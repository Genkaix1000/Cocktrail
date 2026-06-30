import { Router } from "express";
import type { DrinksService } from "./drinks.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, CreateDrinkSchema, UpdateDrinkSchema } from "../../shared/middleware/validate.js";
import { AuditLogsService } from "../audit-logs/audit-logs.service.js";

export function createDrinksController(service: DrinksService): Router {
  const router = Router();

  // GET /api/drinks — público (la carta se lee sin auth)
  router.get("/", async (_req, res, next) => {
    try {
      res.json(await service.listDrinks());
    } catch (err) {
      next(err);
    }
  });

  // GET /api/drinks/:id
  router.get("/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }
      const drink = await service.getDrink(id);
      if (!drink) {
        res.status(404).json({ error: "Trago no encontrado" });
        return;
      }
      res.json(drink);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/drinks — solo admin
  router.post(
    "/",
    authMiddleware,
    requireRole("admin"),
    validate(CreateDrinkSchema),
    async (req, res, next) => {
      try {
        const drink = await service.createDrink(req.body);
        await AuditLogsService.log(
          "drink.created",
          `Producto creado - ${drink.name}`,
          req.session?.username || "admin"
        );
        res.status(201).json(drink);
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /api/drinks/:id — solo admin
  router.patch(
    "/:id",
    authMiddleware,
    requireRole("admin"),
    validate(UpdateDrinkSchema),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
          res.status(400).json({ error: "ID inválido" });
          return;
        }
        const drink = await service.updateDrink(id, req.body);
        await AuditLogsService.log(
          "drink.updated",
          `Producto actualizado - ${drink.name}`,
          req.session?.username || "admin"
        );
        res.json(drink);
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /api/drinks/:id — solo admin
  router.delete(
    "/:id",
    authMiddleware,
    requireRole("admin"),
    async (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
          res.status(400).json({ error: "ID inválido" });
          return;
        }
        
        let drinkName = `ID #${id}`;
        try {
          const drink = await service.getDrink(id);
          if (drink) drinkName = drink.name;
        } catch {}

        await service.deleteDrink(id);
        await AuditLogsService.log(
          "drink.deleted",
          `Producto eliminado - ${drinkName}`,
          req.session?.username || "admin"
        );
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
