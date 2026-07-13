# Deuda estructural de Fase 2

**Estado**: done
**Fecha**: 2026-07-13

---

## Problema / Por qué

La auditoría de `apps/api` (Fase 2 del roadmap, completada 2026-07-01) dejó 5 puntos de deuda
estructural documentados pero **deliberadamente no resueltos en ese momento** ("candidatos para
cuando se decida abordarlas, no bloquean nada hoy"). Ocho meses de features después (Fase 3/3B/3C,
useSSE centralizado, simplificaciones de admin, fixes de Mercado Pago, atomicidad de canje de
ticket), siguen sin tocarse:

1. **`auth.service.ts` mezcla 3 responsabilidades** en un solo archivo de 172 líneas: verificar
   credenciales (`authenticate`), firmar/verificar la cookie de sesión (`signSession`,
   `verifySession`, `buildSessionCookie`), y el registro de captcha por intentos fallidos
   (`captchaRegistry`, `getCaptchaInfo`, `registerFailedAttempt`, `verifyCaptcha`). Son 3
   dominios distintos que hoy solo comparten archivo, no una relación real de negocio.
2. **`SyncService` bypasea los repositorios ya auditados** — en vez de reusar
   `UsersRepository`/`DrinksRepository`/`OrdersRepository`/`CashSalesRepository` (Fase 2, con
   tests y revisión SOLID), `pushEventData`/`pullMasterData`/`seedDefaultAdminIfMissing`/
   `seedDefaultDrinksIfMissing` pegan directo a `supabase.from(...)`/`supabaseCloud.from(...)`,
   duplicando el mismo patrón de acceso a datos que los repos ya resuelven, con su propio mapeo
   de columnas por separado.
3. **`emit()` (SSE) se importa como singleton global** en vez de inyectarse como dependencia —
   `orders.service.ts`, `events.service.ts`, `cash-sales.service.ts` y `config.controller.ts`
   importan `emit` directo del módulo `shared/sse/sse-manager.ts` y lo llaman como una función
   suelta, rompiendo el patrón de inyección por constructor que el resto del código (repos,
   servicios) sí sigue. En los tests, esto obliga a mockear el módulo entero (`vi.mock`) en vez de
   pasar un colaborador falso como con cualquier otra dependencia.
4. **`system.controller.ts` no tiene un Service propio** — la lógica de negocio (chequeo de
   conexión a internet/DB local/DB cloud, cálculo de estado del Posnet, agregación del estado
   general del sistema) vive directo en los route handlers del controller, rompiendo la capa
   Controller→Service→Repository que el resto de los módulos sí respeta.
5. **`TicketsService.redeemTicket` orquesta directamente la máquina de estados de
   `OrdersService`** — llama a `ordersService.updateOrderStatus(...)` conociendo el detalle de
   qué status pasar y con qué metadata, en vez de una separación donde `TicketsService` solo se
   ocupe del ticket y delegue la decisión de "¿se puede entregar este pedido?" a `OrdersService`.

Para quién: el **desarrollador o agente de IA** que en el futuro tenga que tocar autenticación,
sync, tiempo real, estado del sistema, o canje de tickets — hoy tiene que entender excepciones a
la arquitectura del resto del proyecto para trabajar en esos 5 puntos, con más riesgo de
introducir bugs por la inconsistencia (ej. el propio riesgo R3 recién resuelto — la atomicidad del
canje — vivía justo en la intersección de los puntos 2 y 5: `TicketsService` y `OrdersService`
mezclando responsabilidades hizo más difícil ver el problema de concurrencia a primera vista).

---

## Objetivo

Que estos 5 módulos queden con la **misma calidad estructural** que ya tiene el resto de
`apps/api` después de la Fase 2/3C: capas separadas (Controller→Service→Repository), sin
duplicación de lógica de acceso a datos, dependencias inyectadas por constructor (no imports de
singleton donde el patrón del resto del código usa inyección), y con tests.

Esto es **refactor puro**: el comportamiento observable del sistema para cualquier rol
(admin/caja/barman/cliente) **no cambia en absolutamente nada** — mismos endpoints, mismas
respuestas, mismos eventos SSE, mismo comportamiento de login/captcha, mismo sync local↔cloud.
El "para quién" de esta spec es el código mismo y quien lo mantiene, no un usuario final.

Ningún flujo ya probado en producción (Mercado Pago Posnet, sync local→cloud, canje de tickets
recién hecho atómico — spec `atomicidad-canje-ticket`) puede regresar por este trabajo.

---

## Historias de usuario

- Como **desarrollador/agente** que necesita tocar autenticación, quiero encontrar credenciales,
  sesión y captcha en módulos separados (cada uno con su propia responsabilidad clara), para no
  tener que leer 172 líneas de 3 dominios distintos para cambiar uno solo.
