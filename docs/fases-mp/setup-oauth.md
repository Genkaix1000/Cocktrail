# Setup de OAuth de Mercado Pago — checklist

**Fecha**: 2026-07-20 · **Actualizado**: 2026-07-22 (PR 4: handoff cifrado, tokens locales)
**Estado del entorno al escribir esto**: `MP_ACCESS_TOKEN` y `MP_POS_DEVICE_ID` seteadas (camino legacy, es el que cobra hoy); `MP_APP_ID`, `MP_CLIENT_SECRET` y `MP_REDIRECT_URI` **vacías** → el OAuth no puede ejecutarse.

> El detalle de implementación está en [`fase-1-oauth.md`](./fase-1-oauth.md). Este archivo es solo el
> procedimiento de configuración, que estaba disperso.

---

## Cómo funciona el flujo desde el PR 4 (handoff cifrado)

**La Edge Function ya no escribe tokens en claro en ningún lado.** El flujo nuevo:

1. El admin toca **Vincular** en `/admin?tab=pagos` → autoriza en Mercado Pago.
2. La Edge Function `mp-auth-callback` canjea el `code`, **cifra el payload de tokens** con
   `MP_HANDOFF_KEY` (AES-256-GCM, contrato `cocktrail/mp-handoff/v1`) y lo deposita en el buzón
   `mercadopago_seller_handoff` de Cloud. Vence a los **15 minutos**.
   En `mercadopago_sellers` Cloud queda **solo metadata** (user_id, status, expiración, nickname…),
   con `access_token`/`refresh_token` en `NULL` explícito.
3. El **backend local** hace el pull del handoff (lazy al consultar el estado del seller, o en el
   boot), lo **descifra con la misma `MP_HANDOFF_KEY`**, re-cifra los tokens con `MP_TOKEN_SECRET`
   y los guarda en la **base local**. Después borra el handoff.
4. Desde ahí, **cada cobro lee el token de la base local**: no depende de internet ni de Cloud.

