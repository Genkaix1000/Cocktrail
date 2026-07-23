import { apiFetch } from "./api-client";

export type OperatingMode = "PDV" | "STANDALONE";

/**
 * Fila local de un Posnet con su ciclo de vida (gestion-posnets D1): la caja
 * es la unidad estable, el Posnet es hardware reemplazable. Un device con
 * `cajaId` pero `isActive: false` es HISTÓRICO de esa caja (reactivable).
 */
export type DeviceRow = {
  id: string;
  cajaId: string | null;
  deviceId: string;
  deviceUsername: string | null;
  /** Cache del modo REAL leído de MP (D5) — null = nunca sincronizado. */
  operatingMode: OperatingMode | null;
  operatingModeSyncedAt: string | null;
  isActive: boolean;
  linkedAt: string | null;
  deactivatedAt: string | null;
};

export type CajaRow = {
  id: string;
  barId: string;
  storeId: string;
  externalPosId: string;
  posIdMp: string | null;
  qrImage: string | null;
  qrTemplate: string | null;
  sellerUserId: string;
  /** Cache del nombre real de la sucursal en MP (rama A) o alias local (rama B). */
  storeName: string | null;
  /** R22: la caja fue provisionada con una cuenta distinta de la activa. */
  isOrphan: boolean;
  createdAt: string;
  device?: DeviceRow | null;
};

export type StoreStatus = {
  linked: boolean;
  storeId: string | null;
  /** Nombre REAL de la sucursal en MP; null si MP no respondió. */
  name: string | null;
  /** Cache local del nombre o alias puesto por el dueño. */
  storeName: string | null;
  sellerUserId: string | null;
};

export type ProvisioningSummary = {
  store: StoreStatus;
  bars: number;
  posnets: number;
};

/**
 * Fila del listado CRUDO de devices de la cuenta MP (bloque B): el alta ya no
 * escribe ids a mano — se elige de esta lista.
 */
export type MpDeviceListItem = {
  id: string;
  /** Derivado del prefijo del id (PAX_A910__SMARTPOS… → PAX_A910). */
  model: string;
  operatingMode: OperatingMode | null;
  storeId: string | null;
  posId: string | null;
  /** ¿Ya existe en el registro local de Posnets? */
  registeredLocally: boolean;
};

/**
 * Listado + contexto para la pantalla guía (decisión 2): con
 * `token.source`/`token.userId` vs `sellerUserId` se distingue "todavía no
 * reclamaste el lector" de "el token activo es de otra aplicación/cuenta".
 */
export type MpDevicesListing = {
  devices: MpDeviceListItem[];
  token: { source: "seller" | "env"; userId: string | null };
  sellerUserId: string | null;
};

export type SetDeviceModeResult = {
  deviceId: string;
  operatingMode: OperatingMode;
  registeredLocally: boolean;
};

export type RenameStoreResult = {
  /** true = el nombre quedó en MP (rama A, verificado con re-fetch). */
  renamedInMp: boolean;
  name: string;
  /** Rama degradada (alias local): el nombre que MP sigue teniendo. */
  mpName?: string | null;
};

export type CreateCajaBody = {
  barId: string;
  name: string;
};

export type LinkDeviceBody = {
  cajaId?: string;
  deviceId: string | null;
  deviceUsername?: string;
};

export const pdvService = {
  getStoreStatus() {
    return apiFetch<StoreStatus>("/api/mercadopago/provisioning/store");
  },

  /** Resumen de sucursal + conteos (tarjeta "Sucursal" de Pagos). */
  getSummary() {
    return apiFetch<ProvisioningSummary>("/api/mercadopago/provisioning/summary");
  },

  /** Re-descarga la imagen del QR estático de un PDV que quedó sin ella. */
  refreshQr(cajaId: string) {
    return apiFetch<{ ok: true }>(`/api/mercadopago/provisioning/pos/${cajaId}/refresh-qr`, {
      method: "POST",
    });
  },

  listCajas() {
    return apiFetch<CajaRow[]>("/api/mercadopago/provisioning/cajas");
  },

  createCaja(body: CreateCajaBody) {
    return apiFetch<CajaRow>("/api/mercadopago/provisioning/pos", {
      method: "POST",
      body,
    });
  },

  deleteCaja(id: string) {
    return apiFetch<{ ok: true }>(`/api/mercadopago/provisioning/pos/${id}`, {
      method: "DELETE",
    });
  },

  listDevices() {
    return apiFetch<DeviceRow[]>("/api/mercadopago/provisioning/devices");
  },

  /**
   * Lista CRUDA de devices de la cuenta MP (re-sincroniza el modo real al
   * llamarla). Fuente del selector de alta y de la pantalla guía.
   */
  listMpDevices() {
    return apiFetch<MpDevicesListing>("/api/mercadopago/provisioning/mp-devices");
  },

  /** Bloque C: cambia el operating_mode REAL del aparato en MP. */
  setDeviceMode(deviceId: string, mode: OperatingMode) {
    return apiFetch<SetDeviceModeResult>(
      `/api/mercadopago/provisioning/device/${encodeURIComponent(deviceId)}/operating-mode`,
      { method: "PATCH", body: { mode } },
    );
  },

  /**
   * Bloque H: re-crea store/POS de la caja en la cuenta del seller activo.
   * El QR CAMBIA — la UI confirma antes con el aviso de reimpresión.
   */
  reprovisionCaja(cajaId: string) {
    return apiFetch<CajaRow>(
      `/api/mercadopago/provisioning/pos/${encodeURIComponent(cajaId)}/reprovision`,
      { method: "POST" },
    );
  },

  /** Criterio E: renombra la sucursal — el nombre viaja a MP (rama A de T1). */
  renameStore(name: string) {
    return apiFetch<RenameStoreResult>("/api/mercadopago/provisioning/store", {
      method: "PUT",
      body: { name },
    });
  },

  /** Registra un Posnet (deviceId + alias) sin vincularlo a un PDV. */
  registerDevice(body: { deviceId: string; deviceUsername?: string }) {
    return apiFetch<DeviceRow>("/api/mercadopago/provisioning/device", {
      method: "POST",
      body,
    });
  },

  /**
   * Vincula un Posnet a un PDV, o desvincula si deviceId es null. Si el device
   * es histórico de la MISMA caja, el backend hace el swap/reactivación solo.
   */
  linkDevice(body: LinkDeviceBody) {
    return apiFetch<DeviceRow | { ok: true; device: null }>("/api/mercadopago/provisioning/device", {
      method: "POST",
      body,
    });
  },

  unlinkDevice(id: string) {
    return apiFetch<{ ok: true }>(`/api/mercadopago/provisioning/device/${id}`, {
      method: "DELETE",
    });
  },
};