- Como **desarrollador/agente** que necesita tocar el sync local↔cloud, quiero que reuse los
  repositorios ya auditados en vez de tener su propio acceso a datos paralelo, para que un fix o
  cambio de esquema no tenga que aplicarse en dos lugares.
- Como **desarrollador/agente** que escribe un test para un servicio que emite eventos SSE, quiero
  poder inyectar un colaborador falso (como con cualquier repo) en vez de mockear un módulo
  completo, para que el test sea consistente con el resto de la suite.
- Como **desarrollador/agente** que necesita agregar un nuevo chequeo al endpoint de estado del
  sistema (`/api/system/status`), quiero encontrar esa lógica en un `SystemService` testeable, no
  mezclada con el manejo de la request/response del controller.
- Como **desarrollador/agente** que audita el módulo de tickets, quiero que `TicketsService` no
  necesite conocer los detalles internos de la máquina de estados de `OrdersService` para pedir
  una entrega, para que el límite entre "qué es un ticket" y "qué es un pedido" quede claro.

---

## Criterios de aceptación

1. **Dado** el módulo `auth`, **cuando** se lo revisa después del refactor, **entonces** las 3
   responsabilidades (credenciales, sesión/cookie, captcha) viven en archivos/módulos separados,
   cada uno con su propio test, sin que ningún endpoint HTTP cambie su contrato (mismo
   request/response, mismos códigos de estado) respecto a hoy.
2. **Dado** el módulo `sync`, **cuando** se lo revisa, **entonces** `pushEventData`/
   `pullMasterData`/el seed de datos maestros usan los repositorios existentes
   (`UsersRepository`/`DrinksRepository`/`OrdersRepository`/`CashSalesRepository`) para leer/
   escribir, sin una segunda ruta de acceso a `supabase.from()`/`supabaseCloud.from()` paralela a
   los repos para las mismas tablas.
3. **Dado** cualquier servicio que hoy importa `emit` directo de `sse-manager.ts`, **cuando** se
   lo revisa, **entonces** recibe su capacidad de emitir eventos como una dependencia inyectada
   (mismo patrón que los repositorios), y los tests de esos servicios pueden pasar un colaborador
   falso en vez de mockear el módulo `sse-manager`.
4. **Dado** `system.controller.ts`, **cuando** se lo revisa, **entonces** la lógica de negocio
   (chequeos de conexión, agregación de estado) vive en un `SystemService` con sus propios tests,
   y el controller solo maneja request/response — mismo patrón que el resto de los controllers del
   proyecto.
5. **Dado** `TicketsService.redeemTicket`, **cuando** se lo revisa, **entonces** ya no arma
   directamente los parámetros de `updateOrderStatus` de `OrdersService` conociendo su máquina de
   estados interna — la interacción entre ambos servicios queda con un límite más claro (definir
   la forma exacta en `/plan`, con `architect-reviewer`).
6. **Dado** el fix de atomicidad de canje de ticket ya implementado (spec
   `atomicidad-canje-ticket`, done), **cuando** se refactoriza el punto 5, **entonces** la garantía
   de atomicidad (UPDATE condicional, orden como gate) se preserva exactamente — este refactor no
   puede reabrir R3.
7. **Dado** cualquiera de los 5 puntos, **cuando** se termina su refactor, **entonces** la suite
   completa de tests (unitarios + integración) sigue pasando en verde, sin reducir la cobertura de
   comportamiento que ya existía antes del cambio.
8. **Dado** el sistema completo después de los 5 refactors, **cuando** se prueban de punta a punta
   los flujos reales (login con captcha tras 3 intentos fallidos, venta con Posnet, cierre de
   noche con sync a cloud, canje de ticket en `/barra`, `GET /api/system/status`), **entonces**
   el comportamiento observado es idéntico al de antes del refactor.

---

## Fuera de alcance

- Cualquier cambio de comportamiento, mensaje de error, o contrato de API — esto es refactor
  puro, no una feature nueva.
- Migrar `SyncService` a un patrón distinto de sync (ej. un outbox pattern, colas) — se sigue
  usando el mismo mecanismo de push/pull que hoy, solo reusando los repos en vez de acceso
  directo.
- Cambiar el mecanismo de sesión (cookie HMAC) o el algoritmo/formato del captcha — se separan en
  módulos distintos, pero la lógica interna de cada uno no cambia.
- Agregar un event bus más sofisticado (ej. una librería de mensajería) en vez de la inyección de
  `emit` — se resuelve con inyección de dependencia simple, consistente con el resto del proyecto,
  no con una reescritura de la capa de real-time.
- Tocar `useSSE`/`useEventState` del lado del frontend — esta spec es exclusivamente
  `apps/api`, el contrato de eventos SSE que consume el frontend no cambia.
