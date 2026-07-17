# API — OAuth: Buenas Prácticas y Anti-patrones

> **Cuándo leer esto**: durante la implementación de OAuth (Fase 1) para evitar errores comunes al llamar a `/oauth/token` y al configurar el redirect.  
> **Fuente**: [Referencia de API de MP — OAuth](https://www.mercadopago.com.ar/developers/es/reference/authentication/oauth/_oauth_token/post)  
> **Checklist oficial**: [Buenas Prácticas de OAuth](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/credentials/oauth/best-practices)

---

## Convención de nombres

| Variable Cocktrail | Significado en MP |
|---|---|
| `MP_APP_ID` | `client_id` (APPID de la app) |
| `MP_CLIENT_SECRET` | `client_secret` |
| `MP_REDIRECT_URI` | `redirect_uri` |

---

## Anti-patrones en el intercambio de token (`POST /oauth/token`)

### 1) No usar `Authorization: Bearer` en `/oauth/token`

El canje de `code` por tokens se autentica exclusivamente con `client_id` + `client_secret` en el body. Agregar un header `Authorization: Bearer {ACCESS_TOKEN}` no corresponde y puede causar errores de autenticación.

```
❌ headers: { Authorization: "Bearer APP_USR-..." }
✅ body:    { client_id: "...", client_secret: "...", grant_type: "authorization_code", code: "...", redirect_uri: "..." }
```

### 2) No hardcodear `redirect_uri`

Debe leerse de variable de entorno/env y coincidir **exactamente** con la URL de redireccionamiento configurada en la app de MP. Si no coincide (caracter por caracter), falla.

```
❌ redirect_uri: "https://mi-app.com/callback"  // hardcodeado, puede desincronizarse
✅ redirect_uri: Deno.env.get("MP_REDIRECT_URI") // mismo valor que en panel MP + env
```

### 3) No usar `state` como business ID (comercio_id, bar_id, etc.)

`state` es un nonce aleatorio anti-CSRF, generado por intento. El contexto de negocio (ej. `bar_id`) debe guardarse en `oauth_states` y recuperarse al consumir el state.

```
❌ state: "BAR-01"                    // business ID en el state
✅ state: randomUUID()                // nonce aleatorio
   INSERT INTO oauth_states (state, bar_id, ...)  // contexto en DB
```

### 4) No omitir `code_verifier` si PKCE está habilitado

Si la app de MP tiene PKCE habilitado, el `POST /oauth/token` debe incluir `code_verifier`. Si no se envía o no coincide con el `code_challenge` original, el intercambio falla.

```
❌ body: { client_id, client_secret, code, redirect_uri }  // sin code_verifier
✅ body: { client_id, client_secret, code, redirect_uri, code_verifier }
```

### 5) No enviar parámetros extra en `redirect_uri`

`redirect_uri` debe ser una URL estática sin query params dinámicos. MP valida match exacto. Si necesitás pasar contexto, usá `state`.

```
❌ redirect_uri: "https://mi-app.com/callback?barId=01"
✅ redirect_uri: "https://mi-app.com/callback"
   state: randomUUID()  // el barId está en oauth_states, no en redirect_uri
```

### 6) No agregar `params` no requeridos en el body

Enviá solo los campos documentados. Campos extra pueden causar errores 400.

### 7) No usar `grant_type` incorrecto

Para `authorization_code` → `grant_type: "authorization_code"`.  
Para `refresh_token` → `grant_type: "refresh_token"`.

### 8) No enviar parámetros como query params

Los parámetros van en el body de la solicitud POST, no en la URL.

### 9) Usar los headers correctos

`Content-Type: application/x-www-form-urlencoded` (OAuth usa form-encoded, no JSON). No agregar headers innecesarios.

---

## Checklist de implementación (callback)

| Verificación | Correcto |
|---|---|
| State es aleatorio, no business ID | `randomUUID()` |
| `bar_id` se recupera de `oauth_states` vía RPC | `consume_oauth_state(state)` |
| `code_verifier` se incluye en el body de `/oauth/token` | recuperado de `oauth_states` |
| Sin header `Authorization: Bearer` en `/oauth/token` | solo `client_id` + `client_secret` en body |
| `redirect_uri` viene de env, hardcodeado en ningún lado | `Deno.env.get("MP_REDIRECT_URI")` |
| `redirect_uri` sin query params extras | URL estática exacta |
| `Content-Type: application/x-www-form-urlencoded` | sí |
| `grant_type: "authorization_code"` | sí |
| Solo se persisten campos canónicos: `access_token`, `refresh_token`, `user_id`, `expires_at` | no `public_key` ni campos extra |

---

## Checklist de implementación (inicio / URL de autorización)

| Verificación | Correcto |
|---|---|
| `code_verifier` = 43-128 chars URL-safe | `randomBytes(32).toString("base64url")` |
| `code_challenge` = SHA256(code_verifier) → base64url | S256 |
| `code_challenge_method=S256` en URL | sí |
| `state` aleatorio en URL | `randomUUID()` |
| `state` + `code_verifier` + `bar_id` guardados en `oauth_states` | insert en DB, TTL 10 min |
| `redirect_uri` estático, sin query params | `env.MP_REDIRECT_URI` |
| `scope` | no se incluye por defecto. Si en pruebas MP no devuelve `refresh_token`, agregar `scope=read write offline_access`. |
| `response_type=code` | sí |

---

## Troubleshooting: "Aplicación no está lista" / "La aplicación no puede conectarse a tu cuenta"

> ⚠ Este error ocurre **antes** de llegar a tu callback — MP rechaza la URL de autorización.

Referencias oficiales:
- [Cómo resolver "Aplicación no está lista" en OAuth](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/credentials/oauth/troubleshooting)
- [Buenas prácticas de OAuth](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/credentials/oauth/best-practices)

### Causas más frecuentes y verificación

**1) `redirect_uri` no coincide exactamente**

