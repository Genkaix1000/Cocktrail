import { Router } from "express";
import type { MercadoPagoWebhooksService } from "./mercadopago-webhooks.service.js";

export function createMercadoPagoWebhooksController(
  service: MercadoPagoWebhooksService,
): Router {
  const router = Router();

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