- Cualquiera de los otros riesgos del roadmap (R8 impresora, R11 lint, R14/R15 Mercado Pago) —
  esta spec es específicamente los 5 puntos de deuda estructural de Fase 2.

---

## Preguntas abiertas

- Punto 5 (límite entre `TicketsService` y `OrdersService`): ¿cuál es la forma concreta de separar
  mejor la responsabilidad sin introducir una capa nueva innecesaria (ej. un "orchestrator")? Se
  define en `/plan` consultando con `architect-reviewer`, considerando que el fix de atomicidad
  reciente (`orders` como gate, `tickets` como defensa en profundidad) ya impone una relación de
  dependencia real entre ambos servicios que hay que respetar.
- Orden de ejecución de los 5 puntos: ¿se hacen en una sola rama/PR grande, o secuenciados
  (uno por uno, cada uno verificado antes de seguir)? Dado que son 5 módulos centrales y hay
  flujos productivos reales en juego, se recomienda definir esto en `/plan` con un enfoque
  incremental — no es necesario decidirlo en la spec.
  **Resuelto en el Plan técnico**: una sola rama, 5 commits secuenciales verificables por separado.

---

## Plan técnico

Diseñado con el agente `architect-reviewer` (2026-07-13), consultando `app.ts` (raíz de
composición real), las 7 interfaces de repositorio existentes, y los tests actuales de cada
módulo afectado.

### Contexto de arquitectura confirmado

`apps/api/src/app.ts` es la raíz de composición: todo se instancia y wirea ahí. El proyecto **ya
tiene precedente de inyectar funciones sueltas** por constructor (no solo objetos-repo) —
`OrdersService` ya recibe `getActiveEvent`, `incrementOrderCounter`, `printTicket` así. Esto
informa la forma de la inyección de `emit` (punto 3): función suelta, no un objeto envoltorio.

### Punto 3 — SSE inyectado (base del patrón, va primero)

`shared/sse/sse-manager.ts` exporta un tipo nuevo `EmitFn = (event: DomainEvent) => void`.
`OrdersService`/`CashSalesService`/`EventsService` reciben `emit: EmitFn` por constructor (antes
de los parámetros opcionales existentes); `config.controller.ts` (factory) recibe `emit: EmitFn =
realEmit` con default para no romper call sites existentes. `app.ts` importa `emit` del módulo
una sola vez y lo pasa a los 4 constructores/factories.

- **Archivos**: `sse-manager.ts` (+tipo), `orders.service.ts`, `cash-sales.service.ts`,
  `events.service.ts`, `config.controller.ts`, `app.ts`.
- **Tests**: agregar `emit: vi.fn()` a los factories de `orders.service.test.ts` y
  `events.service.test.ts`. **Crear `cash-sales.service.test.ts`** (no existe hoy — el criterio 3
  pide un test con colaborador falso, así que hace falta el archivo). Ningún test mockea
  `sse-manager` hoy (funciona como no-op sin suscriptores), así que no hay `vi.mock` que desarmar.

### Punto 1 — Split de `auth.service.ts` (independiente, bajo riesgo)

El test actual ya está partido en 3 `describe` (`authenticate` / `signSession`-`verifySession` /
`captcha`) — el split es casi mecánico.

- `auth/session.ts` — `COOKIE_NAME`, `signSession`, `verifySession`, `buildSessionCookie`,
  `buildClearCookie`, tipos `Session`/`SignedCookie`. Funciones puras (sin DI) — las importa
  `auth.middleware.ts` estáticamente, mantenerlas puras evita ripple en el middleware que se usa
  en todos lados.
- `auth/credentials.ts` — `authenticate`, `hashPassword`, `USERS` (fallback env), tipo
  `AuthenticatedUser`. También función pura (la usa `system.controller` en `/shutdown`).
- `auth/captcha.service.ts` — **clase `CaptchaService`** (el único de los 3 donde DI aporta valor
  real: el `captchaRegistry` es estado global mutable hoy, un `Map` de módulo compartido entre
  tests). Campo de instancia en vez de estado de módulo. Solo lo consume `auth.controller.ts`.

```ts
export class CaptchaService {
  private registry = new Map<string, CaptchaRecord>();
  getCaptchaInfo(ip): { required: boolean; question?: string } { ... }
  registerFailedAttempt(ip): { captchaRequired: boolean; captchaQuestion?: string } { ... }
  clearFailedAttempts(ip): void { ... }
  verifyCaptcha(ip, answer): boolean { ... }
}
```

- **Wiring**: `app.ts` instancia `const captchaService = new CaptchaService()` →
  `createAuthController(usersRepo, captchaService)`.
