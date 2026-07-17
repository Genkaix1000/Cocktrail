import { supabase } from "../../shared/supabase.js";
import { mapCajaRow, type Caja, type CajaRow } from "./mercadopago-cajas.repository.js";

/**
 * Terminal Point vinculada a una caja. El resolver (Fase 2) usa `findByDeviceId`
 * para mapear un `deviceId` (header del cliente) → caja → `seller_user_id`, por
 * eso hace el JOIN con `mercadopago_cajas`. Vive en la DB local (dato operativo).
 */
export type CajaDevice = {
  id: string;
  cajaId: string;
  deviceId: string;
  deviceUsername: string | null;
  operatingMode: string | null;
  /** Caja dueña, resuelta vía JOIN por `findByDeviceId`/`findByCajaId`. */
  caja?: Caja;
};

/** Datos para crear un vínculo caja↔device (el id lo pone la DB). */
export type NewCajaDevice = Omit<CajaDevice, "id" | "caja">;

type CajaDeviceRow = {
  id: string;
  caja_id: string;
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

// Trae el device + la caja dueña embebida (para resolver seller_user_id sin 2da query).
const SELECT_WITH_CAJA =
  "id, caja_id, device_id, device_username, operating_mode, caja:mercadopago_cajas(*)";

export interface MercadoPagoCajasDevicesRepository {
  findByDeviceId(deviceId: string): Promise<CajaDevice | null>;
  findByCajaId(cajaId: string): Promise<CajaDevice | null>;
  create(device: NewCajaDevice): Promise<CajaDevice>;
}

export class SupabaseMercadoPagoCajasDevicesRepository implements MercadoPagoCajasDevicesRepository {
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
}
