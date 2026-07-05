# Cocktrail / BarQR — Roadmap

> Estado y plan de trabajo. La arquitectura vigente está en [`ARCHITECTURE.md`](./ARCHITECTURE.md).
> Convención: `[x]` hecho · `[~]` parcial/a verificar · `[ ]` pendiente.
> Última actualización: 2026-07-05.

---

## Fase actual — MVP local-first para el boliche de prueba

**Objetivo**: que el sistema funcione completo en una máquina local del boliche (mini-PC/laptop),
sin depender de internet, con caja + reconciliación a la nube al cerrar la noche. El pedido por LAN
(`/carta` + `/barra`) está programado y corre, pero su validación queda para la Fase 7 (ver nota abajo).

### Ya construido
- [x] Monorepo pnpm (`apps/api` Express + `apps/web` Next.js 16 + `packages/shared`).
- [x] Persistencia en **Supabase local** (Postgres) como fuente de verdad.
- [x] **Sync local → cloud** al cerrar la noche + reintento de pendientes al bootear.
- [x] **Pull de datos maestros** cloud → local (users, drinks).
- [x] Operación **offline-first** (si no hay nube, todo sigue funcionando).
- [x] **Boot autocurativo** (levanta `supabase start` / `docker compose` solo).
- [x] **Auto-cierre por día calendario** (zona AR).
- [x] 3 roles (`admin/caja/barman`) con permisos granulares + captcha + rate limiting.
- [x] **Mercado Pago real** (Point/Posnet físico).
- [x] Real-time por SSE (KDS barra, ticket cliente, totales admin).
- [x] Tickets con código HMAC + canje (escáner o manual).
- [x] Audit logs.
- [x] **Impresora térmica** (Fase 1, ver abajo) + **Abrir Noche manual** con palabra clave.

### Pendiente de esta fase
- [ ] **Documentación consolidada** (este commit): `docs/ARCHITECTURE.md` + `ROADMAP.md`, `CLAUDE.md` reescrito, `AGENTS.md`, README. *(en progreso)*
- [x] **Limpieza de código muerto**: borrados los repos `LocalJSON*` / `InMemory*` (~397 líneas) y los `apps/api/src/data/*.json`. Verificado: `app.ts` solo usa `Supabase*Repository`, sin tests afectados, `pnpm typecheck` pasa. Se conservaron `SEED_DRINKS` (lo usa `sync`), `hashPassword` y `DEFAULT_CONFIG`.
- [x] **Resuelto el mismatch de `docker-compose.yml`** (R1): ahora levanta un stack Supabase mínimo (db + PostgREST + Kong) que expone la REST en `:54321`. Verificado con curl. Ver `docs/DEPLOY.md`.
- [ ] **Migración faltante**: la columna `night_events.totals` que usa el sync no está en las migraciones locales. Agregarla o documentar que es cloud-only.
- [ ] **Guía de despliegue en la mini-PC**: `docs/DEPLOY.md` con pasos reproducibles (instalar Docker/Supabase CLI, env, arranque, acceso por LAN, generación del QR).
- [ ] **Activar el sync cloud** (la lógica ya existe en `sync.service.ts`; falta config): el usuario YA tiene proyecto en supabase.com. Pasos: (1) asegurar que el esquema cloud matchea las migraciones + la columna `night_events.totals` (R2); (2) setear `SUPABASE_CLOUD_URL` + `SUPABASE_CLOUD_SERVICE_ROLE_KEY` en `apps/api/.env`; (3) probar un cierre de noche con internet y confirmar el push. Diferido a pedido del usuario.
- [ ] **Verificación E2E del flujo demo que SÍ se prueba ahora**: venta directa en **caja** (la cajera elige el trago en `/caja`, cobra — efectivo/Posnet/QR — y se genera el ticket con código) → **cerrar noche** desde `/admin` → **sync** a Supabase Cloud. El cliente retira el trago en barra físicamente, pero eso es logística del local, no un paso de software a validar.
- [ ] **Tests**: smoke/E2E con Playwright de los **2 flujos activos** (`/caja`, `/admin`). Ver nota abajo sobre qué queda fuera y por qué.
- [ ] Revisar **atomicidad del canje de ticket** (evitar doble canje bajo concurrencia).

> 📌 **Nota — `/carta`, el ticket virtual y `/barra` quedan fuera de la validación hasta la Fase 7**:
> las tres pantallas del **flujo digital del cliente** (`/carta` para armar el pedido por QR, la pantalla
> del ticket con estado en vivo, y `/barra` para que el barman lo canjee) **están programadas y el
> código corre**, pero **no se van a validar/probar ahora** — el acceso rápido a `/barra` en `/login`
> directamente está deshabilitado (no aparece en "Accesos Rápidos"; el rol `barman` sigue existiendo
> en el backend).
>
> **Por qué**: ese flujo completo (carta → ticket → barra) se va a **rediseñar junto con la Fase 7**
> (pedido online), incluyendo cómo se sincroniza un pedido creado en la web con la barra local. No
> tiene sentido validarlo dos veces — se prueba una sola vez, ya rediseñado, al cerrar esa fase.
>
> **Qué se prueba en cambio, ahora**: el flujo real del local es **caja → barra físico** (sin apps):
> el cliente pide el trago en la barra/caja, la cajera lo carga y cobra en `/caja`, imprime el ticket
> (Fase 1, impresora térmica) y se lo entrega para que lo retire. Ese es el circuito que hoy se valida
> de punta a punta, junto con `/admin` para el cierre de noche y el sync.

