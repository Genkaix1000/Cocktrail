# Cocktrail / BarQR — Arquitectura (fuente de verdad)

> **Este documento describe el sistema TAL COMO ESTÁ CONSTRUIDO HOY**, no un plan aspiracional.
> Última actualización: 2026-07-01. Para lo que falta, ver [`ROADMAP.md`](./ROADMAP.md).
> Reemplaza y deja sin efecto a los docs viejos (`ARCHITECTURE_V2`, `cocktrail_architecture_guide`, `HYBRID_ARCHITECTURE_ES`), ya eliminados.

Internamente el repo se llama **Cocktrail**. En el plan de negocio el producto se presenta como **BarQR**.

---

## 1. Qué es

Sistema de pedidos y cobro para un boliche. El cliente escanea un QR → arma su pedido en el celular → recibe un **ticket con código** → lo retira en la barra. En paralelo, la **caja** cobra de forma presencial (efectivo, débito/Posnet) y el **admin** ve totales en vivo y cierra la noche.

Tres operadores + el cliente:

| Pantalla | Quién | Qué hace |
|---|---|---|
| **Carta** (`/carta`) | Cliente (QR) | Ve tragos, arma pedido, recibe ticket con estado en vivo |
| **Barra** (`/barra`) | Barman | Cola de pedidos (KDS), cambia estado, **canjea tickets** (escáner o manual) |
| **Caja** (`/caja`) | Cajera | Cobro presencial (efectivo / débito Posnet), ventas en efectivo |
| **Admin** (`/admin`) | Dueño/encargado | Totales en vivo, historial, carta, usuarios, config, **abrir/cerrar noche** |

> 🌙 **La noche se abre manualmente**: la admin abre cada noche desde `/admin` (`POST /api/events/open`)
> con una **palabra clave obligatoria** que se imprime en cada ticket físico vendido esa noche (mecanismo
> simple anti-falsificación, sin escaneo). Ya **no** se auto-crea sola al arrancar el server ni
> automáticamente después de cerrar la anterior — así `startedAt` refleja el inicio real del turno. Sin
> noche activa, `/caja` y `/carta` rechazan ventas con un mensaje claro.

---

## 2. Decisión arquitectónica central: **local-first + cloud diferida**

El sistema corre **en una máquina local en el boliche** (mini-PC o laptop) y **no necesita internet** para operar. La nube es **opcional y diferida**: solo se usa para reconciliar la información cuando se cierra la noche.

```
  ┌─────────────────────── BOLICHE (LAN, sin internet) ───────────────────────┐
  │                                                                            │
  │   [celu cliente] ──HTTP/SSE─┐                                              │
  │   [tablet barra] ──HTTP/SSE─┤                                              │
  │   [tablet caja]  ──HTTP/SSE─┼──► apps/web (Next.js 16) ──► apps/api        │
  │   [laptop admin] ──HTTP/SSE─┘         (proxy edge)         (Express 5)     │
  │                                                              │             │
  │                                              ┌───────────────┴──────────┐  │
  │                                              │  Supabase LOCAL (Postgres)│  │ ◄── fuente de verdad
  │                                              └───────────────┬──────────┘  │
  └──────────────────────────────────────────────────────────────┼───────────┘
                                                                  │
                                  (solo al "Cerrar Noche" o al rebootear, si hay internet)
                                                                  ▼
                                              ┌──────────────────────────────┐
                                              │  Supabase CLOUD (opcional)    │ ◄── reconciliación / backup
                                              └──────────────────────────────┘
```

- **Si no hay nube configurada** (`SUPABASE_CLOUD_*` vacías), el sync se saltea con un log y **la operación sigue normal**. La caja nunca depende de internet.
- **El pedido online "en la web" (accesible por internet, fuera de la LAN) es Phase 2** — hoy `/carta` y `/pedido/[token]` se sirven desde el mismo backend local y se acceden por la WiFi/LAN del local. Ver [`ROADMAP.md`](./ROADMAP.md).

---

## 3. Estructura del repo (monorepo pnpm)

