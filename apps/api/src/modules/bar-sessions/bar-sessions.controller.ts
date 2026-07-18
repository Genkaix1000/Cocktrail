import { Router } from "express";
import {
  barSessionUserId,
  type BarSessionsService,
} from "./bar-sessions.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import type { Session } from "../auth/session.js";
import { emit } from "../../shared/sse/sse-manager.js";

export function createBarSessionsController(service: BarSessionsService): Router {
  const router = Router();

  function currentUserId(session: Session, deviceId?: string) {
    return barSessionUserId(session.username, session.role, deviceId || "default");
  }

  // deviceId por body o header
  function getDeviceId(req: any): string {
    return req.body?.deviceId || req.headers?.["x-device-id"] || "default";
  }

  // GET /api/bar-sessions/options - cajas disponibles y sesión del usuario actual
  router.get("/options", authMiddleware, requireRole("caja", "admin"), async (req, res, next) => {
    try {
      res.json(await service.listOptions(currentUserId(req.session!, getDeviceId(req))));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bar-sessions/join — cajera se conecta a una barra
  router.post("/join", authMiddleware, requireRole("caja", "admin"), async (req, res, next) => {
    try {
      const { barId, deviceId } = req.body;
      const session = req.session!;

      if (!barId || typeof barId !== "string") {
        res.status(400).json({ error: "barId es requerido" });
        return;
      }

      const result = await service.join(
        barId,
        currentUserId(session, deviceId),
        session.username,
        session.role,
      );

      if (!result.joined) {
        res.status(409).json({
          error: "Barra ocupada",
          connectedUser: result.connectedUser,
          connectedAt: result.connectedAt,
        });
        return;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/bar-sessions/leave — cajera se desconecta
  router.delete("/leave", authMiddleware, requireRole("caja", "admin"), async (req, res, next) => {
    try {
      await service.leave(currentUserId(req.session!, getDeviceId(req)));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bar-sessions/heartbeat - mantiene viva la ocupación de la caja
  router.post("/heartbeat", authMiddleware, requireRole("caja", "admin"), async (req, res, next) => {
    try {
      res.json(await service.heartbeat(currentUserId(req.session!, getDeviceId(req))));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/bar-sessions/force-logout — admin echa a un usuario de una barra
  router.post("/force-logout", authMiddleware, requireRole("admin"), async (req, res, next) => {
    try {
      const { barId } = req.body;
      if (!barId || typeof barId !== "string") {
        res.status(400).json({ error: "barId es requerido" });
        return;
      }

      const ejected = await service.forceLogout(barId);
      if (ejected) {
        emit({
          type: "bar-session.expired",
          barId,
          ejectedUser: ejected.username,
          ejectedBy: req.session!.username,
        });
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/bar-sessions — lista sesiones activas
  router.get("/", authMiddleware, requireRole("admin"), async (_req, res, next) => {
    try {
      const sessions = await service.listAll();
      res.json(sessions);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