---

## Fase 1 — Tickets + impresora térmica 🖨️ *(completa)*

**Objetivo**: cuando se vende un trago en caja, imprimir un ticket físico (POS 58mm) para que el
cliente lo retire en la barra. El dueño ya compró la impresora térmica.

- [x] Integrar impresora térmica NICTOM IT06 (POS58, USB, protocolo ESC/POS). Módulo
  `apps/api/src/modules/printer/` — bytes ESC/POS crudos escritos directo a `/dev/usb/lp*`
  (detección automática por glob), **sin CUPS** (el backend USB bidireccional de CUPS falla
  silenciosamente con este clon) y sin librerías npm externas.
- [x] Imprimir el ticket al confirmar la venta en caja, automático y solo para ventas de staff
  (`createdBy !== "Cliente"`, no para pedidos anónimos de `/carta`). Contenido: nombre del local y
  tragos en letra grande, número de venta + fecha + **palabra clave de la noche** + primeros 4
  caracteres del `ticketCode` (HMAC) como respaldo de auditoría, en tamaño normal.
- [x] Manejo de errores de impresión (sin papel / desconectada) sin frenar la venta: la venta se
  registra igual, `/caja` muestra aviso + botón de reintento.
- [x] Estado real de la impresora + botón "Imprimir ticket de prueba" — quedó en **`/caja`**, no en
  `/admin` (ajuste de alcance pedido durante la implementación: es donde efectivamente se opera).
- [x] **Cambio de alcance sumado**: "Abrir Noche" pasó de automática a **manual** desde `/admin`, con
  palabra clave obligatoria (`night_events.keyword`) — necesario para que la clave tenga un momento
  real de apertura, y de paso deja `startedAt` preciso para medir horas trabajadas a futuro. Ver
  `docs/specs/impresora-termica.md`.
- [ ] Corte automático de papel — la impresora es una comandera simple sin cuchilla, queda fuera de
  alcance (se corta a mano).

---

## Fase 2 — Auditoría API 🔍 *(completa)*

**Objetivo**: dejar `apps/api` con tests reales (Vitest + Supertest) y auditada contra SOLID/clean
code, módulo por módulo, antes de tocar el frontend. Ver `docs/specs/auditoria-api.md`.

- [x] Setup del test runner: Vitest + Supertest, tests unitarios co-ubicados + integración contra
  Supabase local real (`apps/api/tests/integration/`), con `fileParallelism` desactivado para
  integración (los archivos comparten la misma DB real).
- [x] Los 9 módulos (`config, tickets, auth, drinks, orders, users, events, sync, system`) con
  tests de caracterización, auditados con `architect-reviewer`, y con los fixes de bajo riesgo ya
  aplicados. 102 tests unitarios + 78 de integración, `pnpm typecheck` en verde.
- [x] **Seguimiento post-auditoría (rama `simplificar-estados-pedido-y-cajavip`)**: se revisó en
  vivo qué eran `cajavip` y el flujo de estados `pagado/preparando/listo/entregado` — ninguno tenía
  operación manual real detrás (el canje de ticket ya saltaba directo a `entregado`). Se eliminó
  `cajavip` (usuario de sistema sin uso confirmado) y se colapsó `OrderStatus` a 3 valores
  (`pendiente`, `entregado`, `cancelado`) en `packages/shared/src/domain.ts` + toda la API y la
  web. Los tests de `orders`/`tickets`/`users` de esta fase se actualizaron al nuevo modelo (96
  unitarios + 78 de integración tras el cambio — bajó de 102 a 96 unitarios porque la máquina de
  estados pasó de 6 transiciones válidas a 2). Sin migraciones (la columna `orders.status` es
  `TEXT` libre, sin `CHECK`).
- [x] **Bug real corregido**: `POST /api/config` con `theme` hacía doble escritura a DB y doble
  emit SSE.
- [x] **R5 resuelta**: eliminada la credencial hardcodeada `cajavip/cajavip` de `auth.service.ts`
  — si alguien la usaba para operar, hay que crear un usuario real con rol `caja` en
  `/admin → Usuarios`.
