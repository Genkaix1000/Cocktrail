import { randomBytes, createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Conflict, BadRequest } from "../../shared/errors/http-errors.js";
import { env } from "../../config/env.js";
import type { OAuthStatesRepository } from "./oauth-states.repository.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import { isFetchTimeout, MP_HTTP_TIMEOUT_MS } from "./mp-http.js";

const AUTH_BASE_URL = "https://auth.mercadopago.com/authorization";
const TOKEN_URL = "https://api.mercadopago.com/oauth/token";

/** TTL del state OAuth: 10 minutos (ventana para completar el consentimiento). */
const STATE_TTL_MS = 10 * 60 * 1000;

/** Credenciales de la app Cocktrail en MP + config de refresh. Se arma desde env en app.ts. */
export type MpOAuthConfig = {
  appId?: string;
  clientSecret?: string;
  redirectUri?: string;
  /** Días antes del vencimiento en que se refresca proactivamente (default 5). */
  refreshMarginDays: number;
};

type MpTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  message?: string;
};

/** Estado de vinculación para la UI (`GET /seller-status`). */
export type SellerStatusResult = {
  linked: boolean;
  status: "active" | "expired" | null;
  nickname: string | null;
  email: string | null;
  linkedAt: string | null;
  /** Nombre real compuesto (first_name + last_name). Preferido sobre nickname. */
  displayName: string | null;
  /** Diagnóstico admin: user_id de MP (nunca el token). */
  userId: string | null;
  /** Vencimiento del access_token OAuth (ISO), si hay seller. */
  expiresAt: string | null;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
};

/** Resultado del pull del buzón (deprecated F0 — siempre no-op). */
export type PullSellerResult = {
  pulled: boolean;
  userId?: string;
  reason?: string;
};

/**
 * Origen permitido para el redirect post-OAuth (anti open-redirect).
 * Acepta FRONTEND_URL, localhost y LAN privada (donde corrés en el boliche).
 * Devuelve solo el origin — nunca un host público arbitrario.
 */
function isLoopbackOrPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return false;
}

export function resolveOAuthRedirectUrl(candidate: string | null | undefined): string {
  const fallback = env.FRONTEND_URL;
  if (!candidate) return new URL(fallback).origin;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return new URL(fallback).origin;
    const allowed = new URL(fallback).origin;
    if (u.origin === allowed) return u.origin;
    if (isLoopbackOrPrivateHost(u.hostname)) return u.origin;
    return allowed;
  } catch {
    return new URL(fallback).origin;
  }
}

export class MercadoPagoOAuthService {
  constructor(
    private readonly oauthStatesRepo: OAuthStatesRepository,
    private readonly sellersRepo: MercadoPagoSellersRepository,
    private readonly config: MpOAuthConfig,
    /** Misma base que el API (single-base). Se usa en unlink para limpieza residual. */
    private readonly cloudDb: SupabaseClient | null = null,
  ) {}

  private assertConfigured(): { appId: string; clientSecret: string; redirectUri: string } {
    const { appId, clientSecret, redirectUri } = this.config;
    if (!appId || !clientSecret || !redirectUri) {
      throw new Conflict(
        "Mercado Pago OAuth no está configurado (faltan MP_APP_ID, MP_CLIENT_SECRET o MP_REDIRECT_URI).",
      );
    }
    return { appId, clientSecret, redirectUri };
  }

