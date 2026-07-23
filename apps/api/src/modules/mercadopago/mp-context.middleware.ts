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

/**
 * UUID de la barra de la instalación (bars.findByCode(BAR_CODE)), cacheado con
 * TTL corto. Exportada para los consumidores que necesitan la MISMA resolución
 * barId → caja que el cobro fuera de una request (MpHealthService, el bloque
 * posnet de SystemService.getStatus vía app.ts).
 */
export async function resolveInstallationBarId(): Promise<string | null> {
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
 * base local, que es lo que manda la web).
 *
 * `x-device-id` está DEPRECADO (gestion-posnets, A5): la resolución del Posnet
 * es server-side (PosnetResolverService: barId → caja → device activo) y el
 * cobro IGNORA `mpContext.deviceId`. Se sigue validando el formato y dejándolo
 * en el contexto solo para no romper clientes viejos mientras exista el único
 * emisor (bar-sessions.service.ts:51 — lo elimina el PR 6).
 */
export async function mpContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const headerBarId = req.header("x-bar-id")?.trim();
  const deviceId = req.header("x-device-id")?.trim();

  // El contexto siempre lleva el UUID de bars.id: los consumidores del barId
  // (PosnetResolver → cajasRepo.findByBarId) esperan el UUID, nunca el code —
  // si acá quedara BARRA-01 una request sin header caería a la env aunque la
  // caja exista. La resolución está cacheada (TTL arriba), no es un hit por request.
  const installationBarId = await resolveInstallationBarId();

  if (headerBarId && headerBarId !== env.BAR_CODE && headerBarId !== installationBarId) {
    next(new Forbidden(`La barra ${headerBarId} no corresponde a esta instalación (${env.BAR_CODE}).`));
    return;
  }
  if (deviceId && !DEVICE_ID_RE.test(deviceId)) {
    next(new BadRequest("x-device-id inválido: se esperaba un id de Posnet (alfanumérico, _ o -)."));
    return;
  }

  req.mpContext = {
    // Siempre el UUID resuelto de la instalación (venga o no el header); el
    // code queda solo como último recurso si la barra todavía no existe en la
    // DB (instalación legacy → el resolver de Posnet degrada a la env).
    barId: installationBarId ?? env.BAR_CODE,
    ...(deviceId ? { deviceId } : {}),
  };
  next();
}
