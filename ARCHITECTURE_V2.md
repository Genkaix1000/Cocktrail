# 🏗️ Cocktrail — Architecture V2

> **Última actualización**: 2026-06-01  
> **Estado**: Fase 3.5 — Panel de Configuración & CRUD (planificado)

---

## 1. Visión General

La V2 de Cocktrail reestructura el monolito Next.js en un **monorepo** con separación
clara entre frontend, backend y tipos compartidos.

```
Cocktrail/                         (monorepo root)
├── packages/
│   └── shared/                    @cocktrail/shared — tipos de dominio
├── apps/
│   ├── api/                       cocktrail-api — Express + TypeScript
│   └── web/                       cocktrail-web — Next.js (frontend only)
├── pnpm-workspace.yaml
└── ARCHITECTURE_V2.md             (este archivo)
```

### Motivación

| Problema (V1)                            | Solución (V2)                              |
|------------------------------------------|--------------------------------------------|
| Estado in-memory en `globalThis`         | Repository pattern → futura DB (Fase 5)    |
| Frontend importa directamente del server | Services layer HTTP (`api-client.ts`)       |
| APIs sin auth en endpoints de lectura    | Auth middleware Express por rol             |
| Secret hardcodeado como fallback         | Env var obligatoria con Zod (failfast)      |
| Todo en un solo deploy                   | Frontend en Vercel + Backend en Railway     |

---

## 2. Paquete Compartido — `@cocktrail/shared`

Contiene todos los tipos de dominio que usan tanto el frontend como el backend:

- `Role`, `Theme`
- `Drink`, `OrderItem`, `Order`, `OrderStatus`, `PaymentMethod`
- `CashSale`, `NightEvent`, `EventSummary`, `EventTotals`, `DrinkSold`
- `NewOrderInput`, `NewCashSaleInput`

**Ubicación**: `packages/shared/src/domain.ts`  
**Consumo**: Ambos apps lo importan como `@cocktrail/shared`  
**Publicación**: Paquete privado del workspace, no se publica a npm.

---

## 3. Backend — `apps/api`

### 3.1 Stack

- **Runtime**: Node.js
- **Framework**: Express
- **Lenguaje**: TypeScript (strict mode)
- **Validación**: Zod (env vars) + funciones de validación manual (migradas del MVP)
- **Estado**: In-memory (Phase 1) → Supabase PostgreSQL (Phase 5)

### 3.2 Arquitectura por capas

```
Controller (HTTP) → Service (lógica de negocio) → Repository (datos)
                                                 ↘ SSE Manager (eventos)
```

**Módulos**:

| Módulo       | Rutas                                          | Repositorio |
|--------------|-------------------------------------------------|-------------|
| `auth`       | `POST /login`, `POST /logout`, `GET /me`        | —           |
| `drinks`     | `GET /api/drinks`                               | ✅          |
| `orders`     | `POST`, `PATCH /:id`, `GET`, `GET /active`, `GET /by-token/:token` | ✅ |
| `cash-sales` | `POST`, `GET`                                   | ✅          |
| `events`     | `GET /api/state`, `POST /close`, `POST /theme`, `GET /history` | — |
| `sse`        | `GET /api/events` (SSE stream)                  | —           |
| `tickets`    | `POST /api/tickets/redeem`                      | ✅          |

### 3.3 Repository Pattern

```typescript
interface OrdersRepository {
  create(order: Order): Order;
  findById(id: string): Order | undefined;
  findByToken(token: string): Order | undefined;
  findActive(): Order[];
  list(): Order[];
  updateStatus(id: string, status: OrderStatus): Order;
  clear(): void;
}
```

**Fase 1**: `InMemoryOrdersRepository` (Map)  
**Fase 5**: `SupabaseOrdersRepository` (PostgreSQL)

El service recibe el repository por inyección de dependencias. Al cambiar de
implementación, la lógica de negocio **no cambia**.

### 3.4 Seguridad (Fase 2)

El backend incorpora medidas robustas contra vectores de ataque comunes (OWASP Top 10):

- **Helmet**: Modifica cabeceras HTTP para impedir Clickjacking, sniffing de MIME-types e impone una Content Security Policy (CSP) básica.
- **CORS Whitelist**: Permite peticiones con credenciales únicamente desde la URL del frontend (`env.FRONTEND_URL`).
- **Rate Limiting**:
  - `generalLimiter`: Máximo 100 peticiones por 15 minutos por IP.
  - `loginLimiter`: Máximo 5 peticiones por 15 minutos por IP (bloquea fuerza bruta en `/api/auth/login`).
  - `orderLimiter`: Máximo 10 peticiones por minuto por IP (bloquea spam de creación de pedidos).
- **Validación con Zod**:
  - Reemplaza validaciones manuales por esquemas tipados (`LoginSchema`, `CreateOrderSchema`, `CreateCashSaleSchema`, `ThemeSchema`, `UpdateOrderStatusSchema`).
  - Filtra y sanitiza payloads eliminando propiedades no definidas en los esquemas (Mass Assignment).
- **Configuración Fail-Fast**: El servidor aborta inmediatamente con código 1 en producción si `AUTH_SECRET` es débil o menor a 32 caracteres.
- **Cookies de Sesión Seguras**: La cookie `cocktrail_session` se emite con flags `HttpOnly`, `SameSite=Strict` y `Secure` (en producción).

---

## 4. Frontend — `apps/web`

### 4.1 Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4
- **Lenguaje**: TypeScript