- [x] **Hallazgo de seguridad corregido**: `GET /api/system/logs`, `GET /api/system/status` y
  `POST /api/system/sync` no tenían **ningún** middleware de auth pese a estar documentados como
  protegidos por rol `staff` — cualquiera en la LAN podía ver audit logs, estado interno del
  sistema y disparar un sync completo. Se agregó `authMiddleware` + `requireRole`.
- [x] Limpieza: eliminados 2 métodos `clear()` vestigiales (tickets/orders repository, no-ops de
  una implementación in-memory anterior sin callers). `AuditLogsService` inyectado en vez de
  import estático en config/tickets/drinks/orders/users. Varios `any` tipados. `mapRowToEvent`
  extraído (estaba duplicado 5 veces). Seeding de admin/drinks por defecto desduplicado en `sync`.
- [ ] **Deuda estructural documentada, no resuelta en esta fase** (candidatos para cuando se
  decida abordarlas, no bloquean nada hoy): `auth.service.ts` mezcla autenticación + firma de
  sesión + captcha en un archivo; `SyncService` bypasea los repositorios existentes y pega directo
  a Supabase (`users`/`drinks`/`orders`/`cash-sales` duplican el mismo patrón de sync a cloud);
  `emit` (SSE) se llama directo desde `orders.service.ts`/`events.service.ts` en vez de una capa
  de infra separada; `system.controller.ts` no tiene Service propio; `TicketsService.redeemTicket`
  orquesta directamente la máquina de estados de `OrdersService`.
- [ ] **Fuera de alcance de esta fase** (sin tests/auditoría todavía): módulos `printer`,
  `mercadopago`, `cash-sales`, `audit-logs`, `sse`.

---

## Fase 3 — Auditoría Web 🎨 *(completa)*

**Objetivo**: mismo tratamiento que la Fase 2 pero para `apps/web` — el problema principal eran los
god-components: `AdminClient.tsx` (3425 líneas), `CajaClient.tsx` (2186), `BarraClient.tsx` (1517).
Modularizar (hooks, subcomponentes, separar lógica de negocio de presentación), auditar contra
SOLID/clean code con `architect-reviewer` + `expert-react-frontend-engineer` +
`expert-nextjs-developer`, y agregar tests donde corresponda. Spec completa (problema, objetivo,
plan técnico, tareas) en `docs/specs/auditoria-web.md` (estado `done`), rama `refactor/auditoria-web`.

- [x] Setup: Vitest + React Testing Library + jsdom instalado en `apps/web` (no había nada antes).
- [x] **`AdminClient.tsx` completo**: 3418 → 724 líneas (-79%). Las 5 vistas que seguían inline
  (Dashboard/Monitoreo, Estadísticas, Historial, Logs, QR) se extrajeron a
  `components/admin/*Section.tsx`, cada una con su/sus test(s) de caracterización (18 tests en
  total). Se extrajo también `hooks/useAdminAnalytics.ts` (el `useMemo` gigante compartido por
  Monitoreo/Estadísticas) y 4 componentes compartidos a `components/shared/`
  (`MetricCard`/`Sparkline`/`AnimatedNumber`/`EmptyCard`).
- [x] **Bug real corregido**: `useAdminAnalytics` se llamaba dos veces con los mismos argumentos
  (una en el shell, otra dentro de la vista extraída), recalculando el mismo `useMemo` en cada
  render — se fijó como patrón obligatorio que el hook se llama **una sola vez** en el shell y el
  resultado se pasa por prop a las vistas.
- [x] Limpieza de lint post-extracción: 43 problemas sueltos en `AdminClient.tsx` (1 error real de
  `react-hooks/set-state-in-effect`, 42 imports/estado/funciones muertas) — `eslint` en 0.
- [x] **`CajaClient.tsx` completo**: 2182 → 447 líneas (-80%). `VentaSection.tsx` (grid + carrito +
  checkout Posnet, con `hooks/useCheckout.ts` y `hooks/usePrinterStatus.ts`),
  `HistorialSection.tsx` (filtro por día + búsqueda + scroll infinito + popup de detalle/reimpresión)
  y `MetricasSection.tsx` (gráfico horario + widgets), cada una con tests de caracterización.
  Código muerto eliminado: `confirmOrderWithMethod`, `mapStatus`, `getPaginationRange`.
- [x] **`BarraClient.tsx` completo**: 1517 → 863 líneas (-43%). `hooks/useOfflineScanQueue.ts`
  extraído primero como unidad atómica (el bloque de mayor riesgo de toda la fase: cola offline +
  `localStorage` + `navigator.onLine` + reintentos con `setInterval`), con test de caracterización
  antes de tocar el resto de la pantalla. Después: `components/barra/PendingOrdersList.tsx`,
  `ManualRedeemModal.tsx`, `CancelOrderModal.tsx`, `DevPanel.tsx` (sin test, no corre en producción)
  y componentes genéricos (`SectionTitle`/`Stat`/`Sep`) migrados a `components/shared/`. Estado
  muerto eliminado: `customReason`.
