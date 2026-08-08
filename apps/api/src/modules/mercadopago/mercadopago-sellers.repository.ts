import { supabase } from "../../shared/supabase.js";
import {
  MP_TOKEN_KEY_VERSION,
  decryptTokenForBackfill,
  decryptTokenTolerant,
  encryptToken,
} from "./mp-token-cipher.js";

export type SellerStatus = "active" | "expired";

/**
 * Vendedor (Bosko) con sus tokens OAuth. Vive en la base LOCAL con los tokens
 * cifrados (columnas `_enc`); hacia adentro el tipo los expone en claro.
 * `accessToken`/`expiresAt` pueden ser null: existen filas "stub" (solo FK
 * para mercadopago_cajas) y filas desvinculadas (wipe + expired).
 */
export type Seller = {
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  status: SellerStatus;
  nickname: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  linkedAt: Date | null;
};

/**
 * Datos para crear/actualizar un seller. Tokens opcionales: el stub de
 * provisioning solo necesita user_id + status para satisfacer la FK.
 */
export type UpsertSeller = {
  userId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date;
  status?: SellerStatus;
  nickname?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

/** Campos actualizables tras un refresh, un wipe o al marcar expired. */
export type SellerUpdate = Partial<{
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date;
  status: SellerStatus;
}>;

type SellerRow = {
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  key_version: number | null;
  expires_at: string | null;
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
    // `_enc ?? claro`: tolerancia al backfill — una fila legacy sin cifrar se lee igual.
    accessToken: decryptTokenTolerant(
      row.access_token_enc ?? row.access_token,
      row.key_version,
      row.user_id,
    ),
    refreshToken: decryptTokenTolerant(
      row.refresh_token_enc ?? row.refresh_token,
      row.key_version,
      row.user_id,
    ),
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    status: row.status,
    nickname: row.seller_nickname,
    firstName: row.seller_first_name,
    lastName: row.seller_last_name,
    email: row.seller_email,
    linkedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

const SELECT_COLS =
  "user_id, access_token, refresh_token, access_token_enc, refresh_token_enc, key_version, expires_at, status, seller_nickname, seller_first_name, seller_last_name, seller_email, updated_at";

export interface MercadoPagoSellersRepository {
  upsert(seller: UpsertSeller): Promise<Seller>;
  findByUserId(userId: string): Promise<Seller | null>;
  /** El único seller activo (single-seller). Lanza si el invariante está roto (2 activos). */
  findActive(): Promise<Seller | null>;
  update(userId: string, patch: SellerUpdate): Promise<Seller>;
  /** Wipe de tokens + expired en TODAS las filas (desvincular). Devuelve los user_id afectados. */
  wipeAllTokens(): Promise<string[]>;
  /** Boot: cifra filas legacy en claro y re-cifra lo abierto con _PREVIOUS. */
  backfillEncryption(): Promise<{ migrated: number }>;
}

export class SupabaseMercadoPagoSellersRepository implements MercadoPagoSellersRepository {
  async upsert(seller: UpsertSeller): Promise<Seller> {
    const row: Record<string, unknown> = {
      user_id: seller.userId,
      status: seller.status ?? "active",
      updated_at: new Date().toISOString(),
    };
    // Tokens: se escribe SOLO la columna _enc; la columna en claro queda NULL.
    if (seller.accessToken !== undefined) {
      row.access_token_enc = seller.accessToken ? encryptToken(seller.accessToken) : null;
      row.access_token = null;
      row.key_version = seller.accessToken ? MP_TOKEN_KEY_VERSION : null;
    }
    if (seller.refreshToken !== undefined) {
      row.refresh_token_enc = seller.refreshToken ? encryptToken(seller.refreshToken) : null;
      row.refresh_token = null;
    }
    if (seller.expiresAt !== undefined) row.expires_at = seller.expiresAt.toISOString();
    if (seller.nickname !== undefined) row.seller_nickname = seller.nickname;
    if (seller.firstName !== undefined) row.seller_first_name = seller.firstName;
    if (seller.lastName !== undefined) row.seller_last_name = seller.lastName;
    if (seller.email !== undefined) row.seller_email = seller.email;

    const { data, error } = await supabase
      .from("mercadopago_sellers")
      .upsert(row, { onConflict: "user_id" })
      .select(SELECT_COLS)
      .single();

    if (error) {
      console.error("[SupabaseMercadoPagoSellersRepository] Error upserting seller:", error);
      throw error;
    }

    return mapRow(data as SellerRow);
  }

  async findByUserId(userId: string): Promise<Seller | null> {
    const { data, error } = await supabase
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

  async findActive(): Promise<Seller | null> {
    // Sin order-by a propósito: si hay 2 activos el sistema NO debe elegir
    // "por casualidad" (R21) — el invariante lo garantiza el índice único
    // parcial; esto es la guarda de app por si la migración no corrió.
    const { data, error } = await supabase
      .from("mercadopago_sellers")
      .select(SELECT_COLS)
      .eq("status", "active")
      .limit(2);

    if (error) {
      console.error("[SupabaseMercadoPagoSellersRepository] Error finding active seller:", error);
      throw error;
    }

    const rows = (data ?? []) as SellerRow[];
    if (rows.length > 1) {
      throw new Error(
        `Invariante single-seller roto: hay ${rows.length} sellers activos ` +
          `(${rows.map((r) => r.user_id).join(", ")}). Desvinculá desde /admin?tab=pagos y re-vinculá uno solo.`,
      );
    }
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async update(userId: string, patch: SellerUpdate): Promise<Seller> {
    // updated_at se actualiza manualmente (no hay trigger en la DB).
    const row: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.accessToken !== undefined) {
      row.access_token_enc = patch.accessToken ? encryptToken(patch.accessToken) : null;
      row.access_token = null;
      row.key_version = patch.accessToken ? MP_TOKEN_KEY_VERSION : null;
    }
    if (patch.refreshToken !== undefined) {
      row.refresh_token_enc = patch.refreshToken ? encryptToken(patch.refreshToken) : null;
      row.refresh_token = null;
    }
    if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt.toISOString();
    if (patch.status !== undefined) row.status = patch.status;

    const { data, error } = await supabase
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

  async wipeAllTokens(): Promise<string[]> {
    // Todas las filas (no solo las activas): una fila expired legacy puede
    // conservar tokens en claro y el wipe debe eliminarlos también (D9).
    const { data, error } = await supabase
      .from("mercadopago_sellers")
      .update({
        access_token: null,
        refresh_token: null,
        access_token_enc: null,
        refresh_token_enc: null,
        key_version: null,
        status: "expired",
        updated_at: new Date().toISOString(),
      })
      .neq("user_id", "")
      .select("user_id");

    if (error) {
      console.error("[SupabaseMercadoPagoSellersRepository] Error wiping sellers:", error);
      throw error;
    }

    return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  }

  async backfillEncryption(): Promise<{ migrated: number }> {
    const { data, error } = await supabase
      .from("mercadopago_sellers")
      .select("user_id, access_token, refresh_token, access_token_enc, refresh_token_enc, key_version");

    if (error) throw error;

    let migrated = 0;
    for (const row of (data ?? []) as Pick<
      SellerRow,
      "user_id" | "access_token" | "refresh_token" | "access_token_enc" | "refresh_token_enc" | "key_version"
    >[]) {
      try {
        const access = decryptTokenForBackfill(
          row.access_token_enc ?? row.access_token,
          row.key_version,
          row.user_id,
        );
        const refresh = decryptTokenForBackfill(
          row.refresh_token_enc ?? row.refresh_token,
          row.key_version,
          row.user_id,
        );
        const needsRewrite =
          access.source === "plain" || access.source === "previous" ||
          refresh.source === "plain" || refresh.source === "previous";
        if (!needsRewrite) continue;

        const { error: upErr } = await supabase
          .from("mercadopago_sellers")
          .update({
            access_token_enc: access.plaintext ? encryptToken(access.plaintext) : null,
            refresh_token_enc: refresh.plaintext ? encryptToken(refresh.plaintext) : null,
            access_token: null,
            refresh_token: null,
            key_version: access.plaintext || refresh.plaintext ? MP_TOKEN_KEY_VERSION : null,
          })
          .eq("user_id", row.user_id);
        if (upErr) throw upErr;
        migrated += 1;
      } catch (err) {
        // Fail-open por fila: una fila ilegible no frena el backfill de las demás.
        // Jamás loguear el token — solo el user_id y el motivo.
        console.warn(
          `[SellersBackfill] No se pudo re-cifrar el seller ${row.user_id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return { migrated };
  }
}
