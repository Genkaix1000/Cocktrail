# useSSE centralizado — deuda de Fase 3B

**Estado**: draft
**Fecha**: 2026-07-05
**Diseño validado**: [`docs/plans/2026-07-05-usesse-centralizado-design.md`](../plans/2026-07-05-usesse-centralizado-design.md)

---

## Problema / Por qué

Al cerrar la Fase 3B (auditoría de componentes web) quedó documentado como deuda de alto riesgo
que el hook `useSSE` (conexión real-time a `/api/events`) está "centralizado" en los 3 shells
(`AdminClient`, `CajaClient`, `BarraClient`) sin tests de integración. Investigando el código: el
hook en sí (`apps/web/src/lib/useSSE.ts`) está bien hecho — el problema real es que
`AdminClient.tsx` y `CajaClient.tsx` duplican, casi byte a byte, la función `refetch()` y los
handlers de los eventos `order.created`/`order.updated`/`cash_sale.added`/`event.opened` (el
mismo patrón "upsert por id en un array"). Y **ningún** shell tiene un solo test que ejercite el
flujo real de un evento SSE llegando y actualizando el estado — si alguien rompe el upsert o el
manejo de reconexión, no hay forma de enterarse hasta verlo en producción con el local operando.

Afecta al **admin/dueño** y a la **cajera** (los 2 roles cuyos shells comparten esta lógica
duplicada), y en términos de mantenibilidad a cualquiera que tenga que tocar el manejo de
pedidos/ventas en tiempo real en el futuro.

## Objetivo

Que la lógica de sincronización en tiempo real que hoy comparten `/admin` y `/caja` (estado de
la noche, pedidos, ventas en efectivo, upsert por id, refetch) viva en un solo lugar en vez de
duplicada en los dos shells, con el mismo comportamiento observable que tienen hoy — ningún
cambio de UX. Que ese lugar tenga tests que ejerciten un evento SSE llegando de punta a punta
(no solo lógica pura mockeada), para que romper el manejo de un evento real-time se detecte en
CI, no en producción. `/barra` no cambia — su lógica de tiempo real es genuinamente distinta
(cola de pedidos pendientes, notificaciones toast, modo desarrollo) y no se fuerza a compartir
la misma abstracción.

## Historias de usuario

- Como **desarrollador/mantenedor**, quiero que la lógica de sincronización SSE compartida entre
  `/admin` y `/caja` esté en un solo lugar, para no tener que actualizar el mismo fix en dos
  archivos cuando cambie el manejo de un evento.
- Como **desarrollador/mantenedor**, quiero tests que simulen un evento SSE real llegando (no
  solo el estado ya actualizado), para detectar en CI si se rompe el upsert de pedidos/ventas o
  la limpieza de la conexión al desmontar.
- Como **admin**, quiero que los totales, pedidos y ventas en efectivo se seguean actualizando en
  vivo en `/admin` exactamente igual que hoy, sin ningún cambio perceptible.
- Como **cajera**, quiero lo mismo en `/caja`: que un pedido nuevo, un cambio de estado, o el
  cierre de la noche se reflejen en vivo sin que cambie nada de lo que veo hoy.

## Criterios de aceptación

1. **Given** `AdminClient.tsx` y `CajaClient.tsx`, **when** se audita el código tras el cambio,
   **then** ninguno de los dos vuelve a declarar su propia función `refetch()` ni su propio
   bloque `useSSE({...})` con el patrón de upsert — ambos consumen una única fuente compartida.
2. **Given** `BarraClient.tsx`, **when** se completa el cambio, **then** sigue usando `useSSE`
   directo, sin modificaciones de comportamiento.
3. **Given** un evento `order.created` u `order.updated` recibido por SSE, **when** llega un
   pedido con un `id` que ya existe en el estado local, **then** se reemplaza en su lugar (no se
   duplica); si el `id` es nuevo, se agrega.
4. **Given** un evento `cash_sale.added`, **when** llega una venta con un `id` ya conocido,
   **then** no se duplica; si es nueva, se agrega.
5. **Given** un evento `event.opened`, **when** llega, **then** se actualiza el evento activo y
   se refresca el estado completo (mismo comportamiento actual).
