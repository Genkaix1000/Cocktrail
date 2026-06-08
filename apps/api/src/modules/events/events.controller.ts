import { Router } from "express";
import type { EventsService } from "./events.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, ThemeSchema } from "../../shared/middleware/validate.js";
import type { UsersRepository } from "../users/users.repository.js";
import { authenticate } from "../auth/auth.service.js";
import { BadRequest, Forbidden, Unauthorized } from "../../shared/errors/http-errors.js";

export function createEventsController(
  service: EventsService,
  usersRepo: UsersRepository,
): Router {
  const router = Router();

  // GET /api/state — snapshot completo (staff only)
  router.get("/state", authMiddleware, requireRole("admin", "caja"), (_req, res) => {
    res.json(service.snapshot());
  });

  // GET /api/theme — obtener tema activo (público)
  router.get("/theme", (_req, res) => {
    res.json(service.getPublicConfig());
  });

  // POST /api/event/close — cerrar la noche (admin y caja con permisos)
  router.post(
    "/event/close",
    authMiddleware,
    requireRole("admin", "caja"),
    (req, res, next) => {
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
          const dbUser = usersRepo.findByUsername(username);
          if (dbUser && !dbUser.permissions.closeNight) {
            throw new Forbidden("No tenés permiso para cerrar la noche.");
          }
        }

        // Verify password using the same authenticate helper
        const verified = authenticate(username, password, usersRepo);
        if (!verified) {
          throw new BadRequest("Contraseña incorrecta.");
        }

        const summary = service.closeEvent();
        res.json(summary);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/theme — cambiar tema (admin only)
  router.post("/theme", authMiddleware, requireRole("admin"), validate(ThemeSchema), (req, res) => {
    const { theme } = req.body;
    service.setTheme(theme);
    res.json({ success: true, theme });
  });

  // GET /api/events/history — historial de noches cerradas (admin only)
  router.get("/events/history", authMiddleware, requireRole("admin"), (_req, res) => {
    res.json(service.listClosedEvents());
  });

  return router;
}
