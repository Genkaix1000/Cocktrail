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
import { supabase } from "../../shared/supabase.js";

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
  name: string | null;
  sellerUserId: string | null;
};

export type CajaDto = Caja & { device?: CajaDevice | null };

type MpStoreResponse = { id: number | string; name?: string; external_id?: string };
type MpPosResponse = {
  id: number | string;
  external_id?: string;
  store_id?: number | string;
  qr?: { image?: string; template_document?: string };
};
type MpDeviceResponse = {
  id: string;
  operating_mode?: string;
  status?: { state?: string };
};

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
      return { linked: false, storeId: null, name: null, sellerUserId: null };
    }
    const seller = await this.sellersRepo.findByUserId(withStore.sellerUserId);
    return {
      linked: true,
      storeId: withStore.storeId,
      name: "Bosko",
      sellerUserId: withStore.sellerUserId,
    };
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
    const [cajas, devices] = await Promise.all([
      this.cajasRepo.listAll(),
      this.devicesRepo.listAll(),
    ]);
    return cajas.map((c) => ({
      ...c,
      device: devices.find((d) => d.cajaId === c.id) ?? null,
    }));
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
        { method: "GET", headers: { Authorization: `Bearer ${token}` } },
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
        `La barra ${bar.code ?? bar.id} ya tiene un PDV. Multi-barra no está disponible todavía.`,
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

    // El seller vive en Cloud (OAuth Fase 1). Local solo necesita un stub
    // para que la FK mercadopago_cajas.seller_user_id no falle (23503).
    // Cloud sigue siendo la fuente de verdad para tokens.
    const { error: upsertErr } = await supabase
      .from("mercadopago_sellers")
      .upsert(
        {
          user_id: seller.userId,
          status: seller.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("user_id");

    if (upsertErr) {
      console.error("[Provisioning] Failed to upsert seller stub in local DB:", upsertErr);
      throw upsertErr;
    }

    // Verificación post-upsert — el seller debe existir en Local antes del insert de caja
    const { data: exists, error: existsErr } = await supabase
      .from("mercadopago_sellers")
      .select("user_id")
      .eq("user_id", seller.userId)
      .maybeSingle();

    if (existsErr) {
      console.error("[Provisioning] Failed to verify seller stub in local DB:", existsErr);
      throw existsErr;
    }
    if (!exists) {
      throw new Error(
        `[Provisioning] seller stub ${seller.userId} was not created in local DB — check RLS or permissions.`,
      );
    }

    const caja = await this.cajasRepo.create({
      barId: bar.id,
      storeId,
      externalPosId,
      posIdMp: String(mpPos.id),
      qrImage: mpPos.qr?.image ?? null,
      qrTemplate: mpPos.qr?.template_document ?? null,
      sellerUserId: seller.userId,
    });

    return { ...caja, device: null };
  }

  async deletePos(id: string): Promise<{ ok: true }> {
    const caja = await this.cajasRepo.findById(id);
    if (!caja) throw new NotFound("PDV no encontrado.");

    await this.devicesRepo.clearCajaId(id);
    await this.cajasRepo.deleteById(id);
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
    return { ...updated, device: devices.find(d => d.cajaId === updated.id) ?? null };
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

    return this.devicesRepo.create({
      cajaId: null,
      deviceId: mpDevice.id,
      deviceUsername: alias,
      operatingMode: mpDevice.operating_mode ?? "PDV",
    });
  }

  /**
   * Vincula un Posnet registrado a un PDV (o lo desvincula si deviceId es null).
   * Si el PDV ya tenía otro Posnet, ese queda desvinculado (caja_id NULL).
   * Si el deviceId aún no está registrado, lo registra al vuelo.
   */
  async assignDevice(input: AssignDeviceInput): Promise<CajaDevice | null> {
    if (!input.cajaId?.trim()) throw new BadRequest("cajaId es requerido.");

    const caja = await this.cajasRepo.findById(input.cajaId.trim());
    if (!caja) throw new NotFound("PDV no encontrado.");

    // "Sin Posnet": desvincular el actual sin borrar el registro.
    if (!input.deviceId?.trim()) {
      await this.devicesRepo.clearCajaId(caja.id);
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
        cajaId: null,
        deviceId: mpDevice.id,
        deviceUsername: null,
        operatingMode: mpDevice.operating_mode ?? "PDV",
      });
    }

    // Liberar el Posnet actual de esta caja (si es otro).
    const currentOnCaja = await this.devicesRepo.findByCajaId(caja.id);
    if (currentOnCaja && currentOnCaja.id !== device.id) {
      await this.devicesRepo.update(currentOnCaja.id, { cajaId: null });
    }

    // Si ya está en esta caja, no-op.
    if (device.cajaId === caja.id) return device;

    return this.devicesRepo.update(device.id, { cajaId: caja.id });
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
    await this.devicesRepo.deleteById(id);
    return { ok: true };
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async requireActiveSeller(): Promise<Seller> {
    const seller = await this.sellersRepo.findFirstActive();
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
  ): Promise<{ id?: string; qr?: { image?: string | null; template_document?: string | null } | null } | null> {
    // 1) Intentar resolver pos_id_mp desde la DB local (si ya se guardó antes)
    const cajas = await this.cajasRepo.listAll();
    const existing = cajas.find(c => c.externalPosId === externalPosId && c.posIdMp);
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
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

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
