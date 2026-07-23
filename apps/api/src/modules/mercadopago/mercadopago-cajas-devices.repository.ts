import { supabase } from "../../shared/supabase.js";
import { mapCajaRow, type Caja, type CajaRow } from "./mercadopago-cajas.repository.js";

/**
 * Terminal Point. Un device pertenece a UNA caja para siempre (caja_id es
 * inmutable en la base — trazabilidad de cobros históricos) y a lo sumo hay
 * UN device activo por caja (uq_device_caja_active). El ciclo de vida es
 * assignCaja → activate ⇄ deactivate; nunca se "mueve" ni se re-apunta.
 * operating_mode es cache del valor real que devolvió MP (R25), con
 * operating_mode_synced_at como origen declarado — nunca un default optimista.
 */
export type CajaDevice = {
  id: string;
  cajaId: string | null;
  deviceId: string;
  deviceUsername: string | null;
  operatingMode: "PDV" | "STANDALONE" | null;
  /** Cuándo se leyó operating_mode de MP por última vez (null = nunca). */
  operatingModeSyncedAt: string | null;
  isActive: boolean;
  linkedAt: string | null;
  deactivatedAt: string | null;
  /** Caja dueña, resuelta vía JOIN cuando está vinculada. */
  caja?: Caja;
};

/** Datos para registrar un Posnet (nace sin caja e inactivo; el id lo pone la DB). */
export type NewCajaDevice = {
  deviceId: string;
  deviceUsername: string | null;
  operatingMode: "PDV" | "STANDALONE" | null;
  operatingModeSyncedAt?: string | null;
};

/** Sin cajaId: la pertenencia se maneja con assignCaja/activate/deactivate. */
export type CajaDeviceUpdate = {
  deviceUsername?: string | null;
  operatingMode?: "PDV" | "STANDALONE" | null;
  operatingModeSyncedAt?: string | null;
};

type CajaDeviceRow = {
  id: string;
  caja_id: string | null;
  device_id: string;
  device_username: string | null;
  operating_mode: string | null;
  operating_mode_synced_at: string | null;
  is_active: boolean;
  linked_at: string | null;
  deactivated_at: string | null;
  caja?: CajaRow | null;
};

function mapDeviceRow(row: CajaDeviceRow): CajaDevice {
  return {
    id: row.id,
    cajaId: row.caja_id,
    deviceId: row.device_id,
    deviceUsername: row.device_username,
    // El CHECK chk_operating_mode garantiza el dominio; el cast solo lo declara.
    operatingMode: (row.operating_mode as "PDV" | "STANDALONE" | null) ?? null,
    operatingModeSyncedAt: row.operating_mode_synced_at,
    isActive: row.is_active,
    linkedAt: row.linked_at,
    deactivatedAt: row.deactivated_at,
    caja: row.caja ? mapCajaRow(row.caja) : undefined,
  };
}

const SELECT_WITH_CAJA =
  "id, caja_id, device_id, device_username, operating_mode, operating_mode_synced_at, " +
  "is_active, linked_at, deactivated_at, caja:mercadopago_cajas(*)";

export interface MercadoPagoCajasDevicesRepository {
  findById(id: string): Promise<CajaDevice | null>;
  findByDeviceId(deviceId: string): Promise<CajaDevice | null>;
  /** El device activo de la caja (a lo sumo uno — uq_device_caja_active). */
  findActiveByCajaId(cajaId: string): Promise<CajaDevice | null>;
  /** Todos los devices de la caja: el activo + los históricos. */
  listByCajaId(cajaId: string): Promise<CajaDevice[]>;
  listAll(): Promise<CajaDevice[]>;
  create(device: NewCajaDevice): Promise<CajaDevice>;
  update(id: string, patch: CajaDeviceUpdate): Promise<CajaDevice>;
  /** Primera (y única) asignación de caja: caja_id + linked_at. */
  assignCaja(id: string, cajaId: string): Promise<CajaDevice>;
  activate(id: string): Promise<CajaDevice>;
  deactivate(id: string): Promise<CajaDevice>;
  deleteById(id: string): Promise<void>;
}

export class SupabaseMercadoPagoCajasDevicesRepository implements MercadoPagoCajasDevicesRepository {
  async findById(id: string): Promise<CajaDevice | null> {
    const { data, error } = await supabase
      .from("mercadopago_cajas_devices")
      .select(SELECT_WITH_CAJA)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error finding device by id:", error);
      throw error;
    }

