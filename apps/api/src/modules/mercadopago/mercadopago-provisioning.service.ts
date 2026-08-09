import { env } from "../../config/env.js";
import { BadRequest, Conflict, NotFound } from "../../shared/errors/http-errors.js";
import type { BarsRepository } from "./bars.repository.js";
import type { CredentialsResolverService } from "./credentials-resolver.service.js";
import type { Caja, MercadoPagoCajasRepository } from "./mercadopago-cajas.repository.js";
import type {
  CajaDevice,
  MercadoPagoCajasDevicesRepository,
} from "./mercadopago-cajas-devices.repository.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import { getMpFallbackStatus } from "./mp-fallback-preflight.js";
import { isFetchTimeout, MP_HTTP_TIMEOUT_MS } from "./mp-http.js";

const MP_API = "https://api.mercadopago.com";
const EXTERNAL_STORE_ID = "COCKTRAILSUC001";

/** Dirección por defecto de Bosko (docs/mp/api-stores-pos.md). Location es obligatoria en MP. */
const DEFAULT_STORE_ADDRESS = {
  streetNumber: "739",
  streetName: "Ramon Castillo",
  cityName: "Bolívar",
  stateName: "Buenos Aires",
  latitude: -36.23,
  longitude: -61.11,
  reference: "Frente a la rotonda",
};

export type StoreAddress = {
  streetNumber: string;
  streetName: string;
  cityName: string;
  stateName: string;
  latitude: number;
  longitude: number;
  reference?: string;
};

export type CreateStoreInput = {
  barId?: string;
  name: string;
  address?: Partial<StoreAddress>;
};

export type CreatePosInput = {
  /** Código de barra (BARRA-01) o UUID de bars.id. */
  barId: string;
  name: string;
};

export type LinkDeviceInput = {
  /** Si viene, vincula el Posnet a ese PDV (reemplaza el vínculo previo). */
  cajaId?: string;
  deviceId: string;
  deviceUsername?: string;
};

export type AssignDeviceInput = {
  cajaId: string;
  /** null / vacío = "Sin Posnet" (desvincula sin borrar el registro). */
  deviceId: string | null;
};

export type StoreStatus = {
  linked: boolean;
  storeId: string | null;
  /** Nombre REAL de la sucursal en MP (criterio E: nunca un literal); null si MP no respondió. */
  name: string | null;
  /** Cache local del nombre (rama A) o alias puesto por el dueño (rama B). */
  storeName: string | null;
  sellerUserId: string | null;
};

/**
 * Fila del listado crudo de `GET /point/integration-api/devices` (bloque B).
 * `model` se deriva del prefijo del id (`PAX_A910__SMARTPOS…` → `PAX_A910`)
 * porque MP no tiene GET por id (anexo #14 de gestion-posnets).
 */
export type MpDeviceListItem = {
  id: string;
  model: string;
  operatingMode: "PDV" | "STANDALONE" | null;
  storeId: string | null;
  posId: string | null;
  /** ¿Existe en mercadopago_cajas_devices? */
  registeredLocally: boolean;
};

/**
 * Listado + contexto para la pantalla guía (decisión 2 de la spec): con
 * `token.source`/`token.userId` vs `sellerUserId` el front distingue "todavía
 * no reclamaste el lector" de "el token es de otra aplicación/cuenta".
 */
export type MpDevicesListing = {
  devices: MpDeviceListItem[];
  token: { source: "seller" | "env"; userId: string | null };
  sellerUserId: string | null;
};

export type SetOperatingModeResult = {
  deviceId: string;
  /** Modo que MP confirmó tras el PATCH (o el pedido, si no vino en la respuesta). */
  operatingMode: "PDV" | "STANDALONE";
  /** true si además se persistió en mercadopago_cajas_devices (device registrado). */
  registeredLocally: boolean;
};

export type RenameStoreResult = {
  /** true = el nombre quedó en MP (rama A, verificado con re-fetch). */
  renamedInMp: boolean;
  name: string;
  /** Rama degradada (alias local): el nombre que MP sigue teniendo. */
  mpName?: string | null;
};

export type CajaDto = Caja & {
  device?: CajaDevice | null;
  /**
   * R22 derivado (sin columna): la caja está provisionada en OTRA cuenta que la
   * del seller activo. Se computa en cada listado, nunca se persiste.
   */
  isOrphan: boolean;
  /** Código de la barra (BARRA-01 / PORTATIL). */
  barCode: string | null;
  /** Si false, no aparece en el selector de caja. */
  barEnabled: boolean;
};

type MpStoreResponse = {
  id: number | string;
  name?: string;
  external_id?: string;
  location?: Record<string, unknown> | null;
};
type MpPosResponse = {
  id: number | string;
  external_id?: string;
  store_id?: number | string;
  qr?: { image?: string; template_document?: string };
};
type MpDeviceResponse = {
  id: string;
  operating_mode?: string;
  store_id?: number | string;
  pos_id?: number | string;
  status?: { state?: string };
};

/** R25: solo se persiste lo que MP realmente dijo; cualquier otra cosa es NULL honesto. */
function normalizeOperatingMode(mode: string | undefined): "PDV" | "STANDALONE" | null {
  return mode === "PDV" || mode === "STANDALONE" ? mode : null;
}

/**
 * Provisionamiento de Store / POS / Point devices (Fase 3).
 * Usa el token del seller vinculado vía CredentialsResolverService.
 */
export class MercadoPagoProvisioningService {
  private readonly baseUrl = MP_API;

  constructor(
    private readonly credentialsResolver: CredentialsResolverService,
    private readonly sellersRepo: MercadoPagoSellersRepository,
    private readonly barsRepo: BarsRepository,
    private readonly cajasRepo: MercadoPagoCajasRepository,
    private readonly devicesRepo: MercadoPagoCajasDevicesRepository,
  ) {}

