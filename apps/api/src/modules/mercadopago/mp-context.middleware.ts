import type { Request, Response, NextFunction } from "express";
import type { CredentialContext } from "./credentials-resolver.service.js";

// Extiende Express Request
declare global {
  namespace Express {
    interface Request {
      mpContext?: CredentialContext;
    }
  }
}

/**
 * Extrae el contexto operativo elegido en el onboarding de caja.
 * Se monta después de authMiddleware + requireRole en las rutas de MP.
 */
export function mpContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const barId = req.header("x-bar-id")?.trim();
  const deviceId = req.header("x-device-id")?.trim();
  req.mpContext = {
    ...(barId ? { barId } : {}),
    ...(deviceId ? { deviceId } : {}),
  };
  next();
}
