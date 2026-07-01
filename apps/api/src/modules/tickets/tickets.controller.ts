import { Router } from "express";
import type { TicketsService } from "./tickets.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, RedeemTicketSchema } from "../../shared/middleware/validate.js";
import { ticketLimiter } from "../../shared/middleware/rate-limit.js";
import { env } from "../../config/env.js";
import { AuditLogsService } from "../audit-logs/audit-logs.service.js";

export function createTicketsController(
  service: TicketsService,
  auditLogsService: Pick<typeof AuditLogsService, "log"> = AuditLogsService,
): Router {
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

        await auditLogsService.log(
          "ticket.redeemed",
          `Ticket ${code} canjeado en ${resolvedBarCode} (${resolvedMethod})`,
          redeemer,
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
