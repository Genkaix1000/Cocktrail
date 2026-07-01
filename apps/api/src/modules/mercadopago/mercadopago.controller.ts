import { Router } from "express";
import type { MercadoPagoService } from "./mercadopago.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";

export function createMercadoPagoController(service: MercadoPagoService): Router {
  const router = Router();

  // POST /api/mercadopago/pos/intent - Enviar monto al Posnet
  router.post("/pos/intent", authMiddleware, requireRole("admin", "caja"), async (req, res, next) => {
    try {
      const { amount, description } = req.body;
      if (!amount || typeof amount !== "number") {
        res.status(400).json({ error: "Amount es requerido y debe ser un número." });
        return;
      }
      const intent = await service.createPaymentIntent(amount);
      res.json(intent);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/mercadopago/pos/intent/:id - Consultar si el cliente ya pagó
  router.get("/pos/intent/:id", authMiddleware, requireRole("admin", "caja"), async (req, res, next) => {
    try {
      const status = await service.getPaymentIntentStatus(req.params.id as string);
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/mercadopago/pos/intent/:id - Cancelar intención de pago en cola
  router.delete("/pos/intent/:id", authMiddleware, requireRole("admin", "caja"), async (req, res, next) => {
    try {
      const result = await service.cancelPaymentIntent(req.params.id as string);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
