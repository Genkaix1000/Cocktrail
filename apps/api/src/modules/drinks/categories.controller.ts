import { Router } from "express";
import { z } from "zod";
import type { DrinkCategoriesService } from "./categories.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate } from "../../shared/middleware/validate.js";
import { logAction } from "../audit-logs/audit-logs.service.js";

const CreateCategorySchema = z.object({
  name: z.string().min(1).max(80).trim(),
  sortOrder: z.number().int().positive().optional(),
});

const UpdateCategorySchema = z.object({
  name: z.string().min(1).max(80).trim().optional(),
  sortOrder: z.number().int().positive().optional(),
});

const ReorderCategoriesSchema = z.object({
  ids: z.array(z.string().min(1).max(80)).min(1),
});

export function createDrinkCategoriesController(service: DrinkCategoriesService): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      res.json(await service.list());
    } catch (err) {
      next(err);
    }
  });

  router.put(
    "/reorder",
    authMiddleware,
    requireRole("admin"),
    validate(ReorderCategoriesSchema),
    async (req, res, next) => {
      try {
        const categories = await service.reorder(req.body.ids);
        await logAction(
          "category.reordered",
          `Categorías reordenadas (${categories.length})`,
          req.session?.username || "admin",
        );
        res.json(categories);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/",
    authMiddleware,
    requireRole("admin"),
    validate(CreateCategorySchema),
    async (req, res, next) => {
      try {
        const category = await service.create(req.body);
        await logAction(
          "category.created",
          `Categoría creada - ${category.name}`,
          req.session?.username || "admin",
        );
        res.status(201).json(category);
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    "/:id",
    authMiddleware,
    requireRole("admin"),
    validate(UpdateCategorySchema),
    async (req, res, next) => {
      try {
        const category = await service.update(String(req.params.id), req.body);
        await logAction(
          "category.updated",
          `Categoría actualizada - ${category.name}`,
          req.session?.username || "admin",
        );
        res.json(category);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete("/:id", authMiddleware, requireRole("admin"), async (req, res, next) => {
    try {
      await service.delete(String(req.params.id));
      await logAction(
        "category.deleted",
        `Categoría eliminada - ${String(req.params.id)}`,
        req.session?.username || "admin",
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
