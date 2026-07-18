import { supabase } from "../../shared/supabase.js";

/**
 * Caja (POS de MP) de una barra. Persiste el `store_id`, el `external_pos_id`
 * y el QR estático que MP devuelve al crear el POS (Fase 3). Vive en la DB
 * local (dato operativo), a diferencia de los sellers que viven en Cloud.
 */
export type Caja = {
  id: string;
  barId: string;
  storeId: string;
  externalPosId: string;
  posIdMp: string | null;
  qrImage: string | null;
  qrTemplate: string | null;
  sellerUserId: string;
  createdAt: string;
};

/** Datos para crear una caja (el id y created_at los pone la DB). */
export type NewCaja = Omit<Caja, "id" | "createdAt">;

export type CajaRow = {
  id: string;
  bar_id: string;
  store_id: string;
  external_pos_id: string;
  pos_id_mp: string | null;
  qr_image: string | null;
  qr_template: string | null;
  seller_user_id: string;
  created_at: string;
};

export function mapCajaRow(row: CajaRow): Caja {
  return {
    id: row.id,
    barId: row.bar_id,
    storeId: row.store_id,
    externalPosId: row.external_pos_id,
    posIdMp: row.pos_id_mp,
    qrImage: row.qr_image,
    qrTemplate: row.qr_template,
    sellerUserId: row.seller_user_id,
    createdAt: row.created_at,
  };
}

const SELECT_COLS =
  "id, bar_id, store_id, external_pos_id, pos_id_mp, qr_image, qr_template, seller_user_id, created_at";

export interface MercadoPagoCajasRepository {
  findById(id: string): Promise<Caja | null>;
  findByBarId(barId: string): Promise<Caja | null>;
  findBySellerUserId(sellerUserId: string): Promise<Caja[]>;
  listAll(): Promise<Caja[]>;
  create(caja: NewCaja): Promise<Caja>;
  update(id: string, patch: Partial<Pick<Caja, "qrImage" | "qrTemplate" | "posIdMp">>): Promise<Caja>;
  deleteById(id: string): Promise<void>;
}

export class SupabaseMercadoPagoCajasRepository implements MercadoPagoCajasRepository {
  async findById(id: string): Promise<Caja | null> {
    const { data, error } = await supabase
      .from("mercadopago_cajas")
      .select(SELECT_COLS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasRepository] Error finding caja by id:", error);
      throw error;
    }

    return data ? mapCajaRow(data as CajaRow) : null;
  }

  async findByBarId(barId: string): Promise<Caja | null> {
    const { data, error } = await supabase
      .from("mercadopago_cajas")
      .select(SELECT_COLS)
      .eq("bar_id", barId)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasRepository] Error finding caja by bar:", error);
      throw error;
    }

    return data ? mapCajaRow(data as CajaRow) : null;
  }

  async findBySellerUserId(sellerUserId: string): Promise<Caja[]> {
    const { data, error } = await supabase
      .from("mercadopago_cajas")
      .select(SELECT_COLS)
      .eq("seller_user_id", sellerUserId);

    if (error) {
      console.error("[SupabaseMercadoPagoCajasRepository] Error finding cajas by seller:", error);
      throw error;
    }

    return (data ?? []).map((row) => mapCajaRow(row as CajaRow));
  }

  async listAll(): Promise<Caja[]> {
    const { data, error } = await supabase
      .from("mercadopago_cajas")
      .select(SELECT_COLS)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[SupabaseMercadoPagoCajasRepository] Error listing cajas:", error);
      throw error;
    }

    return (data ?? []).map((row) => mapCajaRow(row as CajaRow));
  }

  async create(caja: NewCaja): Promise<Caja> {
    const { data, error } = await supabase
      .from("mercadopago_cajas")
      .insert({
        bar_id: caja.barId,
        store_id: caja.storeId,
        external_pos_id: caja.externalPosId,
        pos_id_mp: caja.posIdMp,
        qr_image: caja.qrImage,
        qr_template: caja.qrTemplate,
        seller_user_id: caja.sellerUserId,
      })
      .select(SELECT_COLS)
      .single();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasRepository] Error creating caja:", error);
      throw error;
    }

    return mapCajaRow(data as CajaRow);
  }

  async deleteById(id: string): Promise<void> {
    const { error } = await supabase.from("mercadopago_cajas").delete().eq("id", id);

    if (error) {
      console.error("[SupabaseMercadoPagoCajasRepository] Error deleting caja:", error);
      throw error;
    }
  }

  async update(id: string, patch: Partial<Pick<Caja, "qrImage" | "qrTemplate" | "posIdMp">>): Promise<Caja> {
    const payload: Record<string, unknown> = {};
    if (patch.qrImage !== undefined) payload.qr_image = patch.qrImage;
    if (patch.qrTemplate !== undefined) payload.qr_template = patch.qrTemplate;
    if (patch.posIdMp !== undefined) payload.pos_id_mp = patch.posIdMp;

    const { data, error } = await supabase
      .from("mercadopago_cajas")
      .update(payload)
      .eq("id", id)
      .select(SELECT_COLS)
      .single();

    if (error) {
      console.error("[SupabaseMercadoPagoCajasRepository] Error updating caja:", error);
      throw error;
    }

    return mapCajaRow(data as CajaRow);
  }
}
