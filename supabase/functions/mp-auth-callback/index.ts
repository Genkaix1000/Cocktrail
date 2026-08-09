import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

// ── Cifrado de tokens (contrato "cocktrail/mp-token/v1") ─────────────────────
// Blob: "v1." + b64url(salt 16B) + "." + b64url(iv 12B) + "." + b64url(ct||tag)
// Clave: HKDF-SHA256(ikm=utf8(MP_TOKEN_SECRET), salt, info) → AES-256-GCM.
// Debe ser IDÉNTICO a apps/api mp-token-cipher.ts / aes-gcm.ts. No tocar sin ambos.

const TOKEN_INFO = "cocktrail/mp-token/v1"
const MP_TOKEN_KEY_VERSION = 1

function b64url(bytes: Uint8Array): string {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function encryptToken(plaintext: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const ikm = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveBits"],
  )
  const keyBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode(TOKEN_INFO) },
    ikm,
    256,
  )
  const key = await crypto.subtle.importKey(
    "raw",
    keyBits,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  )
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  )

  return `v1.${b64url(salt)}.${b64url(iv)}.${b64url(new Uint8Array(ciphertext))}`
}

function resolveSiteUrl(redirectUrl: string | null | undefined): string {
  const fallback = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000"
  if (!redirectUrl) return fallback
  try {
    const u = new URL(redirectUrl)
    if (u.protocol !== "http:" && u.protocol !== "https:") return fallback
    return u.origin
  } catch {
    return fallback
  }
}

serve(async (req: Request) => {
  let siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000"
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")

    if (!code || !state) {
      return new Response("Faltan code o state", { status: 400 })
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const { data: oauthData, error: consumeError } =
      await supabaseAdmin.rpc("consume_oauth_state", { p_state: state })

    if (consumeError || !oauthData || oauthData.length === 0) {
      throw new Error("State inválido o expirado. Reiniciá la vinculación.")
    }

    const { code_verifier, bar_id, redirect_url } = oauthData[0]
    siteUrl = resolveSiteUrl(redirect_url)

    const mpRedirectUri = Deno.env.get("MP_REDIRECT_URI")
    const mpClientId = Deno.env.get("MP_APP_ID")
    const mpClientSecret = Deno.env.get("MP_CLIENT_SECRET")
    const tokenSecret = Deno.env.get("MP_TOKEN_SECRET")

    if (!mpRedirectUri || !mpClientId || !mpClientSecret) {
      throw new Error("Configuración MP incompleta: faltan secrets")
    }
    if (!tokenSecret) {
      throw new Error(
        "Falta el secret MP_TOKEN_SECRET en la Edge Function. " +
          "Configuralo con `supabase secrets set MP_TOKEN_SECRET=...` " +
          "(mismo valor que apps/api) y reintentá.",
      )
    }

    const tokenResponse = await fetch(
      "https://api.mercadopago.com/oauth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: mpClientId,
          client_secret: mpClientSecret,
          grant_type: "authorization_code",
          code: code,
          redirect_uri: mpRedirectUri,
          code_verifier: code_verifier,
        }),
      },
    )

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text()
      console.error("MP /oauth/token HTTP error:", tokenResponse.status, body)
      throw new Error(`Error HTTP ${tokenResponse.status} al obtener tokens`)
    }

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      console.error("MP /oauth/token error:", tokenData)
      throw new Error(tokenData.message || "Error al obtener tokens de Mercado Pago")
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : new Date().toISOString()
    const sellerUserId = String(tokenData.user_id)
    const nowIso = new Date().toISOString()

    const accessTokenEnc = await encryptToken(tokenData.access_token, tokenSecret)
    const refreshTokenEnc = tokenData.refresh_token
      ? await encryptToken(tokenData.refresh_token, tokenSecret)
      : null

    // Single-seller: expirar cualquier OTRO seller activo antes del upsert.
    const { error: expireError } = await supabaseAdmin
      .from("mercadopago_sellers")
      .update({ status: "expired", updated_at: nowIso })
      .eq("status", "active")
      .neq("user_id", sellerUserId)

    if (expireError) throw expireError

    const { error: dbError } = await supabaseAdmin
      .from("mercadopago_sellers")
      .upsert(
        {
          user_id: sellerUserId,
          access_token: null,
          refresh_token: null,
          access_token_enc: accessTokenEnc,
          refresh_token_enc: refreshTokenEnc,
          key_version: MP_TOKEN_KEY_VERSION,
          expires_at: expiresAt,
          status: "active",
          updated_at: nowIso,
        },
        { onConflict: "user_id" },
      )

    if (dbError) throw dbError

    if (bar_id) {
      const byCode = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bar_id)
      await supabaseAdmin
        .from("bars")
        .update({ seller_user_id: sellerUserId })
        .eq(byCode ? "code" : "id", bar_id)
    }

    const userResponse = await fetch(
      "https://api.mercadopago.com/users/me",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    )
    if (userResponse.ok) {
      const userData = await userResponse.json()
      await supabaseAdmin
        .from("mercadopago_sellers")
        .update({
          seller_nickname: userData.nickname ?? null,
          seller_first_name: userData.first_name ?? null,
          seller_last_name: userData.last_name ?? null,
          seller_email: userData.email ?? null,
        })
        .eq("user_id", sellerUserId)
    }

    const params = new URLSearchParams({ linked: "true" })
    if (bar_id) params.set("barId", bar_id)

    return Response.redirect(`${siteUrl}/admin?tab=pagos&${params.toString()}`, 302)
  } catch (error: any) {
    console.error("mp-auth-callback error:", error.message)
    return Response.redirect(
      `${siteUrl}/admin?tab=pagos&linked=false&message=${encodeURIComponent(error.message)}`,
      302,
    )
  }
})
