import { Router } from "express";
import { authenticate } from "./credentials.js";
import { buildSessionCookie, buildClearCookie, COOKIE_NAME, verifySession, getSessionVersion, setSessionVersion } from "./session.js";
import { authMiddleware, requireRole } from "./auth.middleware.js";
import { validate, LoginSchema } from "../../shared/middleware/validate.js";
import { loginLimiter } from "../../shared/middleware/rate-limit.js";
import type { UsersRepository } from "../users/users.repository.js";
import type { Role } from "@cocktrail/shared";

/** Marcador público para que la app Android distinga este server de cualquier HTTP en :3000. */
export const SERVER_FINGERPRINT = { app: "cocktrail" as const };

async function verifyTurnstile(token: string | undefined): Promise<boolean> {
  const secret = process.env.CF_TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Sin secret configurado, permitir (dev/local). En prod fallá cerrado.
    return process.env.NODE_ENV !== "production";
  }
  if (!token) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

type AuthControllerOptions = {
  onLogout?: (user: { username: string; role: Role }) => Promise<void>;
  /** Función que persiste la versión de sesión en DB. */
  persistSessionVersion?: (version: number) => Promise<void>;
};

export function createAuthController(
  usersRepo: UsersRepository,
  options: AuthControllerOptions = {},
): Router {
  const router = Router();

  // GET /api/auth/fingerprint — probe LAN/cloud (sin auth)
  router.get("/fingerprint", (_req, res) => {
    res.json(SERVER_FINGERPRINT);
  });

  // POST /api/auth/login
  router.post("/login", loginLimiter, validate(LoginSchema), async (req, res, next) => {
    try {
      const { username, password, cfTurnstileToken } = req.body;

      const turnstileOk = await verifyTurnstile(cfTurnstileToken);
      if (!turnstileOk) {
        res.status(400).json({ error: "Verificación de seguridad fallida. Reintentá." });
        return;
      }

      const result = await authenticate(username, password, usersRepo);
      if (!result) {
        res.status(400).json({ error: "Credenciales inválidas" });
        return;
      }
      const { user, migrated } = result;

      // Auto-migrate SHA-256 legacy hash to scrypt on successful login
      if (migrated) {
        const { hashPassword } = await import("./credentials.js");
        const newHash = await hashPassword(password);
        usersRepo.updatePassword(username, newHash).catch((err) =>
          console.warn("[auth] Failed to migrate password hash for", username, err),
        );
      }

      res.setHeader("Set-Cookie", buildSessionCookie(user.username, user.role));
      res.json({ username: user.username, role: user.role });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/invalidate-sessions — admin only (DoS si queda abierto)
  router.post(
    "/invalidate-sessions",
    authMiddleware,
    requireRole("admin"),
    async (_req, res, next) => {
      try {
        const nextVersion = getSessionVersion() + 1;
        setSessionVersion(nextVersion);
        if (options.persistSessionVersion) {
          await options.persistSessionVersion(nextVersion);
        }
        console.log(`[auth] Session version bumped to ${nextVersion}. All active sessions invalidated.`);
        res.json({ ok: true, version: nextVersion });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/auth/logout
  router.post("/logout", async (req, res, next) => {
    try {
      const session = verifySession(req.cookies?.[COOKIE_NAME]);
      if (session && options.onLogout) {
        try {
          await options.onLogout(session);
        } catch (error) {
          // Cerrar la cookie siempre. El TTL de bar_sessions libera cualquier
          // ocupación que no haya podido borrarse en este intento.
          console.error("[auth] No se pudo liberar la sesión de caja:", error);
        }
      }
      res.setHeader("Set-Cookie", buildClearCookie());
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/auth/me
  router.get("/me", async (req, res) => {
    const raw = req.cookies?.[COOKIE_NAME];
    const session = verifySession(raw);
    if (!session) {
      res.json(null);
      return;
    }
    // Permisos derivados 100% del rol — ya no son editables por usuario
    // (ver docs/ARCHITECTURE.md §8).
    const permissions =
      session.role === "admin"
        ? { closeNight: true, cancelarTickets: true, historial: true, metricas: true }
        : { closeNight: false, cancelarTickets: true, historial: true, metricas: false };

    res.json({
      role: session.role,
      username: session.username,
      permissions,
    });
  });

  return router;
}
