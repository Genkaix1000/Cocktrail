import { env } from "../../config/env.js";
import { Conflict } from "../../shared/errors/http-errors.js";
import type { MercadoPagoCajasRepository } from "./mercadopago-cajas.repository.js";
import type { MercadoPagoCajasDevicesRepository } from "./mercadopago-cajas-devices.repository.js";

/**
 * Resultado de la resolución server-side del Posnet para un cobro.
 * `source: "env"` significa que se cayó a `MP_POS_DEVICE_ID` — último recurso
 * (D2 de gestion-posnets), siempre logueado y observable, nunca silencioso.
 */
export type ResolvedPosnet = {
  deviceId: string;
  source: "caja" | "env";
  cajaId: string | null;
};

/**
 * Code estable del 409 "sin Posnet": el frontend lo distingue del rechazo de
 * tarjeta (DEVICE_BUSY / REJECTED) sin parsear el mensaje.
 */
export const POSNET_NOT_LINKED_CODE = "POSNET_NOT_LINKED";

const NOT_LINKED_MESSAGE =
  "Esta caja no tiene Posnet vinculado. Vinculá uno desde /admin → Pagos (dar de alta el lector y activarlo para esta caja) y volvé a intentar.";

// ── Flag observable del uso de la env (D2) ──
// Singleton en memoria, mismo patrón que mp-fallback-preflight.ts: lo escribe
// el resolver en cada resolución que cae a la env y lo leerá la salud (T16).
type EnvDeviceUsage = {
  usingEnvDevice: boolean;
  lastUsedAt: string | null;
  lastReason: string | null;
};

const initialUsage: EnvDeviceUsage = { usingEnvDevice: false, lastUsedAt: null, lastReason: null };

let envDeviceUsage: EnvDeviceUsage = initialUsage;

export function markUsingEnvDevice(reason: string): void {
  envDeviceUsage = { usingEnvDevice: true, lastUsedAt: new Date().toISOString(), lastReason: reason };
}

/** ¿Algún cobro de este proceso se resolvió por MP_POS_DEVICE_ID? (lo lee mp-health, T16). */
export function isUsingEnvDevice(): boolean {
  return envDeviceUsage.usingEnvDevice;
}

export function getEnvDeviceUsage(): EnvDeviceUsage {
  return envDeviceUsage;
}

export function resetEnvDeviceUsageForTests(): void {
  envDeviceUsage = initialUsage;
}

/**
 * La autoridad del bloque A de gestion-posnets: en cada cobro resuelve
 * `barId (A12) → caja → device activo`, con `MP_POS_DEVICE_ID` como último
 * recurso observable. El header `x-device-id` del cliente NO participa (A5):
 * el único lugar del sistema que conoce la env es este service.
 *
 * Reglas duras (decididas por el dueño, no cambiarlas acá):
 * - Caja existente SIN device activo → 409. La configuración explícita manda:
 *   acá NO se cae a la env (cobrar en silencio por otro aparato es el defecto
 *   que esta feature vino a matar).
 * - Sin barId o sin caja provisionada (instalación legacy) → env con
 *   `console.warn` (un log por resolución, con el motivo) + flag consultable.
 * - Sin env tampoco → el mismo 409.
 */
export class PosnetResolverService {
  constructor(
    private readonly cajasRepo: MercadoPagoCajasRepository,
    private readonly devicesRepo: MercadoPagoCajasDevicesRepository,
    /**
     * Guarda del caso grave (la plata iría a otra cuenta): si lanza, el cobro
     * NO sale. `app.ts` inyecta MpHealthService.assertDeviceNotGrave (T17):
     * bloquea SOLO con deviceOwnership rojo; unknown jamás bloquea.
     */
    private readonly assertNotGrave: (deviceId: string, cajaId: string) => Promise<void>,
  ) {}

  async resolveForCharge(barId: string | undefined): Promise<ResolvedPosnet> {
    const { resolved, envReason } = await this.resolveChain(barId);
    if (resolved.source === "caja") {
      await this.assertNotGrave(resolved.deviceId, resolved.cajaId as string);
      return resolved;
    }

    markUsingEnvDevice(envReason as string);
    console.warn(
      `[PosnetResolver] cobrando por el device de la env (MP_POS_DEVICE_ID) porque ${envReason} — ` +
        "último recurso (D2): vinculá el Posnet a la caja desde /admin → Pagos.",
    );
    return resolved;
  }

  /**
   * Misma cadena de resolución que el cobro pero SIN efectos: ni warn, ni flag
   * de uso de env (que es exclusivo de cobros reales), ni guarda grave. Para
   * REPORTAR qué device usaría el cobro (bloque posnet de /api/system/status,
   * T18) sin que un poll de /admin ensucie la observabilidad de D2.
   * Lanza el mismo 409 POSNET_NOT_LINKED si no hay nada que resolver.
   */
  async peek(barId: string | undefined): Promise<ResolvedPosnet> {
    return (await this.resolveChain(barId)).resolved;
  }

  private async resolveChain(
    barId: string | undefined,
  ): Promise<{ resolved: ResolvedPosnet; envReason?: string }> {
    if (barId) {
      const caja = await this.cajasRepo.findByBarId(barId);
      if (caja) {
        const device = await this.devicesRepo.findActiveByCajaId(caja.id);
        if (!device) {
          throw new Conflict(NOT_LINKED_MESSAGE, POSNET_NOT_LINKED_CODE);
        }
        return { resolved: { deviceId: device.deviceId, source: "caja", cajaId: caja.id } };
      }
    }

    // Instalación legacy: sin barId en el contexto, o barra sin caja provisionada.
    const reason = barId
      ? `la barra ${barId} no tiene caja de Mercado Pago provisionada`
      : "el contexto de cobro no trae barId";

    const envDeviceId = env.MP_POS_DEVICE_ID;
    if (!envDeviceId) {
      throw new Conflict(NOT_LINKED_MESSAGE, POSNET_NOT_LINKED_CODE);
    }

    return { resolved: { deviceId: envDeviceId, source: "env", cajaId: null }, envReason: reason };
  }
}
