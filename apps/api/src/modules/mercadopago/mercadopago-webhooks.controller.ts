import { Router } from "express";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import type { MercadoPagoWebhooksService } from "./mercadopago-webhooks.service.js";

function parseLimit(raw: unknown, fallback = 20): number {
  if (typeof raw !== "string") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function createMercadoPagoWebhooksController(
  service: MercadoPagoWebhooksService,
): Router {
  const router = Router();

  // GET /api/mercadopago/webhooks/events — diagnóstico admin (últimos webhooks).
  router.get(
    "/webhooks/events",
    authMiddleware,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        res.set("Cache-Control", "no-store");
        res.json(await service.listRecentEvents(parseLimit(req.query.limit)));
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/mercadopago/webhooks — público, validado por HMAC (Fase 6).
  // El 200 sale recién después de persistir el evento: un error de DB devuelve
  // 500 y MP reintenta (durabilidad, PR 3).
  router.post("/webhooks", async (req, res, next) => {
    try {
      const dataId =
        typeof req.query["data.id"] === "string" ? req.query["data.id"] : undefined;
      const type = typeof req.query.type === "string" ? req.query.type : undefined;

      await service.handleWebhook({
        dataId,
        type,
        xSignature:
          typeof req.headers["x-signature"] === "string"
            ? req.headers["x-signature"]
            : undefined,
        xRequestId:
          typeof req.headers["x-request-id"] === "string"
            ? req.headers["x-request-id"]
            : undefined,
        body: req.body ?? {},
      });

      res.status(200).send("OK");
    } catch (err) {
      next(err);
    }
  });

  return router;
}