  async getStoreStatus(): Promise<StoreStatus> {
    const cajas = await this.cajasRepo.listAll();
    const withStore = cajas.find((c) => c.storeId);
    if (!withStore) {
      return { linked: false, storeId: null, name: null, storeName: null, sellerUserId: null };
    }

    // Criterio E: el nombre es el que MP realmente tiene (stores/search ya lo
    // trae) — nunca un literal. Tolerante a fallos: sin respuesta de MP el
    // name queda null y el storeName local cubre la pantalla sin mentir.
    let name: string | null = null;
    try {
      const token = await this.credentialsResolver.resolve({
        sellerUserId: withStore.sellerUserId,
        allowGlobalFallback: true,
      });
      const store = await this.fetchStoreDetail(token, withStore.sellerUserId, withStore.storeId);
      name = store?.name ?? null;
    } catch {
      name = null;
    }

    return {
      linked: true,
      storeId: withStore.storeId,
      name,
      storeName: withStore.storeName,
      sellerUserId: withStore.sellerUserId,
    };
  }

  /**
   * Lista CRUDA de los Posnets que MP reporta para el token activo (bloque B:
   * a diferencia de findDeviceInMp, acá no se filtra ni se descarta nada) +
   * contexto de credenciales para la pantalla guía. De paso re-sincroniza el
   * operating_mode de los devices registrados (bloque C / D5: la columna es
   * cache del valor real, y este fetch es el momento de refrescarla).
   */
  async listMpDevices(): Promise<MpDevicesListing> {
    const creds = await this.resolveListingCredentials();

    const data = await this.mpRequest<{ devices?: MpDeviceResponse[] }>(
      creds.token,
      `/point/integration-api/devices?offset=0&limit=50`,
      { method: "GET" },
      "No se pudo listar los Posnets de la cuenta de Mercado Pago",
    );
    const mpDevices = data.devices ?? [];

    const local = await this.devicesRepo.listAll();
    const localByDeviceId = new Map(local.map((d) => [d.deviceId, d]));

    // Re-sync del modo real: solo escribe si cambió o nunca se sincronizó,
    // para no generar un UPDATE por device en cada refresh de la pantalla.
    const syncedAt = new Date().toISOString();
    for (const mp of mpDevices) {
      const registered = localByDeviceId.get(mp.id);
      if (!registered) continue;
      const realMode = normalizeOperatingMode(mp.operating_mode);
      if (registered.operatingMode !== realMode || !registered.operatingModeSyncedAt) {
        await this.devicesRepo.update(registered.id, {
          operatingMode: realMode,
          operatingModeSyncedAt: syncedAt,
        });
      }
    }

    return {
      devices: mpDevices.map((mp) => ({
        id: mp.id,
        // MP no tiene GET /devices/{id} (anexo #14): el modelo solo puede
        // derivarse del prefijo del id (PAX_A910__SMARTPOS… → PAX_A910).
        model: mp.id.split("__")[0] ?? mp.id,
        operatingMode: normalizeOperatingMode(mp.operating_mode),
        storeId: mp.store_id != null ? String(mp.store_id) : null,
        posId: mp.pos_id != null ? String(mp.pos_id) : null,
        registeredLocally: localByDeviceId.has(mp.id),
      })),
      token: { source: creds.source, userId: creds.tokenUserId },
      sellerUserId: creds.sellerUserId,
    };
  }

