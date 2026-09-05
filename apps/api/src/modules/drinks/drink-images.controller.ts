import { Router } from "express";
import type { DrinkImagesService } from "./drink-images.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { BadRequest } from "../../shared/errors/http-errors.js";

export function createDrinkImagesController(service: DrinkImagesService): Router {
  const router = Router();

  router.get("/", authMiddleware, requireRole("admin"), async (_req, res, next) => {
    try {
      res.json(await service.list());
    } catch (err) {
      next(err);
    }
  });

  router.post("/", authMiddleware, requireRole("admin"), async (req, res, next) => {
    try {
      const raw = typeof req.body?.webpBase64 === "string" ? req.body.webpBase64 : null;
      if (!raw) throw new BadRequest("Falta webpBase64.");
      const image = await service.uploadWebpBase64(raw);
      res.status(201).json(image);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", authMiddleware, requireRole("admin"), async (req, res, next) => {
    try {
      const id = String(req.params.id || "");
      if (!id) throw new BadRequest("ID inválido.");
      res.json(await service.delete(id));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
