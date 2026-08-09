import { Router } from "express";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import type { SystemService } from "./system.service.js";
import { getLatestLogs } from "../audit-logs/audit-logs.service.js";

export function createSystemController(systemService: SystemService): Router {
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

  // GET /api/system/health — staff. Liviano (singleton en memoria, sin I/O).
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

  return router;
}
