import { Router } from "express";
import type { MercadoPagoService } from "./mercadopago.service.js";
import type { PointPaymentsService } from "./point-payments.service.js";
import type { MpCartItem } from "./mp-orders.repository.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { mpContextMiddleware } from "./mp-context.middleware.js";

// Semilla que genera el frontend con crypto.randomUUID() — mismas reglas que
// la idempotencyKey del camino QR.
const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

function parseItems(raw: unknown): MpCartItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: MpCartItem[] = [];
  for (const it of raw) {
    if (
      it &&
      typeof it === "object" &&
      typeof (it as MpCartItem).drinkId === "number" &&
      typeof (it as MpCartItem).qty === "number"
    ) {
      items.push({ drinkId: (it as MpCartItem).drinkId, qty: (it as MpCartItem).qty });
    }
  }
  return items.length > 0 ? items : undefined;
}

export function createMercadoPagoController(
  service: MercadoPagoService,
  pointPayments: PointPaymentsService,
): Router {
  const router = Router();

  // POST /api/mercadopago/pos/intent - Enviar monto al Posnet (persiste el intent en mp_orders)
  router.post("/pos/intent", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      const { amount, description, attemptId, items } = req.body;
      if (!amount || typeof amount !== "number") {
        res.status(400).json({ error: "Amount es requerido y debe ser un número." });
        return;
      }
      if (attemptId !== undefined && (typeof attemptId !== "string" || !ATTEMPT_ID_PATTERN.test(attemptId))) {
        res.status(400).json({
          error: "attemptId inválido: debe ser alfanumérico (con guiones) de 16 a 64 caracteres.",
        });
        return;
      }
      const intent = await pointPayments.createIntent({
        amount,
        description: typeof description === "string" ? description : undefined,
        deviceId: req.mpContext?.deviceId,
        attemptId,
        items: parseItems(items),
      });
      res.json(intent);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/device/status - Probar conexión y modo del Posnet (análogo a /api/printer/test)
  router.get("/device/status", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json(await service.checkDeviceConnection(req.mpContext?.deviceId));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mercadopago/device/test-charge - Manda $15 real al Posnet y confirma si lo recibió.
  // A propósito NO pasa por PointPaymentsService: el intent de prueba no se persiste en mp_orders.
  router.post("/device/test-charge", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      const deviceId =
        typeof req.body?.deviceId === "string" && req.body.deviceId.trim()
          ? req.body.deviceId.trim()
          : req.mpContext?.deviceId;
      res.json(await service.testDeviceReachability(deviceId));
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/pos/intent/:id - Veredicto del cobro (decide el pago real, no el state)
  router.get("/pos/intent/:id", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      // Criterio I: sin no-store, el ETag por defecto de Express deja al
      // navegador cachear el estado del cobro (304) en pleno polling.
      res.set("Cache-Control", "no-store");
      res.json(await pointPayments.getIntentVerdict(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mercadopago/pos/intent/:id/resolve - Re-consulta MP y devuelve el
  // veredicto actualizado (recupera un cobro desde otro dispositivo/pestaña).
  router.post("/pos/intent/:id/resolve", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      res.set("Cache-Control", "no-store");
      res.json(await pointPayments.resolveIntent(req.params.id as string));
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/mercadopago/pos/intent/:id - Cancelar intención de pago en cola
  router.delete("/pos/intent/:id", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      const result = await service.cancelPaymentIntent(req.params.id as string, req.mpContext?.deviceId);
      // Best-effort: deja la fila local coherente (MP ya confirmó la cancelación).
      await pointPayments.markCanceledLocally(req.params.id as string);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