6. **Given** un evento `event.closed`, **when** llega, **then** se guarda el resumen de cierre y
   cada shell decide su propia reacción visual (abrir su modal de resumen correspondiente) sin
   que el otro shell se vea afectado.
7. **Given** que `/admin` recibe cualquiera de los 3 eventos de actividad (pedido nuevo,
   actualizado, o venta en efectivo), **when** ocurre, **then** además de actualizar su estado
   dispara la actualización de logs del sistema, igual que hoy; **given** que `/caja` recibe los
   mismos eventos, **then** NO dispara ninguna actualización de logs (no la tiene hoy).
7b. **Given** que la conexión SSE se abre o se reconecta, **when** ocurre en `/admin`, **then**
   se refresca el estado completo Y se dispara la actualización de logs del sistema (igual que
   hoy); **given** que ocurre en `/caja`, **then** solo se refresca el estado, sin logs.
8. **Given** la nueva pieza compartida, **when** se corre la suite de tests, **then** existe al
   menos un test que simula una conexión SSE real (vía un doble de `EventSource`) emitiendo cada
   tipo de evento soportado, y verifica que el estado resultante es el esperado — no solo tests
   de la lógica de upsert aislada de la conexión.
9. **Given** el componente se desmonta, **when** ocurre, **then** se cierra la conexión SSE y se
   remueven los listeners (mismo comportamiento actual de `useSSE`, verificado con test).
10. **Given** el estado final, **when** se corre `pnpm typecheck`, `pnpm --filter web lint`,
    `pnpm --filter web test` y `pnpm --filter web build`, **then** los cuatro terminan sin
    errores, y una verificación manual/E2E de `/admin` y `/caja` muestra que pedidos, ventas y
    cierre de noche se siguen actualizando en vivo exactamente igual que antes del cambio.

## Fuera de alcance

- `BarraClient.tsx` no se modifica — su lógica de tiempo real (cola de pendientes, toasts, modo
  dev) es genuinamente distinta y no comparte el molde de Admin/Caja.
- `CloseNightModal` (la carga ficticia de 3.2s) — sigue siendo una decisión de producto/UX
  pendiente sin relación con esta feature, no se toca acá.
- No se agregan tests que monten `AdminClient`/`CajaClient` completos (no tienen test propio
  hoy) — la cobertura de integración SSE vive en la pieza compartida nueva, que es donde está
  toda la lógica de sincronización ahora.
- No se extrae un helper genérico de "upsert por id" a un archivo de utilidades separado — si
  hoy solo lo usa esta pieza compartida, queda privado ahí (YAGNI); se extrae el día que
  `BarraClient` u otro consumidor lo necesite.
- No se cambia el protocolo de eventos del backend (`apps/api`) ni el shape de los `DomainEvent`
  — este trabajo es 100% de reorganización del lado del cliente.

## Preguntas abiertas

- Ninguna — el diseño (qué se comparte, la forma de los 2 callbacks de diferenciación entre
  Admin/Caja, y el nivel de testing) ya se validó en la sesión de brainstorming previa.

---

## Plan técnico

### Enfoque

100% `apps/web`, sin tocar `apps/api` ni el protocolo de `DomainEvent` — es reorganización pura
del cliente. Se extrae `useEventState()` (nuevo hook) que absorbe el estado + `refetch()` + las
5 suscripciones SSE hoy duplicadas entre `AdminClient.tsx` y `CajaClient.tsx`, parametrizado con
2 callbacks opcionales (`onActivity`, `onEventClosed`) para las diferencias puntuales entre
ambos shells. Se agrega primero la infraestructura de testing (doble de `EventSource`), después
`useSSE.test.ts` (hoy inexistente, valida el hook base ya en producción) como red de seguridad
antes de tocar código, y recién después se escribe `useEventState.ts` con sus propios tests, y
por último se migran los 2 shells a consumirlo.

### Archivos/módulos afectados

