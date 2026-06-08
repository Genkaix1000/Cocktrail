import fs from "node:fs";
import path from "node:path";

import type { Theme } from "@cocktrail/shared";

// ── Types ──

export type CustomTheme = {
  primary: string;
  background: string;
  cardBg: string;
  accent: string;
  borders: string;
};

export type MercadoPagoConfig = {
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
  get(): AppConfig;
  update(partial: Partial<AppConfig>): AppConfig;
}

// ── Implementación JSON Local ──

const DATA_DIR = path.resolve(
  new URL(".", import.meta.url).pathname,
  "../../data",
);
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

const DEFAULT_CONFIG: AppConfig = {
  theme: "normal",
  brandName: "Cocktrail",
  logoUrl: "",
  customTheme: null,
  mercadoPago: {
    publicKey: "",
    accessToken: "",
    sandbox: true,
  },
  clubId: "cocktrail_club_01",
  clubName: "Bosko Club",
  useLogoUrl: false,
  logoSize: 40,
  textLogoValue: "Cocktrail",
  textLogoSize: 26,
};

export class LocalJSONConfigRepository implements ConfigRepository {
  private config: AppConfig;

  constructor() {
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch (err) {
      console.error("[LocalJSONConfigRepository] Error loading config.json:", err);
    }
    return { ...DEFAULT_CONFIG };
  }

  private persist(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), "utf-8");
    } catch (err) {
      console.error("[LocalJSONConfigRepository] Error persisting config.json:", err);
    }
  }

  get(): AppConfig {
    return { ...this.config };
  }

  update(partial: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...partial };
    // Merge nested objects
    if (partial.mercadoPago) {
      this.config.mercadoPago = {
        ...this.config.mercadoPago,
        ...partial.mercadoPago,
      };
    }
    this.persist();
    return { ...this.config };
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
