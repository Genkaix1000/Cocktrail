import { Router } from "express";
import type { OrdersService } from "./orders.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, CreateOrderSchema, UpdateOrderStatusSchema } from "../../shared/middleware/validate.js";
import { orderLimiter } from "../../shared/middleware/rate-limit.js";

export function createOrdersController(service: OrdersService): Router {
  const router = Router();

  // POST /api/orders — crear pedido (público)
  router.post("/", orderLimiter, validate(CreateOrderSchema), (req, res, next) => {
    try {
      const { items, paymentMethod } = req.body;
      const order = service.createOrder({ items, paymentMethod });
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/orders — listar todos (staff only)
  router.get("/", authMiddleware, requireRole("admin", "caja"), (_req, res) => {
    res.json(service.listOrders());
  });

  // GET /api/orders/active — pedidos activos (staff only)
  router.get("/active", authMiddleware, requireRole("admin", "caja", "barman"), (_req, res) => {
    res.json(service.getActiveOrders());
  });

  // GET /api/orders/by-token/:token — buscar por token (público, para el cliente)
  router.get("/by-token/:token", (req, res) => {
    const order = service.getOrderByToken(req.params.token);
    if (!order) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }
    res.json(order);
  });

  // PATCH /api/orders/:id — cambiar estado (staff only)
  router.patch("/:id", authMiddleware, requireRole("admin", "caja", "barman"), validate(UpdateOrderStatusSchema), (req, res, next) => {
    try {
      const { status } = req.body;
      const order = service.updateOrderStatus(req.params.id as string, status);
      res.json(order);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