- **`apps/web/src/lib/__testUtils__/fakeEventSource.ts`** (nuevo) — doble de test de
  `EventSource`: implementa `addEventListener`/`removeEventListener`/`close`, expone `emit(type,
  data)` y `emitOpen()`, y una lista estática `instances` para que el test acceda a la conexión
  creada dentro del hook bajo prueba.
- **`apps/web/src/lib/useSSE.test.ts`** (nuevo) — tests de caracterización del hook existente
  (`apps/web/src/lib/useSSE.ts`, sin modificar su código) usando el doble de arriba.
- **`apps/web/src/hooks/useEventState.ts`** (nuevo) — el hook compartido. Vive en `hooks/` junto
  a los demás hooks extraídos de shells (`useAdminAnalytics`, `useCheckout`,
  `useOfflineScanQueue`, `usePrinterStatus`), mismo criterio de ubicación que Fase 3.
- **`apps/web/src/hooks/useEventState.test.ts`** (nuevo) — tests de integración SSE de punta a
  punta con el mismo doble de `EventSource`.
- **`apps/web/src/app/admin/AdminClient.tsx`** — se borran los `useState` de
  `event`/`orders`/`cashSales`/`summary`, la función `refetch`, y el bloque `useSSE({...})`
  completo (líneas ~248-290 hoy); se reemplaza por una llamada a `useEventState({ onActivity:
  fetchSystemLogs, onEventClosed: ... })`.
- **`apps/web/src/app/caja/CajaClient.tsx`** — mismo tipo de cambio, sin `onActivity` (líneas
  ~88-130 hoy).
- **`apps/web/src/app/barra/BarraClient.tsx`** — **sin cambios**, fuera de alcance.

### Cambios de datos

Ninguno. No hay migraciones, ni cambios en `packages/shared/src/domain.ts`, ni impacto en el
sync local↔cloud ni en el modo offline-first — todo el trabajo es de organización del código
cliente que ya consume el mismo stream `/api/events` y los mismos tipos de `DomainEvent`
existentes.

### Real-time

No se agregan ni se quitan tipos de evento. Se consumen los mismos 5 que ya maneja el código
hoy: `order.created`, `order.updated`, `cash_sale.added`, `event.opened`, `event.closed` (todos
definidos en `DomainEventHandlers` de `apps/web/src/lib/useSSE.ts`, sin cambios de shape). El
backend (`apps/api`, `EventEmitter` en proceso, `GET /api/events`) no se toca.

### Auth/permisos

Sin cambios. `useEventState` no introduce ninguna lógica de permisos — los shells que lo
consumen (`AdminClient`, `CajaClient`) siguen operando bajo las mismas guardas de rol que ya
tenían (verificadas más arriba en cada shell, antes de llegar al hook).

### Riesgos

- **Riesgo principal, ya mitigado por diseño**: al mover `refetch`/estado dentro de un hook
  nuevo, un error de referencias obsoletas (closures capturando el `refetch` viejo, por ejemplo)
  rompería la sincronización en vivo de forma silenciosa. Mitigación: `useSSE.test.ts` +
  `useEventState.test.ts` con el doble de `EventSource` ANTES de migrar los shells (criterio de
  aceptación 8), y verificación manual/E2E de `/admin` y `/caja` después de migrar (criterio 10).
- **`handleCloseConfirm`/`handleModalClose` en ambos shells, más `OpenNightModal` y la edición
  de la palabra clave en Admin** llaman `setSummary`/`setEvent` directo fuera del flujo SSE
  (respuestas HTTP directas, no un evento SSE) — el hook debe exponer esos setters, no
  encapsularlos completamente, o esos flujos se rompen. Ya contemplado en la API del hook
  (`setEvent`/`setSummary` expuestos, ver diseño).
- **Hallazgo de `architect-reviewer`, ya corregido en el diseño antes de codear**: `onOpen` (se
  dispara en la conexión inicial y en cada reconexión) NO es idéntico entre shells como se creía
  — Admin llama `fetchSystemLogs()` ahí además de `refetch()`, Caja no. Si el hook manejara
  `onOpen` 100% interno sin considerar esto, Admin perdería ese refresh de logs en cada
  reconexión. Se resuelve sin agregar un tercer callback: en `onOpen` el hook llama `refetch()`
  y, si se pasó `onActivity`, también `onActivity()` (una reconexión cuenta como actividad).
