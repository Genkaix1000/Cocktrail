# Plan técnico — PR 5: Conciliación / sync de Mercado Pago

> Plan del PR 5 de [`specs/mercadopago/remediacion-integracion-mp.md`](../../specs/mercadopago/remediacion-integracion-mp.md).
> Escrito el 2026-07-24 sobre un relevamiento del módulo `sync` real. Estado: aprobado, en implementación.

## Problema

Ninguna tabla de MP entró al módulo `sync`: `mp_orders` no sube al cerrar la noche, así que
**todos los cobros de Mercado Pago son invisibles en la nube**. El backup en Cloud —que existe
porque ya hubo un incidente real de pérdida de datos— hoy no protege la plata cobrada por MP.
Tampoco el restore recupera la config MP (cajas/devices/cobros).

## Estado de partida (verificado en el código)

- `mp_orders.event_id` existe (`20260721000100_mp_orders_event_id.sql`) y se llena en cada cobro
  (`mercadopago-orders.service.ts`, `point-payments.service.ts`). Filas anteriores a esa migración
  quedan `NULL` → fuera del sync por noche (aceptado, se documenta).
- `mercadopago_sellers.cloud_synced_at` existe (`20260723000000_sellers_encrypted_tokens.sql:12`)
  con el comentario "el pusher es del PR 5" — es el **outbox** que este PR consume. Hoy nadie lo lee.
- El sync es event-driven: `EventsService.closeEvent()` → `syncEventToCloudBackground()`
  (`events.service.ts:319-325`, fire-and-forget) + `syncAllPendingEvents()` en el boot y
  `POST /api/system/sync` manual. **No hay tick periódico** y no se agrega uno.
- El estado de sync vive en `night_events.sync_status` (`pending`/`synced`/`failed`) — los
  `mp_orders` viajan con su noche, no llevan flag propio.
- `restoreFromCloud()` (`sync.service.ts:231-261`) baja nights → orders → tickets → audit_logs con
  `safePull` por tabla; **no baja nada de MP**. El `pullOrders` anula `mp_order_id` si no existe
  localmente (`cloud-sync.repository.ts:222`, fix `de7c863`) justamente porque `mp_orders` no bajaba.
- **El runner de migraciones (PR 2) es local-only** (`PgMigrationsRepository` sobre `DATABASE_URL`).
  El esquema Cloud se aplica a mano por SQL Editor — precedente: `docs/specs/mercadopago/sql/pr4-cloud.sql`.
- Las tablas MP **no existen en Cloud**: allá solo se creó `mercadopago_seller_handoff` y se purgó
  `mercadopago_sellers` (PR 4).
- `pullSellerHandoff()` del enunciado del PR 5 **ya existe**: es `pullSellerFromCloud()` de
  `mercadopago-oauth.service.ts:235-320` (PR 4, buzón cifrado + TTL 15 min + borrado post-pull).
  No se duplica; se registra la correspondencia en la spec.

## Diseño

### 1. DDL Cloud — `docs/specs/mercadopago/sql/pr5-cloud.sql` (paso manual)

Crear en Cloud `mp_orders`, `mercadopago_cajas` y `mercadopago_cajas_devices` como **archivo
histórico sin FKs** (mismo criterio que las columnas de cobro de `orders` en Cloud: la integridad
la garantiza el origen local; una FK rota no puede frenar un backup). Columnas espejo del esquema
local vigente (incluye las de `gestion-posnets`: `is_active`, `linked_at`, `deactivated_at`,
`operating_mode_synced_at`, `store_name`). Sin triggers ni CHECKs de negocio. Mismos GRANT/RLS
que el resto de las tablas Cloud (patrón `pr4-cloud.sql`). Idempotente (`IF NOT EXISTS`).

### 2. `cloud-sync.repository.ts` — métodos nuevos

Todos devuelven `SyncTableResult` o tiran para que el service capture — **nunca boolean suelto**
(convención del módulo desde el bug del 2026-07-13). Batching con el `BATCH_SIZE = 500` existente.

- `pushMpOrders(eventId)` — upsert a Cloud de los `mp_orders` de la noche (por `event_id`).
- `pushMpCajas()` / `pushMpDevices()` — upsert completo en cada cierre (tablas chicas; no
  amerita outbox).
- `pushSellerMetadata()` — outbox `WHERE cloud_synced_at IS NULL`; sube **solo metadata**
  (`user_id`, nickname, nombres, email, timestamps). Las columnas `_enc` **jamás** salen del
  local (D3). Al confirmar, estampa `cloud_synced_at`.
- `pullMpCajas()` / `pullMpDevices()` / `pullMpOrders()` — para el restore, con mapeo explícito
  de columnas (patrón `pullNightEvents`/fix `de7c863`: normalizar NULLs de filas cloud viejas,
  no confiar en DEFAETs locales).

### 3. Hooks

- `syncEventToCloudBackground()` suma los pushes MP al fire-and-forget del cierre (orden: cajas →
  devices → mp_orders → seller metadata; los fallos se loguean y marcan `sync_status=failed` igual
  que hoy).
- `syncAllPendingEvents()` (boot + sync manual) reintenta lo mismo para noches `pending`/`failed`
  y corre el outbox del seller en cada pasada.

### 4. `restoreFromCloud()`

Orden nuevo por integridad referencial local:
`nights → mp_cajas → mp_devices → mp_orders → orders → tickets → audit_logs`.
Con `mp_orders` ya restaurados, el lookup defensivo de `pullOrders` conserva la FK `mp_order_id`
real en vez de anularla. Tokens **excluidos explícitamente** (D3): tras un restore hay que
**re-vincular el seller por OAuth** — se documenta en la spec y en la UI. `RestoreResult` suma las
claves MP.

### 5. UI — `SistemaSection.tsx`

Renderizar las filas nuevas del `RestoreResult` (cajas, posnets, cobros MP) y la aclaración de
re-vincular tras restore. Nada más.

### 6. Tests

Unit siguiendo el patrón de mocks de `cloud-sync.repository.test.ts` (`vi.mock` de
`shared/supabase.js`, builders por tabla, aserciones sobre `upsert.mock.calls`). Casos mínimos:
push por `event_id`, outbox del seller (estampa `cloud_synced_at`, no sube `_enc`), normalización
de NULLs en los pulls, orden del restore, y `RestoreResult` extendido. **Sin tests de integración
nuevos** (R16 sigue abierto — la suite de integración pega contra la base compartida).

## Gate 🟪 (bloqueante, manual)

1. Cerrar una noche con cobros MP reales → verificar en Cloud que aparecen `mp_orders` (con
   `event_id`), cajas, devices y la metadata del seller.
2. Restore desde `/admin` → cajas/devices/cobros vuelven; el seller queda para re-vincular.

## Fuera de alcance

- Tick periódico de sync (no existe hoy; el event-driven alcanza).
- Backfill de `mp_orders.event_id` NULL (cobros anteriores al 21-07 — datos de prueba).
- Sync bidireccional de pedidos (Fase 7).
- Migración Orders API (R15) y zod en controllers MP (R17).
