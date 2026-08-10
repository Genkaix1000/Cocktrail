import { Router } from "express";
import type { EventsService } from "./events.service.js";
import type { NightDeletionService } from "./night-deletion.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, ThemeSchema } from "../../shared/middleware/validate.js";
import { loginLimiter } from "../../shared/middleware/rate-limit.js";
import type { UsersRepository } from "../users/users.repository.js";
import { authenticate } from "../auth/credentials.js";
import { logAction } from "../audit-logs/audit-logs.service.js";
import { BadRequest, Forbidden, Unauthorized } from "../../shared/errors/http-errors.js";

export function createEventsController(
  service: EventsService,
  usersRepo: UsersRepository,
  nightDeletion: NightDeletionService,
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
    loginLimiter, // re-auth por password: mismo techo que /login
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

        // Cerrar la noche es admin-only (ya no es un permiso configurable por usuario).
        if (req.session?.role === "caja") {
          throw new Forbidden("No tenés permiso para cerrar la noche.");
        }

        // Verify password using the same authenticate helper
        const verified = await authenticate(username, password, usersRepo);
        if (!verified) {
          throw new BadRequest("Contraseña incorrecta.");
        }

        const summary = await service.closeEvent(username);

        // Una noche de prueba no deja rastro en ningún lado, tampoco en la auditoría.
        if (!summary.isTest) {
          await logAction(
            "event.closed",
            `Noche cerrada — $${summary.totals.total.toLocaleString("es-AR")} en ${summary.orders.length} pedidos`,
            username,
          );
        }

        res.json(summary);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/events/open — abrir una noche nueva con palabra clave (admin y caja con permisos)
  router.post(
    "/events/open",
    authMiddleware,
    requireRole("admin", "caja"),
    async (req, res, next) => {
      try {
        const { keyword, isTest } = req.body;
        if (typeof keyword !== "string") throw new BadRequest("keyword requerida.");
        if (isTest !== undefined && typeof isTest !== "boolean") {
          throw new BadRequest("isTest tiene que ser booleano.");
        }

        // Abrir la noche está permitido para cualquier staff autenticado
        // (admin/caja) — no es un permiso configurable por usuario. Marcarla como
        // DE PRUEBA sí es admin-only: una noche de prueba no factura, así que si
        // alguien la abre por error se pierde la venta de todo el turno.
        if (isTest && req.session?.role === "caja") {
          throw new Forbidden("Solo el admin puede abrir una noche de prueba.");
        }

        const event = await service.openEvent(keyword, isTest === true);

        if (!event.isTest) {
          await logAction("event.opened", `Noche abierta — clave "${event.keyword}"`, req.session?.username ?? "desconocido");
        }

        res.status(201).json(event);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/events/:id/deletion-preview — qué se pierde si se borra esa noche (admin only)
  router.get(
    "/events/:id/deletion-preview",
    authMiddleware,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        res.json(await nightDeletion.preview(String(req.params.id)));
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /api/events/:id — borrar una noche registrada (admin only). Irreversible.
  router.delete(
    "/events/:id",
    authMiddleware,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const { fecha } = req.body;
        if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
          throw new BadRequest("Escribí la fecha de la noche (AAAA-MM-DD) para confirmar.");
        }

        const username = req.session?.username;
        if (!username) throw new Unauthorized();

        // `fecha` va como guarda al servidor: si no coincide con el día argentino real
        // de la noche, la función aborta sin tocar nada. La confirmación tipeada de la
        // UI no alcanza — el chequeo tiene que estar de este lado.
        res.json(await nightDeletion.delete(String(req.params.id), fecha, username));
      } catch (err) {
        next(err);
      }
    },
  );

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