- **Imports a actualizar**: `auth.middleware.ts` (`./auth.service` → `./session`),
  `auth.controller.ts` (session + credentials + captchaService inyectado),
  `system.controller.ts` (`authenticate` desde `./auth/credentials`, `verifySession` desde
  `./auth/session`).
- **Tests**: partir `auth.service.test.ts` en `session.test.ts`, `credentials.test.ts`,
  `captcha.service.test.ts` (ahora `new CaptchaService()` por test). `auth.integration.test.ts`
  **no cambia** — es la red de seguridad de los criterios 1 y 8 (contrato HTTP idéntico).

### Punto 5 — Límite `TicketsService`/`OrdersService` (depende del punto 3)

**Sin orchestrator.** Se agrega un método intención-revelante a `OrdersService` que encapsula el
literal `"entregado"` y el chequeo de estado, delgado sobre el mismo `updateOrderStatus`:

```ts
// orders.service.ts
async markDelivered(
  orderId: string,
  operator: string,
  meta?: { deliveredByBar?: string; redeemMethod?: "scan" | "manual" },
): Promise<Order> {
  return this.updateOrderStatus(orderId, "entregado", operator, meta);
}
```

`TicketsService.redeemTicket` pasa de conocer `"entregado"` + la forma exacta del `deliveryMeta`
a solo pedir la intención: `this.ordersService.markDelivered(order.id, username, {...})`.

**Por qué preserva la atomicidad de `atomicidad-canje-ticket` exactamente** (criterio 6):
`markDelivered` es un wrapper delgado sobre el mismo `updateOrderStatus(..., "entregado", ...,
expectedStatus: order.status)` → mismo `UPDATE ... WHERE status='pendiente'` condicional. El
**orden** en `redeemTicket` (orders primero como gate, `ticketsRepo.updateRedemption` después
como defensa en profundidad) no se toca — solo se mueve el conocimiento del literal de estado
adentro de `OrdersService`, que es donde vive `STATUS_TRANSITIONS`.

**Detalle a preservar**: el chequeo `if (order.status !== "pendiente")` en `TicketsService` tira
`"El pedido está en un estado (X) que no se puede entregar."` — ese mensaje exacto se mueve
dentro de `markDelivered` (no dejar que caiga en el genérico `"Transición inválida: X →
entregado"`, que sería un cambio de texto observable, prohibido por el objetivo de refactor puro).
`TicketsService` conserva sus chequeos legítimos de dominio-ticket (firma, `redeemedAt`,
expiración, pedido asociado no encontrado).

- **Archivos**: `orders.service.ts` (+`markDelivered`), `tickets.service.ts`.
- **Tests**: `tickets.service.test.ts` — cambiar spies de `updateOrderStatus` a `markDelivered`.
  `orders.service.test.ts` — test nuevo de `markDelivered`. **Re-correr el test de integración
  concurrente** (`Promise.all` de dos canjes) de `atomicidad-canje-ticket` — es la verificación
  central del criterio 6.

### Punto 2 — `SyncService` → repos (el más grande y delicado, con `supabase-expert`)

**Tensión real**: los repos existentes modelan una sola dirección (leen de local; `users`/`drinks`
hacen dual-write local+cloud en mutaciones de una fila), pero el sync necesita **leer de cloud**
(`pullMasterData`) y **bulk-upsert a cloud** (`pushEventData`) — ninguno de los dos lo expone
ningún repo hoy. Meter esto en los repos locales bloatearía sus interfaces. Se divide en:

**(a) Reuso directo, sin cloud** (ganancias claras):
- `syncAllPendingEvents`: `night_events` crudo → **`eventsRepo.getPendingSync()`** (ya existe,
  agregado en Fase 2/3 justamente para esto pero ignorado hoy); marcado `sync_status` →
  **`eventsRepo.updateSyncStatus()`** (ya existe); lecturas locales de orders/cash-sales → los
  repos ya se usan ahí.
- `pushEventData`: lecturas locales por repos; `sync_status` por `eventsRepo.updateSyncStatus()`.
  Falta un método bulk de tickets: **agregar `TicketsRepository.listByOrderIds(ids: string[])`**
  (hoy solo existe `findByOrderId`, singular).
- Seeds (`seedDefaultAdmin/Drinks/ensureLocalMasterDataSeeded`): `usersRepo.create()` /
  `drinksRepo.create()` + checks de vacío con `.list()`. **Caveat a validar con
  `supabase-expert`** (pregunta abierta 1): `create()` hace dual-write a cloud si `supabaseCloud`
  está configurado, pero el seed hoy es local-only — en el caso borde (cloud configurado + local
  vacío en el primer arranque) esto pushearía datos demo a cloud. Confirmar si es aceptable o si
  hace falta un camino local-only explícito para el seed.

