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

// La web manda el UUID de la barra (api-client.ts → X-Bar-Id: bars.id).
// Cache solo para la barra de instalación (fallback sin header); las demás
// se resuelven por id/code contra DB (pocas barras, lookup barato).
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

/**
 * UUID de la barra de la instalación (bars.findByCode(BAR_CODE)), cacheado con
 * TTL corto. Exportada para consumidores fuera de request (MpHealthService,
 * SystemService) cuando no hay X-Bar-Id.
 */
export async function resolveInstallationBarId(): Promise<string | null> {
  const now = Date.now();
  if (cachedBarId && now - cachedAt < BAR_ID_CACHE_TTL_MS) return cachedBarId;
  try {
    const bar = await barsRepo.findByCode(env.BAR_CODE);
    cachedBarId = bar?.id ?? null;
    cachedAt = now;
  } catch {
    // Fail-open hacia el default: un fallo de DB acá no debe tumbar el cobro.
    cachedBarId = null;
    cachedAt = now;
  }
  return cachedBarId;
}

/**
 * Extrae el contexto operativo elegido en el onboarding de caja.
 * Se monta después de authMiddleware + requireRole en las rutas de MP.
 *
 * `x-bar-id` = UUID (o code) de una fila en `bars`. Sin header → barra de
 * instalación (`BAR_CODE`). Así VIP y Portátil cobran contra su propia caja.
 *
 * `x-device-id` está DEPRECADO: la resolución del Posnet es server-side
 * (PosnetResolverService). Se valida el formato por compat con clientes viejos.
 */
export async function mpContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const headerBarId = req.header("x-bar-id")?.trim();
  const deviceId = req.header("x-device-id")?.trim();

  if (deviceId && !DEVICE_ID_RE.test(deviceId)) {
    next(new BadRequest("x-device-id inválido: se esperaba un id de Posnet (alfanumérico, _ o -)."));
    return;
  }

  let barId: string;
  try {
    barId = await resolveRequestBarId(headerBarId);
  } catch (err) {
    next(err);
    return;
  }

  req.mpContext = {
    barId,
    ...(deviceId ? { deviceId } : {}),
  };
  next();
}

async function resolveRequestBarId(headerBarId: string | undefined): Promise<string> {
  if (!headerBarId || headerBarId === env.BAR_CODE) {
    return (await resolveInstallationBarId()) ?? env.BAR_CODE;
  }

  try {
    const byId = await barsRepo.findById(headerBarId);
    if (byId) return byId.id;

    const byCode = await barsRepo.findByCode(headerBarId);
    if (byCode) return byCode.id;
  } catch {
    // Sin DB solo el code de instalación es autoritativo (mismo fail-open que antes).
    if (headerBarId === env.BAR_CODE) return env.BAR_CODE;
    throw new Forbidden(
      `La barra ${headerBarId} no se pudo validar (DB inaccesible).`,
    );
  }

  throw new Forbidden(`La barra ${headerBarId} no está registrada en esta instalación.`);
}
