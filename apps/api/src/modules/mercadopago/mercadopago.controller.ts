import { Router } from "express";
import type { MercadoPagoService } from "./mercadopago.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { mpContextMiddleware } from "./mp-context.middleware.js";

export function createMercadoPagoController(service: MercadoPagoService): Router {
  const router = Router();

  // POST /api/mercadopago/pos/intent - Enviar monto al Posnet
  router.post("/pos/intent", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      const { amount, description } = req.body;
      if (!amount || typeof amount !== "number") {
        res.status(400).json({ error: "Amount es requerido y debe ser un número." });
        return;
      }
      const intent = await service.createPaymentIntent(
        amount,
        typeof description === "string" ? description : undefined,
        req.mpContext?.deviceId,
      );
      res.json(intent);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/device/status - Probar conexión y modo del Posnet (análogo a /api/printer/test)
  router.get("/device/status", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      res.json(await service.checkDeviceConnection(req.mpContext?.deviceId));
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mercadopago/device/test-charge - Manda $1 real al Posnet y confirma si lo recibió (se auto-cancela)
  router.post("/device/test-charge", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      res.json(await service.testDeviceReachability(req.mpContext?.deviceId));
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/pos/intent/:id - Consultar si el cliente ya pagó
  router.get("/pos/intent/:id", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      const status = await service.getPaymentIntentStatus(req.params.id as string, req.mpContext?.deviceId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/mercadopago/pos/intent/:id - Cancelar intención de pago en cola
  router.delete("/pos/intent/:id", authMiddleware, requireRole("admin", "caja"), mpContextMiddleware, async (req, res, next) => {
    try {
      const result = await service.cancelPaymentIntent(req.params.id as string, req.mpContext?.deviceId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