- [x] Cierre de fase: `tsc --noEmit` + `eslint` + `vitest run` (52/52) + `next build` de punta a
  punta en verde. Fix mecánico pendiente encontrado durante el cierre: `react-hooks/set-state-in-effect`
  en el `useEffect` de `fetchPendingOrders` de `BarraClient.tsx` (mismo patrón preexistente ya
  suprimido en otros 7 lugares del código — fetch-on-mount async, no es un bug real, la regla no
  distingue `setState` detrás de un `await`).

**Hallazgos documentados al cierre de esta fase** — **todos resueltos** (`useSSE` centralizado
en la feature `usesse-centralizado` post-Fase 3C, el resto en la Fase 3B, ver abajo):
`useSSE` centralizado sin descomponerse; `activeTab === "estadisticas"` sin link; `dynamicAlerts`
duplicado con `smartInsights`; `ToastItem` con timer que se resetea; `renderSidebar` sin extraer
(solo existía en `CajaClient`).

---

## Fase 3B — Auditoría Web: componentes sueltos + deuda de Fase 3 🎨 *(completa)*

**Objetivo**: la Fase 3 dejó ~22 componentes de `apps/web/src/components/` (los que ya existían
antes de esa auditoría) sin test ni revisión SOLID, y 5 hallazgos documentados sin resolver. Mismo
tratamiento que Fases 2/3: tests de caracterización + auditoría (`architect-reviewer` +
`expert-react-frontend-engineer`) + fixes de bajo riesgo. Spec completa en
`docs/specs/auditoria-web-componentes.md` (estado `done`), rama `refactor/auditoria-web-componentes`.

- [x] **22 componentes auditados en 4 bloques** por riesgo/paralelizabilidad: triviales
  (`BrandLogo`/`DrinkSkeleton`/`OSHeadbar`/`SafeDeleteModal`/`DrinkCard`), `analytics/*` (7,
  presentacionales), `settings/*` (4, tocan servicios reales), y modales/flujos críticos uno por uno
  (`ThemeProvider`/`OpenNightModal`/`CloseNightModal`/`CashSaleModal`/`Ticket`/`TicketLive`;
  `barra/DevPanel` sin test a propósito, no corre en producción). 109 tests nuevos (52 → 161 en
  `apps/web`, incluida la deuda de Fase 3 resuelta).
- [x] **Bug real más serio de la fase**: en `CloseNightModal.tsx` los 4 `setTimeout` de la secuencia
  de "carga ficticia" (3.2s) nunca se cancelaban — si el modal se desmontaba a mitad de camino, el
  timer final igual disparaba `onConfirm` (el cierre de noche real + sync a cloud) sobre un
  componente ya desmontado. Corregido con `isMounted`/`pendingTimers` (refs) + cleanup.
- [x] Mismo patrón de bug ("modal montado permanentemente, solo `return null`" sin resincronizar
  estado al reabrir) encontrado también en `OpenNightModal` (podía mostrar la palabra clave vieja de
  la noche — dato impreso en cada ticket físico) y `CashSaleModal` (dejaba un monto "borrador"
  pegado). Corregidos con el patrón de React "ajustar estado durante el render".
- [x] **Los 5 hallazgos documentados en la Fase 3 quedaron resueltos**: `ToastItem` (timer movido a
  un `ref`, ya no se resetea con cada re-render del padre); `dynamicAlerts` reemplazado por
  `<SmartInsights>` con los datos de `analytics.smartInsights` (antes calculados pero nunca
  mostrados) — confirmado con el usuario, cambia lo que ve el admin en el Dashboard; se agregó el
  link "Estadísticas" al sidebar — confirmado con el usuario; `renderSidebar` extraído a
  `components/caja/Sidebar.tsx` (`CajaSidebar`) — solo existía en `CajaClient`, `BarraClient` nunca
  tuvo ese patrón (su panel lateral ya era `PendingOrdersList`, un componente propio desde la Fase 3).
- [x] Regresión real encontrada y corregida durante la propia fase: el fix de accesibilidad de
  `DrinkCard.tsx` (Bloque A, `aria-label` en los botones +/-) rompió un test existente de Fase 3
  (`VentaSection.test.tsx`) que asumía un solo botón "Agregar" en el DOM.
- [x] Cierre de fase: `tsc --noEmit` + `eslint` + `vitest run` (161/161) + `next build` de punta a
  punta en verde.

- [x] **Reorganización por dominio de los 11 componentes sueltos** (hallazgo pedido por el usuario
  fuera del plan técnico original, ver R10 — ejecutado en rama aparte
  `refactor/reorganizar-componentes-web`): `BrandLogo`/`OSHeadbar`/`DrinkCard`/`DrinkSkeleton`/
  `SafeDeleteModal`/`CloseNightModal` → `shared/` (cross-cutting), `CashSaleModal`/`OpenNightModal` →
  `admin/`, `Ticket`/`TicketLive` → `carta/` (nueva). `ThemeProvider` se queda en la raíz de
  `components/` (envuelve `layout.tsx`, no es "de un dominio"). `tsc`+`eslint`+`vitest`(161/161)+
  `build` en verde.

