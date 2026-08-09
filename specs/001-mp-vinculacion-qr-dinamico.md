# Spec 001 — Vinculación Mercado Pago, QR Dinámico y Portátil

**Fecha:** 2026-08-09  
**Estado:** En curso — F0+F1 ✅ · F2 ✅ · F3 ✅ · F4 ✅ · F5 pendiente  
**Proyecto Supabase:** Bosko (`nmdvrmglmnbpoyfjmgab`)  
**Contexto:** Handoff legado de la era Local/Cloud, Edge Function con redirect fijo a Render, QR de cobro atado a modo `static`, PDV huérfano al cambiar de cuenta MP, sin flujo tablet sin Posnet.

---

## Veredicto de revisión (2026-08-09)

Cruzado contra código, Bosko y doc MP (MCP `search_documentation` + Orders API):

| Tema | Veredicto |
|------|-----------|
| F0 eliminar handoff | **Correcto.** `app.ts` ya usa el mismo `supabase` como `cloudDb`; el buzón es deuda. |
| F1 redirect multi-entorno | **Correcto.** MP solo devuelve `code` + `state` → `redirect_url` en `oauth_states`. |
| F2 persistencia | **Sobreestimada.** Desvincular ya no borra cajas; `isOrphan` es derivado. Queda copy + reprovision. |
| F3 QR dinámico | **Ajustado.** Sigue haciendo falta Store + POS (`external_pos_id`). No hace falta Posnet Point. Sin columna `qr_mode`. |
| F4 multi-barra | **Slice mínimo.** Onboarding ya elige caja. Para testeos: Barra VIP + Portátil. |
| Comisiones | QR Orders = producto **Código QR presencial**, no Checkout Pro. Plazos/tasas se eligen en la cuenta MP del seller. |

**Estado vivo en Bosko (lectura 2026-08-09):**
- Seller activo: `225043369` (con `access_token_enc`)
- Sellers expired: `1517393956`, `1985627927`
- 1 PDV con `seller_user_id = 1985627927` → **huérfano real** respecto del activo
- Handoffs pendientes: 0

---

## Diagnóstico del Problema Actual

### 1. El handoff es innecesario en arquitectura single-base

La Edge Function deposita tokens cifrados en `mercadopago_seller_handoff` (TTL 15 min) y hace upsert de `mercadopago_sellers` **con tokens en `null`**. El backend hace pull + re-cifrado local.

Diseñado para Local/Cloud separados (pivot 2026-08-03 eliminó la separación). Hoy EF y API escriben en el **mismo** proyecto Supabase. El handoff agrega:

- Cifrado doble (HKDF handoff en Deno → re-cifrado token en Node)
- Race: el pull toma solo el último handoff
- Ventana de 15 min donde los tokens no están en `access_token_enc`
- Falla si `MP_HANDOFF_KEY` no coincide entre EF y API
- Pull lazy/manual puede llegar tarde o después del TTL

**Raíz:** La EF ya tiene `service_role`. Puede cifrar con `MP_TOKEN_SECRET` / `cocktrail/mp-token/v1` y upsert directo en `mercadopago_sellers`.

#### 1.1 Causal directa: handoff → stub activo sin tokens bloquea reprovision y cobros

El handoff no es solo "innecesario" — produce un **stub activo sin tokens** que bloquea todo downstream. La cadena exacta:

1. **EF escribe el stub:** la Edge Function ya hizo upsert de metadata en `mercadopago_sellers` con `access_token = null, refresh_token = null, status = active` (`mp-auth-callback/index.ts:183-195`). El buzón `mercadopago_seller_handoff` tiene los tokens reales (TTL 15 min). `pullSellerFromCloud()` (`mercadopago-oauth.service.ts:233`) aún no corrió.

2. **El pull nunca se dispara para el stub:** `getSellerStatus()` (`mercadopago-oauth.service.ts:118-119`) hace pull lazy *solo* cuando `!seller` — pero `findActive()` (`mercadopago-sellers.repository.ts:161`) **devuelve el stub** porque tiene `status = 'active'`. El stub es indistinguible de un seller sano para `findActive()`. El pull lazy no corre nunca más para ese seller.