```
Cocktrail/
├── apps/
│   ├── api/                    # Backend — Express 5 + TypeScript (tsx watch)
│   │   ├── src/
│   │   │   ├── server.ts       # Boot + arranque autocurativo de la DB local
│   │   │   ├── app.ts          # Composición / DI manual de todos los módulos
│   │   │   ├── config/env.ts   # Validación de env con Zod
│   │   │   ├── shared/
│   │   │   │   ├── supabase.ts  # Clientes supabase (local) y supabaseCloud (opcional)
│   │   │   │   ├── sse/         # sse-manager.ts (EventEmitter, bus de real-time)
│   │   │   │   ├── middleware/  # auth, rate-limit, validate
│   │   │   │   └── utils/       # totals, etc.
│   │   │   ├── modules/         # auth, drinks, orders, cash-sales, events, sse,
│   │   │   │                    #   tickets, users, config, mercadopago, system,
│   │   │   │                    #   sync, audit-logs
│   │   │   └── data/*.json      # ⚠️ CÓDIGO MUERTO (legacy fase 3.5, no se usa)
│   │   └── .env.example
│   └── web/                    # Frontend — Next.js 16 (App Router) + React 19.2
│       ├── src/
│       │   ├── app/            # / carta /pedido/[token] /login /barra /caja /admin
│       │   ├── services/*.ts   # Capa de acceso al API sobre api-client.ts
│       │   ├── lib/useSSE.ts   # Hook de real-time
│       │   ├── proxy.ts        # Guard edge (Next 16: middleware.ts → proxy.ts)
│       │   └── config/env.ts
│       └── .env.example
├── packages/
│   └── shared/src/domain.ts    # Tipos de dominio compartidos (Order, Drink, NightEvent…)
├── supabase/migrations/        # Esquema SQL (night_events, orders, tickets, users…)
├── docker-compose.yml          # Postgres local (ver §9 — hay un mismatch a resolver)
└── docs/                       # ESTA documentación
```

> **Código muerto a eliminar**: `apps/api/src/data/*.json` y los repositorios `LocalJSON*` / `InMemory*`
> dentro de los `.repository.ts` **no están cableados** en `app.ts` — son residuo de la fase JSON-local.
> Ver tarea de limpieza en [`ROADMAP.md`](./ROADMAP.md).

---

## 4. Backend (`apps/api`)

Express 5 + TypeScript. Patrón por capas **Controller → Service → Repository**, con **inyección de dependencias manual** en `app.ts`. Cada módulo vive en `src/modules/<nombre>/`.

| Módulo | Endpoints principales | Auth |
|---|---|---|
| **auth** | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | público |
| **drinks** | `GET /api/drinks`, `GET /:id` | público (lectura) |
| | `POST /api/drinks`, `PATCH /:id`, `DELETE /:id` | admin |
| **orders** | `POST /api/orders` | público (cliente) |
| | `GET /by-token/:token` | público (dueño del token) |
| | `GET /api/orders`, `/log`, `/active`, `PATCH /:id` | staff (admin/caja/barman) |
| **cash-sales** | `POST /api/cash-sales`, `GET /` | admin/caja |
| **events** | `GET /api/state`, `POST /api/events/open`, `PATCH /api/events/current/keyword`, `POST /api/event/close`, `GET /api/events/history` | admin (open/keyword/close), admin/caja (state) |
| | `GET /api/theme` (público), `POST /api/theme` (admin) | |
| **sse** | `GET /api/events` (stream `text/event-stream`) | público (filtrado client-side) |
| **tickets** | `POST /api/tickets/redeem` | admin/barman |
| **users** | `GET /api/users`, `POST`, `PATCH /:id`, `DELETE /:id` | admin |
| **config** | `GET /api/config` (tokens enmascarados), `POST /api/config` | admin |
| **mercadopago** | `POST /api/mercadopago/pos/intent`, `GET /pos/intent/:id`, `DELETE /pos/intent/:id` | admin/caja |
| **printer** | `GET /api/printer/status`, `POST /api/printer/test`, `POST /api/printer/reprint/:orderId` | admin/caja |
| **system** | `GET /api/system/status`, `/logs`, `POST /sync`, `POST /shutdown` | staff |
| **sync** | (sin controller; disparado por `system` y `events`) | — |
| **audit-logs** | (sin controller; `AuditLogsService` usado inline por otros módulos) | — |

