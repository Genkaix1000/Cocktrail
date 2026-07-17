import { mpDb } from "../../shared/supabase.js";

export type SellerStatus = "active" | "expired";

/** Vendedor (Bosko) con sus tokens OAuth. `expiresAt` es la fecha de expiración del access_token. */
export type Seller = {
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  status: SellerStatus;
  nickname: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  linkedAt: Date | null;
};

/** Datos para crear/actualizar un seller tras el intercambio de tokens. */
export type UpsertSeller = {
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  status?: SellerStatus;
};

/** Campos actualizables tras un refresh (o al marcar expired). */
export type SellerUpdate = Partial<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  status: SellerStatus;
}>;

type SellerRow = {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  status: SellerStatus;
  seller_nickname: string | null;
  seller_first_name: string | null;
  seller_last_name: string | null;
  seller_email: string | null;
  updated_at: string | null;
};

function mapRow(row: SellerRow): Seller {
  return {
    userId: row.user_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: new Date(row.expires_at),
    status: row.status,
    nickname: row.seller_nickname,
    firstName: row.seller_first_name,
    lastName: row.seller_last_name,
    email: row.seller_email,
    linkedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

const SELECT_COLS =
  "user_id, access_token, refresh_token, expires_at, status, seller_nickname, seller_first_name, seller_last_name, seller_email, updated_at";

export interface MercadoPagoSellersRepository {
  upsert(seller: UpsertSeller): Promise<Seller>;
  findByUserId(userId: string): Promise<Seller | null>;
  findFirstActive(): Promise<Seller | null>;
  update(userId: string, patch: SellerUpdate): Promise<Seller>;
}

export class SupabaseMercadoPagoSellersRepository implements MercadoPagoSellersRepository {
  async upsert(seller: UpsertSeller): Promise<Seller> {
    const { data, error } = await mpDb
      .from("mercadopago_sellers")
      .upsert(
        {
          user_id: seller.userId,
          access_token: seller.accessToken,
          refresh_token: seller.refreshToken,
          expires_at: seller.expiresAt.toISOString(),
          status: seller.status ?? "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select(SELECT_COLS)
      .single();

    if (error) {
      console.error("[SupabaseMercadoPagoSellersRepository] Error upserting seller:", error);
      throw error;
    }

    return mapRow(data as SellerRow);
  }

  async findByUserId(userId: string): Promise<Seller | null> {
    const { data, error } = await mpDb
      .from("mercadopago_sellers")
      .select(SELECT_COLS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMercadoPagoSellersRepository] Error finding seller:", error);
      throw error;
    }

    return data ? mapRow(data as SellerRow) : null;
  }

  async findFirstActive(): Promise<Seller | null> {
    const { data, error } = await mpDb
      .from("mercadopago_sellers")
      .select(SELECT_COLS)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseMercadoPagoSellersRepository] Error finding active seller:", error);
      throw error;
    }

    return data ? mapRow(data as SellerRow) : null;
  }

  async update(userId: string, patch: SellerUpdate): Promise<Seller> {
    // updated_at se actualiza manualmente (no hay trigger en la DB).
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.accessToken !== undefined) row.access_token = patch.accessToken;
    if (patch.refreshToken !== undefined) row.refresh_token = patch.refreshToken;
    if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt.toISOString();
    if (patch.status !== undefined) row.status = patch.status;

    const { data, error } = await mpDb
      .from("mercadopago_sellers")
      .update(row)
      .eq("user_id", userId)
      .select(SELECT_COLS)
      .single();

    if (error) {
      console.error("[SupabaseMercadoPagoSellersRepository] Error updating seller:", error);
      throw error;
    }

    return mapRow(data as SellerRow);
  }
}
