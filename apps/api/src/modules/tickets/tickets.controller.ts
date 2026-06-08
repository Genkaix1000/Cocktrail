import { Router } from "express";
import type { TicketsService } from "./tickets.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, RedeemTicketSchema } from "../../shared/middleware/validate.js";
import { ticketLimiter } from "../../shared/middleware/rate-limit.js";

export function createTicketsController(service: TicketsService): Router {
  const router = Router();

  // POST /api/tickets/redeem — canjear ticket (requiere login)
  router.post(
    "/redeem",
    authMiddleware,
    requireRole("admin", "barman"),
    ticketLimiter,
    validate(RedeemTicketSchema),
    (req, res, next) => {
      try {
        const { code } = req.body;
        const redeemer = "scanner";
        const order = service.redeemTicket(code, redeemer);

        // Audit Logging (who, when, which ticket, and from which IP)
        console.log(
          JSON.stringify({
            event: "ticket.redeemed",
            ticket: code,
            redeemer,
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
