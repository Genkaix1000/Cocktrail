import { Conflict } from "../../shared/errors/http-errors.js";
import type { Caja, MercadoPagoCajasRepository } from "./mercadopago-cajas.repository.js";
import type {
  CajaDevice,
  MercadoPagoCajasDevicesRepository,
} from "./mercadopago-cajas-devices.repository.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import type { MpDevicesListing } from "./mercadopago-provisioning.service.js";
import { getMpFallbackStatus, type MpFallbackStatus } from "./mp-fallback-preflight.js";
import { isUsingEnvDevice } from "./posnet-resolver.service.js";

/**
 * Un chequeo del panel de salud (bloque G de gestion-posnets).
 * `ok: null` = unknown — no se pudo determinar (MP caído, sin caja, sin
 * seller…). Un unknown NUNCA se pinta rojo ni bloquea nada: la decisión del
 * dueño es cero falsos positivos que paren la caja.
 * `action` solo acompaña a los rojos: dice QUÉ hacer, no solo qué está mal.
 */
export type MpHealthCheck = { ok: boolean | null; detail: string; action?: string };

export type MpHealth = {
  checks: {
    /** R21: exactamente 1 seller activo. */
    singleSeller: MpHealthCheck;
    /** El listado de devices con las credenciales activas contiene el device activo de la caja. */
    deviceOwnership: MpHealthCheck;
    /** operating_mode REAL (el del listado de MP) === "PDV". */
    deviceMode: MpHealthCheck;
    /** R22 derivado: caja.sellerUserId === sellerActivo.userId (sin columna). */
    cajaProvisioned: MpHealthCheck;
  };
  /** Fila F1 del panel — pass-through de getMpFallbackStatus(), tal cual. */
  fallback: MpFallbackStatus;
  /** D2: algún cobro de este proceso se resolvió por MP_POS_DEVICE_ID. */
  usingEnvDevice: boolean;
  /** true ⟺ deviceOwnership.ok === false — bloquea Tarjeta (Posnet). QR no usa device. */
  blocking: boolean;
  /** Hay Posnet activo vinculado a la caja (solo DB — no consulta MP). */
  hasLinkedDevice: boolean;
  checkedAt: string;
};

/**
 * Code estable del 409 del caso grave (la plata iría a otra cuenta): el
 * frontend lo distingue de POSNET_NOT_LINKED y del rechazo de tarjeta sin
 * parsear el mensaje.
 */
export const POSNET_WRONG_ACCOUNT_CODE = "POSNET_WRONG_ACCOUNT";

/** Mismo TTL que el polling de usePosnetStatus: el cobro nunca paga un fetch extra a MP. */
export const MP_HEALTH_TTL_MS = 30_000;

type CacheEntry = {
  health: MpHealth;
  /**
   * Ids de devices del último listado EXITOSO de esta computación. `null` si
   * el listado falló o no se intentó (sin device activo que chequear): con
   * `null` la guarda grave NO bloquea (unknown nunca bloquea).
   */
  listingIds: Set<string> | null;
  at: number;
};

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Bloque G de gestion-posnets: los 4 chequeos de salud de la vinculación con
 * Mercado Pago + la guarda del caso grave que consume el PosnetResolver (T17).
 *
 * Los chequeos operan sobre la caja de la barra activa (`barId` del contexto
 * de cobro; sin él, la de instalación). El listado de devices es EL MISMO
 * camino que `listMpDevices()` del provisioning (se inyecta la función).
 *
 * getHealth() NUNCA lanza: cualquier error interno degrada el chequeo a
 * unknown con el motivo en `detail`.
 */
export class MpHealthService {
  private cache = new Map<string, CacheEntry>();
  private inFlight = new Map<string, Promise<CacheEntry>>();

  constructor(
    private readonly sellersRepo: MercadoPagoSellersRepository,
    private readonly cajasRepo: MercadoPagoCajasRepository,
    private readonly devicesRepo: MercadoPagoCajasDevicesRepository,
    /** Resolución cacheada del UUID de la barra de la instalación (mp-context.middleware). */
    private readonly resolveInstallationBarId: () => Promise<string | null>,
    /** El listMpDevices() del provisioning: el único GET /devices del sistema. */
    private readonly listMpDevices: () => Promise<MpDevicesListing>,
  ) {}

  async getHealth(refresh = false, barId?: string | null): Promise<MpHealth> {
    const entry = await this.getEntry(refresh, barId);
    // Los singletons (preflight F1 y flag de env) se leen en vivo: son lecturas
    // de memoria gratis y así el panel refleja una degradación ocurrida DESPUÉS
    // de la última computación cacheada.
    return {
      ...entry.health,
      fallback: getMpFallbackStatus(),
      usingEnvDevice: isUsingEnvDevice(),
    };
  }

