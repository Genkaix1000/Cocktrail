import { randomBytes, createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Conflict, BadRequest } from "../../shared/errors/http-errors.js";
import type { OAuthStatesRepository } from "./oauth-states.repository.js";
import type { MercadoPagoSellersRepository, Seller } from "./mercadopago-sellers.repository.js";
import { decryptHandoff } from "./mp-token-cipher.js";
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
};

/** Resultado del pull del buzón de traspaso. */
export type PullSellerResult = {
  pulled: boolean;
  userId?: string;
  reason?: string;
};

export class MercadoPagoOAuthService {
  /** Throttle del pull lazy de getSellerStatus: a lo sumo un intento por minuto. */
  private lastLazyPullAt = 0;

  constructor(
    private readonly oauthStatesRepo: OAuthStatesRepository,
    private readonly sellersRepo: MercadoPagoSellersRepository,
    private readonly config: MpOAuthConfig,
    /** Cliente de Supabase CLOUD (buzón de handoff + metadata). null = sin Cloud. */
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
   * contexto de negocio (`barId`) viaja en `oauth_states`, no en la URL.
   */
  async generateAuthUrl(barId: string | null): Promise<{ url: string }> {
    const { appId, redirectUri } = this.assertConfigured();

    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const state = randomUUID();

    await this.oauthStatesRepo.insert({
      state,
      codeVerifier,
      barId,
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
   * pero hoy no se filtra por barra (ver plan Fase 1 § restricción bars UUID vs código).
   */
  async getSellerStatus(_barId: string | null): Promise<SellerStatusResult> {
    let seller = await this.sellersRepo.findActive();

    // Pull lazy: si no hay seller local, quizás hay un handoff esperando en
    // Cloud (el admin acaba de autorizar en MP). Oportunista y throttled —
    // un fallo acá no rompe el status.
    if (!seller && this.cloudDb && Date.now() - this.lastLazyPullAt > 60_000) {
      this.lastLazyPullAt = Date.now();
      try {
        const pull = await this.pullSellerFromCloud();
        if (pull.pulled) seller = await this.sellersRepo.findActive();
      } catch (err) {
        console.warn(
          "[MercadoPagoOAuthService] pull lazy falló:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (!seller) {
      return { linked: false, status: null, nickname: null, email: null, linkedAt: null, displayName: null };
    }
    // Componer nombre real: first_name + last_name. Fallback a nickname (API de MP).
    const displayName = [seller.firstName, seller.lastName].filter(Boolean).join(" ") || seller.nickname;
    return {
      linked: true,
      status: seller.status,
      nickname: seller.nickname,
      email: seller.email,
      linkedAt: seller.linkedAt ? seller.linkedAt.toISOString() : null,
      displayName,
    };
  }

  /**
   * Devuelve un access_token válido para el seller, refrescándolo si vence dentro
   * del margen. El intercambio usa `application/x-www-form-urlencoded`, SIN header
   * `Authorization` y SIN `redirect_uri` (solo aplica a `authorization_code`).
   *
   * ⚠ El `refresh_token` es rotativo y de un solo uso: el nuevo se persiste ANTES
   * de devolver el access_token. Ante `invalid_grant`, marca el seller como expired.
   *
   * Post-PR 4 el repo persiste en la base LOCAL con el token cifrado y marca
   * `cloud_synced_at = NULL` (push diferido de metadata, PR 5). Este método es
   * el ÚNICO escritor del refresh (cierra A8 por construcción); los tokens
   * jamás se pushean a Cloud (D3).
   *
   * NOTA de concurrencia: el plan pide `SELECT ... FOR UPDATE` para serializar
   * refreshes concurrentes, pero el backend usa supabase-js/PostgREST (sin pool pg
   * directo), que no permite sostener una transacción con lock a través del fetch a
   * MP. Se implementa sin lock; la ventana de carrera es mínima (solo cerca del
   * vencimiento). Si se vuelve un problema, mover el refresh a una RPC/pg directo.
   */
  async refreshTokenIfNeeded(seller: Seller): Promise<string> {
    const marginMs = this.config.refreshMarginDays * 24 * 60 * 60 * 1000;
    // accessToken/expiresAt nulos (fila stub o wipe) → forzar el refresh.
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

    // PERSISTIR INMEDIATAMENTE — el refresh_token viejo queda invalidado.
    await this.sellersRepo.update(seller.userId, {
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? seller.refreshToken,
      expiresAt: new Date(Date.now() + (response.expires_in ?? 0) * 1000),
      status: "active",
    });

    return response.access_token;
  }

  /**
   * Baja el seller desde el buzón de traspaso de Cloud (PR 4 — inversión del
   * token): la Edge Function deposita el payload cifrado con MP_HANDOFF_KEY;
   * acá se descifra, se re-cifra con la clave LOCAL y se borra el buzón.
   * Modelo single-seller: si el handoff trae otro user_id, el activo previo
   * queda expirado (wipe) ANTES del upsert — nunca 2 activos.
   */
  async pullSellerFromCloud(): Promise<PullSellerResult> {
    if (!this.cloudDb) {
      return { pulled: false, reason: "Supabase Cloud no está configurado — no hay buzón que leer." };
    }

    // Handoff más nuevo, todavía no vencido (TTL 15 min en la tabla).
    const { data, error } = await this.cloudDb
      .from("mercadopago_seller_handoff")
      .select("id, user_id, payload_enc, key_version, created_at, expires_at")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Conflict(
        `No se pudo leer el buzón de traspaso en Cloud: ${error.message}. ` +
          "Verificá la conexión a internet y que la migración de mercadopago_seller_handoff esté aplicada en Cloud.",
      );
    }
    if (!data) {
      return { pulled: false, reason: "No hay ninguna vinculación pendiente de traspaso." };
    }

    const payload = decryptHandoff(data.payload_enc as string);

    // Single-seller (D9/A17): expirar el activo previo si es otra cuenta.
    const current = await this.sellersRepo.findActive();
    if (current && current.userId !== payload.user_id) {
      await this.sellersRepo.update(current.userId, {
        accessToken: null,
        refreshToken: null,
        status: "expired",
      });
    }

    // Metadata pública desde el seller de Cloud (la EF ya no manda tokens ahí).
    let metadata: {
      nickname?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
    } = {};
    try {
      const { data: cloudSeller } = await this.cloudDb
        .from("mercadopago_sellers")
        .select("seller_nickname, seller_first_name, seller_last_name, seller_email")
        .eq("user_id", payload.user_id)
        .maybeSingle();
      if (cloudSeller) {
        metadata = {
          nickname: cloudSeller.seller_nickname ?? null,
          firstName: cloudSeller.seller_first_name ?? null,
          lastName: cloudSeller.seller_last_name ?? null,
          email: cloudSeller.seller_email ?? null,
        };
      }
    } catch (err) {
      console.warn(
        "[MercadoPagoOAuthService] No se pudo bajar la metadata del seller desde Cloud:",
        err instanceof Error ? err.message : err,
      );
    }

    // Re-cifrado local (el repo cifra con MP_TOKEN_SECRET ?? AUTH_SECRET).
    await this.sellersRepo.upsert({
      userId: payload.user_id,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: new Date(payload.expires_at),
      status: "active",
      ...metadata,
    });

    // El buzón se vacía: el token no debe quedar en Cloud ni cifrado (D3).
    const { error: delError } = await this.cloudDb
      .from("mercadopago_seller_handoff")
      .delete()
      .eq("id", data.id);
    if (delError) {
      console.warn(
        `[MercadoPagoOAuthService] El seller se trajo OK pero no se pudo borrar el handoff ${data.id}: ${delError.message}. El TTL de 15 min lo vence solo.`,
      );
    }

    return { pulled: true, userId: payload.user_id };
  }

  /**
   * Desvincular (D9/A18): wipe de tokens + status expired — NUNCA DELETE, la
   * FK mercadopago_cajas.seller_user_id lo impide y la fila sin tokens cumple
   * D9 igual. Limpia también Cloud (sellers, handoffs, bars.seller_user_id),
   * tolerante a Cloud caído: local se limpia SIEMPRE y `cloudCleaned` reporta
   * si Cloud quedó limpio o no.
   */
  async unlinkSeller(): Promise<{ ok: true; cloudCleaned: boolean }> {
    const wiped = await this.sellersRepo.wipeAllTokens();
    if (wiped.length > 0) {
      console.log(`[MercadoPagoOAuthService] Sellers desvinculados en local: ${wiped.join(", ")}`);
    }

    let cloudCleaned = false;
    if (this.cloudDb) {
      try {
        const { error: sellersErr } = await this.cloudDb
          .from("mercadopago_sellers")
          .update({
            access_token: null,
            refresh_token: null,
            status: "expired",
            updated_at: new Date().toISOString(),
          })
          .neq("user_id", "");
        if (sellersErr) throw new Error(`mercadopago_sellers: ${sellersErr.message}`);

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
          "[MercadoPagoOAuthService] Desvinculación local OK pero Cloud no se pudo limpiar:",
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
