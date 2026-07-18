# Plan MP — Fase 1: OAuth

> **Docs relevantes**: [`docs/mp/INDEX.md`](../mp/INDEX.md), [`docs/mp/api-oauth.md`](../mp/api-oauth.md), [`docs/mp/api-oauth-best-practices.md`](../mp/api-oauth-best-practices.md)


### A) ¿Qué se hace?

Implementar el flujo OAuth con PKCE para que Cocktrail obtenga un `access_token` + `refresh_token` de Bosko (el comercio) y los guarde en `mercadopago_sellers`, con refresh proactivo automático.

### B) ¿Por qué?

Es el Paso 1 del onboarding definido en [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md) § "Flujo completo de onboarding". Sin el token de Bosko no se puede crear sucursales, cajas ni cobros — todo recurso MP se crea "en nombre de" Bosko usando su token. El refresh proactivo (5–7 días antes del vencimiento) evita que una sesión activa se caiga en medio de un turno, y el `refresh_token` es rotativo y de un solo uso: si no se persiste el nuevo inmediatamente, la sesión queda invalidada (ver [`docs/mp/api-oauth.md`](../mp/api-oauth.md) § "Refresh Automático de Token").


### C) Implementación

**Docs**: [`docs/mp/api-oauth.md`](../mp/api-oauth.md) — flujo completo  
[`docs/mp/api-oauth-best-practices.md`](../mp/api-oauth-best-practices.md) — anti-patrones y checklists

**Arquitectura**: dos piezas separadas con responsabilidades distintas:

| Pieza | Dónde vive | Por qué |
|-------|-----------|---------|
| **Inicio** (`GET /oauth/url`) | Ruta Express en `apps/api` | Necesita `authMiddleware + requireRole("admin")` — solo admins inician OAuth. Usa `supabase` service_role (ya disponible en `shared/supabase.ts`). |
| **Callback** (`GET /oauth/callback`) | Edge Function en `supabase/functions/mp-auth-callback` | Endpoint público sin auth — lo llama el redirect de MP desde el navegador del vendedor. Usa `SUPABASE_SERVICE_ROLE_KEY` para bypasear RLS al escribir `mercadopago_sellers`. |

**C.1) Inicio — `GET /api/mercadopago/oauth/url?barId=...`** (Express)

Archivos a modificar:
- `apps/api/src/config/env.ts` — agregar `MP_APP_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI`
- `apps/api/src/modules/mercadopago/mercadopago.service.ts` — agregar `generateAuthUrl(barId)`
- `apps/api/src/modules/mercadopago/mercadopago.controller.ts` — agregar ruta

```ts
// ── mercadopago.service.ts ──
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { supabaseCloud } from "../../shared/supabase.js";

async generateAuthUrl(barId: string): Promise<{ url: string }> {
  const appId = env.MP_APP_ID;
  const redirectUri = env.MP_REDIRECT_URI;

  if (!appId || !redirectUri) {
    throw new Error("Configuración MP OAuth incompleta: faltan MP_APP_ID o MP_REDIRECT_URI");
  }

  // PKCE: code_verifier (43 chars) → code_challenge (S256)
  // ⚠ MP solo valida challenge si PKCE está habilitado en el panel de la app
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const state = randomUUID();

  const { error } = await supabaseCloud.from("oauth_states").insert({
    state,
    code_verifier: codeVerifier,
    bar_id: barId,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  if (error) {
    console.error("Error guardando oauth_state:", error);
    throw new Error("Error al iniciar el flujo OAuth");
  }

  // ⚠ redirect_uri debe ser estático y coincidir EXACTAMENTE con el configurado en la app de MP.
  // No se agregan query params extras (MP valida match exacto).
  const params = new URLSearchParams({
    client_id:              appId,
    response_type:          "code",
    platform_id:            "mp",
    state:                  state,
    redirect_uri:           redirectUri,
    code_challenge:         codeChallenge,
    code_challenge_method:  "S256",
  });

  // ⚠ scope no se incluye por defecto. La doc de Authorization Code de MP no
  // requiere scope explícito. Si en pruebas end-to-end MP no devuelve
  // refresh_token, agregar: scope: "read write offline_access"
  return { url: `https://auth.mercadopago.com/authorization?${params.toString()}` };
}