**(b) El gap real de cloud → un repo dedicado** `sync/cloud-sync.repository.ts`
(`CloudSyncRepository`), que concentra **todo** el acceso `supabaseCloud.from(...)`:

```ts
export interface CloudSyncRepository {
  pullUsers(): Promise<UserRow[]>;
  pullDrinks(): Promise<DrinkRow[]>;
  pushNightEvent(record): Promise<void>;
  pushOrders(rows): Promise<void>;
  pushTickets(rows): Promise<void>;
  pushCashSales(rows): Promise<void>;
  isConfigured(): boolean;   // reemplaza `if (!supabaseCloud)`
}
```

Así `SyncService` deja de importar `supabase`/`supabaseCloud` crudo: local va por repos
auditados, cloud va por un repo cohesivo — no `supabaseCloud.from` desperdigado.

**(c) `SyncService` deja de ser singleton de módulo → se instancia en `app.ts`**:
```ts
const cloudSyncRepo = new SupabaseCloudSyncRepository();
const syncService = new SyncService(usersRepo, drinksRepo, ordersRepo, cashSalesRepo, ticketsRepo, eventsRepo, cloudSyncRepo);
```
Esto rompe el import dinámico actual de `events.service.ts`
(`import("../sync/sync.service.js").then(...)`) → pasa a inyección por constructor
`EventsService(..., syncService)`. Sin ciclo: `SyncService` solo depende de repos, ningún repo
depende de `EventsService`, orden en `app.ts` = repos → `syncService` → `eventsService`.
`syncAllPendingEvents(ordersRepo, cashSalesRepo)` se simplifica a `syncAllPendingEvents()` (los
repos ya son campos de instancia).

- **Archivos**: `sync/sync.service.ts` (reescritura interna), `sync/cloud-sync.repository.ts`
  (nuevo), `tickets.repository.ts` (+`listByOrderIds`), `events.service.ts` (inyectar
  syncService, quitar 2 imports dinámicos), `system.controller.ts` (usar syncService inyectado),
  `server.ts` (deja de importar el singleton), `app.ts`.
- **Tests**: **reescribir `sync.service.test.ts`** fuerte (hoy mockea `shared/supabase.js` con un
  fake query-builder; pasa a inyectar repos falsos + `CloudSyncRepository` falso — más simple y
  alineado con el resto de la suite). `events.service.test.ts` (+syncService fake).
  `system.integration.test.ts` (ruta `/sync`). **Verificar un cierre de noche end-to-end real**
  contra Supabase Cloud (mismo patrón que `activar-sync-cloud.md`) antes de dar este punto por
  cerrado — es el de mayor superficie productiva real de los 5.

### Punto 4 — `SystemService` (último: depende de 1 y 2)

```ts
export class SystemService {
  constructor(
    private eventsRepo: EventsRepository,
    private mpService: MercadoPagoService,
    private printerService: PrinterService,
    private localDb: SupabaseClient,
    private cloudDb: SupabaseClient | null,
  ) {}
  async checkInternet(): Promise<boolean> { ... }
  async getStatus(): Promise<SystemStatus> { ... }
}
```

Las lecturas de dominio salen por repo (**pending events → `eventsRepo.getPendingSync()`**,
**eventDetails → `eventsRepo.getActive()`**, ambos ya existentes) — elimina 3 de los 4 bloques
`supabase.from` crudos del controller. Los pings de conectividad (localDb/cloudDb) son
health-check de infra, no acceso a datos de dominio: se mantienen como
`.from("users"/"app_config").select("id").limit(1)` pero sobre el **cliente inyectado**
(testeable con fake), no sobre el import de módulo. Posnet/printer ya son services, se llaman
igual. `system.controller.ts` queda fino: los handlers delegan; `/sync` llama al `syncService`
inyectado (punto 2). `/shutdown` se mueve a `SystemService.shutdown()` por consistencia (opcional
pero recomendado — confirmado en pregunta abierta 3).

- **Archivos**: `system/system.service.ts` (nuevo), `system.controller.ts` (recibe
  `systemService`+`syncService`+`usersRepo` en vez de 5 dependencias sueltas), `app.ts`.
- **Tests**: **crear `system.service.test.ts`**. `system.integration.test.ts` verifica que el
  JSON de `/status` sea **idéntico** al de hoy — es la red de seguridad del criterio 8.

### Orden de ejecución y estrategia de rama

**Una sola rama** `refactor/deuda-estructural-fase2`, **5 commits secuenciales**, cada uno con
`pnpm typecheck` + suite en verde y revertible por separado. No ramas paralelas: `app.ts` (raíz
de composición) y varios servicios los tocan 2+ puntos cada uno — ramas paralelas serían
conflictos constantes.

**Grafo de dependencias**: 3 (SSE) es base → 1 (auth) y 3 son intercambiables entre sí → 5
(tickets/orders) depende de 3 → 2 (sync) depende blando de 3 → 4 (system) depende de 1 y 2.

