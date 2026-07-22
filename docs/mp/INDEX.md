# Índice MP — Mercado Pago para Cocktrail

> **Cómo usar este índice**: ante cualquier tarea de MP, leé este archivo primero.
> Te dice exactamente a qué archivo ir y para qué sirve cada uno.
> No necesitás leer todos; solo el que corresponde al problema.

---

## Mapa de archivos

| Archivo | Cuándo leerlo |
|---------|--------------|
| [`api-oauth.md`](./api-oauth.md) | Vincular cuenta MP de un vendedor (OAuth), refresh token, multi-seller, schema de sellers/oauth_states |
| [`api-oauth-best-practices.md`](./api-oauth-best-practices.md) | Anti-patrones y checklists al implementar OAuth: qué NO hacer en `/oauth/token`, redirect_uri, state, PKCE |
| [`api-stores-pos.md`](./api-stores-pos.md) | Crear sucursal (`/users/{id}/stores`) y caja (`/pos`) en la cuenta del vendedor |
| [`api-orders-qr.md`](./api-orders-qr.md) | **Cobro por QR estático** — crear/cancelar/consultar una order QR desde `/caja` |
| [`api-orders-point.md`](./api-orders-point.md) | **Cobro con Posnet** — nueva Orders API (`type: "point"`) — referencia para futura migración |
| [`api-point-devices.md`](./api-point-devices.md) | Point Integration API legacy — sistema actual de payment-intents, listar devices |
| [`api-payments.md`](./api-payments.md) | Consultar un pago por ID (`GET /v1/payments/{id}`) — usado al resolver `CONFIRMATION_REQUIRED` |
| [`api-orders-raw.md`](./api-orders-raw.md) | 📄 Documentación oficial completa de MP (raw) — leer solo si necesitás un parámetro específico que no está en los archivos destilados |
| [`../specs/mercadopago/integracion-mp.md`](../specs/mercadopago/integracion-mp.md) | Arquitectura de alto nivel: cómo encajan OAuth, Store, POS, QR y Point en Cocktrail |
| [`../specs/mercadopago/cobro-posnet-mercadopago.md`](../specs/mercadopago/cobro-posnet-mercadopago.md) | Spec técnica completa del módulo de cobro Posnet: estados, `CONFIRMATION_REQUIRED`, tareas |

---

## Árbol de decisión rápido

```
¿Qué necesito hacer?
│
├─ Vincular una cuenta MP de un comercio
│    ├─ Flujo completo + schema → api-oauth.md
│    └─ Errores comunes / anti-patrones → api-oauth-best-practices.md
│
├─ Crear sucursal o caja en MP
│    └─ → api-stores-pos.md
│
├─ Cobro por QR (cliente escanea el QR fijo de la barra)
│    └─ → api-orders-qr.md
│
├─ Cobro con Posnet / terminal física
│    ├─ Sistema actual (payment-intents legacy) → api-point-devices.md
│    └─ Nueva Orders API (futura migración)    → api-orders-point.md
│
├─ Resolver CONFIRMATION_REQUIRED en cobro Posnet
│    └─ → api-payments.md
│
└─ Entender la arquitectura general de la integración
     └─ → ../specs/mercadopago/integracion-mp.md
```

---

## Resumen del modelo operativo de Cocktrail

```
OAuth → token de Bosko (el comercio)
  └─ Sucursal (1 por local)         POST /users/{user_id}/stores
       └─ Caja (1 por barra)        POST /pos
            ├─ QR estático          → imagen guardada en DB, impresa en barra
            │     Al cobrar: POST /v1/orders (type:"qr", mode:"static")
            │     Cliente escanea el QR fijo → paga → webhook → pedido concretado
            │
            └─ Point device         → 1 Posnet por caja
                  Al cobrar: POST payment-intents (legacy actual)
                             o POST /v1/orders (type:"point") — futura migración
```

### Métodos de cobro implementados en `/caja`
- **Efectivo** — sin integración MP
- **Tarjeta (Posnet)** — Point Integration API (payment-intents legacy)
- **QR estático** — Orders API `type: "qr"`, `mode: "static"` — *a implementar*

---

## Decisiones de diseño clave

- **QR elegido**: modelo **estático** — cada PDV tiene su QR fijo impreso. Al iniciar un cobro, Cocktrail crea una order que "carga" ese QR con el monto. El cliente escanea el QR de siempre → paga → Cocktrail recibe el webhook
- **`"qr"` como `PaymentMethod`** sigue siendo válido en el dominio compartido (usado en `/carta` y reportes de `/admin`) — no se eliminó del tipo
- Las credenciales se resuelven **dinámicamente** por `barId`/`deviceId` desde `mercadopago_sellers` en DB
- El `refresh_token` es rotativo y de un solo uso — siempre persistir el nuevo tras cada refresh
- 1 sucursal por local, 1 caja por barra, 1 Posnet por caja
- El cobro con Posnet actual usa payment-intents (legacy). La migración a `api-orders-point.md` está pendiente como deuda técnica