// ── mercadopago.controller.ts ──
router.get(
  "/oauth/url",
  authMiddleware,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const barId = req.query.barId;
      if (!barId || typeof barId !== "string") {
        res.status(400).json({ error: "barId es requerido (query param)" });
        return;
      }

      const { url } = await service.generateAuthUrl(barId);
      res.json({ url });
    } catch (err) {
      next(err);
    }
  }
);
```

**C.2) Callback — Edge Function `supabase/functions/mp-auth-callback/index.ts`**

Archivo a crear: `supabase/functions/mp-auth-callback/index.ts`  
Deploy: `supabase functions deploy mp-auth-callback`  
**Supabase**: la Edge Function corre en Cloud → `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` apuntan a Cloud. `oauth_states` y `mercadopago_sellers` deben existir en Cloud (las migraciones de Fase 0 se aplicaron en ambos).

```sql
-- ⚠ Ejecutar en AMBOS Supabases (Local + Cloud)
-- Vínculo bar↔seller (establecido al vincular OAuth)
ALTER TABLE bars ADD COLUMN IF NOT EXISTS seller_user_id TEXT;

-- Datos públicos de la cuenta MP (nombre, email, mostrados en UI)
ALTER TABLE mercadopago_sellers ADD COLUMN IF NOT EXISTS seller_nickname TEXT;
ALTER TABLE mercadopago_sellers ADD COLUMN IF NOT EXISTS seller_email TEXT;
```

**Nota**: `MP_APP_ID` en envs = `client_id` (APPID de la app de MP). Mantener el nombre de variable para consistencia con el resto del módulo, pero tener claro que en las llamadas a MP se usa como `client_id`. Ver [OAuth — Buenas Prácticas](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/credentials/oauth/best-practices) para la lista completa de chequeos.

```typescript
// supabase/functions/mp-auth-callback/index.ts
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

    // ── 1) Consumir state vía RPC atómica ──
    // state es un nonce aleatorio anti-CSRF, NO un business ID.
    const { data: oauthData, error: consumeError } =
      await supabaseAdmin.rpc("consume_oauth_state", { p_state: state })

    if (consumeError || !oauthData || oauthData.length === 0) {
      throw new Error("State inválido o expirado. Reiniciá la vinculación.")
    }

    const { code_verifier, bar_id } = oauthData[0]

    // ── 2) Intercambiar code por tokens ──
    // ⚠ Sin Authorization header. Autenticación: client_id + client_secret en body.
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

    // ⚠ Verificar HTTP status además de tokenData.error
    // (captura casos donde MP no devuelve JSON válido)
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

    // ── 3) Persistir en mercadopago_sellers ──
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

    // ── 3b) Vincular bar_id ↔ seller ──
    if (bar_id) {
      await supabaseAdmin
        .from("bars")
        .update({ seller_user_id: String(tokenData.user_id) })
        .eq("id", bar_id)
    }

    // ── 3c) Obtener y persistir datos públicos de la cuenta ──
    // GET /users/me con el access_token recién obtenido
    const userResponse = await fetch(
      "https://api.mercadopago.com/users/me",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    )
    if (userResponse.ok) {
      const userData = await userResponse.json()
      await supabaseAdmin
        .from("mercadopago_sellers")
        .update({
          seller_nickname: userData.nickname ?? null,
          seller_email:    userData.email ?? null,
        })
        .eq("user_id", String(tokenData.user_id))
    }
    // Si falla GET /users/me, no es crítico — los tokens ya están guardados

    // ── 4) Redirect al frontend con bar_id ──
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
```

**Secrets en Supabase** (obligatorios para la Edge Function):

```bash
supabase secrets set MP_APP_ID=...
supabase secrets set MP_CLIENT_SECRET=...
supabase secrets set MP_REDIRECT_URI=https://<proyecto>.supabase.co/functions/v1/mp-auth-callback
supabase secrets set NEXT_PUBLIC_SITE_URL=https://cocktrail.com
```

**Anti-patrones evitados** (ver [`api-oauth-best-practices.md`](../mp/api-oauth-best-practices.md) para lista completa):

| Anti-patrón | Cómo se evita |
|---|---|
| `state` usado como business ID | `randomUUID()` → `bar_id` guardado en `oauth_states`, recuperado vía RPC |
| `Authorization: Bearer` en `/oauth/token` | Solo `client_id` + `client_secret` en body |
| `redirect_uri` hardcodeado | `Deno.env.get("MP_REDIRECT_URI")` en ambos lados |
| `code_verifier` ausente (sin PKCE) | Generado en C.1, recuperado de `oauth_states` en callback |
| Guardar `public_key` u otros campos no canónicos | Solo `access_token`, `refresh_token`, `user_id`, `expires_at` |
| CORS innecesario en callback | Callback es redirect de navegador, no XHR — sin CORS |
| `expires_in` ausente = default enorme | Si no viene → `NOW()` → fuerza refresh inmediato |

**C.3) `refreshTokenIfNeeded(seller)`** — llamado antes de cualquier operación con token

**Docs**: [`docs/mp/api-oauth.md`](../mp/api-oauth.md) § "Paso 3 — Refresh Automático de Token"  
[`docs/mp/api-oauth-best-practices.md`](../mp/api-oauth-best-practices.md) § "Anti-patrones"

**⚠ Concurrencia**: el refresh_token es rotativo y de un solo uso. Dos requests concurrentes refrescando el mismo seller pueden "quemar" el token nuevo: el primero refresca y persiste el nuevo, el segundo usa el viejo (ya invalidado) y recibe `invalid_grant`. Solución: lock por seller con `SELECT ... FOR UPDATE`.

```
SERVICE: refreshTokenIfNeeded(seller)

  // ── 1) Lock y re-chequeo dentro de transacción ──
  BEGIN TRANSACTION

  // Bloquea el row del seller para evitar refresh concurrente
  seller = SELECT * FROM mercadopago_sellers
    WHERE user_id = seller.user_id
    FOR UPDATE

  // expires_at es TIMESTAMPTZ en DB → comparar con fecha, no ms
  // Margen configurable (entre 1 y 7 días, default 5)
  refreshMargin = env.MP_REFRESH_MARGIN_DAYS ?? 5  // días antes del vencimiento
  IF seller.expires_at > NOW() + (refreshMargin * INTERVAL '1 day')
    COMMIT
    RETURN seller.access_token  // todavía no hace falta refrescar

  // ── 2) Refrescar token ──
  response = POST https://api.mercadopago.com/oauth/token
    HEADERS: Content-Type: application/x-www-form-urlencoded
    // ⚠ Sin Authorization header
    // ⚠ Sin redirect_uri (solo para authorization_code, no para refresh_token)
    BODY: {
      client_id:      env.MP_APP_ID,
      client_secret:  env.MP_CLIENT_SECRET,
      grant_type:     "refresh_token",
      refresh_token:  seller.refresh_token
    }

  IF NOT response.ok → THROW "Error HTTP al refrescar token"
  IF response.error == "invalid_grant"
    sellersRepo.update(seller.user_id, { status: 'expired' })
    COMMIT
    THROW "seller desconectado, re-vincular OAuth"

  // ── 3) Persistir nuevo token y commit ──
  // ⚠ PERSISTIR INMEDIATAMENTE — el refresh_token viejo queda invalidado
  sellersRepo.update(seller.user_id, {
    access_token:  response.access_token,
    refresh_token: response.refresh_token,  // NUEVO — rotativo, un solo uso
    expires_at:    NOW() + (response.expires_in * INTERVAL '1 second')
  })

  COMMIT
  RETURN response.access_token