**Hallazgos documentados al cierre de esta fase** — **todos resueltos** (la mayoría en la Fase
3C, `useSSE` centralizado en la feature aparte `usesse-centralizado`) salvo 1 que se mantiene:
- `CloseNightModal`: la "carga ficticia" de 3.2s con mensajes que no reflejan trabajo real —
  **deuda que se mantiene**, es una decisión de producto/UX pendiente de revisar, no técnica.
- ~~`useSSE` centralizado en los 3 shells~~ (resuelto — ver "Feature — useSSE centralizado" más
  abajo, hecha después de cerrar la Fase 3C).
- ~~`apps/web/src/services/*.ts` sin auditar~~ (resuelto, Bloque 1: 46 tests nuevos).
- ~~Patrón "modal montado permanentemente"~~ (resuelto, Bloque 4: migrados a montaje condicional;
  `CashSaleModal` se eliminó en vez de migrarse, ver Fase 3C).
- ~~`Ticket.tsx` duplica el render de cada `OrderItem`~~ (resuelto, Bloque 3: `TicketItemRow`).
- ~~`Drink.vibe` nunca se mostraba en la UI~~ (resuelto, Bloque 2: visible en `DrinkCard`/`/carta`).
- ~~`GeneralSection`/`PagosSection` tragaban errores sin feedback visual~~ (resuelto, Bloque 3:
  `Toast` compartido).
- ~~`UsuariosSection.tsx`/`CartaSection.tsx` god-components~~ (resuelto, Bloque 4: partidos en
  tabla+formulario).
- ~~Duplicación de `accentColor`/`accentBg`/`accentBorder` en `analytics/*`~~ (resuelto,
  `lib/accentColors.ts`).
- ~~Duplicación del estado-vacío en `NightRecords`/`RevenueByProduct`/`NightEvolutionChart`~~
  (resuelto, `components/shared/EmptyState.tsx`).
- ~~`OSHeadbar.tsx` mezclaba dos componentes~~ (resuelto, separado en `OSHeadbar.tsx`/
  `OSProfileFooter.tsx`).
- ~~`CashSaleModal.tsx`: validación inalcanzable~~ — ya no aplica, el archivo se eliminó.

---

## Fase 3C — Deuda documentada de Fase 3B 🎨 *(completa)*

**Objetivo**: resolver los 6 hallazgos no-mecánicos documentados al cierre de la Fase 3B (arriba)
+ 3 findings mecánicos, mismo tratamiento SDD que las fases anteriores. Spec completa en
`docs/specs/fase-3c-deuda-web-componentes.md` (estado `done`), rama `refactor/fase-3c-deuda-web`.

- [x] **Bloque 1 — `apps/web/src/services/*.ts` auditado**: 46 tests nuevos (207 total en
  `apps/web`). `api-client.test.ts` mockea `fetch` global (única vez que se prueba `apiFetch` de
  verdad); los otros 9 servicios mockean `apiFetch` y solo verifican path/method/body. Revisión
  SOLID con `expert-react-frontend-engineer`: consistentes, 2 fixes triviales (tipos inline en
  `events.service.ts`, `PrinterStatus.configured` tipado como literal `true` en vez de `boolean`).
- [x] **Bloque 2 — `Drink.vibe` visible en la carta**: `DrinkCard` ya tenía la prop `vibe?` sin
  usar; ahora se renderiza como subtítulo en ambas variantes. `carta/page.tsx` y `VentaSection.tsx`
  ya spreadeaban el `Drink` completo, no hizo falta tocarlos.
- [x] **Bloque 3 — `Toast` compartido + `TicketItemRow`**: `components/shared/Toast.tsx` extraído
  del `ToastItem` local de `PendingOrdersList.tsx` (variante éxito/error), reusado para dar
  feedback de error en `GeneralSection`/`PagosSection`/`CartaSection` (antes solo
  `console.error`). `components/carta/TicketItemRow.tsx` extraído de `Ticket.tsx`, elimina el
  `drinks.find` duplicado entre "Ticket de Control" y "Recibo de Pago".
- [x] **Bloque 4 — Modales a montaje condicional + god-components partidos**: de los 9 modales
  candidatos, 5 ya estaban bien (`VentaSection.tsx` ya usaba montaje condicional,
  `CancelOrderModal`/`ManualRedeemModal` en `BarraClient` también). Se migraron 3
  (`OpenNightModal` modo `edit`, `CloseNightModal`, `SafeDeleteModal`), eliminando los workarounds
  `prevOpen`/`isMounted`/`key`-remount. `UsersTable`+`UserFormDrawer` extraídos de
  `UsuariosSection.tsx` (593→265 líneas); `DrinksTable`+`DrinkFormModal` extraídos de
  `CartaSection.tsx` (658→261 líneas, con el input de `vibe` nuevo).