### 4.2 Capa de Servicios

Toda comunicación con el backend pasa por `src/services/api-client.ts`:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export async function apiFetch<T>(path: string, opts?: RequestOptions): Promise<T>
```

Cuando `NEXT_PUBLIC_API_URL` está vacío (desarrollo local con proxy), los fetches
van a rutas relativas. Cuando tiene un valor (`https://api.cocktrail.app`), van al
backend externo. **Cero cambios en componentes.**

### 4.3 Protección de Rutas — Middleware

**Archivo**: `apps/web/middleware.ts`

**Fase de transición** (actual):
- Intercepta `/admin(.*)` y `/barra(.*)`
- Valida la cookie `cocktrail_session` **localmente** en el Edge runtime
- Usa Web Crypto API (`crypto.subtle`) para HMAC-SHA256
- Redirige a `/login` si no hay sesión válida
- Redirige a `/barra` si un barman intenta acceder a `/admin`

**Fase futura** (backend independiente):
- El middleware mutará para hacer `fetch(API_URL + '/api/auth/me')`
- La validación pasa a ser 100% server-side del backend

**Decisión de diseño**: Se eligió middleware de Next.js sobre auth guard client-side
para evitar parpadeos (flicker) — la redirección ocurre antes de que el browser
reciba HTML.

---

## 5. Decisiones Técnicas

| Decisión | Alternativa descartada | Razón |
|----------|----------------------|-------|
| Monorepo con pnpm workspaces | Repos separados | Simplifica desarrollo local y CI; tipos siempre sincronizados |
| Middleware Next.js para auth | Client-side auth guard | Evita flicker; redirige antes de servir HTML |
| HMAC local en Edge (transición) | fetch a /api/auth/me | No depende del backend aún; zero latency |
| Repository pattern in-memory | Supabase directo | Fase 1 no requiere DB; el pattern permite switch sin refactor |
| Express (no Fastify, Hono) | Hono, Fastify | Ecosistema maduro, equipo familiarizado, middleware abundante |
| Helmet & CORS explícito | Configuración por defecto de Express | Bloquea Clickjacking, sniffers de tipos, y accesos de dominios maliciosos de terceros |
| Rate Limiting por IP | Sin control de volumen | Protege de fuerza bruta en auth (5 req/15 min) y spam de pedidos (10 req/min) |
| Validación Zod centralizada | Funciones de validación manual | Asegura sanitización de payloads (evita Mass Assignment), fail-fast y tipado automático en controladores |
| Firmas HMAC cortas en QR (`READABLE-hmac`) | UUIDs de 36 caracteres completos | Optimiza la densidad del código QR en condiciones de baja iluminación de pista y permite la digito-digitación humana fácil si el lector falla |
| Timing-safe equal en backend | Comparación estándar de strings `===` | Protege el canje de tickets contra ataques de temporización (timing attacks) sobre la firma HMAC |
| Feedback Háptico y Destellos Visuales | Web Audio API / Alertas de sonido | El entorno ruidoso de la barra hace inútiles los beeps. La vibración (`navigator.vibrate`) y destellos a pantalla completa son altamente perceptibles |
| Simulador de hardware en desarrollo | Requiere hardware físico obligado | Permite verificar la lógica del detector de keystrokes veloces (`useScannerInput`) usando eventos virtuales programáticos |
| Aislamiento de roles (Admin / Caja) | Panel único multi-rol | Evita que un operador de Caja acceda al panel de administración y que el Admin acceda a la caja de forma cruzada, manteniendo la seguridad e integridad del dinero |
| `/barra` pública (sin login) | Interfaz protegida para barman | Facilita la operación ultra veloz en barra ya que el escáner se monta sobre un frontend estático directo, delegando la seguridad de la redención al backend con tickets firmados criptográficamente |
| QR Dominante y sin Tracker | Vista con barra de progreso tradicional | Los estados intermedios no aportan valor en este flujo (Cliente -> Barman). Centrar y agrandar el código QR a `size={260}` agiliza el escaneo físico instantáneo |

---

## 6. Changelog

| Fecha       | Etapa    | Cambio                                               |
|-------------|----------|------------------------------------------------------|
| 2026-06-01  | Fase 1.1 | Monorepo setup: `pnpm-workspace.yaml`, `packages/shared` |
| 2026-06-01  | Fase 1.2 | Desacoplamiento completo: backend en Express (`apps/api`), frontend refactorizado (`apps/web`), compilación y typecheck exitosos. |
| 2026-06-01  | Fase 2   | Security by Design: Helmet, CORS restringido, Rate Limiting general/login/orders, validación de payloads con Zod y cookies de sesión seguras. |
| 2026-06-01  | Fase 3   | Sistema de Tickets QR: Códigos HMAC seguros con timing-safe check, hook detector de keystrokes rápidos (`useScannerInput`), alertas visuales y hápticas en KDS `/barra`, render de QR en `/pedido/[token]` y Dev Simulator. |
| 2026-06-01  | Fase 3.2 | Refactor: login con selector de 3 perfiles (Admin, Caja, Barra), separación de rutas `/caja`/`/admin`/`/barra` pública, KDS `/barra` enfocado en historial con status en header y QR de cliente dominante (`size={260}`). |
| 2026-06-03  | Fase 3.5 | Diseño de Panel de Configuración & CRUD: menús y navegación lateral para General, Carta, Pagos y Usuarios, e integración de base de datos local JSON. |

*— Se actualiza incrementalmente con cada etapa completada —*
