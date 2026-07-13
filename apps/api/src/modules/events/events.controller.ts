import { Router } from "express";
import type { EventsService } from "./events.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, ThemeSchema } from "../../shared/middleware/validate.js";
import type { UsersRepository } from "../users/users.repository.js";
import { authenticate } from "../auth/credentials.js";
import { BadRequest, Forbidden, Unauthorized } from "../../shared/errors/http-errors.js";

export function createEventsController(
  service: EventsService,
  usersRepo: UsersRepository,
): Router {
  const router = Router();

  // GET /api/state — snapshot completo (staff only)
  router.get("/state", authMiddleware, requireRole("admin", "caja"), async (_req, res, next) => {
    try {
      res.json(await service.snapshot());
    } catch (err) {
      next(err);
    }
  });

  // GET /api/theme — obtener tema activo (público)
  router.get("/theme", async (_req, res, next) => {
    try {
      res.json(await service.getPublicConfig());
    } catch (err) {
      next(err);
    }
  });

  // POST /api/event/close — cerrar la noche (admin y caja con permisos)
  router.post(
    "/event/close",
    authMiddleware,
    requireRole("admin", "caja"),
    async (req, res, next) => {
      try {
        const { password } = req.body;
        if (!password) {
          throw new BadRequest("Contraseña requerida para confirmar el cierre.");
        }

        const username = req.session?.username;
        if (!username) {
          throw new Unauthorized();
        }

        // Check closeNight permission for caja role
        if (req.session?.role === "caja") {
          const dbUser = await usersRepo.findByUsername(username);
          const hasCloseNight = dbUser ? dbUser.permissions.closeNight : false;
          if (!hasCloseNight) {
            throw new Forbidden("No tenés permiso para cerrar la noche.");
          }
        }

        // Verify password using the same authenticate helper
        const verified = await authenticate(username, password, usersRepo);
        if (!verified) {
          throw new BadRequest("Contraseña incorrecta.");
        }

        const summary = await service.closeEvent(username);
        res.json(summary);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/events/open — abrir una noche nueva con palabra clave (admin only)
  router.post("/events/open", authMiddleware, requireRole("admin"), async (req, res, next) => {
    try {
      const { keyword } = req.body;
      if (typeof keyword !== "string") throw new BadRequest("keyword requerida.");
      res.status(201).json(await service.openEvent(keyword));
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/events/current/keyword — corregir la clave de la noche activa (admin only)
  router.patch("/events/current/keyword", authMiddleware, requireRole("admin"), async (req, res, next) => {
    try {
      const { keyword } = req.body;
      if (typeof keyword !== "string") throw new BadRequest("keyword requerida.");
      res.json(await service.setKeyword(keyword));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/theme — cambiar tema (admin only)
  router.post("/theme", authMiddleware, requireRole("admin"), validate(ThemeSchema), async (req, res, next) => {
    try {
      const { theme } = req.body;
      await service.setTheme(theme);
      res.json({ success: true, theme });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/events/history — historial de noches cerradas (admin only)
  router.get("/events/history", authMiddleware, requireRole("admin"), async (_req, res, next) => {
    try {
      res.json(await service.listClosedEvents());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
