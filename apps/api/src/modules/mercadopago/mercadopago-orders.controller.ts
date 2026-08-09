import { Router } from "express";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { mpContextMiddleware } from "./mp-context.middleware.js";
import type { MercadoPagoOrdersService } from "./mercadopago-orders.service.js";

// Semilla que genera el frontend con crypto.randomUUID() (36 chars) — se aceptan
// variantes alfanuméricas con guiones de 16 a 64.
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

function parseLimit(raw: unknown, fallback = 20): number {
  if (typeof raw !== "string") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function createMercadoPagoOrdersController(service: MercadoPagoOrdersService): Router {
  const router = Router();
  const cajaOrAdmin = [authMiddleware, requireRole("admin", "caja"), mpContextMiddleware] as const;

  // GET /api/mercadopago/orders/recent — diagnóstico admin (antes de :orderId).
  router.get("/orders/recent", authMiddleware, requireRole("admin"), async (req, res, next) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json({ orders: await service.listRecentOrders(parseLimit(req.query.limit)) });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mercadopago/orders/qr — crear order QR estática
  router.post("/orders/qr", ...cajaOrAdmin, async (req, res, next) => {
    try {
      const { amount, barId, description, idempotencyKey } = req.body ?? {};
      if (amount == null || typeof amount !== "number") {
        res.status(400).json({ error: "amount es requerido y debe ser un número." });
        return;
      }
      if (
        idempotencyKey !== undefined &&
        (typeof idempotencyKey !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey))
      ) {
        res.status(400).json({
          error: "idempotencyKey inválida: debe ser alfanumérica (con guiones) de 16 a 64 caracteres.",
        });
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
          idempotencyKey,
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/orders/:orderId/status — polling con consulta a MP
  router.get("/orders/:orderId/status", ...cajaOrAdmin, async (req, res, next) => {
    try {
      // Criterio I: sin no-store, el ETag por defecto de Express deja al
      // navegador cachear el estado del cobro (304) en pleno polling.
      res.set("Cache-Control", "no-store");
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

  // POST /api/mercadopago/fees/backfill — completa neto/fee pendientes (admin)
  router.post("/fees/backfill", authMiddleware, requireRole("admin"), async (req, res, next) => {
    try {
      const raw = req.body?.limit;
      const limit = typeof raw === "number" && Number.isFinite(raw) ? raw : 50;
      res.json(await service.backfillFees(limit));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