3. **UI miente:** `getSellerStatus` devuelve `linked: true` (porque `findActive()` encontró el stub). El admin ve "Vinculado" sin nickname ni tokens utilizables.

4. **Reprovision y cobros fallan:** `reprovisionCaja()` (`mercadopago-provisioning.service.ts:736`) → `requireActiveSeller()` → `credentialsResolver.resolve()` (`credentials-resolver.service.ts:77-87`) → `seller.refreshToken` es `null` → lanza `"la cuenta de Mercado Pago (…) no tiene refresh_token — volvé a vincularla"`. Mismo error para cualquier cobro que pase por el resolver.

**Conclusión:** F0 elimina el stub: la EF escribe tokens cifrados y metadata en un solo upsert atómico → `findActive()` nunca devuelve un seller sin `refresh_token` → el resolver nunca falla por ese motivo. La ventana de inconsistencia desaparece.

### 2. “Pérdida” de sucursales = huérfanas por cambio de cuenta

`DELETE /api/mercadopago/seller` **no borra** cajas: hace wipe de tokens + `status = expired` (la FK lo impide).

Lo que pasa:
- Mismo `user_id` re-vincula → `isOrphan` se cura solo (`caja.sellerUserId === activeSeller.userId`)
- Otra cuenta MP → cajas quedan huérfanas; hace falta `reprovisionCaja` (ya existe)

Hoy en Bosko el PDV apunta a un seller expired distinto del activo: caso “cuenta distinta”, no “se borraron los datos”.

### 3. Edge Function redirige a URL fija de producción

```ts
const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000"
```

Si el secret apunta a Render, el callback OAuth local también. No hay multi-entorno.

### 4. QR de cobro usa modo `static` y asume Posnet

`createQrOrder` hoy manda `config.qr.mode: "static"` y muestra `caja.qrImage` (QR estático del PDV). Eso **no requiere** Posnet Point para existir, pero el health/UI bloquean cobro si falta device.

Para tablet sin Posnet hace falta:
1. Store + POS en MP (ya se provisionan)
2. `mode: "dynamic"` → MP devuelve `type_response.qr_data` por transacción
3. UI que no exija device para el botón QR

---

## Modelo operativo objetivo

Dos cajas bajo el mismo seller (testeos):

| | Barra VIP | Portátil |
|--|-----------|----------|
| Código | `BARRA-01` | `PORTATIL` |
| Rol | Mostrador fijo | Tablet que recorre el salón |
| Store + POS MP | Sí | Sí |
| Posnet Point | Sí (opcional pero esperado) | No |
| Cobros | Tarjeta (Point) + QR dinámico | Solo QR dinámico |
| Nombre UI | Barra VIP | Portátil |

> “Portátil” en vez de “Comandera Portátil”: en el repo “comandera” ya es la impresora térmica.

Reglas de cobro (sin columna `qr_mode`):
- **QR del checkout siempre `mode: "dynamic"`** → mostrar `type_response.qr_data`. El QR estático del POS queda de provisioning, no del cobro.
- **Tarjeta** solo si hay device Point activo vinculado a la caja.
- Health: sin Posnet → QR OK si hay seller + caja; Tarjeta bloqueada.

---

## Fases

### Fase 0 + 1 — Handoff fuera + OAuth multi-entorno (un solo corte)

**Objetivo:** Tokens cifrados directo en DB; callback redirige al frontend que inició el OAuth.

#### Edge Function (`supabase/functions/mp-auth-callback/index.ts`)
- Tras el exchange: cifrar con `MP_TOKEN_SECRET` + info `cocktrail/mp-token/v1` (mismo blob que `mp-token-cipher.ts`: `"v1." + b64url(salt) + "." + b64url(iv) + "." + b64url(ct||tag)`)
- Upsert en `mercadopago_sellers`: `access_token_enc`, `refresh_token_enc`, `key_version=1`, metadata, `status=active`
- Single-seller: expirar otros activos antes del upsert
- Fetch `users/me` para nickname/nombre/email
- Actualizar `bars.seller_user_id` si hay `bar_id`
- **Eliminar** INSERT en `mercadopago_seller_handoff` y limpieza del buzón
- Redirect final: `redirect_url` del state consumido → fallback `NEXT_PUBLIC_SITE_URL` → `http://localhost:3000`

