import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1"

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

    // 3a) Persistir en mercadopago_sellers
    // Si expires_in no viene → NOW() para forzar refresh inmediato
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : new Date().toISOString()

    const { error: dbError } = await supabaseAdmin
      .from("mercadopago_sellers")
      .upsert(
        {
          user_id: String(tokenData.user_id),
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token ?? null,
          expires_at: expiresAt,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )

    if (dbError) throw dbError

    // 3b) Vincular bar_id ↔ seller
    if (bar_id) {
      await supabaseAdmin
        .from("bars")
        .update({ seller_user_id: String(tokenData.user_id) })
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
        .eq("user_id", String(tokenData.user_id))
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
