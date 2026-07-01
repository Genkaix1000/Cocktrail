import type { Theme } from "@cocktrail/shared";

// ── Types ──

type CustomTheme = {
  backgroundColor: string;
  surfaceColor: string;
  accentColor: string;
};

type MercadoPagoConfig = {
  publicKey: string;
  accessToken: string;
  sandbox: boolean;
};

export type AppConfig = {
  theme: Theme;
  brandName: string;
  logoUrl: string;
  customTheme: CustomTheme | null;
  mercadoPago: MercadoPagoConfig;
  clubId: string;
  clubName: string;
  useLogoUrl: boolean;
  logoSize: number;
  textLogoValue: string;
  textLogoSize: number;
};

/** Config pública (oculta tokens sensibles). */
export type SafeConfig = Omit<AppConfig, "mercadoPago"> & {
  mercadoPago: {
    publicKey: string;
    accessTokenMasked: string;
    sandbox: boolean;
  };
};

// ── Interface ──

export interface ConfigRepository {
  get(): Promise<AppConfig>;
  update(partial: Partial<AppConfig>): Promise<AppConfig>;
}

// ── Default config ──

const DEFAULT_CONFIG: AppConfig = {
  theme: "bosko",
  brandName: "Bosko",
  logoUrl: "/bosko.webp",
  customTheme: null,
  mercadoPago: {
    publicKey: "",
    accessToken: "",
    sandbox: true,
  },
  clubId: "cocktrail_club_01",
  clubName: "Bosko Club",
  useLogoUrl: true,
  logoSize: 56,
  textLogoValue: "Bosko",
  textLogoSize: 26,
};

// ── Implementación Supabase (fase 4 — Edge Sync) ──

import { supabase } from "../../shared/supabase.js";

type AppConfigRow = {
  theme: Theme;
  brand_name: string;
  logo_url: string | null;
  custom_theme: CustomTheme | null;
  mercado_pago: MercadoPagoConfig | null;
  club_id: string;
  club_name: string;
  use_logo_url: boolean;
  logo_size: number;
  text_logo_value: string;
  text_logo_size: number;
};

function mapRowToConfig(row: AppConfigRow): AppConfig {
  return {
    theme: row.theme as Theme,
    brandName: row.brand_name,
    logoUrl: row.logo_url || "",
    customTheme: row.custom_theme || null,
    mercadoPago: row.mercado_pago || DEFAULT_CONFIG.mercadoPago,
    clubId: row.club_id,
    clubName: row.club_name,
    useLogoUrl: row.use_logo_url,
    logoSize: row.logo_size,
    textLogoValue: row.text_logo_value,
    textLogoSize: row.text_logo_size,
  };
}

export class SupabaseConfigRepository implements ConfigRepository {
  async get(): Promise<AppConfig> {
    const { data, error } = await supabase
      .from("app_config")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      console.error("[SupabaseConfigRepository] Error getting config:", error);
      throw error;
    }

    if (!data) {
      // Si no existe en la BD local, creamos el default
      const { data: newData, error: insertError } = await supabase
        .from("app_config")
        .insert({
          id: "default",
          theme: DEFAULT_CONFIG.theme,
          brand_name: DEFAULT_CONFIG.brandName,
          logo_url: DEFAULT_CONFIG.logoUrl || null,
          custom_theme: DEFAULT_CONFIG.customTheme,
          mercado_pago: DEFAULT_CONFIG.mercadoPago,
          club_id: DEFAULT_CONFIG.clubId,
          club_name: DEFAULT_CONFIG.clubName,
          use_logo_url: DEFAULT_CONFIG.useLogoUrl,
          logo_size: DEFAULT_CONFIG.logoSize,
          text_logo_value: DEFAULT_CONFIG.textLogoValue,
          text_logo_size: DEFAULT_CONFIG.textLogoSize,
        })
        .select()
        .single();
        
      if (insertError) {
        console.error("[SupabaseConfigRepository] Error creating default config:", insertError);
        return DEFAULT_CONFIG;
      }
      return mapRowToConfig(newData);
    }

    return mapRowToConfig(data);
  }

  async update(partial: Partial<AppConfig>): Promise<AppConfig> {
    // Primero obtener la config actual para hacer merge profundo de mercadoPago si hace falta
    const current = await this.get();
    
    const updates: Partial<AppConfigRow> = {};
    if (partial.theme !== undefined) updates.theme = partial.theme;
    if (partial.brandName !== undefined) updates.brand_name = partial.brandName;
    if (partial.logoUrl !== undefined) updates.logo_url = partial.logoUrl || null;
    if (partial.customTheme !== undefined) updates.custom_theme = partial.customTheme;
    if (partial.mercadoPago !== undefined) {
      updates.mercado_pago = {
        ...current.mercadoPago,
        ...partial.mercadoPago,
      };
    }
    if (partial.clubId !== undefined) updates.club_id = partial.clubId;
    if (partial.clubName !== undefined) updates.club_name = partial.clubName;
    if (partial.useLogoUrl !== undefined) updates.use_logo_url = partial.useLogoUrl;
    if (partial.logoSize !== undefined) updates.logo_size = partial.logoSize;
    if (partial.textLogoValue !== undefined) updates.text_logo_value = partial.textLogoValue;
    if (partial.textLogoSize !== undefined) updates.text_logo_size = partial.textLogoSize;

    const { data, error } = await supabase
      .from("app_config")
      .update(updates)
      .eq("id", "default")
      .select()
      .single();

    if (error) {
      console.error("[SupabaseConfigRepository] Error updating config:", error);
      throw error;
    }

    return mapRowToConfig(data);
  }
}

/** Enmascarar el access token para respuestas públicas. */
export function toSafeConfig(config: AppConfig): SafeConfig {
  const { mercadoPago, ...rest } = config;
  return {
    ...rest,
    mercadoPago: {
      publicKey: mercadoPago.publicKey,
      accessTokenMasked: mercadoPago.accessToken
        ? `${"•".repeat(8)}${mercadoPago.accessToken.slice(-4)}`
        : "",
      sandbox: mercadoPago.sandbox,
    },
  };
}
