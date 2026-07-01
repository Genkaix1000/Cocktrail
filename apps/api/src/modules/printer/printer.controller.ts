import { Router } from "express";
import type { PrinterService } from "./printer.service.js";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { EventsService } from "../events/events.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { Conflict, NotFound } from "../../shared/errors/http-errors.js";

export function createPrinterController(
  printerService: PrinterService,
  ordersRepo: OrdersRepository,
  eventsService: EventsService
): Router {
  const router = Router();

  // GET /api/printer/status
  router.get("/status", authMiddleware, requireRole("admin", "caja"), (_req, res) => {
    res.json(printerService.getStatus());
  });

  // POST /api/printer/test
  router.post("/test", authMiddleware, requireRole("admin", "caja"), async (_req, res, next) => {
    try {
      res.json(await printerService.printTest());
    } catch (err) {
      next(err);
    }
  });

  // POST /api/printer/reprint/:orderId
  router.post("/reprint/:orderId", authMiddleware, requireRole("admin", "caja"), async (req, res, next) => {
    try {
      const order = await ordersRepo.findById(req.params.orderId as string);
      if (!order) throw new NotFound("Pedido no encontrado.");

      const event = await eventsService.getCurrentEvent();
      if (!event) throw new Conflict("No hay noche activa para reimprimir.");

      res.json(await printerService.printTicket(order, event));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
