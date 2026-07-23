import { Router } from "express";
import type { ConfigRepository } from "./config.repository.js";
import { toSafeConfig } from "./config.repository.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, UpdateConfigSchema } from "../../shared/middleware/validate.js";
import type { EventsService } from "../events/events.service.js";
import { emit as realEmit, type EmitFn } from "../../shared/sse/sse-manager.js";
import { logAction } from "../audit-logs/audit-logs.service.js";

export function createConfigController(
  repo: ConfigRepository,
  eventsService?: EventsService,
  emit: EmitFn = realEmit,
): Router {
  const router = Router();

  // GET /api/config — solo admin (datos sensibles enmascarados)
  router.get(
    "/",
    authMiddleware,
    requireRole("admin"),
    async (_req, res, next) => {
      try {
        const config = await repo.get();
        res.json(toSafeConfig(config));
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/config — solo admin (actualiza configuración)
  router.post(
    "/",
    authMiddleware,
    requireRole("admin"),
    validate(UpdateConfigSchema),
    async (req, res, next) => {
      try {
        const updated = await repo.update(req.body);
        // Solo sincroniza el cache en memoria del tema — la persistencia y el
        // broadcast SSE ya los hace este handler una única vez, más abajo.
        if (eventsService && req.body.theme) {
          eventsService.syncActiveTheme(req.body.theme);
        }

        const safe = toSafeConfig(updated);
        emit({
          type: "theme.changed",
          theme: safe.theme,
          customTheme: safe.customTheme,
          useLogoUrl: safe.useLogoUrl,
          logoUrl: safe.logoUrl,
          logoSize: safe.logoSize,
          textLogoValue: safe.textLogoValue,
          textLogoSize: safe.textLogoSize,
          clubId: safe.clubId,
          clubName: safe.clubName,
        });

        await logAction(
          "config.updated",
          "Configuración del boliche actualizada",
          req.session?.username || "admin"
        );

        res.json(safe);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
