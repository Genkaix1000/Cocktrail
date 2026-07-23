import { Router } from "express";
import type { UsersService } from "./users.service.js";
import { authMiddleware, requireRole } from "../auth/auth.middleware.js";
import { validate, CreateUserSchema, UpdateUserSchema } from "../../shared/middleware/validate.js";
import { logAction } from "../audit-logs/audit-logs.service.js";

export function createUsersController(
  service: UsersService,
): Router {
  const router = Router();

  // GET /api/users — solo admin
  router.get(
    "/",
    authMiddleware,
    requireRole("admin"),
    async (_req, res, next) => {
      try {
        res.json(await service.listUsers());
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/users — solo admin
  router.post(
    "/",
    authMiddleware,
    requireRole("admin"),
    validate(CreateUserSchema),
    async (req, res, next) => {
      try {
        const user = await service.createUser(req.body);
        await logAction(
          "staff.created",
          `Staff creado - ${user.username}`,
          req.session?.username || "admin"
        );
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
    async (req, res, next) => {
      try {
        const id = req.params.id as string;
        await service.deleteUser(id);
        await logAction(
          "staff.deleted",
          `Staff eliminado - ID #${id}`,
          req.session?.username || "admin"
        );
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
    async (req, res, next) => {
      try {
        const id = req.params.id as string;
        const user = await service.updateUser(id, req.body);
        await logAction(
          "staff.updated",
          `Staff actualizado - ${user.username}`,
          req.session?.username || "admin"
        );
        res.json(user);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