### Boot autocurativo (`server.ts`)
Al arrancar, el server **abre el puerto HTTP primero** y luego intenta conectar a la DB local. Si la DB no responde, ejecuta `pnpm exec supabase start`; si eso falla, `docker compose up -d`. Reintenta hasta 6 veces y deja un loop en background. Esto permite "encender la máquina y que levante solo".

---

## 5. Persistencia: **Supabase (Postgres)**, no in-memory

> El `CLAUDE.md` viejo decía "sin base de datos / in-memory". **Eso ya no es cierto.**

`apps/api/src/shared/supabase.ts` exporta dos clientes:

- **`supabase`** → instancia **LOCAL** (`SUPABASE_URL`, default `http://127.0.0.1:54321`). **Fuente de verdad operativa.** Todos los repositorios cableados (`Supabase*Repository`) usan este cliente.
- **`supabaseCloud`** → instancia **NUBE**, solo existe si están seteadas `SUPABASE_CLOUD_URL` + `SUPABASE_CLOUD_SERVICE_ROLE_KEY`. Si no, es `null` y todo el sync cloud se saltea.

El "flag" que decide *single backend* vs *local+cloud* es simplemente **la presencia de las env `SUPABASE_CLOUD_*`**.

### Esquema (`supabase/migrations/`)
- `20240101000000_schema.sql` — `night_events` (status, `order_counter`, `sync_status`, `synced_at`), `orders` (items JSONB, total, payment_method, status, ticket_code, campos de cancelación/entrega), `tickets` (code único, redención), `cash_sales`.
- `20240102000000_edge_sync.sql` — datos maestros: `users` (password_hash, role, permissions JSONB), `drinks`, `app_config` (theme, branding, `mercado_pago` JSONB, club, logo).
- `20260626175947_add_closed_by.sql` — `night_events.closed_by`.
- `20260629201500_create_audit_logs.sql` — `audit_logs` (action, description, operator, created_at).
- `20260701000000_add_keyword.sql` — `night_events.keyword` (palabra clave de la noche, la define la
  admin al abrirla, se imprime en cada ticket físico).

> ⚠️ La columna `night_events.totals` que usa el sync **no está en las migraciones locales** — se asume solo en el esquema cloud. Ver riesgos en [`ROADMAP.md`](./ROADMAP.md).

---

## 6. Sincronización local ↔ nube (`modules/sync/sync.service.ts`)

Implementa el modelo "**caja offline, reconcilia al cerrar**". `SyncService` recibe los
repositorios locales ya auditados (`Users`/`Drinks`/`Orders`/`CashSales`/`Tickets`/
`EventsRepository`) y un `CloudSyncRepository` (`modules/sync/cloud-sync.repository.ts`) por
constructor — no pega directo a `supabase`/`supabaseCloud`, salvo el seed local-only de datos
demo (a propósito: evita el dual-write a cloud que hacen `UsersRepository.create()`/
`DrinksRepository.create()` para escrituras normales). `CloudSyncRepository` es el único lugar
que concentra el acceso crudo a `supabaseCloud` (pull cloud→local, push local→cloud bulk).

