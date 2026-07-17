# Spec — Integración MP en Cocktrail (Arquitectura de Alto Nivel)

**Estado**: referencia activa
**Ver también**: [`docs/mp/INDEX.md`](../mp/INDEX.md) para el mapa de archivos de API

---

## Modelo mental

```
Cocktrail (miBoliche / plataforma)
  │
  └─ OAuth → accede en nombre de "Bosko" (el comercio dueño del dinero)
       │
       ├─ Sucursal (Store)  — 1 por comercio
       │    └─ store_id: asignado por MP, guardado en DB
       │
       └─ Cajas (POS/PDV)   — 1 por barra
            ├─ QR estático  — imagen/PDF retornada al crear el POS, inmutable
            └─ Point device — 1 terminal física por POS (vinculada vía Point API)
```

**Quién es quién:**

| Rol | Qué es |
|-----|--------|
| **Cocktrail** | La plataforma — orquesta todo, guarda tokens, crea recursos "en nombre de" Bosko |
| **Bosko** | La cuenta MP del comercio — owner real del dinero y de todos los recursos creados |
| **Sucursal** | Entidad dentro de la cuenta de Bosko (no "dentro de Cocktrail") |
| **Caja/POS** | Creada con el token de Bosko; queda con QR estático único |
| **Point/Posnet** | 1 terminal física por POS — modelo esperado de MP |

---

## Flujo completo de onboarding (primer setup)

1. **Vinculación OAuth** (`/dashboard/pagos` → botón "Vincular Mercado Pago")
   - Cocktrail redirige al usuario a MP OAuth
   - En el `redirect_uri`, recibe `code` → lo intercambia por `access_token` + `refresh_token`
   - Guarda tokens en `mercadopago_sellers` asociados al comercio Bosko (no a Cocktrail)

2. **Provisionamiento** (con el token de Bosko)
   - Crear Sucursal → `POST /users/{user_id}/stores` → guardar `store_id`
   - Crear N Cajas → `POST /pos` (1 por barra) → guardar `pos_id`, `qr.image`, `qr.template_document`

3. **Operación de cobro**
   - **QR estático**: cada barra tiene su QR fijo impreso. Al cobrar, Cocktrail crea una order (`POST /v1/orders`, `type:"qr"`, `mode:"static"`) que "carga" ese QR con el monto → ver [`api-orders-qr.md`](../mp/api-orders-qr.md)
   - **Point/Posnet**: 1 terminal por POS. Actualmente usa payment-intents (legacy) → ver [`api-point-devices.md`](../mp/api-point-devices.md). Migración futura a Orders API (`type:"point"`) → ver [`api-orders-point.md`](../mp/api-orders-point.md)

4. **Conciliación**
   - Webhooks de MP notifican el pago → backend valida contra la API antes de impactar el pedido

---

## Modelo de datos (Cocktrail DB)

```
mercadopago_sellers
  ├─ user_id          — mp_user_id del vendedor (Bosko)
  ├─ access_token     — token OAuth activo
  ├─ refresh_token    — rotativo, un solo uso
  ├─ expires_at       — timestamp ms (refresh proactivo 5–7 días antes)
  └─ status           — 'active' | 'expired'

mercadopago_cajas
  ├─ bar_id           — referencia a la barra en Cocktrail
  ├─ store_id         — ID de sucursal MP
  ├─ external_pos_id  — external_id que Cocktrail asignó al POS
  ├─ qr_image         — URL estática del QR
  └─ seller_user_id   — FK a mercadopago_sellers

mercadopago_cajas_devices
  ├─ caja_id          — FK a mercadopago_cajas
  ├─ device_id        — ID del Posnet físico en MP
  └─ device_username  — nombre/alias del operador con la tablet
```

---

## Resolución dinámica de credenciales

El service resuelve el `access_token` correcto por contexto:

1. Si llega `X-Device-Id` → buscar en `mercadopago_cajas_devices` → obtener el seller del dueño
2. Si llega `X-Bar-Id` → buscar en `mercadopago_cajas` → obtener el seller de esa barra
3. Si `allowGlobalFallback = true` → usar el primer seller activo (para endpoints admin/globales)
4. Fallback final → variables de entorno `MP_ACCESS_TOKEN` (legacy, solo sandbox)

Antes de usar el token, verificar `expires_at` y hacer refresh si corresponde.

---

## Decisiones tomadas (no cambiar sin discusión)

- `"qr"` permanece como valor válido en `PaymentMethod` del dominio compartido — lo usa `/carta` (preferencia del cliente) y los reportes de `/admin`. Solo se eliminó del selector de cobro Posnet en `/caja`
- El QR estático se implementa con la Orders API (`type:"qr"`, `mode:"static"`) — cada PDV tiene su propio QR fijo. La Point API es un producto distinto para terminales físicas
- `CONFIRMATION_REQUIRED` se resuelve automáticamente consultando `GET /v1/payments/{id}` — nunca le preguntamos a la cajera
- 1 sucursal por comercio, 1 caja por barra, 1 terminal por caja — restricción de MP