#### API
- `pullSellerFromCloud()` → eliminar del boot (`server.ts`) y del lazy en `getSellerStatus`; endpoint `POST /pull-seller` deprecated/no-op
- `generateAuthUrl(barId, redirectUrl)` → persiste `redirect_url` en `oauth_states`
- Controller: tomar `Origin` / `FRONTEND_URL` como `redirectUrl`

#### DB
```sql
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS redirect_url TEXT;

CREATE OR REPLACE FUNCTION consume_oauth_state(p_state TEXT)
RETURNS TABLE(code_verifier TEXT, bar_id TEXT, redirect_url TEXT)
-- mismo DELETE…RETURNING, incluye redirect_url
```
- `mercadopago_seller_handoff`: **no dropear aún** (deprecated)
- `MP_HANDOFF_KEY`: deprecated cuando F0 esté en prod

#### Secrets EF
| Secret | Acción |
|--------|--------|
| `MP_TOKEN_SECRET` | **Nuevo** — mismo valor que `apps/api` |
| `MP_HANDOFF_KEY` | Deja de usarse |
| `NEXT_PUBLIC_SITE_URL` | Solo fallback |

#### Verificación
- OAuth local → tokens en `access_token_enc` sin pasar por handoff; redirect a `localhost:3000`
- OAuth prod → redirect a Render
- Re-vincular mismo `user_id` → upsert pisa tokens, status `active`
- Cambiar cuenta MP → seller anterior `expired`, nuevo `active`

- Reprovision del PDV huérfano de Bosko: `POST /api/mercadopago/provisioning/pos/<id>/reprovision` con la caja que apunta a `1985627927` debe re-provisionar bajo el seller activo `225043369` usando su `access_token_enc` ya presente. Si falla, revisar que el token refresque correctamente en MP.
#### Riesgos
- Algoritmo de cifrado EF ≠ Node → backend no descifra. Un assert/test de round-trip obligatorio.
- Sin `MP_TOKEN_SECRET` en EF → error claro, no escribir tokens en claro.

---

### Fase 2 — Persistencia / huérfanas (light, no es fase grande)

**Objetivo:** Claridad en UI + arreglar el orphan actual. Casi no hay backend nuevo.

1. Copy en “Desvincular”: *Tus barras y Posnets se conservan. Con la misma cuenta MP se restauran solos. Con otra cuenta hay que re-asociar el PDV.*
2. Verificar `POST .../pos/:id/reprovision` (ya existe) con la caja huérfana de Bosko.
3. No migración de schema. No auto-migración a otra cuenta (eso sería peligroso).

---

### Fase 3 — QR dinámico sin Posnet Point

**Objetivo:** Cobrar con QR desde tablet sin terminal Point. Store + POS siguen siendo requisito MP.

#### Qué NO hacer
- No columna `qr_mode`
- No toggle Terminal/Dinámico
- No crear order “sin `external_pos_id`” (MP responde `pos_not_found`)

#### API (`MercadoPagoOrdersService.createQrOrder`)
```ts
config: {
  qr: {
    external_pos_id: caja.externalPosId,
    mode: "dynamic", // antes: "static"
  },
}
// Persistir type_response.qr_data en mp_orders.qr_data (columna ya existe)
// Devolver ese string al frontend para renderizar el QR
```

#### Resolver / health
- Sin device activo → QR habilitado; Tarjeta bloqueada
- Con device activo → QR + Tarjeta
- `cajaProvisioned` verde con seller + caja; `deviceOwnership` no bloquea QR

#### Frontend
- Botón “Código QR”: siempre usa el flujo dynamic (`qr_data`)
- Botón “Tarjeta”: hidden/disabled si la caja no tiene Posnet activo
- Countdown de expiración (default MP `PT15M`, ya usado)
- Polling / webhook como hoy

