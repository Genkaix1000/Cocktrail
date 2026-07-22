import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

// ── Cifrado del handoff (contrato "cocktrail/mp-handoff/v1") ──────────────────
// Blob: "v1." + b64url(salt 16B) + "." + b64url(iv 12B) + "." + b64url(ct||tag)
// Clave: HKDF-SHA256(ikm=utf8(MP_HANDOFF_KEY), salt, info) → AES-256-GCM.
// El backend Node implementa EXACTAMENTE el mismo contrato (mp-token-cipher.ts):
// cualquier desvío acá rompe el descifrado del pull. No tocar sin tocar ambos.

const HANDOFF_INFO = "cocktrail/mp-handoff/v1"

function b64url(bytes: Uint8Array): string {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function encryptHandoff(plaintext: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const ikm = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveBits"]
  )
  const keyBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode(HANDOFF_INFO) },
    ikm,
    256
  )
  const key = await crypto.subtle.importKey(
    "raw",
    keyBits,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  )
  // WebCrypto devuelve ciphertext||tag concatenado — compatible con Node.
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  )

  return `v1.${b64url(salt)}.${b64url(iv)}.${b64url(new Uint8Array(ciphertext))}`
}

serve(async (req: Request) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")

    if (!code || !state) {
      return new Response("Faltan code o state", { status: 400 })
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    // 1) Consumir state vía RPC atómica
    // state es un nonce aleatorio anti-CSRF, NO un business ID
    const { data: oauthData, error: consumeError } =
      await supabaseAdmin.rpc("consume_oauth_state", { p_state: state })

    if (consumeError || !oauthData || oauthData.length === 0) {
      throw new Error("State inválido o expirado. Reiniciá la vinculación.")
    }

    const { code_verifier, bar_id } = oauthData[0]

    // 2) Intercambiar code por tokens
    // Sin Authorization header — autenticación: client_id + client_secret en body
    const mpRedirectUri = Deno.env.get("MP_REDIRECT_URI")
    const mpClientId = Deno.env.get("MP_APP_ID")
    const mpClientSecret = Deno.env.get("MP_CLIENT_SECRET")

    if (!mpRedirectUri || !mpClientId || !mpClientSecret) {
      throw new Error("Configuración MP incompleta: faltan secrets")
    }

    // El secret del handoff se valida ANTES del exchange: si falta, la
    // vinculación falla con mensaje claro. NUNCA se escriben tokens en claro
    // como fallback (D3).
    const handoffKey = Deno.env.get("MP_HANDOFF_KEY")
    if (!handoffKey) {
      throw new Error(
        "Falta el secret MP_HANDOFF_KEY en la Edge Function. " +
        "Configuralo con `supabase secrets set MP_HANDOFF_KEY=...` y reintentá."
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
      }
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

    // 3a) Persistir: los tokens van CIFRADOS al buzón de traspaso
    // (mercadopago_seller_handoff); mercadopago_sellers Cloud queda con SOLO
    // metadata. El backend local hace el pull, descifra y re-cifra local (PR 4).
    // Si expires_in no viene → NOW() para forzar refresh inmediato
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : new Date().toISOString()
    const sellerUserId = String(tokenData.user_id)
    const nowIso = new Date().toISOString()

    // 3a.1) Higiene del buzón: fuera los handoffs vencidos y los del mismo user
    const { error: cleanupError } = await supabaseAdmin
      .from("mercadopago_seller_handoff")
      .delete()
      .or(`expires_at.lt.${nowIso},user_id.eq.${sellerUserId}`)

    if (cleanupError) {
      // No es fatal: el INSERT nuevo sigue siendo el más reciente
      console.error("mp-auth-callback: limpieza de handoffs falló:", cleanupError)
    }

    // 3a.2) INSERT del handoff cifrado (expires_at: DEFAULT NOW() + 15 min)
    const payloadEnc = await encryptHandoff(
      JSON.stringify({
        user_id: sellerUserId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token ?? null,
        expires_at: expiresAt,
      }),
      handoffKey
    )

    const { error: handoffError } = await supabaseAdmin
      .from("mercadopago_seller_handoff")
      .insert({
        user_id: sellerUserId,
        payload_enc: payloadEnc,
        key_version: 1,
      })

    if (handoffError) throw handoffError

    // 3a.3) Single-seller: expirar cualquier OTRO seller activo antes del
    // upsert — el índice único parcial (WHERE status='active') rechazaría
    // un segundo activo.
    const { error: expireError } = await supabaseAdmin
      .from("mercadopago_sellers")
      .update({ status: "expired", updated_at: nowIso })
      .eq("status", "active")
      .neq("user_id", sellerUserId)

    if (expireError) throw expireError

    // 3a.4) Upsert de SOLO metadata. Los tokens en NULL EXPLÍCITOS: en un
    // re-link pisan cualquier token en claro que hubiera quedado de antes.
    const { error: dbError } = await supabaseAdmin
      .from("mercadopago_sellers")
      .upsert(
        {
          user_id: sellerUserId,
          access_token: null,
          refresh_token: null,
          expires_at: expiresAt,
          status: "active",
          updated_at: nowIso,
        },
        { onConflict: "user_id" }
      )

    if (dbError) throw dbError

    // 3b) Vincular bar_id ↔ seller
    if (bar_id) {
      await supabaseAdmin
        .from("bars")
        .update({ seller_user_id: sellerUserId })
        .eq("id", bar_id)
    }

    // 3c) Obtener y persistir datos públicos de la cuenta
    const userResponse = await fetch(
      "https://api.mercadopago.com/users/me",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    )
    if (userResponse.ok) {
      const userData = await userResponse.json()
      await supabaseAdmin
        .from("mercadopago_sellers")
        .update({
          seller_nickname:   userData.nickname ?? null,
          seller_first_name:  userData.first_name ?? null,
          seller_last_name:   userData.last_name ?? null,
          seller_email:       userData.email ?? null,
        })
        .eq("user_id", sellerUserId)
    }

    // 4) Redirect al frontend con bar_id
    const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000"
    const params = new URLSearchParams({ linked: "true" })
    if (bar_id) params.set("barId", bar_id)

    return Response.redirect(`${siteUrl}/admin?tab=pagos&${params.toString()}`, 302)
  } catch (error: any) {
    console.error("mp-auth-callback error:", error.message)
    const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000"
    return Response.redirect(
      `${siteUrl}/admin?tab=pagos&linked=false&message=${encodeURIComponent(error.message)}`,
      302
    )
  }
})