- **`pullMasterData()`** — **Cloud → Local**. Baja `users` y `drinks` y hace `upsert` en local. Si no hay nada en ningún lado, siembra admin + drinks por defecto.
- **`pushEventData(eventId)`** — **Local → Cloud**. Sube un `night_event` cerrado + sus `orders` + `tickets` + `cash_sales`. Marca `sync_status` `pending → synced/failed` en la tabla local. Calcula totales con `computeTotals` y los guarda en `night_events.totals` (cloud).
- **`syncAllPendingEvents()`** — recorre noches cerradas locales con `sync_status != 'synced'` y las reintenta.
- **`ensureLocalMasterDataSeeded()`** — siembra admin/drinks en local en cada boot (sin tocar la nube).
- **`pushAuditLogsIfConfigured()`** — **Local → Cloud**, fire-and-forget. Sube `audit_logs` completo a cloud vía upsert; nunca lanza (se llama junto al push de cada cierre de noche, `events.service.ts`).
- **`restoreFromCloud()`** — **Cloud → Local, merge/upsert (gana cloud en conflicto, no borra nada local)**. Restore de emergencia para cuando una tabla local se vació o corrompió (motivado por un incidente real: `drinks` se vació en silencio por un bug de sync ya arreglado). Trae `night_events` (forzando `status: "cerrado"`, descartando `totals` que es cloud-only) → `orders` → `tickets` → `cash_sales` → `audit_logs`, en ese orden, cada tabla en su propio try/catch para que una falla no aborte el resto. Devuelve un `RestoreResult` con `{ok, failed, error?}` por tabla — nunca un booleano (lección directa del incidente de `drinks`). Expuesto en `POST /api/system/restore` (rol `admin` únicamente, re-pide contraseña) y en `/admin` → Configuración → Sistema.

**Cuándo corre:**
- Al **cerrar la noche** (`events.service.closeEvent` → sync en background).
- Al **arrancar** (`eventsService.initialize` → `syncAllPendingEvents` en background).
- **Auto-cierre**: si al bootear hay un evento `activo` de un día calendario anterior (zona `America/Argentina/Buenos_Aires`), lo cierra automáticamente y lo empuja.
- **Manual**: `POST /api/system/sync` (local→cloud) y `POST /api/system/restore` (cloud→local, botón "Restaurar desde backup" en `/admin`).

---

## 7. Real-time (SSE)

- **Servidor**: `modules/sse/sse.controller.ts` expone `GET /api/events` como `text/event-stream` (frame `connected` inicial + ping cada 25s). Bus: `shared/sse/sse-manager.ts` (Node `EventEmitter`, canal único `domain`). Los servicios que emiten (`OrdersService`/`CashSalesService`/`EventsService`) reciben `emit` (tipo `EmitFn`) inyectado por constructor, no lo importan como singleton — mismo patrón de DI que los repos.
- **Eventos** (`DomainEvent`): `order.created`, `order.updated`, `cash_sale.added`, `event.closed`, `event.opened`, `theme.changed`.
- **Cliente**: hook `apps/web/src/lib/useSSE.ts` abre `EventSource(${API_URL}/api/events, {withCredentials:true})`. El stream es **global** y se filtra del lado del cliente (por token para el cliente, por rol para staff).

> Implicancia: como el estado real-time vive en el `EventEmitter` del proceso Node, el backend **no puede correr en serverless/edge** (Vercel functions). Debe ser un proceso Node persistente — coherente con el modelo local-first.

---

## 8. Autenticación y roles

- **Cookie HMAC** `cocktrail_session`: payload `role.username.expiresAt` firmado con HMAC-SHA256 (`AUTH_SECRET`), TTL 12h, `HttpOnly; SameSite=Strict; Secure` en prod. Verificación con `timingSafeEqual`.
- **Roles**: `admin | caja` (el rol `barman` se retiró el 2026-07-13 — ver decisión más abajo). Permisos (`closeNight`, `cancelarTickets`, `historial`, `metricas`) ya **no son editables por usuario**: se calculan puros por rol en `auth.controller.ts` (`GET /api/auth/me`), admin tiene los 4 en `true`, caja solo `cancelarTickets`/`historial`. La columna `permissions JSONB` de `users` sigue existiendo por compatibilidad de schema pero se escribe vacía (`{}`) y no se lee.
- **Doble fuente de credenciales**: primero `SupabaseUsersRepository` (password hasheada SHA-256); si no, usuarios fallback de `env` (`admin/admin`, `caja/caja`).
- **Guard backend**: `auth.middleware.ts` (`authMiddleware` + `requireRole`).
- **Guard frontend**: `apps/web/src/proxy.ts` (Next 16 renombró `middleware.ts` → `proxy.ts`). Verifica la firma HMAC **localmente** con Web Crypto en el Edge runtime (no fetchea al API). Protege `/admin`, `/caja`, `/barra`, `/login` y redirige según rol. **Debe usar `export default function proxy(...)`**.
- **`/barra` (2026-07-13)**: sin rol dedicado, la pantalla de canje manual de tickets quedó **admin-only** (antes era barman-only a nivel página, lo que con el rol retirado la hubiese dejado inalcanzable). El flujo físico real del local es caja→barra sin app — ver `docs/ROADMAP.md`.
- **Hardening**: rate limiters por endpoint (incl. `loginLimiter`, la protección real contra fuerza bruta en el login — el captcha aritmético que existía se sacó el 2026-07-13, sistema 100% LAN sin exposición a bots externos), Helmet, CORS whitelist, validación Zod, `AUTH_SECRET` ≥32 chars con fail-fast en prod.

