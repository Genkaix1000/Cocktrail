import { env } from "../../config/env.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import type { MercadoPagoOAuthService } from "./mercadopago-oauth.service.js";

export type CredentialContext = {
  sellerUserId?: string;
  deviceId?: string;
  barId?: string;
  allowGlobalFallback?: boolean;
};

/**
 * Resuelve el access_token del único vendedor vinculado (single-seller),
 * refrescándolo proactivamente si está por vencer.
 *
 * Modelo operativo de Cocktrail: un solo comercio (Bosko) recibe todo el
 * dinero — no hay multi-seller.
 */
export class CredentialsResolverService {
  constructor(
    private readonly sellersRepo: MercadoPagoSellersRepository,
    private readonly oauthService: MercadoPagoOAuthService,
  ) {}

  async resolve(context: CredentialContext = {}): Promise<string> {
    let seller: Seller | null = null;

    // 1. sellerUserId explícito (admin/provisioning — prioridad máxima)
    if (context.sellerUserId) {
      seller = await this.sellersRepo.findByUserId(context.sellerUserId);
    }

    // 2. Seller activo por defecto (único vendedor vinculado vía OAuth)
    if (!seller) {
      seller = await this.sellersRepo.findFirstActive();
    }

    // 3. Fallback legacy env vars — solo si allowGlobalFallback
    if (!seller) {
      if (context.allowGlobalFallback && env.MP_ACCESS_TOKEN) {
        return env.MP_ACCESS_TOKEN;
      }
      throw new Error(
        "No hay ninguna cuenta de Mercado Pago vinculada. " +
        "Vinculala desde /admin?tab=pagos.",
      );
    }

    // Validar que el seller esté activo antes de refrescar
    if (seller.status !== "active") {
      throw new Error(
        `La cuenta de Mercado Pago (${seller.userId}) está desconectada. ` +
        "Volvé a vincularla desde /admin?tab=pagos.",
      );
    }

    // Validar que tenga refresh_token para refrescar proactivamente
    if (!seller.refreshToken) {
      throw new Error(
        `La cuenta de Mercado Pago (${seller.userId}) no tiene refresh_token. ` +
        "Volvé a vincularla para obtener uno nuevo.",
      );
    }

    // Refrescar si está por vencer (Fase 1 — C.3). La semántica de
    // concurrencia del refresh está documentada en refreshTokenIfNeeded.
    return this.oauthService.refreshTokenIfNeeded(seller);
  }
}
