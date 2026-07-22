import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env.js";
import { BadRequest, Forbidden } from "../../shared/errors/http-errors.js";
import type { CredentialContext } from "./credentials-resolver.service.js";
import { SupabaseBarsRepository, type BarsRepository } from "./bars.repository.js";

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

// La web manda el UUID de la barra (api-client.ts → X-Bar-Id: bars.id), no su
// code. Se cachea el id de la barra de la instalación para no pegarle a la DB
// en cada request de cobro; TTL corto porque la barra puede re-crearse.
const BAR_ID_CACHE_TTL_MS = 60_000;
let cachedBarId: string | null = null;
let cachedAt = 0;
let barsRepo: BarsRepository = new SupabaseBarsRepository();

/** Solo para tests: inyectar un repo fake y resetear el cache. */
export function _setBarsRepoForTests(repo: BarsRepository) {
  barsRepo = repo;
  cachedBarId = null;
  cachedAt = 0;
}

async function resolveInstallationBarId(): Promise<string | null> {
  const now = Date.now();
  if (cachedBarId && now - cachedAt < BAR_ID_CACHE_TTL_MS) return cachedBarId;
  try {
    const bar = await barsRepo.findByCode(env.BAR_CODE);
    cachedBarId = bar?.id ?? null;
    cachedAt = now;
  } catch {
    // Fail-open hacia el default: un fallo de DB acá no debe tumbar el cobro;
    // la validación fuerte por id se saltea y solo vale el match por code.
    cachedBarId = null;
    cachedAt = now;
  }
  return cachedBarId;
}

/**
 * Extrae el contexto operativo elegido en el onboarding de caja.
 * Se monta después de authMiddleware + requireRole en las rutas de MP.
 *
 * A12 (mínimo): los headers dejan de ser autoritativos a ciegas — `x-bar-id`
 * debe ser la barra de la instalación (por code `BARRA-01` o por su UUID en la
 * base local, que es lo que manda la web) y `x-device-id` debe tener formato
 * de device de Point. El cableado device↔caja llega con gestion-posnets.
 */
export async function mpContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const barId = req.header("x-bar-id")?.trim();
  const deviceId = req.header("x-device-id")?.trim();

  if (barId && barId !== env.BAR_CODE) {
    const installationBarId = await resolveInstallationBarId();
    if (barId !== installationBarId) {
      next(new Forbidden(`La barra ${barId} no corresponde a esta instalación (${env.BAR_CODE}).`));
      return;
    }
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