---

## 9. Containerización / deploy

**Objetivo actual**: levantar todo en una mini-PC/laptop del boliche con `docker compose up -d` + la app. App "doble-click" empaquetada → más adelante (ver roadmap). Pasos detallados en [`DEPLOY.md`](./DEPLOY.md).

El `docker-compose.yml` levanta un **stack Supabase local mínimo** (3 servicios) que expone la API REST en `:54321` — que es lo que usa `@supabase/supabase-js`:

| Servicio | Imagen | Rol |
|---|---|---|
| `db` | `supabase/postgres:17.6.1.136` | Postgres con los roles Supabase (`anon`, `authenticated`, `service_role`, `authenticator`). Aplica `supabase/migrations/*.sql` en el primer boot. |
| `rest` | `postgrest/postgrest:v14.12` | PostgREST: traduce HTTP REST → SQL. |
| `kong` | `kong/kong:3.9.1` | Gateway en host `:54321`: enruta `/rest/v1/*` → PostgREST y valida la `apikey`. |

- **Opcionales** (`--profile debug`): `meta` + `studio` (UI web en `:54323`) para inspeccionar la base.
- **Excluidos a propósito** (el backend no los usa): auth/gotrue, realtime, storage, functions, analytics, vector, pooler.
- **Llaves**: por default, JWT secret demo de Supabase + `anon`/`service_role` firmadas con él (`docker-compose.yml` trae los valores demo embebidos, corre sin `.env`; `supabase/generate-keys.mjs --demo` los regenera si hace falta, vía `postinstall`). `supabase/docker/kong.yml` **no se versiona ni se edita a mano** — se genera desde `supabase/docker/kong.yml.template` (Kong DB-less no interpola env vars en `key-auth`). Para un deployment que pueda salir de la LAN, `node supabase/generate-keys.mjs` genera credenciales propias — la `service_role` resultante va en `apps/api/.env` como `SUPABASE_SERVICE_ROLE_KEY`. Ver `docs/DEPLOY.md` § 7 y `docs/specs/hardening-kong-demo-keys.md`.
- **Init ordenado** (string-sort): `01-roles` → `02-jwt` → `10..13-migraciones`. **Cada migración nueva se agrega como `14-…`, `15-…` en el compose.**
- **R1 resuelto** (2026-06-30): antes esto era Postgres pelado sin REST; verificado end-to-end con curl (las 8 tablas responden con la `service_role`, 401 sin apikey).

---

## 10. Modelo de dominio (`packages/shared/src/domain.ts`)

