import { Router } from "express";
import type { OrdersService } from "./orders.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { COOKIE_NAME, verifySession } from "../auth/session.js";
import { validate, CreateOrderSchema, UpdateOrderStatusSchema } from "../../shared/middleware/validate.js";
import { orderLimiter } from "../../shared/middleware/rate-limit.js";
import { logAction } from "../audit-logs/audit-logs.service.js";
import type { OrderStatus } from "@cocktrail/shared";

export function createOrdersController(
  service: OrdersService,
): Router {
  const router = Router();

  const STATUS_AUDIT_ACTION: Partial<Record<OrderStatus, string>> = {
    cancelado: "order.cancelled",
    entregado: "order.delivered",
  };

  function statusAuditMessage(status: OrderStatus, order: { displayNumber: number; total: number }): string {
    switch (status) {
      case "cancelado":
        return `Devolución procesada - Ticket #${order.displayNumber} - $${order.total.toLocaleString("es-AR")}`;
      case "entregado":
        return `Ticket #${order.displayNumber} entregado`;
      default:
        return `Ticket #${order.displayNumber} actualizado a ${status}`;
    }
  }

  // POST /api/orders — crear pedido (staff only: admin/caja)
  router.post("/", authMiddleware, requireRole("admin", "caja"), orderLimiter, validate(CreateOrderSchema), async (req, res, next) => {
    try {
      const { items, paymentMethod, payment, idempotencyKey, isGift, isSplit, payments } = req.body;
      const createdBy = req.session?.username || "Caja";

      const order = await service.createOrder({ items, paymentMethod, payment, idempotencyKey, isGift, isSplit, payments }, createdBy);
      await logAction(
        "order.created",
        `Venta realizada - Ticket #${order.displayNumber} - $${order.total.toLocaleString("es-AR")}`,
        createdBy
      );
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/orders — listar todos (staff only)
  router.get("/", authMiddleware, requireRole("admin", "caja"), async (_req, res, next) => {
    try {
      res.json(await service.listOrders());
    } catch (err) {
      next(err);
    }
  });

  // GET /api/orders/log — historial de auditoría de todos los tickets (admin only)
  router.get("/log", authMiddleware, requireRole("admin"), async (req, res, next) => {
    try {
      const all = req.query.all === "true";
      res.json(await service.getOrdersLog(all));
    } catch (err) {
      next(err);
    }
  });

  // GET /api/orders/active — pedidos activos (staff only)
  router.get("/active", authMiddleware, requireRole("admin", "caja"), async (_req, res, next) => {
    try {
      res.json(await service.getActiveOrders());
    } catch (err) {
      next(err);
    }
  });

  // GET /api/orders/by-token/:token — buscar por token (staff only)
  router.get("/by-token/:token", authMiddleware, requireRole("admin", "caja"), async (req, res, next) => {
    try {
      const order = await service.getOrderByToken(String(req.params.token));
      if (!order) {
        res.status(404).json({ error: "Pedido no encontrado" });
        return;
      }
      res.json(order);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/orders/:id — cambiar estado (staff only)
  router.patch("/:id", authMiddleware, requireRole("admin", "caja"), validate(UpdateOrderStatusSchema), async (req, res, next) => {
    try {
      const { status } = req.body;
      const username = req.session?.username || "desconocido";

      // Cancelar tickets está permitido para cualquier staff autenticado
      // (admin/caja) — antes era un permiso configurable por usuario, pero
      // todos los roles reales ya lo tenían en true por default.

      const order = await service.updateOrderStatus(req.params.id as string, status, username);

      const auditAction = STATUS_AUDIT_ACTION[status as OrderStatus];
      if (auditAction) {
        await logAction(auditAction, statusAuditMessage(status as OrderStatus, order), username);
      }

      res.json(order);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