  /**
   * Paso 1 — genera la URL de autorización con PKCE y persiste el state.
   *
   * ⚠ `scope` NO se incluye por defecto (la doc de Authorization Code de MP no lo
   * requiere). Si en pruebas end-to-end MP no devuelve `refresh_token`, agregar
   * `scope=read write offline_access`. Ver docs/mp/api-oauth-best-practices.md.
   * ⚠ `redirect_uri` es estático (sin query params): MP valida match exacto. El
   * contexto de negocio (`barId`, `redirectUrl`) viaja en `oauth_states`.
   */
  async generateAuthUrl(
    barId: string | null,
    redirectUrl: string | null = null,
  ): Promise<{ url: string }> {
    const { appId, redirectUri } = this.assertConfigured();

    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const state = randomUUID();
    const safeRedirect = resolveOAuthRedirectUrl(redirectUrl);

    await this.oauthStatesRepo.insert({
      state,
      codeVerifier,
      barId,
      redirectUrl: safeRedirect,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });

    const params = new URLSearchParams({
      client_id: appId,
      response_type: "code",
      platform_id: "mp",
      state,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return { url: `${AUTH_BASE_URL}?${params.toString()}` };
  }

  /**
   * Estado de vinculación para la UI. Modelo single-seller: devuelve el primer
   * seller activo (o expired). `barId` se acepta por compatibilidad/futuro multi-bar
   * pero hoy no se filtra por barra.
   */
  async getSellerStatus(_barId: string | null): Promise<SellerStatusResult> {
    const seller = await this.sellersRepo.findActive();

    if (!seller) {
      return {
        linked: false,
        status: null,
        nickname: null,
        email: null,
        linkedAt: null,
        displayName: null,
        userId: null,
        expiresAt: null,
        hasAccessToken: false,
        hasRefreshToken: false,
      };
    }
    const displayName = [seller.firstName, seller.lastName].filter(Boolean).join(" ") || seller.nickname;
    return {
      linked: true,
      status: seller.status,
      nickname: seller.nickname,
      email: seller.email,
      linkedAt: seller.linkedAt ? seller.linkedAt.toISOString() : null,
      displayName,
      userId: seller.userId,
      expiresAt: seller.expiresAt ? seller.expiresAt.toISOString() : null,
      hasAccessToken: Boolean(seller.accessToken),
      hasRefreshToken: Boolean(seller.refreshToken),
    };
  }

  /**
   * Devuelve un access_token válido para el seller, refrescándolo si vence dentro
   * del margen. El intercambio usa `application/x-www-form-urlencoded`, SIN header
   * `Authorization` y SIN `redirect_uri` (solo aplica a `authorization_code`).
   *
   * ⚠ El `refresh_token` es rotativo y de un solo uso: el nuevo se persiste ANTES
   * de devolver el access_token. Ante `invalid_grant`, marca el seller como expired.
   */
  async refreshTokenIfNeeded(seller: Seller): Promise<string> {
    const marginMs = this.config.refreshMarginDays * 24 * 60 * 60 * 1000;
    if (
      seller.accessToken &&
      seller.expiresAt &&
      seller.expiresAt.getTime() > Date.now() + marginMs
    ) {
      return seller.accessToken;
    }

    const { appId, clientSecret } = this.assertConfigured();

    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: "POST",
        signal: AbortSignal.timeout(MP_HTTP_TIMEOUT_MS),
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: seller.refreshToken ?? "",
        }),
      });
    } catch (err) {
      if (isFetchTimeout(err)) {
        throw new Conflict(
          `No se pudo refrescar el token de Mercado Pago: no respondió en ${MP_HTTP_TIMEOUT_MS / 1000} segundos. Probá de nuevo.`,
          "MP_TIMEOUT",
        );
      }
      throw err;
    }

    const response = (await res.json().catch(() => ({}))) as MpTokenResponse;

    if (!res.ok || response.error || !response.access_token) {
      if (response.error === "invalid_grant") {
        await this.sellersRepo.update(seller.userId, { status: "expired" });
        throw new Conflict(
          "La cuenta de Mercado Pago se desconectó. Volvé a vincularla.",
          "MP_SELLER_DISCONNECTED",
        );
      }
      throw new Conflict(
        `No se pudo refrescar el token de Mercado Pago: ${response.error ?? res.statusText}`,
      );
    }

    await this.sellersRepo.update(seller.userId, {
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? seller.refreshToken,
      expiresAt: new Date(Date.now() + (response.expires_in ?? 0) * 1000),
      status: "active",
    });

    return response.access_token;
  }

  /**
   * @deprecated F0 — la Edge Function escribe tokens cifrados directo en
   * `mercadopago_sellers`. El buzón `mercadopago_seller_handoff` ya no se usa.
   */
  async pullSellerFromCloud(): Promise<PullSellerResult> {
    return {
      pulled: false,
      reason: "Deprecated: la Edge Function persiste tokens cifrados directo en mercadopago_sellers (F0).",
    };
  }

  /**
   * Desvincular (D9/A18): wipe de tokens + status expired — NUNCA DELETE, la
   * FK mercadopago_cajas.seller_user_id lo impide. Limpia handoffs residuales
   * y bars.seller_user_id.
   */
  async unlinkSeller(): Promise<{ ok: true; cloudCleaned: boolean }> {
    const wiped = await this.sellersRepo.wipeAllTokens();
    if (wiped.length > 0) {
      console.log(`[MercadoPagoOAuthService] Sellers desvinculados: ${wiped.join(", ")}`);
    }

    let cloudCleaned = false;
    if (this.cloudDb) {
      try {
        // Higiene: buzón legado + bars (wipeAllTokens ya limpió sellers).
        const { error: handoffErr } = await this.cloudDb
          .from("mercadopago_seller_handoff")
          .delete()
          .neq("user_id", "");
        if (handoffErr) throw new Error(`mercadopago_seller_handoff: ${handoffErr.message}`);

        const { error: barsErr } = await this.cloudDb
          .from("bars")
          .update({ seller_user_id: null })
          .not("seller_user_id", "is", null);
        if (barsErr) throw new Error(`bars: ${barsErr.message}`);

        cloudCleaned = true;
      } catch (err) {
        console.warn(
          "[MercadoPagoOAuthService] Wipe local OK pero limpieza residual falló:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    return { ok: true, cloudCleaned };
  }

  /** Helper para el controller: valida que barId venga como string no vacío. */
  requireBarId(barId: unknown): string {
    if (typeof barId !== "string" || !barId) {
      throw new BadRequest("barId es requerido (query param).");
    }
    return barId;
  }
}
