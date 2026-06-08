import { Router } from "express";
import type { DrinksService } from "./drinks.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, CreateDrinkSchema, UpdateDrinkSchema } from "../../shared/middleware/validate.js";

export function createDrinksController(service: DrinksService): Router {
  const router = Router();

  // GET /api/drinks — público (la carta se lee sin auth)
  router.get("/", (_req, res) => {
    res.json(service.listDrinks());
  });

  // GET /api/drinks/:id
  router.get("/:id", (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: "ID inválido" });
        return;
      }
      const drink = service.getDrink(id);
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
    (req, res, next) => {
      try {
        const drink = service.createDrink(req.body);
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
    (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
          res.status(400).json({ error: "ID inválido" });
          return;
        }
        const drink = service.updateDrink(id, req.body);
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
    (req, res, next) => {
      try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
          res.status(400).json({ error: "ID inválido" });
          return;
        }
        service.deleteDrink(id);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
