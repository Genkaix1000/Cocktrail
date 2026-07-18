import { Router } from "express";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { mpContextMiddleware } from "./mp-context.middleware.js";
import type { MercadoPagoOrdersService } from "./mercadopago-orders.service.js";

export function createMercadoPagoOrdersController(service: MercadoPagoOrdersService): Router {
  const router = Router();
  const cajaOrAdmin = [authMiddleware, requireRole("admin", "caja"), mpContextMiddleware] as const;

  // POST /api/mercadopago/orders/qr — crear order QR estática
  router.post("/orders/qr", ...cajaOrAdmin, async (req, res, next) => {
    try {
      const { amount, barId, description } = req.body ?? {};
      if (amount == null || typeof amount !== "number") {
        res.status(400).json({ error: "amount es requerido y debe ser un número." });
        return;
      }
      res.status(201).json(
        await service.createQrOrder({
          amount,
          barId:
            typeof barId === "string"
              ? barId
              : req.mpContext?.barId,
          description: typeof description === "string" ? description : undefined,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/orders/:orderId/status — polling con consulta a MP
  router.get("/orders/:orderId/status", ...cajaOrAdmin, async (req, res, next) => {
    try {
      const orderId = req.params.orderId as string;
      const barId = typeof req.query.barId === "string" ? req.query.barId : undefined;
      res.json(await service.getOrderStatus(orderId, barId));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mercadopago/orders/:orderId/cancel — cancelar order en estado created
  router.post("/orders/:orderId/cancel", ...cajaOrAdmin, async (req, res, next) => {
    try {
      const orderId = req.params.orderId as string;
      const barId =
        typeof req.body?.barId === "string"
          ? req.body.barId
          : typeof req.query.barId === "string"
            ? req.query.barId
            : undefined;
      res.json(await service.cancelQrOrder(orderId, barId));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
