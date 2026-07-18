import { apiFetch } from "./api-client";

export type DeviceRow = {
  id: string;
  cajaId: string | null;
  deviceId: string;
  deviceUsername: string | null;
  operatingMode: string | null;
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
  createdAt: string;
  device?: DeviceRow | null;
};

export type StoreStatus = {
  linked: boolean;
  storeId: string | null;
  name: string | null;
  sellerUserId: string | null;
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

  /** Registra un Posnet (deviceId + alias) sin vincularlo a un PDV. */
  registerDevice(body: { deviceId: string; deviceUsername?: string }) {
    return apiFetch<DeviceRow>("/api/mercadopago/provisioning/device", {
      method: "POST",
      body,
    });
  },

  /** Vincula un Posnet a un PDV, o desvincula si deviceId es null. */
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