El valor enviado en `redirect_uri` debe ser **idéntico carácter por carácter** al registrado en el panel de MP:

```
Panel MP > tu app > URLs de redireccionamiento:
  https://nmdvrmglmnbpoyfjmgab.supabase.co/functions/v1/mp-auth-callback

URL que genera generateAuthUrl():
  redirect_uri=https://nmdvrmglmnbpoyfjmgab.supabase.co/functions/v1/mp-auth-callback
```

Chequeos:
- ¿Mismo protocolo? (`https://` obligatorio, no `http://`)
- ¿Misma barra final? (sin `/` al final — `mp-auth-callback` no `mp-auth-callback/`)
- ¿Mismo path completo? (`/functions/v1/mp-auth-callback` exacto)
- ¿Sin query params extras en `redirect_uri`? (MP valida match exacto)

**2) La app no está activa en el panel de MP**

> Tus integraciones > tu app > debe mostrar estado **"Activa"**. Si está en modo borrador o pendiente de revisión, OAuth no funciona.

**3) `client_id` no corresponde a la misma app**

El `MP_APP_ID` (que usás como `client_id`) debe ser el de la misma app donde registraste el `redirect_uri`. Si tenés varias apps (test + producción), verificá que estás usando el par correcto.

**4) La app no tiene PKCE habilitado (si lo estás enviando)**

Si enviás `code_challenge` + `code_challenge_method=S256` pero PKCE no está habilitado en la app, MP puede rechazar la solicitud. Alternativa: no enviar `code_challenge` hasta confirmar que PKCE está activo en el panel.

### Prueba rápida

Para aislar si el problema es el redirect_uri o la app, armá manualmente una URL mínima y probala en el navegador:

```
https://auth.mercadopago.com/authorization
  ?client_id=2990738606457276
  &response_type=code
  &platform_id=mp
  &state=test123
  &redirect_uri=https://nmdvrmglmnbpoyfjmgab.supabase.co/functions/v1/mp-auth-callback
```

Si esta URL mínima (sin PKCE, sin scope) también da error, el problema está en la configuración de la app (redirect_uri o estado). Si funciona, agregá los parámetros de a uno (`code_challenge`, `scope`, etc.) para ver cuál lo rompe.