    return data ? mapDeviceRow(data as unknown as CajaDeviceRow) : null;
  }

  async findByDeviceId(deviceId: string): Promise<CajaDevice | null> {
    const { data, error } = await supabase
      .from("mercadopago_cajas_devices")
      .select(SELECT_WITH_CAJA)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error finding device:", error);
      throw error;
    }

    return data ? mapDeviceRow(data as unknown as CajaDeviceRow) : null;
  }

  async findActiveByCajaId(cajaId: string): Promise<CajaDevice | null> {
    const { data, error } = await supabase
      .from("mercadopago_cajas_devices")
      .select(SELECT_WITH_CAJA)
      .eq("caja_id", cajaId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error finding active device:", error);
      throw error;
    }

    return data ? mapDeviceRow(data as unknown as CajaDeviceRow) : null;
  }

  async listByCajaId(cajaId: string): Promise<CajaDevice[]> {
    const { data, error } = await supabase
      .from("mercadopago_cajas_devices")
      .select(SELECT_WITH_CAJA)
      .eq("caja_id", cajaId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error listing devices by caja:", error);
      throw error;
    }

    return (data ?? []).map((row) => mapDeviceRow(row as unknown as CajaDeviceRow));
  }

  async listAll(): Promise<CajaDevice[]> {
    const { data, error } = await supabase
      .from("mercadopago_cajas_devices")
      .select(SELECT_WITH_CAJA)
      .order("device_id", { ascending: true });

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error listing devices:", error);
      throw error;
    }

    return (data ?? []).map((row) => mapDeviceRow(row as unknown as CajaDeviceRow));
  }

  async create(device: NewCajaDevice): Promise<CajaDevice> {
    const { data, error } = await supabase
      .from("mercadopago_cajas_devices")
      .insert({
        device_id: device.deviceId,
        device_username: device.deviceUsername,
        operating_mode: device.operatingMode,
        operating_mode_synced_at: device.operatingModeSyncedAt ?? null,
      })
      .select(SELECT_WITH_CAJA)
      .single();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error creating device:", error);
      throw error;
    }

    return mapDeviceRow(data as unknown as CajaDeviceRow);
  }

  async update(id: string, patch: CajaDeviceUpdate): Promise<CajaDevice> {
    const payload: Record<string, unknown> = {};
    if (patch.deviceUsername !== undefined) payload.device_username = patch.deviceUsername;
    if (patch.operatingMode !== undefined) payload.operating_mode = patch.operatingMode;
    if (patch.operatingModeSyncedAt !== undefined) {
      payload.operating_mode_synced_at = patch.operatingModeSyncedAt;
    }

    const { data, error } = await supabase
      .from("mercadopago_cajas_devices")
      .update(payload)
      .eq("id", id)
      .select(SELECT_WITH_CAJA)
      .single();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error updating device:", error);
      throw error;
    }

    return mapDeviceRow(data as unknown as CajaDeviceRow);
  }

  async assignCaja(id: string, cajaId: string): Promise<CajaDevice> {
    const { data, error } = await supabase
      .from("mercadopago_cajas_devices")
      .update({ caja_id: cajaId, linked_at: new Date().toISOString() })
      .eq("id", id)
      .select(SELECT_WITH_CAJA)
      .single();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error assigning caja:", error);
      throw error;
    }

    return mapDeviceRow(data as unknown as CajaDeviceRow);
  }

  async activate(id: string): Promise<CajaDevice> {
    const { data, error } = await supabase
      .from("mercadopago_cajas_devices")
      .update({ is_active: true, deactivated_at: null })
      .eq("id", id)
      .select(SELECT_WITH_CAJA)
      .single();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error activating device:", error);
      throw error;
    }

    return mapDeviceRow(data as unknown as CajaDeviceRow);
  }

  async deactivate(id: string): Promise<CajaDevice> {
    const { data, error } = await supabase
      .from("mercadopago_cajas_devices")
      .update({ is_active: false, deactivated_at: new Date().toISOString() })
      .eq("id", id)
      .select(SELECT_WITH_CAJA)
      .single();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error deactivating device:", error);
      throw error;
    }

    return mapDeviceRow(data as unknown as CajaDeviceRow);
  }

  async deleteById(id: string): Promise<void> {
    const { error } = await supabase.from("mercadopago_cajas_devices").delete().eq("id", id);

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error deleting device:", error);
      throw error;
    }
  }
}
