import { Router } from "express";
import type { OrdersService } from "./orders.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { COOKIE_NAME, verifySession } from "../auth/auth.service.js";
import { validate, CreateOrderSchema, UpdateOrderStatusSchema } from "../../shared/middleware/validate.js";
import { orderLimiter } from "../../shared/middleware/rate-limit.js";
import type { UsersRepository } from "../users/users.repository.js";
import { Forbidden } from "../../shared/errors/http-errors.js";

export function createOrdersController(
  service: OrdersService,
  usersRepo: UsersRepository,
): Router {
  const router = Router();

  // POST /api/orders — crear pedido (público)
  router.post("/", orderLimiter, validate(CreateOrderSchema), (req, res, next) => {
    try {
      const { items, paymentMethod } = req.body;
      const sessionCookie = req.cookies?.[COOKIE_NAME];
      const session = verifySession(sessionCookie);
      const createdBy = session ? session.username : "Cliente";

      const order = service.createOrder({ items, paymentMethod }, createdBy);
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/orders — listar todos (staff only)
  router.get("/", authMiddleware, requireRole("admin", "caja"), (_req, res) => {
    res.json(service.listOrders());
  });

  // GET /api/orders/log — historial de auditoría de todos los tickets (admin only)
  router.get("/log", authMiddleware, requireRole("admin"), (_req, res) => {
    res.json(service.getOrdersLog());
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
      const username = req.session?.username || "desconocido";
      const role = req.session?.role;

      // If they want to cancel, check if they have cancelarTickets permission
      if (status === "cancelado") {
        if (role !== "admin") {
          const dbUser = usersRepo.findByUsername(username);
          const hasCancel = dbUser
            ? dbUser.permissions.cancelarTickets
            : (role === "barman" ? true : false); // default barman has it, default caja doesn't
          if (!hasCancel) {
            throw new Forbidden("No tenés permiso para cancelar tickets.");
          }
        }
      }

      const order = service.updateOrderStatus(req.params.id as string, status, username);
      res.json(order);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