```

**Notas**:
- `redirect_uri` **no** se envía en el refresh (la doc de MP lo usa solo para `authorization_code`).
- Si MP no devuelve `refresh_token`, el sistema tolera `NULL` — el seller quedará sin refresh y eventualmente expirará, forzando re-vinculación.
- El `FOR UPDATE` dentro de una transacción serializa los refreshes: si dos requests llegan al mismo tiempo, el segundo espera al COMMIT del primero y re-chequea `expires_at` (ya actualizado).

**C.4) UI** — botón "Vincular Mercado Pago" en `PagosSection.tsx`

El botón muestra:
- **Label**: "Vincular Mercado Pago" (o "Actualizar vinculación" si ya está vinculado)
- **Icono**: logo minimalista de Mercado Pago (`<img>` o SVG inline, 20×20px, alineado a la izquierda del texto)
- **Info de cuenta** (si ya vinculada): debajo del botón, un badge sutil con:
  - `seller_nickname` (ej. "BOSKO BAR")
  - `seller_email`
  - `updated_at` con formato relativo ("Vinculado hace 3 días")

Comportamiento:
- Si `mercadopago_sellers` está vacío → botón "Vincular Mercado Pago" → `GET /api/mercadopago/oauth/url?barId=...` → `window.location.href = url`
- Si existe un seller `active` → el botón cambia a "Actualizar vinculación" + muestra badge con datos de cuenta
- Si existe un seller `expired` → el botón muestra "Re-vincular Mercado Pago" en rojo/naranja + badge "Sesión expirada"

Datos que necesita el frontend: un endpoint `GET /api/mercadopago/seller-status?barId=...` que lea de `supabaseCloud` (no de local — los sellers viven en Cloud):

```json
{
  "linked": true,
  "status": "active",
  "nickname": "BOSKO BAR",
  "email": "bosko@example.com",
  "linkedAt": "2026-07-15T22:14:00Z"
}
```

**Errores clave**:
- `invalid_grant` → el refresh token expiró o fue consumido (incluye caso de concurrencia: dos refreshes simultáneos). Marcar seller como `expired` y pedir re-vinculación manual. El `FOR UPDATE` previene la mayoría de estos casos.
- MP no devuelve `refresh_token` → revisar scopes/config en la app de MP. El sistema ya tolera `refresh_token` nulo (el seller queda sin capacidad de refresh y eventualmente expira).
- `redirect_uri` no coincide → MP rechaza el canje. Asegurar que `MP_REDIRECT_URI` en secrets coincida exactamente con la URL de redireccionamiento configurada en la app de MP. No se envía en refresh (solo en `authorization_code`).
- PKCE no habilitado en la app de MP → `code_verifier` se ignora silenciosamente. Verificar en panel de MP > tu app > PKCE.
- "Aplicación no está lista" / "La aplicación no puede conectarse a tu cuenta" → error pre-callback. Ver [`api-oauth-best-practices.md#troubleshooting`](../mp/api-oauth-best-practices.md#troubleshooting-aplicación-no-está-lista--la-aplicación-no-puede-conectarse-a-tu-cuenta): redirect_uri mismatch, app inactiva, o client_id incorrecto.