  /**
   * Guarda del caso grave para el resolver (T17): lanza 409 SOLO si el último
   * listado exitoso de devices (cache de 30 s) NO contiene el device con el que
   * se va a cobrar — la plata iría a otra cuenta. `unknown` (MP caído, listado
   * nunca corrido) NUNCA bloquea: esos casos fallan solos contra MP y la
   * decisión del dueño es no parar la caja por un falso positivo.
   *
   * Latencia del camino de cobro: con cache tibio es una lectura de memoria;
   * con cache frío paga UN fetch acotado por MP_HTTP_TIMEOUT_MS que, si falla,
   * degrada a unknown (no bloquea) — nunca un fetch por intent.
   */
  async assertDeviceNotGrave(deviceId: string, _cajaId: string): Promise<void> {
    let entry: CacheEntry;
    try {
      // El listado de devices es por seller (no por barra): alcanza cualquier
      // cache tibio con listing, o computar la barra de instalación.
      entry =
        [...this.cache.values()].find(
          (e) => e.listingIds && Date.now() - e.at < MP_HEALTH_TTL_MS,
        ) ?? (await this.getEntry(false, null));
    } catch {
      // getEntry no debería lanzar (compute atrapa todo), pero si lo hiciera,
      // la guarda es fail-open por diseño.
      return;
    }
    if (!entry.listingIds) return; // unknown: sin listado fresco no se bloquea
    if (!entry.listingIds.has(deviceId)) {
      throw new Conflict(
        `Cobro bloqueado: el Posnet ${deviceId} no aparece en el listado de la cuenta de ` +
          "Mercado Pago vinculada — la plata de este cobro entraría a OTRA cuenta. " +
          "Reclamá el lector desde la app de Mercado Pago con la cuenta vinculada, o " +
          "vinculá la cuenta correcta en /admin → Pagos.",
        POSNET_WRONG_ACCOUNT_CODE,
      );
    }
  }

  // ── internals ────────────────────────────────────────────────────────