- [x] **Hallazgo mayor — `CashSaleModal` era una feature muerta, no un bug de montaje**: la
  verificación E2E post-migración reveló que el botón que debía abrirlo (`setCashOpen(true)`)
  nunca existió en ningún commit del historial del repo — el modal era inalcanzable desde el
  primer commit. Investigando el propósito (`lib/totals.ts` documenta que es para que el
  **barman** cargue efectivo fuera del checkout digital) se confirmó que no hay caso de uso real
  que `VentaSection.tsx` (`/caja`, efectivo/débito/QR + ticket impreso) no cubra ya. Se **eliminó**
  la feature completa del frontend (`CashSaleModal.tsx`, `cash-sales.service.ts` y sus tests) en
  vez de agregarle un botón. El backend (`apps/api/src/modules/cash-sales/`, tabla `cash_sales`,
  `computeTotals`) queda intacto — sigue siendo necesario para totales/sync de eventos cerrados.
- [x] **Findings mecánicos resueltos** (`accentColor`/`EmptyState`/`OSHeadbar`, ver lista de la
  Fase 3B arriba).
- [x] Cierre de fase: `tsc --noEmit` + `eslint` (en archivos tocados; ver R11 abajo) +
  `vitest run` (223/223, subió de 161 al cierre de 3B) + `next build` de punta a punta en verde.

---

## Feature — `useSSE` centralizado (deuda de Fase 3B) 🔌 *(completa)*

**Objetivo**: resolver el último hallazgo abierto de Fase 3B — no era un problema del hook
`useSSE.ts` en sí (genérico, tipado, ~86 líneas, bien hecho), sino que `AdminClient.tsx` y
`CajaClient.tsx` duplicaban byte a byte la función `refetch()` y el manejo de los 5 eventos SSE
(`order.created`/`order.updated`/`cash_sale.added`/`event.opened`/`event.closed`), y ningún
shell tenía un solo test de integración SSE. Spec completa en
`docs/specs/usesse-centralizado.md` (estado `done`), sin rama aparte (se implementó directo en
`develop`, feature acotada y de bajo riesgo estructural una vez con tests).

- [x] `apps/web/src/lib/__testUtils__/fakeEventSource.ts` (nuevo) — doble de test de
  `EventSource` con `emit`/`emitOpen`/`emitRaw`, usado tanto para `useSSE.test.ts` (5 tests,
  hoy inexistente) como para `useEventState.test.ts`.
- [x] `apps/web/src/hooks/useEventState.ts` (nuevo, 15 tests) — hook compartido para
  Admin+Caja únicamente (`BarraClient.tsx` queda afuera a propósito, su modelo de estado —cola de
  pendientes, toasts, modo dev— no comparte el molde de upsert-por-id). Expone `setEvent`/
  `setSummary` (sin invariante que proteger, reemplazo completo) y `upsertOrder` (con invariante
  de upsert-por-id, en vez de exponer `setOrders` crudo).
- [x] **3 hallazgos que el diseño original no contempló, corregidos antes/durante la
  implementación** (todos vía revisión del código real, no solo del diseño en abstracto):
  1. `onOpen` (reconexión SSE) no era idéntico entre shells — Admin también refresca logs ahí.
     Resuelto sin agregar un tercer callback: `onOpen` llama `refetch()` y, si hay `onActivity`,
     también `onActivity()`.
  2. `AdminClient` recibe `initialEvent`/`initialOrders`/`initialCashSales` como props (su
     página padre ya hace su propio `getState()` antes de montarlo, para no mostrar un instante
     de vacío) — `CajaClient` no. Se agregó `options.initial` al hook para que Admin no pierda
     esa garantía.
  3. El handler `event.closed` de ambos shells originales también llamaba `refetch()`, no solo
     `setSummary`/abrir el modal — se había omitido en el diseño inicial.
  4. `CajaClient` tenía `handleOrderUpdated` (pasado a `HistorialSection`) que sincronizaba un
     pedido tras cancelar/reimprimir un ticket vía HTTP directo, sin esperar el eco SSE — resuelto
     con `upsertOrder` expuesto por el hook.
- [x] `AdminClient.tsx` y `CajaClient.tsx` migrados a `useEventState`; `BarraClient.tsx` sin
  cambios (confirmado con `git diff` vacío en toda la feature).
- [x] Verificación con `e2e-playwright-tester`: `/admin` sin parpadeo de vacío al cargar, `/caja`
  en segunda pestaña, venta en efectivo reflejada en vivo cruzando pestañas por SSE, cierre de
  noche con modal de resumen correcto.
- [x] Cierre: `tsc --noEmit` (api+web) + `eslint` en 0 + `vitest run` (243/243, subió de 223 al
  cierre de 3C) + `next build` de punta a punta en verde.

