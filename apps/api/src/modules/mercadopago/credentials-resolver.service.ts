import { env } from "../../config/env.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import type { MercadoPagoOAuthService } from "./mercadopago-oauth.service.js";
import { SellerTokenDecryptError } from "./mp-token-cipher.js";
import { getMpFallbackStatus, markMpFallbackDegraded } from "./mp-fallback-preflight.js";

export type CredentialContext = {
  sellerUserId?: string;
  deviceId?: string;
  barId?: string;
  allowGlobalFallback?: boolean;
  /** Cobro en ghost mode: usa el seller OAuth paralelo (no el active del local). */
  useGhost?: boolean;
};

/**
 * Resuelve el access_token del vendedor vinculado, refrescándolo proactivamente
 * si está por vencer.
 *
 * Modelo operativo: un seller `active` (comercio) + opcional seller `ghost`
 * (pruebas). Con `useGhost` se resuelve el ghost; sin él, el active.
 *
 * Estrategia F1: un fallo del nivel 2 degrada al fallback de env SOLO si el
 * preflight verificó que el MP_ACCESS_TOKEN es de la MISMA cuenta que el
 * seller vinculado — degradar hacia otra cuenta mandaría la plata a otro
 * lado (R21/R22), y eso es peor que no cobrar. El camino ghost NO degrada.
 */
export class CredentialsResolverService {
  constructor(
    private readonly sellersRepo: MercadoPagoSellersRepository,
    private readonly oauthService: MercadoPagoOAuthService,
  ) {}

  async resolve(context: CredentialContext = {}): Promise<string> {
    let seller: Seller | null = null;

    // 1. sellerUserId explícito (admin/provisioning — prioridad máxima).
    // Sus fallos NO degradan: quien pide un seller puntual quiere ESE seller.
    if (context.sellerUserId) {
      seller = await this.sellersRepo.findByUserId(context.sellerUserId);
    }

    // 1b. Ghost mode (cobros de prueba): seller paralelo, sin fallback env.
    if (!seller && context.useGhost) {
      seller = await this.sellersRepo.findGhost();
      if (!seller) {
        throw new Error(
          "Ghost mode activo pero no hay cuenta MP ghost vinculada. " +
            "Vinculala desde Herramientas de desarrollador.",
        );
      }
      if (seller.status !== "ghost") {
        throw new Error(
          `La cuenta ghost de Mercado Pago (${seller.userId}) no está disponible.`,
        );
      }
      if (!seller.refreshToken) {
        throw new Error(
          `La cuenta ghost (${seller.userId}) no tiene refresh_token — ` +
            "volvé a vincularla desde DevTools.",
        );
      }
      return this.oauthService.refreshTokenIfNeeded(seller);
    }

    // 2. Seller activo por defecto (único vendedor vinculado vía OAuth).
    // F1.a: "no hay seller" (null) y "hay seller pero algo falló" (excepción)
    // son cosas distintas — la excepción evalúa la degradación medida.
    let fromDefaultLevel = false;
    if (!seller) {
      fromDefaultLevel = true;
      try {
        seller = await this.sellersRepo.findActive();
      } catch (err) {
        return this.degradeOrThrow(err, context);
      }
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

    // Validar que tenga refresh_token para refrescar proactivamente.
    // En el camino por defecto esto es la clase (4) de fallo del nivel 2
    // (spec F1): una fila stub de provisioning o un wipe a medias — el
    // fallback de env puede cubrir el cobro, con la guarda de cuenta F1.b.
    if (!seller.refreshToken) {
      const causa = new Error(
        `la cuenta de Mercado Pago (${seller.userId}) no tiene refresh_token — ` +
        "volvé a vincularla desde /admin?tab=pagos para obtener uno nuevo",
      );
      if (fromDefaultLevel) {
        return this.degradeOrThrow(causa, context, seller.userId);
      }
      throw causa;
    }

    // Refrescar si está por vencer (Fase 1 — C.3). La semántica de
    // concurrencia del refresh está documentada en refreshTokenIfNeeded.
    return this.oauthService.refreshTokenIfNeeded(seller);
  }

  /**
   * F1.a/b — el nivel 2 lanzó (hay seller pero no se pudo usar). Degrada al
   * MP_ACCESS_TOKEN de la env únicamente si el preflight pudo verificar que
   * pertenece a la misma cuenta que el seller local; en cualquier otro caso
   * el criterio es conservador: error accionable, nunca cobrar a ciegas.
   */
  private degradeOrThrow(err: unknown, context: CredentialContext, knownUserId?: string): string {
    const causa = err instanceof Error ? err.message : String(err);
    const sellerUserId =
      knownUserId ?? (err instanceof SellerTokenDecryptError ? err.userId : null);

    if (!context.allowGlobalFallback || !env.MP_ACCESS_TOKEN) {
      throw new Error(
        `No se pudo usar la cuenta de Mercado Pago vinculada (${causa})` +
          (env.MP_ACCESS_TOKEN
            ? "."
            : " y no hay MP_ACCESS_TOKEN de emergencia configurado en apps/api/.env."),
      );
    }

    const preflight = getMpFallbackStatus();
    if (!preflight.tokenUserId) {
      throw new Error(
        `No se pudo usar la cuenta de Mercado Pago vinculada (${causa}) y tampoco se pudo ` +
          `verificar de qué cuenta es el MP_ACCESS_TOKEN de emergencia (preflight: ${
            preflight.reason ?? preflight.status
          }). No se cobra hacia una cuenta sin verificar.`,
      );
    }

    if (!sellerUserId || preflight.tokenUserId !== sellerUserId) {
      throw new Error(
        `El token de emergencia es de otra cuenta de Mercado Pago: la plata iría a ` +
          `${preflight.tokenUserId}, pero el seller vinculado es ${sellerUserId ?? "desconocido"}. ` +
          `No se degrada. Causa original: ${causa}`,
      );
    }

    // Misma cuenta verificada → degradar, pero nunca en silencio (R21/R22).
    console.warn(`[CredentialsResolver] cobrando por el fallback de env porque ${causa}`);
    markMpFallbackDegraded(causa);
    return env.MP_ACCESS_TOKEN;
  }
}