```ts
type Role = 'admin' | 'caja' | 'barman';

type Order = {
  id: string;
  token: string;                 // va en la URL /pedido/[token]
  displayNumber: number;         // #1, #2 — secuencial por noche
  items: OrderItem[];
  total: number;
  paymentMethod: 'efectivo' | 'qr' | 'debito';   // (antes: transferencia/efectivo)
  status: 'pagado' | 'preparando' | 'listo' | 'entregado' | 'cancelado';
  ticketCode?: string;
  createdBy?: string;
  createdAt: number;
  // auditoría/canje:
  cancelledBy?: string; cancelledAt?: number;
  readyAt?: number; deliveredAt?: number;
  deliveredBy?: string; deliveredByBar?: string;
  redeemMethod?: 'scan' | 'manual';
};

type Drink = {
  id: number; name: string; price: number; description: string;
  vibe: string; flavors: string[];
  iconName: string;              // serializable (antes era LucideIcon)
  image?: string; promo?: ...;
  trending: boolean; available: boolean;
};

type NightEvent = {              // (antes: Event)
  id: string; status: 'activo' | 'cerrado';
  startedAt: number; closedAt?: number; closedBy?: string;
  orderCounter: number;
  keyword?: string;              // palabra clave de la noche, impresa en cada ticket físico
};

type CashSale = { id: string; amount: number; description: string; addedBy: string; createdAt: number; };

type Theme = 'normal' | 'bosko' | 'custom';   // + CustomTheme (branding por club)

type EventTotals = {             // desglose por método de pago
  webTotal; qrTotal; efectivoTotal; debitoTotal; /* + counts */ drinksSold: ...;
};
```

### Máquina de estados del pedido
```
pagado ──► preparando ──► listo ──► entregado
   └──────────┴───────────┴──► cancelado
```
Transiciones válidas (en `orders.service.ts`): `pagado→{preparando,cancelado}`, `preparando→{listo,cancelado}`, `listo→{entregado,cancelado}`.

---

## 11. Mercado Pago — integración **real** (Point / Posnet)

`modules/mercadopago/mercadopago.service.ts` llama a `https://api.mercadopago.com` (**Point Integration API**, lectora física Posnet):

- `POST /point/integration-api/devices/{deviceId}/payment-intents` (monto en centavos)
- `GET /point/integration-api/payment-intents/{id}` (status, normalizado a
  `OPEN|ON_TERMINAL|FINISHED|CANCELED|PENDING` antes de llegar al frontend)
- `DELETE .../payment-intents/{id}` (cancelar)
- `GET /v1/payments/{id}` (Payments API estándar) — usado internamente cuando MP responde el
  estado final `CONFIRMATION_REQUIRED`, para resolver automáticamente si el cobro se concretó sin
  que la cajera tenga que mirar la pantalla del Posnet
- `checkDeviceConnection` (usado por `/api/system/status`)

Requiere `MP_ACCESS_TOKEN` + `MP_POS_DEVICE_ID`. Si faltan, lanza `Conflict` (no hay fallback simulado). **Es cobro presencial con lectora física, no checkout web ni QR de MP** — `/caja` solo ofrece Efectivo y Tarjeta; el valor `"qr"` de `PaymentMethod` sigue existiendo en el dominio para la preferencia que declara el cliente en `/carta` y el reporte de `/admin`, sin relación con el Posnet.

---

## 12. Variables de entorno

Ver `apps/api/.env.example` y `apps/web/.env.example`. Las críticas:

| Variable | Dónde | Para qué |
|---|---|---|
| `AUTH_SECRET` / `COCKTRAIL_AUTH_SECRET` | api + web | HMAC de cookies (≥32 chars; **debe coincidir** entre api y web) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | api | DB local (fuente de verdad) |
| `SUPABASE_CLOUD_URL`, `SUPABASE_CLOUD_SERVICE_ROLE_KEY` | api | Nube (opcional; activa el sync) |
| `MP_ACCESS_TOKEN`, `MP_POS_DEVICE_ID` | api | Mercado Pago Point (opcional) |
| `NEXT_PUBLIC_API_URL` | web | URL del Express |
| `NEXT_PUBLIC_LAN_HOST` | web | Base para generar los QR escaneables |

---

## 13. Comandos

```bash
pnpm dev          # api + web en paralelo
pnpm dev:api      # solo Express (tsx watch, :3001)
pnpm dev:web      # solo Next.js (:3000, -H 0.0.0.0 para LAN)
pnpm build        # build:api && build:web
pnpm typecheck    # tsc --noEmit en api + web
docker compose up # Postgres local (ver §9)
```