---

## Fase 4 — E2E post-refactor 🧪

**Objetivo**: una vez que API y Web estén auditadas, pruebas E2E (Playwright, agente
`e2e-playwright-tester`) de los flujos completos — reemplaza/amplía la verificación manual que hoy
se hace del flujo caja→admin (ver nota en la Fase actual).

- [ ] Definir alcance ahora que la Fase 3 y la Fase 3B están cerradas.

---

## Fase 5 — Pulir UI de caja ⚡

**Objetivo**: que la pantalla de caja sea más rápida y dinámica para el ritmo real de una barra
(menos clicks, cobro más ágil), antes de empaquetar y llevar al boliche.

- [ ] Revisar el flujo de cobro: atajos de teclado, montos/medios de pago rápidos, menos pasos.
- [ ] Bajar la latencia percibida en la operación de caja.
- [ ] Detallar el resto con el uso real en el boliche (test en LAN, sin empaquetar todavía).

---

## Fase 6 — Empaquetado y producto 📦

**Objetivo**: que el dueño abra la app con **doble-click**, sin instalar Docker ni Node ni levantar
nada a mano.

> 🔑 **Decisión clave (bloqueante del empaquetado): sacar Docker.**
> Hoy el stack corre con `docker compose` (Postgres + PostgREST + Kong). **Node sí se puede *embeber***
> en el ejecutable (Node SEA / Tauri / Electron), pero **Docker NO se empaqueta**. Para el doble-click
> hay que reemplazar el Docker por un **Postgres embebido**: un binario que la app arranca sola
> (p.ej. `embedded-postgres`) o un shell **Tauri/Electron** con Postgres como *sidecar*.
>
> **Implicancia**: en modo empaquetado, **Kong + PostgREST + las demo keys pasan a ser descartables**
> (solo emulan la "puerta apikey" de Supabase cloud); localmente se le habla a Postgres directo. El
> stack Docker actual sigue sirviendo para el test en LAN ahora y para que el esquema cloud matchee.
>
> **Ojo**: para *probar en el boliche* NO hace falta esperar al empaquetado — se hace setup una sola
> vez en la mini-PC y todos entran por navegador a la IP de la LAN. El empaquetado es para el producto.

- [ ] Elegir shell de empaquetado (Tauri vs Electron vs Node SEA + binarios).
- [ ] **App "doble-click"** = Node embebido + Postgres embebido (sin Docker).
- [ ] Integrar la impresora térmica (Fase 1) dentro del paquete.
- [ ] Multi-tenant (slug por boliche) + RLS en Supabase.

---

## Fase 7 — Pedido online "en la web" 🌐 *(lo último de lo último)*

**Objetivo**: que el cliente pueda pedir desde internet (fuera de la LAN del local), reciba su ticket
online, y ese pedido aparezca en la barra local y se reconcilie al cerrar la caja.

- [ ] Definir el path cloud del pedido online (¿se sirve `/carta` + `/pedido/[token]` desde la nube?).
- [ ] **Sync bidireccional**: pedidos creados en la nube → bajan a la barra local (hoy el sync sube; falta el camino inverso para órdenes online).
- [ ] Auth de la zona cloud (las cookies HMAC LAN no sirven cross-origin contra un host cloud).
- [ ] Reconciliación de tragos online al **cerrar la caja** (juntar lo online con lo presencial en el resumen de la noche).
- [ ] Mercado Pago **online** (Checkout Pro / QR / Bricks) además del Point físico — usar el plugin oficial de MP (ver `docs/AGENTS.md`).
- [ ] **Reactivar `/barra`**: sumar de nuevo el acceso rápido de barman en `/login` y verificar E2E el flujo completo (pedido online → ticket en el celular → barman lo lee/canjea en `/barra` → reconciliación).

---

## Backlog / más adelante

- [ ] Métricas avanzadas (hora pico, ticket promedio).
- [ ] Edición de carta avanzada, fidelidad/puntos, propinas.

---

## Riesgos / deuda técnica conocida

