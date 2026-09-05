import type { Request, Response, NextFunction } from "express";
import type { Role } from "@cocktrail/shared";
import { COOKIE_NAME, verifySession, type Session } from "./session.js";
import { Unauthorized, Forbidden } from "../../shared/errors/http-errors.js";
import { isSuperadminUsername } from "./superadmin.js";

// Extiende el tipo Request de Express para incluir la sesión
declare global {
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

/**
 * Middleware que parsea y valida la cookie de sesión.
 * Inyecta `req.session` si la cookie es válida.
 */
export function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const raw = req.cookies?.[COOKIE_NAME];
  const session = verifySession(raw);
  if (!session) {
    next(new Unauthorized());
    return;
  }
  req.session = session;
  next();
}

/**
 * Middleware factory que requiere que el usuario tenga uno de los roles dados.
 * Debe usarse DESPUÉS de `authMiddleware`.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.session) {
      next(new Unauthorized());
      return;
    }
    if (!roles.includes(req.session.role)) {
      next(new Forbidden());
      return;
    }
    next();
  };
}

/** Admin con username superadmin. Usar después de authMiddleware. */
export function requireSuperadmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.session) {
    next(new Unauthorized());
    return;
  }
  if (req.session.role !== "admin" || !isSuperadminUsername(req.session.username)) {
    next(new Forbidden("Solo el superadmin puede hacer esto."));
    return;
  }
  next();
}