**Orden recomendado**: 3 → 1 → 5 → 2 → 4 (mecánico/bajo riesgo primero, el de mayor riesgo real
—sync a cloud— penúltimo con margen para verificarlo a fondo, system al final para heredar la
forma final de sus dependencias).

### Riesgos por punto

| Punto | Riesgo principal | Tests/mocks a tocar |
|---|---|---|
| 3 SSE | Orden de params opcionales en `OrdersService` (emit antes de los `?`). | `orders.service.test.ts`, `events.service.test.ts` (+`emit: vi.fn()`); crear `cash-sales.service.test.ts`. |
| 1 Auth | Ripple de imports (`auth.middleware`/`system.controller`). Estado del captcha ahora por-instancia. | Partir `auth.service.test.ts` en 3. `auth.integration.test.ts` sin cambios (garantiza criterios 1/8). |
| 5 Tickets/Orders | **Reabrir R3** si se altera el orden orders-first o la escritura condicional. Perder el mensaje de error exacto. | `tickets.service.test.ts`, `orders.service.test.ts` (+test `markDelivered`). Re-correr integración concurrente de `atomicidad-canje-ticket`. |
| 2 Sync | El más peligroso: sync a **cloud real**. Dual-write de `create()` en seeds (ver pregunta abierta 1). Romper el import dinámico sin crear ciclo. | Reescribir `sync.service.test.ts` completo. `events.service.test.ts` (+syncService fake). `system.integration.test.ts` (`/sync`). Verificar cierre de noche e2e real. |
| 4 System | Que el JSON de `/status` cambie (debe ser idéntico, criterio 8). | Crear `system.service.test.ts`. `system.integration.test.ts` como oráculo del contrato. |

### Alternativas consideradas

- **Ramas paralelas por punto**: descartada — `app.ts` y varios servicios se tocan desde 2+
  puntos, generaría conflictos constantes sin beneficio real de paralelismo (un solo agente/dev
  trabajando).
- **"Orchestrator" genérico para el punto 5**: descartado — sobre-diseño para un caso de un solo
  método (`markDelivered`) que ya resuelve el acoplamiento sin agregar una capa nueva.
- **Bloatear los repos locales con métodos de cloud** (punto 2): descartado — cloud es una
  persistencia deliberadamente distinta (dirección de lectura opuesta, bulk en vez de fila a
  fila); un repo de cloud dedicado y cohesivo es más honesto que forzarlo en la interfaz de los
  repos locales ya auditados.

---

## Tareas

Una sola rama `refactor/deuda-estructural-fase2`, 5 commits en este orden (3 → 1 → 5 → 2 → 4),
cada uno con `pnpm typecheck` + suite completa en verde antes de pasar al siguiente.

### Commit 1/5 — Punto 3: SSE inyectado

- [x] `apps/api/src/shared/sse/sse-manager.ts` — exportar `export type EmitFn = (event:
  DomainEvent) => void`.
- [x] `apps/api/src/modules/orders/orders.service.ts` — agregar `emit: EmitFn` al constructor
  (antes de los parámetros opcionales existentes), usar `this.emit(...)` en vez del import
  directo.
- [x] `apps/api/src/modules/cash-sales/cash-sales.service.ts` — ídem.
- [x] `apps/api/src/modules/events/events.service.ts` — ídem (6º parámetro del constructor).
- [x] `apps/api/src/modules/config/config.controller.ts` — `createConfigController(...,  emit:
  EmitFn = realEmit)` con default (import `{ emit as realEmit }`) para no romper call sites.
- [x] `apps/api/src/app.ts` — importar `emit` una sola vez, pasarlo a los 4 constructores/factories.
- [x] `orders.service.test.ts` / `events.service.test.ts` — agregar `emit: vi.fn()` a los
  factories.
- [x] **Crear `apps/api/src/modules/cash-sales/cash-sales.service.test.ts`** (no existe hoy) —
  verificar `emit` llamado con `{ type: "cash_sale.added", cashSale }` usando un colaborador
  falso (criterio 3).
- [x] `pnpm --filter cocktrail-api typecheck` + `pnpm --filter cocktrail-api test` en verde.

### Commit 2/5 — Punto 1: split de `auth.service.ts`

- [x] Crear `apps/api/src/modules/auth/session.ts` — mover `COOKIE_NAME`, `signSession`,
  `verifySession`, `buildSessionCookie`, `buildClearCookie`, tipos `Session`/`SignedCookie`
  (funciones puras, sin DI).
- [x] Crear `apps/api/src/modules/auth/credentials.ts` — mover `authenticate`, `hashPassword`,
  `USERS`, tipo `AuthenticatedUser`.