| # | Riesgo | Impacto | Estado |
|---|---|---|---|
| R1 | `docker-compose.yml` levantaba Postgres pelado en `:54321`, pero el cliente espera la REST de Supabase ahí. | El arranque sin Supabase CLI no funcionaba. | ✅ Resuelto (2026-06-30) — stack db+PostgREST+Kong |
| R2 | `night_events.totals` no está en migraciones locales (solo cloud). | El push de totales asume schema cloud. | Abierto |
| R3 | Canje de ticket podría no ser atómico (read-check-write). | Doble canje bajo concurrencia. | A verificar |
| R4 | Código muerto (`data/*.json`, repos `LocalJSON/InMemory`). | Confunde, sugiere persistencia que no se usa. | ✅ Resuelto (2026-06-30) |
| R5 | Credencial `cajavip/cajavip` hardcodeada en `auth.service.ts`. | Acceso no documentado. | ✅ Resuelto (2026-07-01, Fase 2) — eliminada |
| R9 | `GET /api/system/logs`, `GET /api/system/status` y `POST /api/system/sync` no tenían **ningún** middleware de auth pese a estar documentados como protegidos por rol `staff`. | Cualquiera en la LAN podía ver audit logs, estado interno del sistema y disparar un sync completo. | ✅ Resuelto (2026-07-01, Fase 2) — agregado `authMiddleware`+`requireRole` |
| R6 | `next-env.d.ts` y `apps/api/src/data/*.json` aparecen como modificados en runtime. | Ruido en git. | Considerar `.gitignore` |
| R7 | `supabase/docker/kong.yml` usa las **demo keys públicas** de Supabase (JWT secret demo incluido), hardcodeadas. Kong DB-less **no** interpola env vars en el campo `key` de key-auth (ni `${{}}` de decK ni vault refs), así que no se pueden mover a `.env`. | Para LAN aceptable; si se expone `:54321` a internet = takeover de la DB (secret público). | Abierto — rotar las 3 llaves + JWT_SECRET antes de exponer fuera de LAN; alternativa: render con `envsubst` (la imagen de Kong no lo trae). |
| R8 | La impresora térmica **no reporta "sin papel"** — verificado en vivo: con el rollo vacío/sin papel, `GET /api/printer/status` sigue devolviendo `connected: true` y la venta marca `printed: true` aunque no salió nada. La impresora no expone protocolo bidireccional confiable (por eso se evitó CUPS), así que el software solo confirma que el device node existe y acepta la escritura, no que el papel esté presente. | La cajera puede creer que el ticket salió cuando en realidad no imprimió nada (papel agotado). | Abierto — mitigación operativa por ahora: revisar visualmente el rollo antes de empezar el turno. Una detección real requeriría lectura de estado bidireccional (fuera de alcance, ver plan técnico de `docs/specs/impresora-termica.md`). |
| R10 | 11 componentes de `apps/web/src/components/` (`BrandLogo`, `CashSaleModal`, `CloseNightModal`, `DrinkCard`, `DrinkSkeleton`, `OpenNightModal`, `OSHeadbar`, `SafeDeleteModal`, `ThemeProvider`, `Ticket`, `TicketLive`) estaban sueltos en la raíz en vez de organizados por dominio como el resto del árbol (`admin/`, `caja/`, `barra/`, `analytics/`, `settings/`, `shared/`). | Ninguno funcional — solo hacía más difícil ubicar un componente por convención de carpetas. | ✅ Resuelto (2026-07-04, rama `refactor/reorganizar-componentes-web`) — movidos con `git mv`: `BrandLogo`/`OSHeadbar`/`DrinkCard`/`DrinkSkeleton`/`SafeDeleteModal`/`CloseNightModal` → `shared/`, `CashSaleModal`/`OpenNightModal` → `admin/`, `Ticket`/`TicketLive` → `carta/` (nueva). `ThemeProvider` se queda en la raíz de `components/` (cross-cutting real, lo usa `layout.tsx`). `tsc`+`eslint`+`vitest`(161/161)+`build` en verde. |
| R11 | `pnpm --filter web lint` sobre **todo** `apps/web` reporta 21 errores preexistentes (reglas `react-hooks/refs`, `react-hooks/purity`, `react-hooks/set-state-in-effect` de una versión más estricta de `eslint-plugin-react-hooks`/reglas del React Compiler) en archivos que la Fase 3C no tocó: `LogsSection.tsx`, `QrSection.tsx`, `AnimatedNumber.tsx`, `Sparkline.tsx`, `orderStatus.ts`. Confirmado que ya estaban así antes de esta rama (corrido sobre el commit previo al Bloque 1, mismo resultado) — no es una regresión de ninguna fase de auditoría, es deuda que nunca se detectó porque las fases anteriores solo corrieron `eslint` sobre los archivos tocados, nunca `eslint .` sobre el árbol completo. | Cosmético/mantenibilidad — no rompe build ni tests, pero el criterio "`eslint` en 0" de las specs de auditoría en realidad nunca se cumplió a nivel repo completo. | Abierto — candidato a una fase de limpieza puntual (no se mezcló con Fase 3C para no ensuciar el diff de cada bloque con archivos no relacionados). |

---

## Cómo trabajamos (SDD nativo)

Para features nuevas usamos **Spec-Driven Development nativo** (sin herramientas externas):
1. `brainstorming` (skill) para explorar el intent.
2. `/spec` → escribe la spec en `docs/specs/<feature>.md` (el *qué* y el *por qué*).
3. `/plan` → plan técnico sobre esa spec.
4. `/tasks` → checklist accionable.
5. Implementar (Plan Mode de Claude Code para los cambios grandes).

Ver `docs/specs/README.md` y los comandos en `.claude/commands/`.
