import { Router } from "express";
import type { CashSalesService } from "./cash-sales.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, CreateCashSaleSchema } from "../../shared/middleware/validate.js";
import { AuditLogsService } from "../audit-logs/audit-logs.service.js";

export function createCashSalesController(service: CashSalesService): Router {
  const router = Router();

  // POST /api/cash-sales — agregar venta (admin y caja)
  router.post("/", authMiddleware, requireRole("admin", "caja"), validate(CreateCashSaleSchema), async (req, res, next) => {
    try {
      const { amount, description } = req.body;
      const addedBy = req.session?.username || "admin";
      const sale = await service.addCashSale({ amount, description }, addedBy);
      await AuditLogsService.log(
        "cash_sale.created",
        `Venta manual de barra agregada - $${amount.toLocaleString("es-AR")} (${description})`,
        addedBy
      );
      res.status(201).json(sale);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/cash-sales — listar (admin only)
  router.get("/", authMiddleware, requireRole("admin"), async (_req, res, next) => {
    try {
      res.json(await service.listCashSales());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