**C.5) Tests** — por capa

### Unit tests (`generateAuthUrl` service)

Mock: `supabaseCloud.from("oauth_states").insert` exitoso.

```
1) state es único entre llamadas consecutivas (dos URLs generadas tienen state distinto)
2) code_verifier cumple longitud entre 43 y 128 caracteres, solo caracteres base64url
3) code_challenge = SHA256(code_verifier).digest("base64url")
4) code_challenge_method = "S256" en la URL
5) La URL contiene client_id, response_type=code, redirect_uri, state, code_challenge, code_challenge_method
6) El insert a oauth_states lleva expires_at ≈ NOW + 10 min (margen ±1s)
7) Si MP_APP_ID o MP_REDIRECT_URI no están definidos → throw
```

### pgTAP (DB/RPC) — se agregan a la suite existente de Fase 0

```
8)  consume_oauth_state: primer consumo devuelve datos, segundo no devuelve nada
9)  consume_oauth_state: state expirado no se consume (no devuelve filas)
10) consume_oauth_state: en concurrencia simulada, solo una sesión obtiene datos
     -- Se usa pg_try_advisory_lock para simular dos sesiones compitiendo
```

### Integration tests (Edge Function callback) — `fetch` mockeado

```
11) Caso OK: POST /oauth/token → 200 { access_token, refresh_token, user_id, expires_in }
    → verifica upsert en mercadopago_sellers con status='active'
    → GET /users/me → 200 { nickname, email } → verifica update de seller_nickname, seller_email
    → redirect a /admin?tab=pagos&linked=true&barId=...

12) Caso error MP: POST /oauth/token → 400 { error: "invalid_grant", message: "..." }
    → redirect a /admin?tab=pagos&linked=false&message=...
    → NO persiste seller

13) Caso state inválido/expirado: consume_oauth_state → []
    → redirect /admin?tab=pagos&linked=false&message=State%20inv%C3%A1lido...

14) Caso GET /users/me falla: token guardado, account info no → redirect OK
    (la obtención de datos de cuenta no es crítica)

15) Caso sin code o state en query params → 400
```