  /**
   * Pasa un lector a modo PDV (o STANDALONE) contra MP — el PATCH que hasta
   * ahora iba con `curl` a mano (bloque C). Si el device está registrado,
   * persiste el modo confirmado + synced_at (la columna nunca miente, R25).
   */
  async setDeviceOperatingMode(
    deviceId: string,
    mode: "PDV" | "STANDALONE",
  ): Promise<SetOperatingModeResult> {
    if (!deviceId?.trim()) throw new BadRequest("deviceId es requerido.");
    if (mode !== "PDV" && mode !== "STANDALONE") {
      throw new BadRequest('mode debe ser "PDV" o "STANDALONE".');
    }
    const id = deviceId.trim();

    const seller = await this.requireActiveSeller();
    const token = await this.credentialsResolver.resolve({
      sellerUserId: seller.userId,
      allowGlobalFallback: true,
    });

    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}/point/integration-api/devices/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          signal: AbortSignal.timeout(MP_HTTP_TIMEOUT_MS),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ operating_mode: mode }),
        },
      );
    } catch (err) {
      if (isFetchTimeout(err)) {
        throw new Conflict(
          `Mercado Pago no respondió en ${MP_HTTP_TIMEOUT_MS / 1000} segundos al cambiar ` +
            `el modo del Posnet ${id}. Probá de nuevo.`,
          "MP_TIMEOUT",
        );
      }
      throw err;
    }

    if (!response.ok) {
      const errData = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      const mpMessage = errData.message || response.statusText;
      // 4xx accionables: el admin tiene que saber QUÉ hacer, no ver un 500.
      if (response.status === 404) {
        throw new Conflict(
          `Mercado Pago no encontró el Posnet ${id} en la cuenta vinculada (${seller.userId}): ` +
            "el lector pertenece a otra cuenta o todavía no fue reclamado. Reclamalo desde la " +
            "app de Mercado Pago con la cuenta del boliche y volvé a intentar.",
          errData.error,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new Conflict(
          `La cuenta de Mercado Pago vinculada (${seller.userId}) no tiene permiso para cambiar ` +
            `el modo del Posnet ${id} (MP respondió ${response.status}: ${mpMessage}). ` +
            "Verificá que el lector esté reclamado en esa cuenta.",
          errData.error,
        );
      }
      throw new Conflict(
        `No se pudo cambiar el modo del Posnet ${id}: ${mpMessage}`,
        errData.error,
      );
    }

    const body = (await response.json().catch(() => null)) as {
      operating_mode?: string;
    } | null;
    const confirmedMode = normalizeOperatingMode(body?.operating_mode) ?? mode;

    const registered = await this.devicesRepo.findByDeviceId(id);
    if (registered) {
      await this.devicesRepo.update(registered.id, {
        operatingMode: confirmedMode,
        operatingModeSyncedAt: new Date().toISOString(),
      });
    }

    return { deviceId: id, operatingMode: confirmedMode, registeredLocally: Boolean(registered) };
  }

  /**
   * Renombra la sucursal (bloque E, decisión 3: el nombre viaja a MP). Rama A
   * con degradación automática: si el PUT falla, MP lo ignora, o resulta ser
   * un replace destructivo, el nombre queda como ALIAS local y la respuesta
   * lleva el nombre real de MP — la pantalla nunca miente.
   */
  async renameStore(rawName: string): Promise<RenameStoreResult> {
    const name = rawName?.trim();
    if (!name || name.length > 60) {
      throw new BadRequest("name es requerido (1 a 60 caracteres).");
    }

    const cajas = await this.cajasRepo.listAll();
    const caja = cajas.find((c) => c.storeId);
    if (!caja) {
      throw new Conflict(
        "No hay ninguna sucursal provisionada todavía: creá la sucursal desde /admin → Pagos antes de renombrarla.",
      );
    }

    const token = await this.credentialsResolver.resolve({
      sellerUserId: caja.sellerUserId,
      allowGlobalFallback: true,
    });

    // GET previo: baseline para verificar el PUT y para restaurar si resulta
    // ser un replace completo. Sin baseline no se puede verificar nada → alias.
    const prev = await this.fetchStoreDetail(token, caja.sellerUserId, caja.storeId);
    if (!prev) {
      await this.cajasRepo.updateProvisioning(caja.id, { storeName: name });
      return { renamedInMp: false, name, mpName: null };
    }

    // Rama A: PUT solo con { name } (supuesto de T1, pendiente de validación
    // real — por eso todo lo que sigue verifica en vez de confiar).
    let putAccepted = true;
    try {
      await this.mpRequest(
        token,
        `/users/${caja.sellerUserId}/stores/${caja.storeId}`,
        { method: "PUT", body: JSON.stringify({ name }) },
        "No se pudo renombrar la sucursal en Mercado Pago",
      );
    } catch {
      // 4xx/405/timeout → degradación automática a alias local.
      putAccepted = false;
    }

    if (!putAccepted) {
      await this.cajasRepo.updateProvisioning(caja.id, { storeName: name });
      return { renamedInMp: false, name, mpName: prev.name ?? null };
    }

    // Verificar con re-fetch que el name quedó y que nada se vació.
    const after = await this.fetchStoreDetail(token, caja.sellerUserId, caja.storeId);
    if (!after) {
      // MP aceptó el PUT pero no se pudo verificar: no se afirma lo que no se vio.
      await this.cajasRepo.updateProvisioning(caja.id, { storeName: name });
      return { renamedInMp: false, name, mpName: prev.name ?? null };
    }

    const hasLocation = (s: MpStoreResponse) =>
      s.location != null && typeof s.location === "object" && Object.keys(s.location).length > 0;
    const erased =
      (Boolean(prev.external_id) && !after.external_id) ||
      (hasLocation(prev) && !hasLocation(after));

    if (erased) {
      // PUT-replace destructivo detectado: restaurar el objeto previo completo
      // (best effort) y tratarlo como rechazo — alias local.
      try {
        await this.mpRequest(
          token,
          `/users/${caja.sellerUserId}/stores/${caja.storeId}`,
          {
            method: "PUT",
            body: JSON.stringify({
              ...(prev.name !== undefined ? { name: prev.name } : {}),
              ...(prev.external_id !== undefined ? { external_id: prev.external_id } : {}),
              ...(prev.location != null ? { location: prev.location } : {}),
            }),
          },
          "No se pudo restaurar la sucursal en Mercado Pago",
        );
      } catch (err) {
        console.error("[MercadoPagoProvisioningService] Error restaurando el store tras PUT destructivo:", err);
      }
      await this.cajasRepo.updateProvisioning(caja.id, { storeName: name });
      return { renamedInMp: false, name, mpName: prev.name ?? null };
    }

    if (after.name !== name) {
      // MP respondió 200 pero ignoró el campo → alias local, nombre real visible.
      await this.cajasRepo.updateProvisioning(caja.id, { storeName: name });
      return { renamedInMp: false, name, mpName: after.name ?? prev.name ?? null };
    }

    // Rama A confirmada: el nombre quedó en MP; store_name pasa a ser cache.
    await this.cajasRepo.updateProvisioning(caja.id, { storeName: name });
    return { renamedInMp: true, name };
  }

  async getSummary() {
    const [cajas, devices] = await Promise.all([
      this.cajasRepo.listAll(),
      this.devicesRepo.listAll(),
    ]);
    const storeStatus = await this.getStoreStatus();
    return {
      store: storeStatus,
      bars: cajas.length,
      posnets: devices.length,
    };
  }

  async listCajas(): Promise<CajaDto[]> {
    const [cajas, devices, bars, activeSellerUserId] = await Promise.all([
      this.cajasRepo.listAll(),
      this.devicesRepo.listAll(),
      this.barsRepo.listAll(),
      this.findActiveSellerUserId(),
    ]);
    const barById = new Map(bars.map((b) => [b.id, b]));
    return cajas.map((c) => {
      const bar = barById.get(c.barId);
      return {
        ...c,
        device: devices.find((d) => d.cajaId === c.id && d.isActive) ?? null,
        // Sin seller activo → false: no hay cuenta "activa" contra la cual estar
        // huérfana, y ese unknown ya lo señala el check cajaProvisioned del health.
        isOrphan: activeSellerUserId !== null && c.sellerUserId !== activeSellerUserId,
        barCode: bar?.code ?? null,
        barEnabled: bar?.enabled ?? true,
      };
    });
  }

  async listDevices(): Promise<CajaDevice[]> {
    return this.devicesRepo.listAll();
  }

  /**
   * Crea la sucursal en MP y deja el store_id listo para la primera caja.
   * No persiste una fila de caja por sí sola: el store_id se guarda al crear el POS.
   * Si ya hay cajas con store_id, reusa ese id (idempotente a nivel Cocktrail).
   */
  async createStore(input: CreateStoreInput): Promise<{ storeId: string; name: string }> {
    const seller = await this.requireActiveSeller();
    const token = await this.credentialsResolver.resolve({
      sellerUserId: seller.userId,
      allowGlobalFallback: true,
    });

    const existing = await this.cajasRepo.findBySellerUserId(seller.userId);
    const existingStoreId = existing.find((c) => c.storeId)?.storeId;
    if (existingStoreId) {
      return { storeId: existingStoreId, name: input.name };
    }

    // Idempotencia con MP: si el store ya existe en la cuenta (ej. un intento
    // previo que falló al crear el POS), reusarlo en vez de recrearlo — MP
    // rechaza external_id duplicado con "already assigned to this user".
    const alreadyInMp = await this.findStoreByExternalId(token, seller.userId, EXTERNAL_STORE_ID);
    if (alreadyInMp) {
      return { storeId: String(alreadyInMp.id), name: alreadyInMp.name ?? input.name };
    }

    const address = this.mergeAddress(input.address);
    const body = {
      name: input.name,
      external_id: EXTERNAL_STORE_ID,
      location: {
        street_number: address.streetNumber,
        street_name: address.streetName,
        city_name: address.cityName,
        state_name: address.stateName,
        latitude: address.latitude,
        longitude: address.longitude,
        reference: address.reference,
      },
    };

    const mpStore = await this.mpRequest<MpStoreResponse>(
      token,
      `/users/${seller.userId}/stores`,
      { method: "POST", body: JSON.stringify(body) },
      "No se pudo crear la sucursal en Mercado Pago",
    );

    return { storeId: String(mpStore.id), name: mpStore.name ?? input.name };
  }

  /**
   * Busca una sucursal ya creada en MP por su external_id (GET .../stores/search).
   * Tolerante a fallos: si la búsqueda falla o no encuentra nada, devuelve null
   * (el caller intenta crear). El response de MP es `[{ paging, results: [...] }]`
   * en algunas variantes y `{ results: [...] }` en otras — se normalizan ambas.
   */
  private async findStoreByExternalId(
    token: string,
    userId: string,
    externalId: string,
  ): Promise<MpStoreResponse | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/users/${userId}/stores/search?external_id=${encodeURIComponent(externalId)}`,
        {
          method: "GET",
          signal: AbortSignal.timeout(MP_HTTP_TIMEOUT_MS),
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) return null;

      const data = await response.json().catch(() => null);
      const results = Array.isArray(data)
        ? data[0]?.results
        : (data as { results?: unknown[] } | null)?.results;
      if (!Array.isArray(results)) return null;

      const match = (results as MpStoreResponse[]).find(
        (s) => s.external_id === externalId,
      ) ?? (results[0] as MpStoreResponse | undefined);
      return match?.id != null ? match : null;
    } catch (err) {
      console.error("[MercadoPagoProvisioningService] Error searching store:", err);
      return null;
    }
  }

  /**
   * Crea el POS en MP (con QR estático) y lo persiste en mercadopago_cajas.
   * Si el seller aún no tiene store_id, crea la sucursal automáticamente.
   */
  async createPos(input: CreatePosInput): Promise<CajaDto> {
    if (!input.barId?.trim()) throw new BadRequest("barId es requerido.");
    if (!input.name?.trim()) throw new BadRequest("name es requerido.");

    const seller = await this.requireActiveSeller();
    const token = await this.credentialsResolver.resolve({
      sellerUserId: seller.userId,
      allowGlobalFallback: true,
    });

    const bar = await this.resolveBar(input.barId.trim(), input.name.trim());
    const existingCaja = await this.cajasRepo.findByBarId(bar.id);
    if (existingCaja) {
      throw new Conflict(
        `La barra ${bar.code ?? bar.id} ya tiene un PDV. Creá otra barra (ej. PORTATIL) si necesitás un segundo punto.`,
      );
    }

    // Reusar store_id del seller o crear sucursal on-the-fly.
    let storeId = (await this.cajasRepo.findBySellerUserId(seller.userId)).find((c) => c.storeId)?.storeId;
    if (!storeId) {
      const store = await this.createStore({
        name: seller.nickname ?? "Bosko Bar",
        barId: bar.code ?? undefined,
      });
      storeId = store.storeId;
    }

    const externalPosId = this.buildExternalPosId(bar.code ?? env.BAR_CODE);
    let mpPos: MpPosResponse;
    try {
      mpPos = await this.mpRequest<MpPosResponse>(
        token,
        "/pos",
        {
          method: "POST",
          body: JSON.stringify({
            name: input.name.trim(),
            fixed_amount: true,
            store_id: Number(storeId) || storeId,
            external_store_id: EXTERNAL_STORE_ID,
            external_id: externalPosId,
          }),
        },
        "No se pudo crear el POS en Mercado Pago",
      );
    } catch (err: any) {
      if (err?.code === "point_of_sale_exists" || err?.message?.includes("point_of_sale_exists")) {
        // El POS ya existe en MP. Recuperar qr.image y pos_id_mp reales.
        const posData = await this.recoverExistingPos(token, externalPosId);
        mpPos = {
          id: Number(posData?.id ?? 0),
          qr: posData?.qr ?? null,
        } as MpPosResponse;
      } else {
        throw err;
      }
    }

    // Garantizar la fila del seller en local antes del insert de la caja (FK
    // mercadopago_cajas.seller_user_id, 23503). Post-PR 4 el seller YA vive en
    // local — si vino por findActive la fila existe y esto es un no-op; si vino
    // por el fallback de env todavía puede faltar. Sin tokens: upsert parcial.
    await this.sellersRepo.upsert({
      userId: seller.userId,
      status: seller.status,
    });

    const caja = await this.cajasRepo.create({
      barId: bar.id,
      storeId,
      externalPosId,
      posIdMp: String(mpPos.id),
      qrImage: mpPos.qr?.image ?? null,
      qrTemplate: mpPos.qr?.template_document ?? null,
      sellerUserId: seller.userId,
    });

    // Recién provisionada en la cuenta del seller activo → nunca huérfana.
    return {
      ...caja,
      device: null,
      isOrphan: false,
      barCode: bar.code,
      barEnabled: bar.enabled,
    };
  }

  async deletePos(id: string): Promise<{ ok: true }> {
    const caja = await this.cajasRepo.findById(id);
    if (!caja) throw new NotFound("PDV no encontrado.");

    // El vínculo device→caja es histórico e inmutable (gestion-posnets D1): si la
    // caja tiene Posnets, la FK bloquea el DELETE. Mensaje claro antes del 23503.
    const linked = await this.devicesRepo.listByCajaId(id);
    if (linked.length > 0) {
      throw new Conflict(
        `El PDV tiene ${linked.length} Posnet(s) vinculados (activos o históricos). ` +
          "Ese vínculo preserva la trazabilidad de los cobros y no se puede romper: " +
          "desactivá el Posnet en vez de borrar la caja.",
      );
    }

    try {
      await this.cajasRepo.deleteById(id);
    } catch (err) {
      // Carrera: un device se vinculó entre el chequeo y el DELETE.
      if ((err as { code?: string })?.code === "23503") {
        throw new Conflict(
          "El PDV tiene Posnets vinculados: el vínculo histórico no se puede romper. " +
            "Desactivá el Posnet en vez de borrar la caja.",
        );
      }
      throw err;
    }
    return { ok: true };
  }

  /**
   * Refresca qr_image y qr_template desde MP para un PDV existente.
   * Útil cuando el POS ya existía en MP y se creó con datos placeholder.
   */
  async refreshQr(id: string): Promise<CajaDto> {
    const caja = await this.cajasRepo.findById(id);
    if (!caja) throw new NotFound("PDV no encontrado.");

    const seller = await this.requireActiveSeller();
    const token = await this.credentialsResolver.resolve({
      sellerUserId: seller.userId,
      allowGlobalFallback: true,
    });

    // Intentar con pos_id_mp si existe (no "0")
    let mpPos: any = null;
    if (caja.posIdMp && caja.posIdMp !== "0") {
      mpPos = await this.mpRequest<any>(
        token,
        `/pos/${caja.posIdMp}`,
        { method: "GET" },
        "No se pudo consultar el POS en MP",
      );
    }

    // Si no se pudo recuperar por id, buscar por external_id
    if (!mpPos?.qr?.image) {
      mpPos = await this.recoverExistingPos(token, caja.externalPosId);
    }

    if (!mpPos?.qr?.image) {
      throw new NotFound("No se encontró el QR del POS en Mercado Pago.");
    }

    // Actualizar en DB
    const updated = await this.cajasRepo.update(caja.id, {
      qrImage: mpPos.qr.image ?? null,
      qrTemplate: mpPos.qr.template_document ?? null,
      posIdMp: String(mpPos.id ?? caja.posIdMp),
    });

    // Merge device
    const devices = await this.devicesRepo.listAll();
    const barMeta = await this.barsRepo.findById(updated.barId);
    return {
      ...updated,
      device: devices.find(d => d.cajaId === updated.id && d.isActive) ?? null,
      isOrphan: updated.sellerUserId !== seller.userId,
      barCode: barMeta?.code ?? null,
      barEnabled: barMeta?.enabled ?? true,
    };
  }

  /**
   * Re-provisiona la caja en la cuenta del seller ACTIVO (bloque H, R22).
   * Reusa los caminos idempotentes existentes (store por `external_id` vía
   * createStore, POS con manejo de `point_of_sale_exists`) y hace UPDATE de la
   * fila EXISTENTE de mercadopago_cajas — mismo UUID, NUNCA delete+insert: la
   * FK y el trigger de inmutabilidad dejarían colgados los vínculos históricos
   * de devices. El QR resultante CAMBIA; el aviso previo de reimpresión es del
   * front, acá solo se devuelve la caja actualizada completa.
   */
  async reprovisionCaja(id: string): Promise<CajaDto> {
    const caja = await this.cajasRepo.findById(id);
    if (!caja) throw new NotFound("PDV no encontrado.");

    const seller = await this.requireActiveSeller();
    const token = await this.credentialsResolver.resolve({
      sellerUserId: seller.userId,
      allowGlobalFallback: true,
    });

    // Sucursal en la cuenta destino: createStore ya es idempotente (reusa el
    // store_id de otra caja del seller o el store que MP tenga por external_id).
    const store = await this.createStore({ name: seller.nickname ?? "Bosko Bar" });

    // Nombre del POS: el de la barra (como en el alta), no un literal.
    const bar = await this.barsRepo.findById(caja.barId);
    const posName = bar?.name ?? caja.externalPosId;

    let mpPos: MpPosResponse;
    try {
      mpPos = await this.mpRequest<MpPosResponse>(
        token,
        "/pos",
        {
          method: "POST",
          body: JSON.stringify({
            name: posName,
            fixed_amount: true,
            store_id: Number(store.storeId) || store.storeId,
            external_store_id: EXTERNAL_STORE_ID,
            external_id: caja.externalPosId,
          }),
        },
        "No se pudo re-crear el POS en Mercado Pago",
      );
    } catch (err: any) {
      if (err?.code === "point_of_sale_exists" || err?.message?.includes("point_of_sale_exists")) {
        // El POS ya existe en la cuenta destino (reintento). El pos_id_mp local
        // es de la cuenta SALIENTE — consultarlo con el token nuevo fallaría —
        // así que se lo ignora y se recupera por external_id desde la API.
        const posData = await this.recoverExistingPos(token, caja.externalPosId, {
          skipLocalCajaId: caja.id,
        });
        mpPos = { id: Number(posData?.id ?? 0), qr: posData?.qr ?? null } as MpPosResponse;
      } else {
        throw err;
      }
    }

    // FK mercadopago_cajas.seller_user_id (como en createPos): no-op si la fila
    // local del seller ya existe.
    await this.sellersRepo.upsert({ userId: seller.userId, status: seller.status });

    const updated = await this.cajasRepo.updateProvisioning(caja.id, {
      storeId: store.storeId,
      posIdMp: String(mpPos.id),
      qrImage: mpPos.qr?.image ?? null,
      qrTemplate: mpPos.qr?.template_document ?? null,
      sellerUserId: seller.userId,
    });

    const devices = await this.devicesRepo.listAll();
    const barMeta = await this.barsRepo.findById(updated.barId);
    return {
      ...updated,
      device: devices.find((d) => d.cajaId === updated.id && d.isActive) ?? null,
      isOrphan: updated.sellerUserId !== seller.userId,
      barCode: barMeta?.code ?? null,
      barEnabled: barMeta?.enabled ?? true,
    };
  }

  /**
   * Registra un Posnet (deviceId + alias) sin vincularlo a un PDV, o lo vincula
   * si viene `cajaId`. Verifica existencia en MP antes de persistir.
   */
  async registerOrLinkDevice(input: LinkDeviceInput): Promise<CajaDevice> {
    if (!input.deviceId?.trim()) throw new BadRequest("deviceId es requerido.");

    const deviceId = input.deviceId.trim();
    const alias = input.deviceUsername?.trim() || null;

    if (input.cajaId?.trim()) {
      const assigned = await this.assignDevice({ cajaId: input.cajaId.trim(), deviceId });
      if (!assigned) throw new NotFound("No se pudo vincular el Posnet.");
      return assigned;
    }

    const existing = await this.devicesRepo.findByDeviceId(deviceId);
    if (existing) {
      throw new Conflict("Ese Posnet ya está registrado.");
    }

    const seller = await this.requireActiveSeller();
    const token = await this.credentialsResolver.resolve({
      sellerUserId: seller.userId,
      allowGlobalFallback: true,
    });

    const mpDevice = await this.findDeviceInMp(token, deviceId);
    if (!mpDevice) {
      throw new NotFound(
        `El Posnet ${deviceId} no está vinculado a esta cuenta de Mercado Pago.`,
      );
    }

    // R25: se guarda el modo REAL que devolvió MP (o NULL honesto), nunca un
    // default optimista, con el momento de la lectura como origen declarado.
    return this.devicesRepo.create({
      deviceId: mpDevice.id,
      deviceUsername: alias,
      operatingMode: normalizeOperatingMode(mpDevice.operating_mode),
      operatingModeSyncedAt: new Date().toISOString(),
    });
  }

  /**
   * Vincula un Posnet a un PDV (o desactiva el activo si deviceId es null).
   * Modelo gestion-posnets (D1): el device pertenece a UNA caja para siempre;
   * el reemplazo es deactivate(activo actual) → activate(nuevo), nunca un
   * re-apuntado de caja_id. Si el deviceId no está registrado, lo registra
   * al vuelo con el operating_mode real de MP.
   */
  async assignDevice(input: AssignDeviceInput): Promise<CajaDevice | null> {
    if (!input.cajaId?.trim()) throw new BadRequest("cajaId es requerido.");

    const caja = await this.cajasRepo.findById(input.cajaId.trim());
    if (!caja) throw new NotFound("PDV no encontrado.");

    // "Sin Posnet": desactivar el activo sin borrar el registro (queda histórico).
    if (!input.deviceId?.trim()) {
      const active = await this.devicesRepo.findActiveByCajaId(caja.id);
      if (active) await this.devicesRepo.deactivate(active.id);
      return null;
    }

    const deviceId = input.deviceId.trim();
    let device = await this.devicesRepo.findByDeviceId(deviceId);

    if (!device) {
      const token = await this.credentialsResolver.resolve({
        sellerUserId: caja.sellerUserId,
        allowGlobalFallback: true,
      });
      const mpDevice = await this.findDeviceInMp(token, deviceId);
      if (!mpDevice) {
        throw new NotFound(
          `El Posnet ${deviceId} no está vinculado a esta cuenta de Mercado Pago.`,
        );
      }
      device = await this.devicesRepo.create({
        deviceId: mpDevice.id,
        deviceUsername: null,
        operatingMode: normalizeOperatingMode(mpDevice.operating_mode),
        operatingModeSyncedAt: new Date().toISOString(),
      });
    }

    // Invariante del dueño: el Posnet pertenece históricamente a su caja.
    // Error claro ANTES de que el trigger de la base lo rechace en crudo.
    if (device.cajaId && device.cajaId !== caja.id) {
      const dueña = device.caja?.externalPosId ?? device.cajaId;
      throw new Conflict(
        `El Posnet ${deviceId} pertenece históricamente a la caja ${dueña}: ` +
          "reactivalo en su caja o da de alta otro aparato.",
      );
    }

    const currentActive = await this.devicesRepo.findActiveByCajaId(caja.id);

    // Ya es el activo de esta caja: no-op.
    if (currentActive && currentActive.id === device.id) return currentActive;

    // Swap: primero se desactiva el actual (uq_device_caja_active banca la carrera).
    if (currentActive) await this.devicesRepo.deactivate(currentActive.id);

    // Primera asignación (device nuevo o registrado suelto); si es histórico de
    // esta misma caja, caja_id ya está y solo se reactiva.
    if (!device.cajaId) {
      device = await this.devicesRepo.assignCaja(device.id, caja.id);
    }

    return this.devicesRepo.activate(device.id);
  }

  /** @deprecated Preferir registerOrLinkDevice / assignDevice. Compat Fase 3. */
  async linkDevice(input: LinkDeviceInput): Promise<CajaDevice> {
    if (!input.cajaId?.trim()) throw new BadRequest("cajaId es requerido.");
    if (!input.deviceId?.trim()) throw new BadRequest("deviceId es requerido.");
    const result = await this.assignDevice({
      cajaId: input.cajaId.trim(),
      deviceId: input.deviceId.trim(),
    });
    if (!result) throw new BadRequest("deviceId es requerido.");
    if (input.deviceUsername?.trim()) {
      return this.devicesRepo.update(result.id, {
        deviceUsername: input.deviceUsername.trim(),
      });
    }
    return result;
  }

  async unlinkDevice(id: string): Promise<{ ok: true }> {
    const device = await this.devicesRepo.findById(id);
    if (!device) throw new NotFound("Vínculo de Posnet no encontrado.");
    try {
      await this.devicesRepo.deleteById(id);
    } catch (err) {
      // Trigger trg_mp_devices_no_delete_con_cobros (ERRCODE 23503).
      if ((err as { code?: string })?.code === "23503") {
        throw new Conflict(
          `El Posnet ${device.deviceId} tiene cobros registrados: se desactiva, no se borra.`,
        );
      }
      throw err;
    }
    return { ok: true };
  }

  // ── helpers ──────────────────────────────────────────────────────────

  /**
   * Credenciales para LISTAR (no para cobrar): a diferencia de
   * requireActiveSeller, acá se acepta operar solo con la env — la pantalla
   * guía necesita el listado aunque el OAuth todavía no esté vinculado.
   * El userId del token de env sale del preflight F1 (cacheado en memoria):
   * cero llamadas extra a /users/me.
   */
  private async resolveListingCredentials(): Promise<{
    token: string;
    source: "seller" | "env";
    tokenUserId: string | null;
    sellerUserId: string | null;
  }> {
    let seller: Seller | null = null;
    try {
      seller = await this.sellersRepo.findActive();
    } catch {
      // El resolver evalúa la degradación por su cuenta (F1); acá solo se
      // necesita saber quién es el seller vinculado, si se puede.
      seller = null;
    }
    const sellerUserId = seller?.userId ?? null;

    let token: string;
    try {
      token = await this.credentialsResolver.resolve({ allowGlobalFallback: true });
    } catch (err) {
      // Sin ninguna credencial no hay listado posible: 409 accionable (el
      // mensaje del resolver ya dice qué hacer), no un 500 opaco.
      throw new Conflict(err instanceof Error ? err.message : String(err));
    }

    // Si el token resuelto es el de la env (nivel 3 o degradación F1), la
    // fuente es "env". Si el seller usara literalmente el mismo token que la
    // env, es la misma cuenta y la etiqueta no cambia el diagnóstico.
    if (env.MP_ACCESS_TOKEN && token === env.MP_ACCESS_TOKEN) {
      return {
        token,
        source: "env",
        tokenUserId: getMpFallbackStatus().tokenUserId ?? null,
        sellerUserId,
      };
    }
    return { token, source: "seller", tokenUserId: sellerUserId, sellerUserId };
  }

  /**
   * Lee la sucursal para el rename/status: primero `GET /stores/{id}` (sigue
   * funcionando aunque un PUT destructivo haya vaciado el external_id), con
   * fallback al search por external_id. Tolerante a fallos: null, nunca lanza.
   */
  private async fetchStoreDetail(
    token: string,
    userId: string,
    storeId: string,
  ): Promise<MpStoreResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/stores/${encodeURIComponent(storeId)}`, {
        method: "GET",
        signal: AbortSignal.timeout(MP_HTTP_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = (await response.json().catch(() => null)) as MpStoreResponse | null;
        if (data?.id != null) return data;
      }
    } catch (err) {
      console.error("[MercadoPagoProvisioningService] Error fetching store by id:", err);
    }
    return this.findStoreByExternalId(token, userId, EXTERNAL_STORE_ID);
  }

  /**
   * userId del seller activo para derivar isOrphan (R22). Tolerante a fallos:
   * si no hay seller o findActive lanza (invariante single-seller roto), null —
   * el listado de cajas nunca debe caerse por eso.
   */
  private async findActiveSellerUserId(): Promise<string | null> {
    try {
      return (await this.sellersRepo.findActive())?.userId ?? null;
    } catch {
      return null;
    }
  }

  private async requireActiveSeller(): Promise<Seller> {
    const seller = await this.sellersRepo.findActive();
    if (!seller) {
      throw new Conflict(
        "No hay ninguna cuenta de Mercado Pago vinculada. Vinculala desde /admin?tab=pagos.",
      );
    }
    if (seller.status !== "active") {
      throw new Conflict(
        `La cuenta de Mercado Pago (${seller.userId}) está desconectada. Volvé a vincularla.`,
      );
    }
    return seller;
  }

  /**
   * Acepta UUID de bars.id o código legible (BARRA-01).
   * Si es código, hace findOrCreate para no bloquear el primer setup.
   */
  private async resolveBar(barIdOrCode: string, fallbackName: string) {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRe.test(barIdOrCode)) {
      const byId = await this.barsRepo.findById(barIdOrCode);
      if (!byId) throw new NotFound(`Barra ${barIdOrCode} no encontrada.`);
      return byId;
    }
    return this.barsRepo.findOrCreateByCode(barIdOrCode, fallbackName);
  }

  private buildExternalPosId(barCode: string): string {
    // MP POS exige alphanumeric (sin guiones/underscores): "external_id must be alphanumeric".
    // BARRA-01 → COCKTRAILBAR01
    const normalized = barCode
      .replace(/^BARRA-/i, "BAR")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();
    return `COCKTRAIL${normalized}`;
  }

  /**
   * Cuando MP responde point_of_sale_exists (409), el POS ya existe.
   * Recuperamos su id y QR desde la API de MP: listamos POS y encontramos
   * por external_id, luego consultamos GET /pos/{id} para qr.image.
   */
  private async recoverExistingPos(
    token: string,
    externalPosId: string,
    opts?: {
      /**
       * Re-provisioning (bloque H): el pos_id_mp de esa caja es de la cuenta
       * saliente y consultarlo con el token nuevo fallaría — se lo saltea.
       */
      skipLocalCajaId?: string;
    },
  ): Promise<{ id?: string; qr?: { image?: string | null; template_document?: string | null } | null } | null> {
    // 1) Intentar resolver pos_id_mp desde la DB local (si ya se guardó antes)
    const cajas = await this.cajasRepo.listAll();
    const existing = cajas.find(
      (c) => c.externalPosId === externalPosId && c.posIdMp && c.id !== opts?.skipLocalCajaId,
    );
    if (existing?.posIdMp && existing.posIdMp !== "0") {
      const pos = await this.mpRequest<any>(
        token,
        `/pos/${existing.posIdMp}`,
        { method: "GET" },
        "No se pudo consultar el POS existente",
      );
      return pos;
    }

    // 2) Listar POS del seller y buscar por external_id
    const data = await this.mpRequest<{ results?: any[] }>(
      token,
      "/pos",
      { method: "GET" },
      "No se pudo listar los POS existentes",
    );
    const found = data?.results?.find((p: any) => p.external_id === externalPosId);
    if (!found?.id) return null;

    // 3) Consultar el POS individual para obtener qr.image
    const pos = await this.mpRequest<any>(
      token,
      `/pos/${found.id}`,
      { method: "GET" },
      "No se pudo consultar el POS existente",
    );
    return pos;
  }

  private mergeAddress(partial?: Partial<StoreAddress>): StoreAddress {
    return {
      streetNumber: partial?.streetNumber ?? DEFAULT_STORE_ADDRESS.streetNumber,
      streetName: partial?.streetName ?? DEFAULT_STORE_ADDRESS.streetName,
      cityName: partial?.cityName ?? DEFAULT_STORE_ADDRESS.cityName,
      stateName: partial?.stateName ?? DEFAULT_STORE_ADDRESS.stateName,
      latitude: partial?.latitude ?? DEFAULT_STORE_ADDRESS.latitude,
      longitude: partial?.longitude ?? DEFAULT_STORE_ADDRESS.longitude,
      reference: partial?.reference ?? DEFAULT_STORE_ADDRESS.reference,
    };
  }

  /**
   * Verifica que un Posnet exista en la cuenta de MP.
   * El Point Integration API NO soporta `GET /devices/{id}` (devuelve error 111
   * "Action not supported"); hay que listar `GET /devices` y filtrar por id.
   */
  private async findDeviceInMp(
    token: string,
    deviceId: string,
  ): Promise<MpDeviceResponse | null> {
    const data = await this.mpRequest<{ devices?: MpDeviceResponse[] }>(
      token,
      `/point/integration-api/devices?offset=0&limit=50`,
      { method: "GET" },
      "No se pudo verificar el Posnet en Mercado Pago",
    );
    return (data.devices ?? []).find((d) => d.id === deviceId) ?? null;
  }

  private async mpRequest<T>(
    token: string,
    path: string,
    init: RequestInit,
    errorMessage: string,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(MP_HTTP_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
    } catch (err) {
      if (isFetchTimeout(err)) {
        throw new Conflict(
          `${errorMessage}: Mercado Pago no respondió en ${MP_HTTP_TIMEOUT_MS / 1000} segundos. Probá de nuevo.`,
          "MP_TIMEOUT",
        );
      }
      throw err;
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`MP Provisioning Error (${path}):`, errData);
      const mpMessage =
        (errData as { message?: string })?.message || response.statusText;
      const mpError = (errData as { error?: string })?.error;
      throw new Conflict(`${errorMessage}: ${mpMessage}`, mpError);
    }

    return response.json() as Promise<T>;
  }
}
