import { supabase } from "../../shared/supabase.js";
import { mapCajaRow, type Caja, type CajaRow } from "./mercadopago-cajas.repository.js";

/**
 * Terminal Point. Puede existir solo registrada (caja_id NULL — Fase 5) o
 * vinculada a un PDV. El resolver (Fase 2) usa `findByDeviceId` para mapear
 * deviceId → caja → seller cuando está vinculada.
 */
export type CajaDevice = {
  id: string;
  cajaId: string | null;
  deviceId: string;
  deviceUsername: string | null;
  operatingMode: string | null;
  /** Caja dueña, resuelta vía JOIN cuando está vinculada. */
  caja?: Caja;
};

/** Datos para crear un Posnet (el id lo pone la DB). */
export type NewCajaDevice = Omit<CajaDevice, "id" | "caja">;

export type CajaDeviceUpdate = {
  cajaId?: string | null;
  deviceUsername?: string | null;
  operatingMode?: string | null;
};

type CajaDeviceRow = {
  id: string;
  caja_id: string | null;
  device_id: string;
  device_username: string | null;
  operating_mode: string | null;
  caja?: CajaRow | null;
};

function mapDeviceRow(row: CajaDeviceRow): CajaDevice {
  return {
    id: row.id,
    cajaId: row.caja_id,
    deviceId: row.device_id,
    deviceUsername: row.device_username,
    operatingMode: row.operating_mode,
    caja: row.caja ? mapCajaRow(row.caja) : undefined,
  };
}

const SELECT_WITH_CAJA =
  "id, caja_id, device_id, device_username, operating_mode, caja:mercadopago_cajas(*)";

export interface MercadoPagoCajasDevicesRepository {
  findById(id: string): Promise<CajaDevice | null>;
  findByDeviceId(deviceId: string): Promise<CajaDevice | null>;
  findByCajaId(cajaId: string): Promise<CajaDevice | null>;
  listAll(): Promise<CajaDevice[]>;
  create(device: NewCajaDevice): Promise<CajaDevice>;
  update(id: string, patch: CajaDeviceUpdate): Promise<CajaDevice>;
  clearCajaId(cajaId: string): Promise<void>;
  deleteById(id: string): Promise<void>;
  deleteByCajaId(cajaId: string): Promise<void>;
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

  async findByCajaId(cajaId: string): Promise<CajaDevice | null> {
    const { data, error } = await supabase
      .from("mercadopago_cajas_devices")
      .select(SELECT_WITH_CAJA)
      .eq("caja_id", cajaId)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error finding device by caja:", error);
      throw error;
    }

    return data ? mapDeviceRow(data as unknown as CajaDeviceRow) : null;
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
        caja_id: device.cajaId,
        device_id: device.deviceId,
        device_username: device.deviceUsername,
        operating_mode: device.operatingMode,
      })
      .select(SELECT_WITH_CAJA)
      .single();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error creating device link:", error);
      throw error;
    }

    return mapDeviceRow(data as unknown as CajaDeviceRow);
  }

  async update(id: string, patch: CajaDeviceUpdate): Promise<CajaDevice> {
    const payload: Record<string, unknown> = {};
    if (patch.cajaId !== undefined) payload.caja_id = patch.cajaId;
    if (patch.deviceUsername !== undefined) payload.device_username = patch.deviceUsername;
    if (patch.operatingMode !== undefined) payload.operating_mode = patch.operatingMode;

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

  /** Desvincula todos los Posnets de una caja sin borrarlos del registro. */
  async clearCajaId(cajaId: string): Promise<void> {
    const { error } = await supabase
      .from("mercadopago_cajas_devices")
      .update({ caja_id: null })
      .eq("caja_id", cajaId);

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error clearing caja_id:", error);
      throw error;
    }
  }

  async deleteById(id: string): Promise<void> {
    const { error } = await supabase.from("mercadopago_cajas_devices").delete().eq("id", id);

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error deleting device:", error);
      throw error;
    }
  }

  async deleteByCajaId(cajaId: string): Promise<void> {
    const { error } = await supabase.from("mercadopago_cajas_devices").delete().eq("caja_id", cajaId);

    if (error) {
      console.error("[SupabaseMercadoPagoCajasDevicesRepository] Error deleting devices by caja:", error);
      throw error;
    }
  }
}
