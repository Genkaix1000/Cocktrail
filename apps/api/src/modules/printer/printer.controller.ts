import { Router } from "express";
import type { PrinterService } from "./printer.service.js";
import type { OrdersRepository } from "../orders/orders.repository.js";
import type { EventsService } from "../events/events.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";

export function createPrinterController(
  printerService: PrinterService,
  ordersRepo: OrdersRepository,
  eventsService: EventsService
): Router {
  const router = Router();

  router.get("/status", authMiddleware, requireRole("admin", "caja"), (_req, res) => {
    res.json(printerService.getStatus());
  });

  router.post("/test", authMiddleware, requireRole("admin", "caja"), async (_req, res, next) => {
    try {
      res.json(await printerService.printTest());
    } catch (err) {
      next(err);
    }
  });

  router.post("/reprint/:orderId", authMiddleware, requireRole("admin", "caja"), async (req, res, next) => {
    try {
      const order = await ordersRepo.findById(req.params.orderId as string);
      if (!order) throw new NotFound("Pedido no encontrado.");

      if (order.paymentStatus === "pendiente_de_cobro") {
        throw new Conflict("Este pedido todavía no está cobrado — no se puede reimprimir el ticket.");
      }

      const event = await eventsService.getCurrentEvent();
      if (!event) throw new Conflict("No hay noche activa para reimprimir.");

      res.json(await printerService.printTicket(order, event));
    } catch (err) {
      next(err);
    }
  });

  /** Un cobro, N papeles. Body: { groups: [{ items: [{ drinkId, qty }] }] } */
  router.post("/splits/:orderId", authMiddleware, requireRole("admin", "caja"), async (req, res, next) => {
    try {
      const order = await ordersRepo.findById(req.params.orderId as string);
      if (!order) throw new NotFound("Pedido no encontrado.");
      if (order.paymentStatus === "pendiente_de_cobro") {
        throw new Conflict("Este pedido todavía no está cobrado.");
      }
      const event = await eventsService.getCurrentEvent();
      if (!event) throw new Conflict("No hay noche activa.");

      const rawGroups = req.body?.groups;
      if (!Array.isArray(rawGroups) || rawGroups.length === 0) {
        throw new BadRequest("groups es requerido.");
      }

      const byDrink = new Map(order.items.map((i) => [i.drinkId, i]));
      const groups = rawGroups.map((g: { items?: { drinkId?: number; qty?: number }[] }) => {
        const items = (g.items ?? [])
          .map((it) => {
            const line = byDrink.get(Number(it.drinkId));
            const qty = Math.floor(Number(it.qty) || 0);
            if (!line || qty <= 0) return null;
            return { qty, name: line.name };
          })
          .filter((x): x is { qty: number; name: string } => x !== null);
        return { items };
      });

      const tickets = printerService.renderSplitPayloads(order, event, groups);
      if (tickets.length === 0) throw new BadRequest("Ningún papel tiene ítems.");
      res.json({ tickets });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