- **Deuda que esta feature no toca**: `CloseNightModal` (carga ficticia de 3.2s) sigue como
  decisión de UX pendiente; `BarraClient` sigue sin compartir esta pieza (decisión explícita, no
  deuda nueva).

### Alternativas consideradas

- **Un único hook para los 3 shells** (incluyendo `BarraClient`) — descartada en brainstorming:
  `BarraClient` tiene una cola de pedidos pendientes, notificaciones toast y modo desarrollo que
  no comparten el molde simple de "upsert por id"; forzar la abstracción haría el hook más
  configurable/complejo para acomodar un caso ajeno, peor que la duplicación actual.
- **Extraer solo funciones puras de upsert (sin hook)** — descartada: no resuelve la duplicación
  real, que es tanto el estado como las 5 suscripciones y el `refetch`, no solo la lógica de
  upsert en sí.
- **Testear también `AdminClient`/`CajaClient` completos con el doble de EventSource** —
  descartada por ahora: esos shells no tienen test propio hoy (son shells, no lógica de negocio
  aislada), y montarlos completos para este test necesitaría mockear servicios/auth/tema que ya
  están fuera del alcance de esta feature — la cobertura en el hook cubre el riesgo real sin ese
  costo.

---

## Tareas

### Bloque 1 — Infraestructura de testing (antes de tocar código de producción) ✅ *(completo)*

- [x] `apps/web/src/lib/__testUtils__/fakeEventSource.ts` — doble de `EventSource`:
  `addEventListener`/`removeEventListener`/`close` (misma interfaz que usa `useSSE.ts`), más
  `emit(type, data)` (dispara el listener registrado para ese `type` con un `MessageEvent` cuyo
  `data` es `JSON.stringify(data)`) y `emitOpen()` (dispara el listener de `"open"`). Expone una
  lista estática `instances` (o similar) para que el test acceda a la conexión creada dentro del
  hook bajo prueba.
- [x] `pnpm --filter web typecheck` en verde con el nuevo archivo (sin producción que lo consuma
  todavía). `eslint` en 0.

### Bloque 2 — Tests de caracterización de `useSSE.ts` (hook existente, sin tocar su código) ✅ *(completo)*

- [x] `apps/web/src/lib/useSSE.test.ts` (nuevo) usando el doble del Bloque 1 y
  `vi.stubGlobal("EventSource", FakeEventSource)`: 5 tests — despacha el handler correcto según
  el `type` con el `data` ya parseado; no dispara handlers de otros tipos; ignora un frame con
  JSON malformado sin lanzar (se agregó `emitRaw()` al doble para simularlo limpio); llama
  `onOpen` en el evento `open` (inicial y reconexión simulada); al desmontar remueve listeners y
  cierra la conexión.
- [x] `pnpm --filter web test src/lib/useSSE.test.ts` en verde (5/5). Suite completa: 228/228
  (antes 223). `tsc --noEmit` + `eslint` en 0.

### Bloque 3 — `useEventState.ts` (el hook compartido) + sus tests

- [ ] `apps/web/src/hooks/useEventState.ts` (nuevo): estado `event`/`orders`/`cashSales`/
  `summary`, función `refetch()` (idéntica a la que hoy está duplicada en ambos shells), las 5
  suscripciones SSE (`order.created`/`order.updated`/`cash_sale.added`/`event.opened`/
  `event.closed`) con upsert-por-id para `orders`/`cashSales`, `onOpen` interno que llama
  `refetch()` y, si se pasó `onActivity`, también `onActivity()`. Firma:
  `useEventState(options?: { onActivity?: () => void; onEventClosed?: (summary: EventSummary) => void })`.
  Retorna `{ event, orders, cashSales, summary, setEvent, setSummary, refetch }` (sin
  `setOrders`/`setCashSales`).
