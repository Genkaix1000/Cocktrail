import { Router } from "express";
import type { TicketsService } from "./tickets.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, RedeemTicketSchema } from "../../shared/middleware/validate.js";
import { ticketLimiter } from "../../shared/middleware/rate-limit.js";
import { env } from "../../config/env.js";

export function createTicketsController(service: TicketsService): Router {
  const router = Router();

  // POST /api/tickets/redeem — canjear ticket (requiere login)
  router.post(
    "/redeem",
    authMiddleware,
    requireRole("admin", "barman"),
    ticketLimiter,
    validate(RedeemTicketSchema),
    async (req, res, next) => {
      try {
        const { code, barCode, method } = req.body;
        const redeemer = req.session?.username ?? "desconocido";
        const resolvedBarCode = barCode?.trim() || env.BAR_CODE;
        const resolvedMethod = method ?? "scan";
        const order = await service.redeemTicket(code, redeemer, {
          barCode: resolvedBarCode,
          method: resolvedMethod,
        });

        // Audit Logging (who, when, which ticket, bar station, method and from which IP)
        console.log(
          JSON.stringify({
            event: "ticket.redeemed",
            ticket: code,
            redeemer,
            barCode: resolvedBarCode,
            method: resolvedMethod,
            ip: req.ip,
            timestamp: new Date().toISOString(),
          })
        );

        res.json({
          success: true,
          order,
          status: "success",
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
