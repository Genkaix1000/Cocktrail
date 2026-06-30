import type { Theme, CustomTheme } from "@cocktrail/shared";
import { apiFetch } from "./api-client";

export type SafeConfig = {
  theme: Theme;
  brandName: string;
  logoUrl: string;
  customTheme: CustomTheme | null;
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
  customTheme?: CustomTheme | null;
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