- [ ] `apps/web/src/hooks/useEventState.test.ts` (nuevo), mismo patrón de doble de `EventSource`:
  - `order.created`/`order.updated` hacen upsert por id en `orders` (agrega si no existe,
    reemplaza si existe);
  - `cash_sale.added` hace upsert por id en `cashSales`;
  - `event.opened` setea `event` y dispara `refetch` (mock de `eventsService.getState`);
  - `event.closed` setea `summary` y llama `onEventClosed(summary)` si se pasó la opción;
  - `onActivity` se llama exactamente una vez por cada evento de actividad
    (`order.created`/`order.updated`/`cash_sale.added`), y no se llama si no se pasó la opción;
  - `onOpen`/reconexión: llama `refetch()` siempre, y llama `onActivity()` además si se pasó
    (cubre el hallazgo de `architect-reviewer` sobre Admin refrescando logs en cada reconexión);
  - al desmontar, limpia listeners y cierra la conexión (igual que `useSSE.test.ts`, para
    confirmar que `useEventState` no rompe esa garantía al envolver el hook base).
- [ ] `pnpm --filter web test src/hooks/useEventState.test.ts` en verde.

### Bloque 4 — Migrar `AdminClient.tsx`

- [ ] Reemplazar en `apps/web/src/app/admin/AdminClient.tsx`: borrar los `useState` de
  `event`/`orders`/`cashSales`/`summary`, la función `refetch` (líneas ~239-246), y el bloque
  `useSSE({...}, { onOpen: ... })` completo (líneas ~248-290) por una llamada a
  `useEventState({ onActivity: fetchSystemLogs, onEventClosed: (s) => { setSummary — ya lo
  hace el hook —; setModalOpen(true); setHistoryLoaded(false); } })`. Ojo: `onEventClosed` NO
  debe volver a setear `summary` (ya lo hizo el hook antes de llamarlo) — solo hace lo que el
  shell necesita además.
- [ ] Confirmar que los usos existentes de `setEvent` (modo `open`/`edit` de `OpenNightModal`,
  líneas ~565-580) y `setSummary` (`handleCloseConfirm`, `handleModalClose`) siguen compilando
  contra los setters devueltos por `useEventState`, sin cambiar su lógica interna.
- [ ] `pnpm --filter web typecheck` en verde.

### Bloque 5 — Migrar `CajaClient.tsx`

- [ ] Mismo tipo de cambio en `apps/web/src/app/caja/CajaClient.tsx` (líneas ~88-130): borrar
  `useState` locales, `refetch`, y el bloque `useSSE({...}, { onOpen: refetch })`; reemplazar por
  `useEventState({ onEventClosed: () => setCloseModalOpen(true) })` (sin `onActivity`, Caja no
  tiene `fetchSystemLogs`).
- [ ] Confirmar que `handleCloseConfirm`/`handleCloseModalClose` siguen compilando contra los
  setters del hook.
- [ ] `pnpm --filter web typecheck` en verde.

### Bloque 6 — `BarraClient.tsx`: confirmar que NO se tocó

- [ ] `git diff` de `apps/web/src/app/barra/BarraClient.tsx` vacío al final de la feature —
  fuera de alcance, sin cambios.

### Cierre de fase

- [ ] `pnpm typecheck` (api + web) en verde.
- [ ] `pnpm --filter web lint` en 0 en todos los archivos tocados.
- [ ] `pnpm --filter web test` completo en verde (contar total de tests antes/después).
- [ ] `pnpm --filter web build` en verde.
- [ ] Verificación manual o con `e2e-playwright-tester`: en `/admin` y `/caja`, un pedido
  nuevo/actualizado y una venta en efectivo se siguen reflejando en vivo; cerrar la noche abre el
  modal de resumen correcto en cada shell; no hay errores de consola.
- [ ] Actualizar `docs/ROADMAP.md`: mover el hallazgo "`useSSE` centralizado" de la lista de
  deuda de Fase 3B a resuelto, referenciando esta feature.
- [ ] Marcar `docs/specs/usesse-centralizado.md` como `estado: done`.
- [ ] Commit de cierre siguiendo la convención del repo (sin co-author de Claude).

> Implementar con **Plan Mode** dado que toca el estado real-time de 2 shells en producción. Ir
> tildando `- [x]` en esta checklist a medida que se completa cada tarea.