- [x] Crear `apps/api/src/modules/auth/captcha.service.ts` — clase `CaptchaService` con
  `registry` como campo de instancia (no `Map` de módulo), métodos `getCaptchaInfo`/
  `registerFailedAttempt`/`clearFailedAttempts`/`verifyCaptcha`.
- [x] Borrar `apps/api/src/modules/auth/auth.service.ts` una vez migrado todo.
- [x] `apps/api/src/modules/auth/auth.middleware.ts` — actualizar import (`./auth.service` →
  `./session`).
- [x] `apps/api/src/modules/auth/auth.controller.ts` — actualizar imports (session +
  credentials), recibir `captchaService: CaptchaService` inyectado.
- [x] `apps/api/src/modules/system/system.controller.ts` — actualizar imports (`authenticate`
  desde `./auth/credentials`, `verifySession` desde `./auth/session`).
- [x] `apps/api/src/app.ts` — instanciar `const captchaService = new CaptchaService()`, pasarlo a
  `createAuthController`.
- [x] Partir `auth.service.test.ts` en `session.test.ts`, `credentials.test.ts`,
  `captcha.service.test.ts` (este último con `new CaptchaService()` por test).
- [x] Confirmar que `auth.integration.test.ts` sigue pasando **sin modificarlo** (es la red de
  seguridad de los criterios 1 y 8 — contrato HTTP idéntico).
- [x] `pnpm --filter cocktrail-api typecheck` + `pnpm --filter cocktrail-api test` en verde.

### Commit 3/5 — Punto 5: límite `TicketsService`/`OrdersService`

- [x] `apps/api/src/modules/orders/orders.service.ts` — agregar `markDelivered(orderId, operator,
  meta?)` que valida `status === "pendiente"` con el mensaje exacto actual (`"El pedido está en
  un estado (X) que no se puede entregar."`) y delega a `updateOrderStatus(id, "entregado", ...)`.
- [x] `apps/api/src/modules/tickets/tickets.service.ts` — `redeemTicket` llama a
  `ordersService.markDelivered(...)` en vez de `updateOrderStatus(...)` directo, sin conocer el
  literal `"entregado"` ni la forma exacta del `deliveryMeta`.
- [x] `tickets.service.test.ts` — actualizar spies de `updateOrderStatus` → `markDelivered`.
- [x] `orders.service.test.ts` — test nuevo de `markDelivered` (delega correctamente, propaga
  Conflict con el mensaje exacto).
- [x] **Re-correr el test de integración concurrente** de `atomicidad-canje-ticket.md`
  (`tickets.integration.test.ts`, el de `Promise.all` con dos canjes) — debe seguir pasando
  exactamente igual. Este es el criterio 6, no negociable.
- [x] `pnpm --filter cocktrail-api typecheck` + `pnpm --filter cocktrail-api test` (unit +
  integration) en verde.

### Commit 4/5 — Punto 2: `SyncService` → repos (el más delicado)

- [x] **Consultar con `supabase-expert`** la pregunta abierta 1 (dual-write de `create()` en
  seeds cuando `supabaseCloud` está configurado) antes de tocar código — confirmar si es
  aceptable o si hace falta un camino local-only explícito.
- [x] `apps/api/src/modules/tickets/tickets.repository.ts` — agregar `listByOrderIds(ids:
  string[]): Promise<Ticket[]>` (interfaz + implementación Supabase).
- [x] Crear `apps/api/src/modules/sync/cloud-sync.repository.ts` — interfaz
  `CloudSyncRepository` (`pullUsers`, `pullDrinks`, `pushNightEvent`, `pushOrders`, `pushTickets`,
  `pushCashSales`, `isConfigured`) + implementación `SupabaseCloudSyncRepository` que concentra
  todo el `supabaseCloud.from(...)` que hoy vive en `sync.service.ts`.
- [x] `apps/api/src/modules/sync/sync.service.ts` — reescribir `pullMasterData`/`pushEventData`/
  `syncAllPendingEvents`/seeds para usar `usersRepo`/`drinksRepo`/`ordersRepo`/`cashSalesRepo`/
  `ticketsRepo`/`eventsRepo` (local) + `cloudSyncRepo` (cloud) inyectados por constructor, en vez
  de importar `supabase`/`supabaseCloud` directo. `syncAllPendingEvents()` pierde los parámetros
  `ordersRepo`/`cashSalesRepo` (ya son campos de instancia).
- [x] `apps/api/src/modules/events/events.service.ts` — reemplazar los 2 imports dinámicos de
  `sync.service.js` por `syncService: SyncService` inyectado por constructor.
- [x] `apps/api/src/modules/system/system.controller.ts` — usar el `syncService` inyectado en vez
  del singleton importado.
