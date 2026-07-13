import { Router } from "express";
import { authenticate } from "../auth/credentials.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import type { SyncService } from "../sync/sync.service.js";
import type { SystemService } from "./system.service.js";
import type { UsersRepository } from "../users/users.repository.js";
import { verifySession } from "../auth/session.js";
import { systemStatusLimiter } from "../../shared/middleware/rate-limit.js";
import { AuditLogsService } from "../audit-logs/audit-logs.service.js";
import { supabaseCloud } from "../../shared/supabase.js";

export function createSystemController(
  usersRepo: UsersRepository,
  systemService: SystemService,
  syncService: SyncService,
): Router {
  const router = Router();

  // GET /api/system/logs — staff only (documentado en ARCHITECTURE.md, faltaba el guard)
  router.get("/logs", authMiddleware, requireRole("admin", "caja"), async (_req, res, next) => {
    try {
      const logs = await AuditLogsService.getLatest(10);
      res.json(logs);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/system/status — staff only (documentado en ARCHITECTURE.md, faltaba el guard)
  router.get("/status", authMiddleware, requireRole("admin", "caja"), systemStatusLimiter, async (_req, res, next) => {
    try {
      const status = await systemService.getStatus();
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/system/sync — staff only (documentado en ARCHITECTURE.md, faltaba el guard)
  router.post("/sync", authMiddleware, requireRole("admin", "caja"), async (_req, res, next) => {
    try {
      // 1. Pull Master Data
      await syncService.pullMasterData();

      // 2. Push Pending Events
      let syncResult = { successCount: 0, failedCount: 0 };
      if (supabaseCloud) {
        syncResult = await syncService.syncAllPendingEvents();
      }

      res.json({
        success: true,
        message: "Proceso de sincronización completado.",
        pulled: true,
        pushed: syncResult
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/system/restore — solo admin (blast radius mayor que /sync: gana cloud en
  // conflicto, puede pisar datos locales recientes). Re-autentica con contraseña, mismo
  // patrón que /shutdown. Ver docs/specs/restaurar-backup-desde-cloud.md.
  router.post("/restore", authMiddleware, requireRole("admin"), async (req, res, next) => {
    try {
      const { password } = req.body;
      const username = req.session?.username;
      if (!username || !password) {
        res.status(401).json({ error: "Faltan credenciales para restaurar." });
        return;
      }

      const authenticated = await authenticate(username, password, usersRepo);
      if (!authenticated) {
        res.status(401).json({ error: "Contraseña incorrecta." });
        return;
      }

      const result = await syncService.restoreFromCloud();
      res.json(result);
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
