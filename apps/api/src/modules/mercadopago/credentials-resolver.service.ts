import { env } from "../../config/env.js";
import { Conflict } from "../../shared/errors/http-errors.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import type { MercadoPagoCajasRepository } from "./mercadopago-cajas.repository.js";
import type { MercadoPagoCajasDevicesRepository } from "./mercadopago-cajas-devices.repository.js";
import type { MercadoPagoOAuthService } from "./mercadopago-oauth.service.js";

/**
 * Contexto de resolución de credenciales MP. Los headers `deviceId`/`barId`
 * vienen del cliente (vía `mpContextMiddleware`); `sellerUserId` es explícito
 * (admin/provisioning). `allowGlobalFallback` habilita el fallback global
 * (primer seller activo) y el legacy `env.MP_ACCESS_TOKEN`.
 */
export type CredentialContext = {
  deviceId?: string;
  barId?: string;
  sellerUserId?: string;
  allowGlobalFallback?: boolean;
};

/**
 * Resuelve el `access_token` de MP a usar según el contexto, refrescándolo si
 * está por vencer. Prioridad: sellerUserId explícito → device → barra →
 * fallback global → env legacy. Ver plan Fase 2 § "Prioridad del fallback".
 *
 * Los sellers viven en Cloud (`mpDb` en su repo); las cajas/devices en Local.
 * Mientras las tablas de cajas/devices estén vacías (pre-Fase 3), los niveles
 * por device/barra no encuentran nada y el flujo cae al fallback global/env.
 */
export class CredentialsResolverService {
  constructor(
    private readonly sellersRepo: MercadoPagoSellersRepository,
    private readonly cajasRepo: MercadoPagoCajasRepository,
    private readonly cajasDevicesRepo: MercadoPagoCajasDevicesRepository,
    private readonly oauthService: MercadoPagoOAuthService,
  ) {}

  async resolve(context: CredentialContext): Promise<string> {
    let seller: Seller | null = null;

    // 1. sellerUserId explícito (prioridad máxima — quien lo pasa sabe exactamente
    //    qué cuenta usar; no debe ser "pisado" por headers de cliente).
    if (context.sellerUserId) {
      seller = await this.sellersRepo.findByUserId(context.sellerUserId);
    }

    // 2. Resolver por device (Point/Posnet).
    if (!seller && context.deviceId) {
      const device = await this.cajasDevicesRepo.findByDeviceId(context.deviceId);
      const ownerUserId = device?.caja?.sellerUserId;
      if (ownerUserId) {
        seller = await this.sellersRepo.findByUserId(ownerUserId);
      }
    }

    // 3. Resolver por barra (QR de cobro).
    if (!seller && context.barId) {
      const caja = await this.cajasRepo.findByBarId(context.barId);
      if (caja?.sellerUserId) {
        seller = await this.sellersRepo.findByUserId(caja.sellerUserId);
      }
    }

    // 4. Fallback global (admin / provisioning / single-seller).
    if (!seller && context.allowGlobalFallback) {
      seller = await this.sellersRepo.findFirstActive();
    }

    // 5. Fallback legacy env — solo si allowGlobalFallback está activo. Sin él no
    //    cobramos en el token legacy por un header faltante o mal configurado.
    if (!seller) {
      if (context.allowGlobalFallback && env.MP_ACCESS_TOKEN) {
        return env.MP_ACCESS_TOKEN;
      }
      throw new Conflict(
        "No se encontró ninguna cuenta de Mercado Pago vinculada para este contexto. " +
          "Verificá la vinculación OAuth en /admin?tab=pagos.",
        "MP_NO_SELLER",
      );
    }

    // El seller debe estar activo antes de intentar refrescar.
    if (seller.status !== "active") {
      throw new Conflict(
        `La cuenta de Mercado Pago (${seller.userId}) está desconectada. ` +
          "Volvé a vincularla desde /admin?tab=pagos.",
        "MP_SELLER_DISCONNECTED",
      );
    }

    // Sin refresh_token no se puede refrescar proactivamente → forzar re-vinculación.
    if (!seller.refreshToken) {
      throw new Conflict(
        `La cuenta de Mercado Pago (${seller.userId}) no tiene refresh_token. ` +
          "Volvé a vincularla para obtener uno nuevo.",
        "MP_SELLER_NO_REFRESH",
      );
    }

    // Refresca si está por vencer (Fase 1 — refreshTokenIfNeeded).
    return this.oauthService.refreshTokenIfNeeded(seller);
  }
}
