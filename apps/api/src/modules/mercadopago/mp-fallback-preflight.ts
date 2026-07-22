import { env } from "../../config/env.js";
import { MP_HTTP_TIMEOUT_MS, isFetchTimeout } from "./mp-http.js";

/**
 * Preflight del fallback de emergencia (F1.c) — mide si el MP_ACCESS_TOKEN de
 * la env podría cobrar por el lector, SIN cobrar: dos GET de solo lectura.
 * Singleton en memoria, mismo patrón que migrations-status.ts: lo escribe el
 * boot (y el refresh on-demand de health) y lo leen el resolver (guarda de
 * cuenta F1.b), /api/system/health y el aviso de /admin.
 *
 * `usable` se declara como "no encontré motivo para que no sirva": el listado
 * es un GET y el cobro un POST — lo único que cierra esa pregunta es el gate
 * físico del modo 3 (ver spec F1.c).
 *
 * Fail-open: NUNCA lanza, NUNCA bloquea el arranque, JAMÁS loguea el token.
 */

export type MpFallbackStatus = {
  status: "usable" | "unusable" | "unknown";
  /** Cuenta de MP dueña del MP_ACCESS_TOKEN (GET /users/me). */
  tokenUserId?: string;
  /** ¿El token ve el MP_POS_DEVICE_ID en su listado de devices? */
  deviceSeen?: boolean;
  operatingMode?: string;
  reason?: string;
  checkedAt: string | null;
  /** F1.a — quedó marcado si un cobro real degradó al fallback de env. */
  lastDegradedAt?: string;
  lastDegradedReason?: string;
};

const MP_API = "https://api.mercadopago.com";

const initialStatus: MpFallbackStatus = {
  status: "unknown",
  reason: "Preflight todavía no corrió.",
  checkedAt: null,
};

let status: MpFallbackStatus = initialStatus;

export function getMpFallbackStatus(): MpFallbackStatus {
  return status;
}

/** F1.a — el resolver marca acá que un cobro salió por la env (flag de salud). */
export function markMpFallbackDegraded(reason: string): void {
  status = { ...status, lastDegradedAt: new Date().toISOString(), lastDegradedReason: reason };
}

export function resetMpFallbackStatusForTests(): void {
  status = initialStatus;
}

async function mpGet(path: string, token: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${MP_API}${path}`, {
    method: "GET",
    signal: AbortSignal.timeout(MP_HTTP_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${token}` },
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}

/** Corre (o re-corre) el preflight y actualiza el singleton. Nunca lanza. */
export async function runMpFallbackPreflight(): Promise<MpFallbackStatus> {
  const checkedAt = new Date().toISOString();
  // Preservar el flag de degradación a través de re-evaluaciones.
  const degraded = {
    ...(status.lastDegradedAt ? { lastDegradedAt: status.lastDegradedAt } : {}),
    ...(status.lastDegradedReason ? { lastDegradedReason: status.lastDegradedReason } : {}),
  };

  const token = env.MP_ACCESS_TOKEN;
  if (!token) {
    status = {
      status: "unknown",
      reason: "MP_ACCESS_TOKEN no está configurado — no hay fallback de emergencia.",
      checkedAt,
      ...degraded,
    };
    return status;
  }

  try {
    // 1. ¿De qué cuenta es el token?
    const me = await mpGet("/users/me", token);
    if (!me.ok) {
      status = {
        status: me.status === 401 || me.status === 403 ? "unusable" : "unknown",
        reason: `GET /users/me respondió ${me.status} — el MP_ACCESS_TOKEN no es válido o MP no lo aceptó.`,
        checkedAt,
        ...degraded,
      };
      return status;
    }
    const tokenUserId = String((me.body as { id?: number | string } | null)?.id ?? "");
    if (!tokenUserId) {
      status = {
        status: "unknown",
        reason: "GET /users/me no devolvió un id de cuenta.",
        checkedAt,
        ...degraded,
      };
      return status;
    }

    const deviceId = env.MP_POS_DEVICE_ID;
    if (!deviceId) {
      status = {
        status: "unknown",
        tokenUserId,
        reason: "MP_POS_DEVICE_ID no está configurado — no hay lector contra el cual verificar.",
        checkedAt,
        ...degraded,
      };
      return status;
    }

    // 2. ¿El token ve ese lector, y en qué modo?
    const devices = await mpGet("/point/integration-api/devices?offset=0&limit=50", token);
    if (!devices.ok) {
      status = {
        status: "unknown",
        tokenUserId,
        reason: `GET /point/integration-api/devices respondió ${devices.status}.`,
        checkedAt,
        ...degraded,
      };
      return status;
    }
    const list =
      (devices.body as { devices?: { id: string; operating_mode?: string }[] } | null)?.devices ?? [];
    const device = list.find((d) => d.id === deviceId);
    if (!device) {
      status = {
        status: "unusable",
        tokenUserId,
        deviceSeen: false,
        reason: `El MP_ACCESS_TOKEN (cuenta ${tokenUserId}) no ve el lector ${deviceId} en su listado de devices.`,
        checkedAt,
        ...degraded,
      };
      return status;
    }

    status = {
      status: "usable",
      tokenUserId,
      deviceSeen: true,
      operatingMode: device.operating_mode,
      checkedAt,
      ...degraded,
    };
    return status;
  } catch (err) {
    status = {
      status: "unknown",
      reason: isFetchTimeout(err)
        ? `Mercado Pago no respondió en ${MP_HTTP_TIMEOUT_MS / 1000} segundos.`
        : `No se pudo consultar Mercado Pago: ${err instanceof Error ? err.message : "error desconocido"}.`,
      checkedAt,
      ...degraded,
    };
    return status;
  }
}
