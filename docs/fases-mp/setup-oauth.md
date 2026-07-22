# Setup de OAuth de Mercado Pago — checklist

**Fecha**: 2026-07-20
**Estado del entorno al escribir esto**: `MP_ACCESS_TOKEN` y `MP_POS_DEVICE_ID` seteadas (camino legacy, es el que cobra hoy); `MP_APP_ID`, `MP_CLIENT_SECRET` y `MP_REDIRECT_URI` **vacías** → el OAuth no puede ejecutarse.

> El detalle de implementación está en [`fase-1-oauth.md`](./fase-1-oauth.md). Este archivo es solo el
> procedimiento de configuración, que estaba disperso.

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

```bash
supabase secrets set MP_APP_ID=<mismo valor que en el .env>
supabase secrets set MP_CLIENT_SECRET=<mismo valor que en el .env>
supabase secrets set MP_REDIRECT_URI=https://nmdvrmglmnbpoyfjmgab.supabase.co/functions/v1/mp-auth-callback
supabase secrets set NEXT_PUBLIC_SITE_URL=http://<ip-lan-de-la-mini-pc>:3000
```

Y desplegarla:

```bash
supabase functions deploy mp-auth-callback
```

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

**Tu camino de cobro se muda solo.** Hoy no hay ningún seller, así que
`credentials-resolver.service.ts` cae siempre al nivel 3 (`env.MP_ACCESS_TOKEN`). Apenas exista un seller
activo, el nivel 2 empieza a devolverlo y **los cobros pasan a usar el token de OAuth, leído desde
Supabase Cloud en cada cobro**.

Eso te pone sobre los hallazgos **A1** y **A1b** de
[`../specs/remediacion-integracion-mp.md`](../specs/mercadopago/remediacion-integracion-mp.md): con un seller
vinculado y Cloud sin responder, **no se cobra** — y ni siquiera cae al fallback, porque
`findFirstActive()` lanza excepción antes de llegar a él.

**Es reversible**: borrando la fila del seller (o poniéndole `status` distinto de `active`) el resolver
vuelve al fallback legacy.

**Recomendación**: hacé la vinculación en un momento tranquilo para validar el flujo de punta a punta
—la Fase 1 figura como "⏳ E2E cloud" pendiente en [`INDEX.md`](./INDEX.md)— pero **no** dejes un seller
vinculado corriendo en un turno real hasta que salga el PR 4 del plan de remediación, que es el que hace
que leer el token no dependa de internet.