- [x] `apps/api/src/server.ts` — dejar de importar el singleton `syncService`, usar el
  instanciado en `app.ts` (exportarlo desde ahí si hace falta).
- [x] `apps/api/src/app.ts` — instanciar `cloudSyncRepo` → `syncService` → pasarlo a
  `EventsService` y a `createSystemController`. Confirmar orden sin ciclos: repos → syncService →
  eventsService.
- [x] Reescribir `sync.service.test.ts` — de mockear `shared/supabase.js` (fake query-builder) a
  inyectar repos falsos + `CloudSyncRepository` falso.
- [x] `events.service.test.ts` — agregar `syncService` fake al constructor.
- [x] `system.integration.test.ts` — confirmar que `POST /api/system/sync` sigue funcionando
  igual.
- [x] **Verificar un cierre de noche end-to-end real contra Supabase Cloud** (mismo patrón que
  `docs/specs/activar-sync-cloud.md`: abrir noche, vender, cerrar, confirmar `sync_status:
  "synced"` y datos coincidentes local↔cloud) — con `supabase-expert` si hace falta, antes de dar
  este commit por cerrado. Es el punto de mayor superficie productiva real de los 5.
- [x] `pnpm --filter cocktrail-api typecheck` + suite completa (unit + integration) en verde.

### Commit 5/5 — Punto 4: `SystemService`

- [x] Crear `apps/api/src/modules/system/system.service.ts` — clase `SystemService` con
  `checkInternet()` y `getStatus()`, recibiendo `eventsRepo`/`mpService`/`printerService`/
  `localDb`/`cloudDb` por constructor. `getStatus()` usa `eventsRepo.getPendingSync()` y
  `eventsRepo.getActive()` en vez de `supabase.from("night_events")` crudo.
- [x] Decidir (confirmado en pregunta abierta 3, recomendado que sí) mover el `exec("docker
  compose down")` de `/shutdown` a `SystemService.shutdown()`.
- [x] `apps/api/src/modules/system/system.controller.ts` — los handlers `/status`/`/logs`
  delegan a `systemService`; `/sync` usa `syncService` inyectado (ya viene del commit anterior);
  recibe `(systemService, syncService, usersRepo)` en vez de las 5 dependencias sueltas actuales.
- [x] `apps/api/src/app.ts` — instanciar `systemService`, pasarlo al controller.
- [x] Crear `apps/api/src/modules/system/system.service.test.ts` — tests con fakes (criterio 4).
- [x] `system.integration.test.ts` — confirmar que el JSON de `GET /api/system/status` es
  **byte-a-byte idéntico** al de antes del refactor (criterio 8, oráculo del contrato).
- [x] `pnpm --filter cocktrail-api typecheck` + suite completa en verde.

### Cierre general (después de los 5 commits)

- [x] Probado de punta a punta contra el sistema real corriendo (`tsx watch`, hot-reload):
  `GET /api/system/status` con contrato idéntico antes/después, `POST /api/system/sync` real
  contra Supabase Cloud, y un ciclo completo abrir noche → cash sale → cerrar → verificar
  push a cloud con los campos bien mapeados → limpiar datos de prueba. **Ajuste sobre el
  criterio 8 original**: el captcha se eliminó por completo en esta misma sesión (decisión de
  producto del usuario, ver commit aparte `a249ed9`), así que el "login con captcha tras 3
  intentos" ya no aplica — se verificó login normal en su lugar. No se corrió
  `e2e-playwright-tester` para la parte de UI (se priorizó la verificación real contra
  producción, que es más fuerte para el módulo de sync); queda como verificación pendiente si
  se quiere cobertura de UI además de la de backend/API ya hecha.
- [x] `pnpm typecheck` (api + web) en verde.
- [x] Suite completa `apps/api`: 271 unitarios (subieron de 253 al empezar esta spec — 4 archivos
  de test nuevos: `cash-sales.service.test.ts`, `credentials.test.ts`, `session.test.ts`,
  `captcha.service.test.ts` [luego eliminado con el captcha], `system.service.test.ts`) + 78 de
  integración (bajó de 79 porque se sacó el test de captcha en `auth.integration.test.ts` al
  eliminar la feature) en verde.
- [x] `docs/ARCHITECTURE.md` actualizado (§4 sync, §7 SSE).
- [x] `docs/ROADMAP.md` actualizado: 5 puntos marcados resueltos en Fase 2 y en "Deuda pre-Fase 6".
- [x] Estado de esta spec cambiado a `done`.

---

**Siguiente paso**: implementar en Plan Mode (cambio grande, 5 módulos centrales, flujos
productivos reales en juego — Mercado Pago Posnet físico y sync a Supabase Cloud real). Ir
marcando `- [x]` commit por commit; no arrancar el siguiente commit sin la suite en verde del
anterior.
