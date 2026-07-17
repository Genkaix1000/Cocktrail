import type { Request, Response, NextFunction } from "express";
import type { CredentialContext } from "./credentials-resolver.service.js";

// Extiende el tipo Request de Express para incluir el contexto de credenciales MP.
declare global {
  namespace Express {
    interface Request {
      mpContext?: CredentialContext;
    }
  }
}

/**
 * Extrae los headers contextuales (`X-Device-Id`, `X-Bar-Id`) y los expone en
 * `req.mpContext` para que el resolver elija la cuenta MP correcta.
 *
 * ⚠ Seguridad: estos headers vienen del cliente, por eso este middleware SOLO
 * se monta en cadena DESPUÉS de `authMiddleware + requireRole(...)`. Una request
 * sin sesión ya fue rechazada antes de llegar acá; no se aceptan headers de
 * requests no autenticadas.
 */
export function mpContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const deviceId = req.headers["x-device-id"];
  const barId = req.headers["x-bar-id"];
  req.mpContext = {
    deviceId: typeof deviceId === "string" ? deviceId : undefined,
    barId: typeof barId === "string" ? barId : undefined,
  };
  next();
}
