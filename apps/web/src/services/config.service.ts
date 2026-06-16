import type { Theme } from "@cocktrail/shared";
import { apiFetch } from "./api-client";

export type SafeConfig = {
  theme: Theme;
  brandName: string;
  logoUrl: string;
  customTheme: {
    primary: string;
    background: string;
    cardBg: string;
    accent: string;
    borders: string;
    textColor: string;
    success: string;
    danger: string;
  } | null;
  mercadoPago: {
    publicKey: string;
    accessTokenMasked: string;
    sandbox: boolean;
  };
  clubId: string;
  clubName: string;
  useLogoUrl: boolean;
  logoSize: number;
  textLogoValue: string;
  textLogoSize: number;
};

export type ConfigUpdate = {
  theme?: Theme;
  brandName?: string;
  logoUrl?: string;
  customTheme?: {
    primary: string;
    background: string;
    cardBg: string;
    accent: string;
    borders: string;
    textColor: string;
    success: string;
    danger: string;
  } | null;
  mercadoPago?: {
    publicKey: string;
    accessToken: string;
    sandbox: boolean;
  };
  clubId?: string;
  clubName?: string;
  useLogoUrl?: boolean;
  logoSize?: number;
  textLogoValue?: string;
  textLogoSize?: number;
};

export const configService = {
  get() {
    return apiFetch<SafeConfig>("/api/config");
  },

  update(data: ConfigUpdate) {
    return apiFetch<SafeConfig>("/api/config", { method: "POST", body: data });
  },
};
