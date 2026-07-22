import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env.js";
import { BadRequest, Forbidden } from "../../shared/errors/http-errors.js";
import type { CredentialContext } from "./credentials-resolver.service.js";

// Extiende Express Request
declare global {
  namespace Express {
    interface Request {
      mpContext?: CredentialContext;
    }
  }
}

/** Formato permitido para un device id de Point (PAX_A910__SMARTPOS...). */
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * Extrae el contexto operativo elegido en el onboarding de caja.
 * Se monta después de authMiddleware + requireRole en las rutas de MP.
 *
 * A12 (mínimo): los headers dejan de ser autoritativos a ciegas — `x-bar-id`
 * debe coincidir con la barra configurada (single-bar hoy) y `x-device-id`
 * debe tener formato de device de Point. Sin lookup a DB (eso llega con
 * gestion-posnets).
 */
export function mpContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const barId = req.header("x-bar-id")?.trim();
  const deviceId = req.header("x-device-id")?.trim();

  if (barId && barId !== env.BAR_CODE) {
    next(new Forbidden(`La barra ${barId} no corresponde a esta instalación (${env.BAR_CODE}).`));
    return;
  }
  if (deviceId && !DEVICE_ID_RE.test(deviceId)) {
    next(new BadRequest("x-device-id inválido: se esperaba un id de Posnet (alfanumérico, _ o -)."));
    return;
  }

  req.mpContext = {
    // Ausente → default de la instalación; presente → ya validado arriba.
    barId: barId || env.BAR_CODE,
    ...(deviceId ? { deviceId } : {}),
  };
  next();
}