### Integration tests (refresh token)

```
16) expires_at > NOW + umbral → no llama a /oauth/token, devuelve token actual
17) expires_at < NOW + umbral → llama refresh, persiste nuevo access_token + refresh_token
18) /oauth/token devuelve invalid_grant → marca status='expired', throw
19) Concurrencia: dos llamadas simultáneas al refresh del mismo seller
    → FOR UPDATE serializa: la segunda espera, re-chequea expires_at (ya actualizado),
      y reutiliza el token sin hacer segunda llamada a MP
```

### Tests de seguridad

```
20) RLS mercadopago_sellers: SET LOCAL role anon → SELECT → blocked
21) RLS mercadopago_sellers: SET LOCAL role authenticated → SELECT → blocked
22) GET /api/mercadopago/oauth/url sin auth → 401
23) GET /api/mercadopago/oauth/url con rol caja → 403 (solo admin)
24) Callback redirect no expone access_token ni refresh_token en la URL
    (solo flags: linked=true/false, barId, message)
25) Callback no acepta POST con body arbitrario para crear sellers
    (solo procesa code+state de query params, y el state se consume una sola vez)
```

### D) Estado de validación — ✅ APROBADO (local) / ⏳ PENDIENTE (cloud) (2026-07-17)

**Implementación** (flujo cloud, decidido con el usuario):
- `apps/api/src/modules/mercadopago/mercadopago-oauth.service.ts` — `generateAuthUrl` (PKCE S256, sin `scope` por defecto, redirect_uri estático), `refreshTokenIfNeeded` (form-urlencoded, sin `Authorization`, sin `redirect_uri`, margen `MP_REFRESH_MARGIN_DAYS` default 5, `invalid_grant`→`expired`) y `getSellerStatus`.
- Repos `oauth-states.repository.ts` + `mercadopago-sellers.repository.ts` usan `mpDb = supabaseCloud ?? supabase` (escriben en Cloud en prod; en dev caen a la DB local que tiene las mismas tablas).
- `mercadopago-oauth.controller.ts` — `GET /api/mercadopago/oauth/url` (admin, barId requerido) + `GET /api/mercadopago/seller-status` (admin). Wireado en `app.ts`.
- **Callback = Edge Function** `supabase/functions/mp-auth-callback/index.ts` (nombre alineado a la función ya deployada del usuario): consume state → canjea token (x-www-form-urlencoded) → upsert seller → `/users/me` (nickname/email) → link `bars.seller_user_id` (best-effort) → redirect a **`/admin?tab=pagos`** con `linked=true|false[&message]`.
- Migración `20260715000500_mp_oauth_cloud_columns.sql` — `bars.seller_user_id`, `mercadopago_sellers.seller_nickname/seller_email` (cableada en `docker-compose.yml`, aplicada a la DB local).
- Env: `MP_APP_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI`, `MP_REFRESH_MARGIN_DAYS` (+ `.env.example`).
- UI: `PagosSection.tsx` — botón Vincular/Actualizar/Re-vincular según `seller-status`, badge (nickname/email/"vinculado hace N días"), manejo de `?linked&message`.