#### Verificación
- Caja sin device → venta QR → se muestra QR dinámico → pago → order `processed`
- Caja con Point → Tarjeta sigue por intent Point; QR sigue dynamic
- Health no bloquea QR por falta de Posnet

#### Comisiones (producto)
Orders `type: "qr"` = **Código QR presencial**. Misma familia tarifaria que el QR del Posnet / PDV, **no** Checkout Pro. Estático vs dinámico cambia el modelo de código, no el bucket de producto.

---

### Fase 4 — Segunda caja de prueba (slice, no multi-barra product)

**Objetivo:** Poder operar Barra VIP + Portátil en testeos. El selector de sesión **ya existe** (`CajaSessionOnboarding`).

1. Desbloquear crear una 2ª caja en admin (sacar el hardcode “solo BARRA-01 / multi-barra no implementado” lo justo para `PORTATIL`).
2. Provisionar Store/POS para Portátil (sin vincular device).
3. Onboarding lista ambas; el operador elige.
4. No tope artificial de 3. No transferencia entre barras. No cierre por barra.

Diferir UI fancy de sidebar/dropdown hasta que haya ≥2 barras en producción real.

---

### Fase 5 — Comisiones y plazos de liberación en Pagos

**Objetivo:** En `/admin?tab=pagos`, que el negocio entienda y pueda elegir **qué comisión afronta según cuándo quiere el dinero disponible**.

#### Cómo funciona en Mercado Pago (doc oficial)