Si `MP_HANDOFF_KEY` falta en la Edge Function, la vinculación **falla con mensaje claro**
(`linked=false&message=...`) — jamás cae a escribir tokens en claro. Si la clave difiere entre la
Edge Function y el backend, el pull falla con un error accionable ("handoff ilegible: verificá
`MP_HANDOFF_KEY` en ambos lados").

---

## Concepto previo (importante)

La aplicación de Mercado Pago que hay que crear es de **Cocktrail, la plataforma** — **no** del dueño del boliche.

- `MP_APP_ID` / `MP_CLIENT_SECRET` = credenciales de **tu** aplicación.
- El **dueño del boliche** no te entrega nada: es quien *autoriza* a tu aplicación mediante el flujo de OAuth, y de ahí sale **su** `access_token`, que queda guardado en `mercadopago_sellers`.

Esto es distinto del `MP_ACCESS_TOKEN` actual, que es el token de una cuenta concreta puesto a mano.

---

## Paso 1 — Crear la aplicación en Mercado Pago

1. Entrar a <https://www.mercadopago.com.ar/developers> → **Tus integraciones**.
2. Crear una aplicación (o abrir la existente).
3. Anotar de **Credenciales**:
   - **App ID / Client ID** → va a `MP_APP_ID`
   - **Client Secret** → va a `MP_CLIENT_SECRET`
4. En la configuración de la app, registrar la **URL de redirección**:

   ```
   https://nmdvrmglmnbpoyfjmgab.supabase.co/functions/v1/mp-auth-callback
   ```

   ⚠ MP valida **match exacto**. Sin barra final de más, sin query params.

5. **Habilitar PKCE** en el panel de la app. Si no está habilitado, MP ignora el `code_challenge` que manda el backend (ver `fase-1-oauth.md:48`).

> **Producción vs prueba**: la app te da credenciales de ambos entornos. Para cobrar plata real usá las
> de producción. El toggle "Sandbox" de `/admin → Pagos` es independiente de esto.

---

## Paso 2 — `apps/api/.env`

El backend usa estas variables para **armar la URL de autorización** y para **refrescar** el token.

```bash
# ── Mercado Pago OAuth ──
MP_APP_ID=<App ID / Client ID del paso 1>
MP_CLIENT_SECRET=<Client Secret del paso 1>
MP_REDIRECT_URI=https://nmdvrmglmnbpoyfjmgab.supabase.co/functions/v1/mp-auth-callback

# Opcional (default 5, rango 1-7): días antes del vencimiento para refrescar
MP_REFRESH_MARGIN_DAYS=5

# ── Cifrado (PR 4) ──
# Clave del cifrado local de tokens (≥32 chars). Si falta, cae a AUTH_SECRET.
MP_TOKEN_SECRET=<random ≥32 chars>
# Clave del buzón de traspaso del OAuth. DEBE ser EXACTAMENTE la misma acá y
# en el secret de la Edge Function (paso 3) — si difieren, el pull del seller
# falla con "handoff ilegible".
MP_HANDOFF_KEY=<random ≥32 chars>

# Webhooks (Fase 6). Se genera en el panel de MP al configurar notificaciones.
# Sin esto, POST /api/mercadopago/webhooks responde 401 (fail-closed, a propósito).
MP_WEBHOOK_SECRET=<clave secreta de notificaciones>
```

`SUPABASE_CLOUD_URL` y `SUPABASE_CLOUD_SERVICE_ROLE_KEY` ya están seteadas — no hace falta tocarlas.

**No borres `MP_ACCESS_TOKEN` ni `MP_POS_DEVICE_ID`.** Son el fallback que hoy hace funcionar el cobro,
y el plan de remediación los conserva deliberadamente durante toda esta ronda.

---

## Paso 3 — Secrets de la Edge Function

La Edge Function corre en Supabase Cloud, en **otro proceso**, y **no lee** el `.env` del backend. Es ella
la que canjea el `code` por el token (`mp-auth-callback/index.ts:32-34`).

Procedimiento completo con el CLI (una sola vez el `login` + `link`):

```bash
supabase login                                     # abre el navegador
supabase link --project-ref nmdvrmglmnbpoyfjmgab   # vincula el repo al proyecto Cloud

supabase secrets set MP_APP_ID=<mismo valor que en el .env>
supabase secrets set MP_CLIENT_SECRET=<mismo valor que en el .env>
supabase secrets set MP_REDIRECT_URI=https://nmdvrmglmnbpoyfjmgab.supabase.co/functions/v1/mp-auth-callback
supabase secrets set NEXT_PUBLIC_SITE_URL=http://<ip-lan-de-la-mini-pc>:3000

# PR 4 — clave del handoff cifrado. MISMO valor que MP_HANDOFF_KEY en apps/api/.env.
supabase secrets set MP_HANDOFF_KEY=<el valor de apps/api/.env>
```

Y desplegarla (cada vez que cambia `supabase/functions/mp-auth-callback/index.ts`):

```bash
supabase functions deploy mp-auth-callback
```

> ⚠ **Sin `MP_HANDOFF_KEY` la vinculación falla a propósito** (la Edge Function no tiene fallback a
> tokens en claro). Si después de vincular ves `linked=false&message=Falta el secret MP_HANDOFF_KEY...`,
> es esto.

> `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase automáticamente en las Edge
> Functions — **no** hay que setearlas como secrets.

### Sobre `NEXT_PUBLIC_SITE_URL`

Es a dónde la Edge Function te devuelve después de vincular (`index.ts:118,125`). Hoy no está seteada,
así que caería a `http://localhost:3000`.

Esa URL tiene que ser **alcanzable desde el navegador que está haciendo el OAuth**:

- Si vinculás desde la propia mini-PC → `http://localhost:3000` sirve.
- Si vinculás desde otra máquina de la LAN → poné la IP LAN (`http://192.168.x.x:3000`).

---

## Paso 4 — Verificar

1. Reiniciar el backend para que tome el `.env`.
2. `/admin` → pestaña **Pagos** → botón **Vincular**.
3. Debería redirigir a Mercado Pago, pedir autorización, y volver a `/admin?tab=pagos&linked=true`.
4. La tarjeta de vinculación debería mostrar el nickname y el email de la cuenta vinculada.

### Si algo falla

| Síntoma | Causa típica |
|---|---|
| "Mercado Pago OAuth no está configurado" | falta alguna de las 3 en `apps/api/.env`; no reiniciaste el backend |
| MP rechaza el canje del `code` | `MP_REDIRECT_URI` no coincide **exacto** con el panel, o difiere entre el `.env` y los secrets |
| Vuelve con `?error=` | mirar los logs de la Edge Function: `supabase functions logs mp-auth-callback` |
| No devuelve `refresh_token` | agregar `scope=read write offline_access` a la URL de autorización (ver `fase-1-oauth.md`) |
| Vinculó pero volvés a una URL muerta | `NEXT_PUBLIC_SITE_URL` apunta a un host inalcanzable desde ese navegador |

---

## ⚠ Qué cambia en el momento en que vinculás

**Tu camino de cobro se muda solo.** Sin seller activo, `credentials-resolver.service.ts` cae al
nivel 3 (`env.MP_ACCESS_TOKEN`). Apenas exista un seller activo, el nivel 2 empieza a devolverlo y
los cobros pasan a usar el token de OAuth — que desde el PR 4 se lee **de la base local, cifrado**:
el cobro ya **no** depende de Cloud ni de internet (los hallazgos A1/A1b de la
[spec de remediación](../specs/mercadopago/remediacion-integracion-mp.md) quedaron cerrados por diseño).

**Es reversible**: el botón **Desvincular** de `/admin?tab=pagos` hace el wipe de tokens y deja el
seller en `expired` (local y Cloud); el resolver vuelve al fallback de la env.

---

## Re-provisión al cambiar de cuenta (R22)

Cambiar la cuenta de Mercado Pago vinculada **deja huérfanas las cajas ya provisionadas**: el
`store_id`/`pos_id` de cada caja viven **dentro de la cuenta del seller viejo**, y el **QR estático
apunta a esa cuenta**. No hay re-provisión automática. El procedimiento:

1. **Desvincular** el seller saliente desde `/admin?tab=pagos` (la confirmación ya avisa esto).
2. Si el Posnet físico es de la cuenta vieja: sacarlo con **"Eliminar el lector de mi cuenta"** en la
   app de MP, y que el dueño **lo reclame desde SU cuenta** (paso manual irreductible — MP no expone
   API para transferir hardware).
3. **Vincular** la cuenta nueva por OAuth (flujo de este doc).
4. **Re-provisionar** local/caja desde la app: se crean store/POS nuevos **en la cuenta nueva** y
   **el QR estático CAMBIA**.
5. Si el QR viejo ya estaba impreso, **reimprimirlo**. Un cliente que escanee el QR viejo estaría
   pagando contra un punto de venta de la cuenta vieja.

> Las cajas viejas quedan en `mercadopago_cajas` apuntando al seller expirado; la detección de cajas
> huérfanas y el panel de salud son de
> [`gestion-posnets.md`](../specs/mercadopago/gestion-posnets.md) (bloques G/H).