Archivos de test creados:
- `apps/api/src/modules/mercadopago/mercadopago-oauth.service.test.ts` — unit C.5 #1–7 + refresh #16–18 + `getSellerStatus`.
- `apps/web/src/components/settings/PagosSection.test.tsx` — UI (botón, estados, callback `linked`/`message`).
- `supabase/tests/phase1_oauth_rpc_test.sql` — pgTAP C.5 #8–10.

| # | Test | Estado |
|---|------|--------|
| 1–7 | Unit `generateAuthUrl` (state único, verifier 43–128 base64url, challenge S256, params, sin scope, TTL 10 min, throw sin config) | ✅ (7/7) |
| 8–10 | pgTAP `consume_oauth_state` (primer consumo, one-shot, expirado no consume) | ✅ (4/4) |
| 16–18 | Unit refresh token (umbral 5d, form-urlencoded sin redirect_uri, `invalid_grant`→expired, otro error) | ✅ |
| — | UI PagosSection (Vincular/Actualizar/Re-vincular, badge, callback params) | ✅ (backend 218/218 · web 15/15 · tsc API+web OK) |
| 11–15 | Integration callback (Edge Function Deno) | ⏳ Cloud — función `mp-auth-callback` **deployada** (v2, `verify_jwt=false`) en el proyecto Bosko; falta E2E con credenciales MP reales |
| 19 | Refresh concurrencia `FOR UPDATE` | ⚠ No aplicable con supabase-js/PostgREST (sin pool pg no se puede sostener el lock a través del fetch a MP). Documentado en el service; refresh sin lock (ventana de carrera mínima) |
| 20–21 | RLS sellers `anon`/`authenticated` | ✅ ya cubierto en Fase 0 (phase0_schema_test #31–32) |
| 22–23 | Auth `/oauth/url` (401 sin sesión, 403 rol caja) | ✅ por `authMiddleware + requireRole("admin")` (middleware ya testeado) — ⏳ falta integration e2e dedicado |
| 24–25 | Callback no expone tokens en URL / solo procesa code+state, state one-shot | ✅ por diseño (redirect solo con `linked/message/barId`; state consumido vía RPC) |

**Provisión cloud — ✅ HECHO (2026-07-17, proyecto Bosko `nmdvrmglmnbpoyfjmgab`)**:
- Migraciones aplicadas: Fase 0 (`bars`, `mercadopago_sellers`+RLS, `mercadopago_cajas`, `mercadopago_cajas_devices`, `oauth_states`+RPC) + Fase 1 (`20260715000500` columnas). Verificado: 5 tablas MP + columnas + RPC.
- Edge Function `mp-auth-callback` **deployada v2** con `verify_jwt=false` (callback público; CSRF = state one-shot).
- RPC `consume_oauth_state` endurecida (search_path fijo + `REVOKE EXECUTE FROM anon, authenticated`) → advisors de seguridad MP en verde (solo queda un WARN preexistente en `rls_auto_enable`, ajeno a MP).
- Probe E2E de la RPC en cloud: insert + consume OK + segundo consumo vacío (one-shot).

**Pendiente (acción del usuario, requiere credenciales que no tengo)**:
1. **Secrets de la Edge Function** (no hay tool MCP para setearlos): `supabase secrets set MP_APP_ID=... MP_CLIENT_SECRET=... MP_REDIRECT_URI=https://nmdvrmglmnbpoyfjmgab.supabase.co/functions/v1/mp-auth-callback NEXT_PUBLIC_SITE_URL=<url_del_frontend>`.
2. **Backend** (`apps/api/.env`): `SUPABASE_CLOUD_URL` + `SUPABASE_CLOUD_SERVICE_ROLE_KEY` (para que `generateAuthUrl` escriba el state en el mismo proyecto), y `MP_APP_ID` / `MP_CLIENT_SECRET` / `MP_REDIRECT_URI` (mismo redirect_uri exacto).
3. **Panel de MP**: registrar ese `redirect_uri` exacto en "Tus integraciones" y habilitar PKCE.
4. E2E real de vinculación (11–15) una vez cargadas las credenciales.

---

---