- Las **tasas y plazos** se configuran en la **cuenta del seller**, no por order:
  - UI: [https://www.mercadopago.com.ar/settings/release-options](https://www.mercadopago.com.ar/settings/release-options)
  - Referencia tarifas: [support/37740](https://www.mercadopago.com.ar/developers/es/support/37740)
- La doc de reportes (Liquidaciones / Liberaciones) lo confirma: *“Dependiendo de las tasas y plazos seleccionados, el valor se liquida un tiempo después de acreditado el cobro.”*
- **No hay endpoint público en Orders/QR** para setear el plazo por transacción. Es setting de cuenta.
- En integraciones OAuth (nuestro caso), aplica la config de la **cuenta vinculada** (el boliche), no la de la app Cocktrail.

#### Qué construimos en Cocktrail (lazy)

1. **Panel informativo en Pagos** con tabla de referencia MLA (abajo) + disclaimer: *los valores exactos viven en tu cuenta MP y pueden cambiar*.
2. **CTA primario:** “Configurar plazos y comisiones en Mercado Pago” → abre `https://www.mercadopago.com.ar/settings/release-options` (nueva pestaña; el seller debe estar logueado en esa cuenta).
3. Texto corto: QR dinámico / Point QR = presencial; Checkout Pro = otro producto/tasa.
4. **No** persistir la elección en nuestra DB ni intentar mutarla por API (no hay API estable documentada para esto en el flujo QR). Si MP publica API de release-options más adelante, se reevalúa.

#### Tabla de referencia orientativa (MLA)

> Fuente: estructura pública de plazos/comisiones de cobros MP en Argentina. **No es contractual.** Confirmar siempre en el panel del seller. IVA aparte salvo que MP lo indique incluido. Actualizar esta tabla cuando cambien las tarifas oficiales.

| Medio de pago del cliente | Plazo de liberación | Comisión orientativa |
|---------------------------|---------------------|----------------------|
| Dinero en cuenta Mercado Pago | Inmediato | ~0,80% + IVA |
| Tarjeta de débito | Inmediato | ~1,35% + IVA |
| Tarjeta de débito | ~2 días | ~0,85% + IVA |
| Tarjeta de crédito / prepaga | Inmediato | ~6,29% + IVA |
| Tarjeta de crédito / prepaga | ~10 días | ~4,39% + IVA |
| Tarjeta de crédito / prepaga | ~18 días | ~3,39% + IVA |
| Tarjeta de crédito / prepaga | ~35 días | ~1,49% + IVA |
| Tarjeta de crédito / prepaga | ~70 días | Desde 0% / mínimo según cuenta |

Notas operativas:
- El **plazo elegido en release-options** aplica a los cobros de esa cuenta (incluye QR y Point bajo esa cuenta).
- Más inmediato = comisión más alta; más días = más barato, menos liquidez.
- Reclamos / contracargos pueden demorar la liberación aunque el plazo diga otra cosa.
- Retenciones/percepciones impositivas (IIBB, etc.) son aparte de la comisión MP.

#### Verificación
- En Pagos, con seller vinculado, se ve la tabla + CTA que abre release-options
- Sin seller vinculado, el bloque explica que hace falta vincular primero
- Copy deja claro que la elección se confirma en MP, no con un toggle local inventado

---

## Orden de Ejecución

| Fase | Depende de | Esfuerzo | Impacto |
|------|------------|----------|---------|
| **F0+F1** Handoff + multi-env | Nada | 3-4h | Vinculación estable; OAuth local sin tocar secrets de prod. Tras esta fase, verificar `reprovisionCaja` con el PDV huérfano real de Bosko (`seller_user_id = 1985627927` → `225043369`) como primer smoke test del token directo. |
| **F2** Huérfanas light | F0 recomendado | 0.5-1h | Copy + reprovision del PDV actual |
| **F3** QR dynamic | F0 | 2-3h | Tablet sin Posnet puede cobrar |
| **F4** Portátil (2ª caja) | F3 | 1-2h | VIP + Portátil en testeos |
| **F5** Panel comisiones/plazos | Nada (UI) | 1-2h | Transparencia de costos; deep-link a MP |

**Orden:** F0+F1 → F3 → F2 (o en paralelo a F3) → F4 → F5

F5 puede adelantarse si solo es UI estática + link (no bloquea cobros).

---

## Notas Técnicas

### Cifrado en Edge Function (Deno)
- Secret: `MP_TOKEN_SECRET`
- Info HKDF: `cocktrail/mp-token/v1` (no el de handoff)
- Formato: `"v1." + b64url(salt 16B) + "." + b64url(iv 12B) + "." + b64url(ct||tag)`
- WebCrypto AES-GCM compatible con Node `crypto` / `aes-gcm.ts` del API

Hoy la EF cifra handoff con `cocktrail/mp-handoff/v1` + `MP_HANDOFF_KEY`. F0 migra a token local y abandona handoff.

### Por qué no `qr_mode`
Si no hay device → solo QR. Si hay device → QR + Tarjeta. El cobro QR siempre es `dynamic`. Un toggle explícito solo aportaría “device vinculado pero forzar dynamic” — ya es el default del checkout.

### Endpoints

| Método | Ruta | Fase | Descripción |
|--------|------|------|-------------|
| `POST` | `/api/mercadopago/oauth/url` | F0+F1 | Persiste `redirectUrl` en `oauth_states` |
| `POST` | `/api/mercadopago/pull-seller` | F0 | Deprecated / no-op |
| `DELETE` | `/api/mercadopago/seller` | F2 | + copy de advertencia en UI |
| `POST` | `/api/mercadopago/provisioning/pos/:id/reprovision` | F2 | Verificar (ya existe) |
| `POST` | `/api/mercadopago/orders/qr` | F3 | `mode: dynamic` + devolver `qr_data` |
| `POST` | `/api/mercadopago/provisioning/pos` | F4 | Permitir 2ª caja `PORTATIL` |
| — | UI Pagos → release-options | F5 | Tabla + deep-link (sin API nueva) |

### Variables de entorno

| Variable | Scope | Fase | Cambio |
|----------|-------|------|--------|
| `MP_TOKEN_SECRET` | Edge Function (nuevo) | F0 | Cifrar tokens en EF |
| `MP_HANDOFF_KEY` | Edge Function / API | F0 | Deprecated |
| `NEXT_PUBLIC_SITE_URL` | Edge Function | F1 | Solo fallback |
| `FRONTEND_URL` | API | F1 | Default de `redirectUrl` si no hay `Origin` |

### Apps MP vinculadas al usuario del MCP
- `micaja` (AppID `8269242352751853`)
- `miboliche` (AppID `2990738606457276`)

Confirmar cuál es la de Cocktrail antes de tocar credentials/webhooks en panel.
