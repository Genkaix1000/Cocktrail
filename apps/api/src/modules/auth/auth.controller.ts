import { Router } from "express";
import { authenticate } from "./credentials.js";
import { buildSessionCookie, buildClearCookie, COOKIE_NAME, verifySession } from "./session.js";
import { validate, LoginSchema } from "../../shared/middleware/validate.js";
import { loginLimiter } from "../../shared/middleware/rate-limit.js";
import type { UsersRepository } from "../users/users.repository.js";

export function createAuthController(usersRepo: UsersRepository): Router {
  const router = Router();

  // POST /api/auth/login — la protección contra fuerza bruta es loginLimiter
  // (rate limit por IP); se sacó el captcha matemático: sistema 100% LAN, sin
  // exposición a bots externos, no justificaba la fricción/mantenimiento extra.
  router.post("/login", loginLimiter, validate(LoginSchema), async (req, res, next) => {
    try {
      const { username, password } = req.body;

      const user = await authenticate(username, password, usersRepo);
      if (!user) {
        res.status(400).json({ error: "Credenciales inválidas" });
        return;
      }

      res.setHeader("Set-Cookie", buildSessionCookie(user.username, user.role));
      res.json({ username: user.username, role: user.role });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/auth/logout
  router.post("/logout", (_req, res) => {
    res.setHeader("Set-Cookie", buildClearCookie());
    res.json({ ok: true });
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
