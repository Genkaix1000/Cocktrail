import { Router } from "express";
import type { UsersService } from "./users.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, CreateUserSchema, UpdateUserSchema } from "../../shared/middleware/validate.js";

export function createUsersController(service: UsersService): Router {
  const router = Router();

  // GET /api/users — solo admin
  router.get(
    "/",
    authMiddleware,
    requireRole("admin"),
    (_req, res) => {
      res.json(service.listUsers());
    },
  );

  // POST /api/users — solo admin
  router.post(
    "/",
    authMiddleware,
    requireRole("admin"),
    validate(CreateUserSchema),
    (req, res, next) => {
      try {
        const user = service.createUser(req.body);
        res.status(201).json(user);
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /api/users/:id — solo admin
  router.delete(
    "/:id",
    authMiddleware,
    requireRole("admin"),
    (req, res, next) => {
      try {
        service.deleteUser(req.params.id as string);
        res.json({ ok: true });
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /api/users/:id — solo admin
  router.patch(
    "/:id",
    authMiddleware,
    requireRole("admin"),
    validate(UpdateUserSchema),
    (req, res, next) => {
      try {
        const user = service.updateUser(req.params.id as string, req.body);
        res.json(user);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
