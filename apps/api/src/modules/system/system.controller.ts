import { Router } from "express";
import { authenticate } from "../auth/credentials.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import type { SystemService } from "./system.service.js";
import type { UsersRepository } from "../users/users.repository.js";
import { verifySession } from "../auth/session.js";
import { systemStatusLimiter } from "../../shared/middleware/rate-limit.js";
import { getLatestLogs } from "../audit-logs/audit-logs.service.js";

export function createSystemController(
  usersRepo: UsersRepository,
  systemService: SystemService,
): Router {
  const router = Router();

  // GET /api/system/logs — staff only (documentado en ARCHITECTURE.md, faltaba el guard)
  router.get("/logs", authMiddleware, requireRole("admin", "caja"), async (_req, res, next) => {
    try {
      const logs = await getLatestLogs(10);
      res.json(logs);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/system/health — staff. Liviano (singleton en memoria, sin I/O) y
  // SIN systemStatusLimiter: lo pollea el banner de migraciones de /admin.
  // No confundir con el GET /health público de app.ts (liveness sin auth).
  router.get("/health", authMiddleware, requireRole("admin", "caja"), async (req, res) => {
    // ?refreshMpFallback=1 re-corre el preflight del fallback MP (F1.c, nunca lanza).
    if (req.query.refreshMpFallback === "1") {
      await systemService.refreshMpFallback();
    }
    res.json(systemService.getHealth());
  });

  // GET /api/system/version — staff. Versión de app + deploy (sin I/O).
  router.get("/version", authMiddleware, requireRole("admin", "caja"), (_req, res) => {
    res.json(systemService.getVersion());
  });

  // POST /api/system/migrations/accept-drift — admin. Pisa checksums al disco actual.
  router.post(
    "/migrations/accept-drift",
    authMiddleware,
    requireRole("admin"),
    async (_req, res, next) => {
      try {
        res.json(await systemService.acceptMigrationDrift());
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /api/system/status — staff only (documentado en ARCHITECTURE.md, faltaba el guard)
  router.get("/status", authMiddleware, requireRole("admin", "caja"), systemStatusLimiter, async (_req, res, next) => {
    try {
      const status = await systemService.getStatus();
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/system/shutdown
  router.post("/shutdown", async (req, res, next) => {
    const { username, password } = req.body;

    try {
      // 1. Determine which credentials to authenticate
      let targetUser = username;
      let targetPass = password;

      // If already logged in, use req.cookies to verify session
      const rawCookie = req.cookies?.["cocktrail_session"];
      const session = verifySession(rawCookie);
      
      if (session) {
        targetUser = session.username;
      }

      if (!targetUser || !targetPass) {
        return res.status(401).json({ error: "Faltan credenciales para apagar la terminal." });
      }

      // 2. Authenticate
      const authenticated = await authenticate(targetUser, targetPass, usersRepo);
      if (!authenticated) {
        return res.status(401).json({ error: "Contraseña incorrecta." });
      }

      // 3. Initiate Shutdown
      res.json({ success: true, message: "Apagando terminal y base de datos..." });
      systemService.shutdown(targetUser);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
