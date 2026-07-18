# Fases — Plan de Implementación MP

> **Punto de partida**: ante cualquier tarea de MP, leer primero [`docs/mp/INDEX.md`](../mp/INDEX.md).  
> Este plan se basa en [`docs/specs/integracion-mp.md`](../specs/integracion-mp.md).  
> Cada fase depende de la anterior — ejecutar en orden.

---

## Orden de ejecución

| # | Archivo | Depende de | Estado |
|---|---------|------------|--------|
| 0 | [`fase-0-schema.md`](./fase-0-schema.md) | — | ✅ APROBADO |
| 1 | [`fase-1-oauth.md`](./fase-1-oauth.md) | Fase 0 | ✅ APROBADO (local) / ⏳ E2E cloud |
| 2 | [`fase-2-credentials.md`](./fase-2-credentials.md) | Fase 1 | ✅ IMPLEMENTADO |
| 3 | [`fase-3-provisioning.md`](./fase-3-provisioning.md) | Fase 2 | ✅ IMPLEMENTADO |
| 4 | [`fase-4-qr.md`](./fase-4-qr.md) | Fase 3 | ✅ IMPLEMENTADO |
| 5 | [`fase-5-posnet.md`](./fase-5-posnet.md) | Fase 2 | ✅ IMPLEMENTADO |
| 6 | [`fase-6-webhooks.md`](./fase-6-webhooks.md) | Fase 4 | ✅ IMPLEMENTADO |
| 7 | [`fase-7-refunds.md`](./fase-7-refunds.md) | Fase 4 | 🔲 PENDIENTE |

## Decisiones de diseño

| Decisión | Reflejo en el plan |
|----------|-------------------|
| `"qr"` permanece en `PaymentMethod` del dominio | No se toca `packages/shared/src/domain.ts` |
| QR estático con Orders API `type:"qr"` `mode:"static"` | Fase 4 — `POST /v1/orders` con `mode: "static"` |
| Point/Posnet legacy (payment-intents) no se migra | Fase 5 — sin cambios funcionales |
| `CONFIRMATION_REQUIRED` se resuelve automáticamente | Ya implementado — no se toca |
| 1 sucursal, 1 caja por barra, 1 terminal por caja | Modelo de datos y provisioning lo imponen |
| Refresh token rotativo y de un solo uso | Fase 1 — `refreshTokenIfNeeded` persiste el nuevo inmediatamente |
| Credenciales dinámicas por `barId`/`deviceId` | Fase 2 — single-seller: sellerUserId → findFirstActive → env |
| Single-seller (1 solo comercio recibe todo el dinero) | Fase 2 simplificada a 2 niveles de resolución |

## Arquitectura Supabase

```
┌─ OAuth (Fase 1) ─────────────────────────────┐
│  Express C.1  ──→ supabaseCloud ──→ Cloud     │
│  Edge Func C.2 ──→ supabaseAdmin ──→ Cloud    │
│  Tablas: oauth_states, mercadopago_sellers     │
└───────────────────────────────────────────────┘

┌─ Operativo (Fase 2–7) ───────────────────────┐
│  Express API ──→ supabase (local Docker)       │
│  Tablas: bars, mercadopago_cajas,              │
│          mercadopago_cajas_devices, orders...  │
│  Solo lectura de sellers desde Cloud para      │
│  resolver access_token (Fase 2)                │
└───────────────────────────────────────────────┘
```

## Árbol de decisión rápido

```
¿En qué fase estoy trabajando?
│
├─ Tablas / schema / migraciones → fase-0-schema.md
├─ Vincular cuenta MP de un comercio → fase-1-oauth.md
├─ Resolver access_token automáticamente → fase-2-credentials.md
├─ Crear sucursal/caja/Posnet en MP → fase-3-provisioning.md
├─ Cobro por QR estático → fase-4-qr.md
├─ Cobro con Posnet (refactor) → fase-5-posnet.md
├─ Recibir notificaciones de pago → fase-6-webhooks.md
└─ Reembolsar un pago → fase-7-refunds.md
```