  private async getEntry(refresh: boolean, barId?: string | null): Promise<CacheEntry> {
    const key = barId?.trim() || "__install__";
    const warm = this.cache.get(key);
    if (!refresh && warm && Date.now() - warm.at < MP_HEALTH_TTL_MS) {
      return warm;
    }
    // Dedup de computaciones concurrentes por barra.
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const created = this.compute(barId).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, created);
    return created;
  }

  private async compute(barIdHint?: string | null): Promise<CacheEntry> {
    const checkedAt = new Date().toISOString();
    const cacheKey = barIdHint?.trim() || "__install__";

    // ── seller activo (R21) ──
    let seller: Seller | null = null;
    let singleSeller: MpHealthCheck;
    try {
      seller = await this.sellersRepo.findActive();
      singleSeller = seller
        ? {
            ok: true,
            detail:
              `Una sola cuenta de Mercado Pago activa: ${seller.userId}` +
              (seller.nickname ? ` (${seller.nickname})` : "") +
              ".",
          }
        : {
            ok: false,
            detail: "No hay ninguna cuenta de Mercado Pago vinculada.",
            action:
              "Vinculá la cuenta de Mercado Pago del boliche desde /admin → Pagos " +
              "(botón «Vincular con Mercado Pago»).",
          };
    } catch (err) {
      const msg = errMessage(err);
      // findActive lanza con mensaje propio cuando el invariante single-seller
      // está roto (2+ activos, R21); cualquier otro error (DB caída) es unknown.
      singleSeller = msg.includes("single-seller")
        ? {
            ok: false,
            detail: msg,
            action:
              "Desvinculá todas las cuentas desde /admin → Pagos y volvé a vincular " +
              "UNA sola: la del dueño del lector.",
          }
        : { ok: null, detail: `No se pudo consultar las cuentas vinculadas: ${msg}` };
    }

    // ── caja + device activo de la barra del contexto (fallback: instalación) ──
    let caja: Caja | null = null;
    let device: CajaDevice | null = null;
    let contextError: string | null = null;
    try {
      const barId = barIdHint?.trim() || (await this.resolveInstallationBarId());
      caja = barId ? await this.cajasRepo.findByBarId(barId) : null;
      device = caja ? await this.devicesRepo.findActiveByCajaId(caja.id) : null;
    } catch (err) {
      contextError = errMessage(err);
    }

    // ── listado de devices (solo si hay un device activo que chequear) ──
    let listing: MpDevicesListing | null = null;
    let listingError: string | null = null;
    if (device) {
      try {
        listing = await this.listMpDevices();
      } catch (err) {
        listingError = errMessage(err);
      }
    }

    const deviceOwnership = this.checkDeviceOwnership(caja, device, listing, listingError, contextError);
    const deviceMode = this.checkDeviceMode(caja, device, listing, listingError, contextError);
    const cajaProvisioned = this.checkCajaProvisioned(caja, seller, singleSeller, contextError);

    const health: MpHealth = {
      checks: { singleSeller, deviceOwnership, deviceMode, cajaProvisioned },
      fallback: getMpFallbackStatus(),
      usingEnvDevice: isUsingEnvDevice(),
      // Device en otra cuenta: bloquea Tarjeta. QR dinámico no usa Posnet.
      blocking: deviceOwnership.ok === false,
      hasLinkedDevice: device !== null,
      checkedAt,
    };

    const entry: CacheEntry = {
      health,
      listingIds: listing ? new Set(listing.devices.map((d) => d.id)) : null,
      at: Date.now(),
    };
    this.cache.set(cacheKey, entry);
    return entry;
  }

  private checkDeviceOwnership(
    caja: Caja | null,
    device: CajaDevice | null,
    listing: MpDevicesListing | null,
    listingError: string | null,
    contextError: string | null,
  ): MpHealthCheck {
    if (contextError) {
      return { ok: null, detail: `No se pudo resolver la caja de la instalación: ${contextError}` };
    }
    if (!caja) {
      return {
        ok: null,
        detail:
          "No hay caja de Mercado Pago provisionada para esta barra: no hay vínculo que " +
          "chequear. Provisionala desde /admin → Pagos.",
      };
    }
    if (!device) {
      return {
        ok: null,
        detail:
          "La caja no tiene Posnet activo vinculado: no hay lector que chequear. " +
          "El cobro con débito va a avisar «esta caja no tiene Posnet vinculado».",
      };
    }
    if (!listing) {
      return {
        ok: null,
        detail: `No se pudo consultar el listado de Posnets en Mercado Pago: ${listingError ?? "sin detalle"}`,
      };
    }
    const seen = listing.devices.some((d) => d.id === device.deviceId);
    if (!seen) {
      const owner = listing.token.userId ? ` (cuenta ${listing.token.userId})` : "";
      return {
        ok: false,
        detail:
          `El lector ${device.deviceId} NO aparece en el listado de devices de las credenciales ` +
          `activas${owner}: la plata de un cobro entraría a otra cuenta. Cobro bloqueado.`,
        action:
          "El lector está en otra cuenta de MP: reclamalo desde la app de MP con la cuenta " +
          "vinculada, o vinculá la cuenta correcta en /admin → Pagos.",
      };
    }
    return {
      ok: true,
      detail: `El lector ${device.deviceId} aparece en el listado de la cuenta activa.`,
    };
  }

  private checkDeviceMode(
    caja: Caja | null,
    device: CajaDevice | null,
    listing: MpDevicesListing | null,
    listingError: string | null,
    contextError: string | null,
  ): MpHealthCheck {
    if (contextError) {
      return { ok: null, detail: `No se pudo resolver la caja de la instalación: ${contextError}` };
    }
    if (!caja || !device) {
      return {
        ok: null,
        detail: !caja
          ? "Sin caja provisionada no hay lector cuyo modo chequear."
          : "La caja no tiene Posnet activo vinculado: no hay modo que chequear.",
      };
    }
    if (!listing) {
      return {
        ok: null,
        detail: `No se pudo leer el modo real del lector en Mercado Pago: ${listingError ?? "sin detalle"}`,
      };
    }
    const mpDevice = listing.devices.find((d) => d.id === device.deviceId);
    if (!mpDevice) {
      return {
        ok: null,
        detail:
          `El modo real del lector ${device.deviceId} no se puede leer: no aparece en el ` +
          "listado de la cuenta activa (ver el chequeo de pertenencia).",
      };
    }
    if (mpDevice.operatingMode === "PDV") {
      return { ok: true, detail: `El lector ${device.deviceId} está en modo PDV (valor real de MP).` };
    }
    if (mpDevice.operatingMode === "STANDALONE") {
      return {
        ok: false,
        detail: `El lector ${device.deviceId} está en modo STANDALONE: rechaza los cobros por sistema.`,
        action: "Ponelo en modo PDV desde /admin → Pagos (botón «Poner en modo PDV» del lector).",
      };
    }
    return {
      ok: null,
      detail: `Mercado Pago no informó el operating_mode del lector ${device.deviceId}.`,
    };
  }

  private checkCajaProvisioned(
    caja: Caja | null,
    seller: Seller | null,
    singleSeller: MpHealthCheck,
    contextError: string | null,
  ): MpHealthCheck {
    if (contextError) {
      return { ok: null, detail: `No se pudo resolver la caja de la instalación: ${contextError}` };
    }
    if (!caja) {
      return {
        ok: null,
        detail:
          "No hay caja de Mercado Pago provisionada para esta barra. " +
          "Provisionala desde /admin → Pagos.",
      };
    }
    if (!seller) {
      // Sin seller activo (o invariante roto / DB caída): no hay contra qué
      // comparar — el problema real lo señala el chequeo singleSeller.
      return {
        ok: null,
        detail:
          singleSeller.ok === false
            ? "Sin una única cuenta activa no se puede verificar en qué cuenta está provisionada la caja (ver el chequeo de cuenta)."
            : "No se pudo determinar la cuenta activa para verificar la caja.",
      };
    }
    if (caja.sellerUserId !== seller.userId) {
      return {
        ok: false,
        detail:
          `La caja está provisionada en la cuenta ${caja.sellerUserId}, pero la cuenta activa ` +
          `es ${seller.userId}: caja huérfana (R22).`,
        action:
          "Re-provisioná la caja desde /admin → Pagos con la cuenta activa. Ojo: el QR " +
          "estático cambia — hay que reimprimir el de las mesas.",
      };
    }
    return {
      ok: true,
      detail: `La caja está provisionada en la cuenta activa (${seller.userId}).`,
    };
  }
}
