# Fase 3C — Deuda documentada de la Fase 3B (auditoría web componentes)

**Estado**: done
**Fecha**: 2026-07-05
**Diseño validado**: [`docs/plans/03-auditoria-web/2026-07-05-fase-3c-design.md`](../../plans/03-auditoria-web/2026-07-05-fase-3c-design.md)

---

## Problema / Por qué

Al cerrar la Fase 3B (auditoría de los componentes sueltos de `apps/web`), quedaron **11
hallazgos documentados sin resolver** en el roadmap — deuda que no bloqueaba nada pero fue
anotada explícitamente para una próxima ronda. De esos 11, hay **6 que ameritan tratamiento con
tests + auditoría** (no son mecánicos):

- La capa `services/*.ts` (llamadas a la API desde el frontend) nunca tuvo auditoría ni tests,
  a diferencia de todo lo demás en `apps/web`.
- Un patrón de bug ya confirmado 3 veces en Fase 3B (modal "montado permanentemente, solo
  `return null`") sigue latente en otros ~6 modales que no tuvieron incidente todavía — cada uno
  es candidato al mismo tipo de bug (estado viejo mostrado al reabrir).
- El ticket virtual que ve el cliente en su celular (`Ticket.tsx`) duplica la lógica de render de
  cada producto del pedido en dos secciones distintas de la misma pantalla, con riesgo de
  desincronizarse si cambia el formato de un ítem.
- El campo de dominio `Drink.vibe` tiene datos reales cargados (usados para categorizar/vender el
  trago) pero la carta del cliente nunca los muestra — se está perdiendo información de producto.
- Tres pantallas de `/admin → Configuración` (`GeneralSection`, `PagosSection`, `CartaSection`)
  no le muestran nada al usuario cuando falla guardar/cargar — el error solo queda en la consola
  del navegador, invisible para quien está operando.
- `UsuariosSection.tsx` y `CartaSection.tsx` (de `settings/`) son los últimos dos componentes de
  `apps/web` con más de 500 líneas mezclando tabla + formulario + lógica de guardado, el mismo
  patrón que ya se resolvió en los god-components de la Fase 3.

Afecta principalmente al **dueño/encargado** (rol `admin`, que opera `/admin → Configuración` y
`/admin → Usuarios`) y al **cliente final** (que usa `/carta` y ve su ticket virtual).

## Objetivo

Que la capa de servicios del frontend tenga la misma cobertura de tests que el resto del código
auditado. Que ningún modal de la aplicación pueda mostrar datos de una apertura anterior al
reabrirse. Que el ticket virtual del cliente tenga una única fuente de verdad para el render de
cada producto del pedido. Que la "vibe" de cada trago sea visible para el cliente en la carta. Que
cualquier error al guardar o cargar configuración en `/admin` se le muestre al usuario que está
operando, no solo a la consola del navegador. Que `UsuariosSection` y `CartaSection` (settings)
queden del mismo tamaño y separación de responsabilidades que el resto de los módulos ya
auditados.

## Historias de usuario

- Como **admin**, quiero que si falla el guardado de la configuración general o de pagos, se me
  muestre un aviso visible, para saber que tengo que reintentar en vez de asumir que se guardó.
- Como **admin**, quiero que al reabrir cualquier modal (cobro en efectivo, abrir noche, borrar
  usuario, etc.) vea siempre el estado correcto y no datos de la vez anterior.
- Como **cliente**, quiero ver la "onda"/categoría de cada trago en la carta (ej. "PROMO AMIGOS",
  "FIESTA TOTAL"), para elegir más rápido lo que se ajusta a lo que estoy buscando.
- Como **cliente**, quiero que mi ticket virtual muestre siempre el mismo detalle de mis productos
  en ambas secciones (control y recibo), sin inconsistencias.
- Como **desarrollador/mantenedor**, quiero que la capa de `services/*.ts` tenga tests, para
  detectar regresiones cuando cambie un endpoint de la API.
- Como **desarrollador/mantenedor**, quiero que `UsuariosSection`/`CartaSection` (settings) estén
  divididos en piezas más chicas, para poder modificar el formulario de alta sin releer 600
  líneas de tabla.

## Criterios de aceptación

1. **Given** cualquier archivo de `apps/web/src/services/*.ts`, **when** se corre la suite de
   tests, **then** existe al menos un test que cubre su camino feliz y su manejo de error.
2. **Given** un modal de la aplicación (`CashSaleModal`, `OpenNightModal`, `CloseNightModal`,
   `SafeDeleteModal`, `CancelOrderModal`, `ManualRedeemModal`, y los inline de
   `VentaSection`/`CartaSection`(settings)/`UsuariosSection`), **when** se cierra y se vuelve a
   abrir con datos distintos, **then** no queda visible ningún dato de la apertura anterior (se
   verifica con test de caracterización antes/después de migrar a montaje condicional).
3. **Given** el ticket virtual de un pedido con items, **when** se renderiza, **then** la sección
   "Ticket de Control" y "Recibo de Pago" usan el mismo componente de fila por ítem
   (`TicketItemRow`) sin duplicar la búsqueda del trago ni el markup.
4. **Given** un trago con `vibe` cargado, **when** se muestra en `/carta` (vista del cliente),
   **then** el `vibe` es visible en la tarjeta del trago.
5. **Given** un error de red o de la API al guardar/cargar en `GeneralSection`, `PagosSection` o
   `CartaSection` (settings), **when** ocurre, **then** se le muestra al usuario un mensaje visual
   de error (no solo `console.error`).
6. **Given** `UsuariosSection.tsx` y `CartaSection.tsx` (settings), **when** termina la
   extracción, **then** cada shell queda como orquestador (listado + estado global) y la
   tabla/formulario viven en componentes propios con sus tests de caracterización.
7. **Given** el estado final de la fase, **when** se corre `pnpm typecheck`, `pnpm --filter web
   lint`, `pnpm --filter web test` y `pnpm --filter web build`, **then** los cuatro terminan sin
   errores.

## Fuera de alcance

- Los findings mecánicos de la Fase 3B (duplicación de `accentColor` en `analytics/*`,
  `EmptyState` duplicado, `OSHeadbar.tsx` mezclando dos componentes, validación inalcanzable de
  `CashSaleModal`) — se resuelven directo, sin spec, en la misma rama.
- Rediseñar la carga ficticia de 3.2s de `CloseNightModal` — es una decisión de UX/producto
  pendiente, no un problema técnico de esta fase.
- Sacar `Drink.vibe` del contrato de dominio — se decidió mostrarlo en vez de eliminarlo.
- Cualquier cambio a `apps/api` (los `services/*.ts` del frontend consumen la API tal como está
  hoy; si algún test revela un contrato inconsistente, se documenta pero no se toca el backend en
  esta fase).
- `useSSE` centralizado (finding de Fase 3B que sigue como deuda, no entra en esta ronda).

## Preguntas abiertas

- Ninguna — el alcance y las decisiones de producto (mostrar `vibe`, migrar todos los modales a
  montaje condicional) ya se validaron en la sesión de brainstorming previa.

---

## Plan técnico

### Enfoque

Fase 100% `apps/web`, sin tocar `apps/api` ni Supabase — no hay migraciones ni cambios de dominio
(`vibe` ya existe en `packages/shared/src/domain.ts` y en la API). Se ordena en 4 bloques
independientes por riesgo/dependencia, cada uno con test de caracterización antes de tocar código
(mismo patrón que Fases 2/3/3B): (1) `services/*.ts` — el más aislado y mecánico, sirve de
calentamiento; (2) `Drink.vibe` en la UI — chico, y desbloquea el formulario nuevo del bloque 4;
(3) extracción de `Toast` compartido + `TicketItemRow`; (4) migración de modales a montaje
condicional + partición de `UsuariosSection`/`CartaSection` (settings) — el bloque más grande,
al final porque toca más archivos y se beneficia de que `vibe` y `Toast` ya estén resueltos.

### Archivos/módulos afectados

**Bloque 1 — `services/*.ts`** (10 archivos en `apps/web/src/services/`): agregar
`*.test.ts` co-ubicado por servicio (`api-client`, `auth`, `cash-sales`, `config`, `drinks`,
`events`, `mercadopago`, `orders`, `printer`, `tickets`, `users`), mockeando `global.fetch`.
Sin cambios de código salvo que la auditoría encuentre algo puntual (ej. manejo de error
inconsistente entre servicios) — se corrige ahí mismo si es de bajo riesgo, se documenta si no.

**Bloque 2 — `Drink.vibe`**:
- `apps/web/src/components/shared/DrinkCard.tsx` — usar la prop `vibe?` ya declarada (línea 25)
  para renderizar un badge/subtítulo bajo el nombre.
- El componente que arma la carta del cliente (`apps/web/src/app/carta/*` — confirmar el
  componente exacto que pasa las props a `DrinkCard` antes de tocar) — pasar `drink.vibe`.
- Actualizar `DrinkCard.test.tsx` para cubrir el nuevo dato.

**Bloque 3 — Toast compartido + `TicketItemRow`**:
- Nuevo `apps/web/src/components/shared/Toast.tsx` (extraído de `ToastItem` en
  `apps/web/src/components/barra/PendingOrdersList.tsx`, variante éxito/error).
- `apps/web/src/components/settings/GeneralSection.tsx`, `PagosSection.tsx`, `CartaSection.tsx`
  — reemplazar el toast ad-hoc de éxito (`GeneralSection`) y agregar el de error (los 3) usando
  el componente nuevo.
- `apps/web/src/components/barra/PendingOrdersList.tsx` — pasa a importar `Toast` en vez de
  declararlo local.
- Nuevo `apps/web/src/components/carta/TicketItemRow.tsx`, consumido dos veces desde
  `apps/web/src/components/carta/Ticket.tsx` (líneas ~228-258 y ~310-338), con prop `showPrice?`
  para diferenciar "Ticket de Control" de "Recibo de Pago".

**Bloque 4 — Modales + god-components de `settings/`**:
- Modales a migrar a `{ isOpen && <Modal /> }` en el padre: `CashSaleModal`/`OpenNightModal`
  (padre `apps/web/src/app/admin/AdminClient.tsx`), `CloseNightModal` (padres
  `apps/web/src/app/admin/AdminClient.tsx` y `apps/web/src/app/caja/CajaClient.tsx`),
  `SafeDeleteModal` (varios padres: `CartaSection`/`UsuariosSection`/`Sidebar` de caja),
  `CancelOrderModal`/`ManualRedeemModal` (padre `BarraClient.tsx` vía `PendingOrdersList`), y los
  inline de `VentaSection.tsx` (Modal 1 "Carrito" y Modal 2 "Checkout"). Al migrar, se borra el
  workaround `prevOpen`/`isMounted`/`pendingTimers` de `CashSaleModal`, `OpenNightModal` y
  `CloseNightModal` (ya no hace falta si el componente se desmonta de verdad).
- `apps/web/src/components/settings/UsuariosSection.tsx` (593 líneas) → extraer
  `components/settings/UsersTable.tsx` y `components/settings/UserFormDrawer.tsx`, reusando
  `SafeDeleteModal`.
- `apps/web/src/components/settings/CartaSection.tsx` (658 líneas) → extraer
  `components/settings/DrinksTable.tsx` (o `DrinksGrid.tsx`) y
  `components/settings/DrinkFormModal.tsx` (acá se agrega el input de `vibe` del bloque 2).

### Cambios de datos

Ninguno. `Drink.vibe` ya existe en `packages/shared/src/domain.ts:14`, en las validaciones de
`apps/api/src/shared/middleware/validate.ts`, en `drinks.repository.ts` y en `sync.service.ts` —
esta fase solo consume un dato que ya viaja end-to-end. Sin migraciones Supabase, sin impacto en
el sync local↔cloud ni en el modo offline-first (todo el trabajo es de presentación en `apps/web`).

### Real-time

Sin cambios. No se agregan ni consumen eventos SSE nuevos — los modales y componentes tocados ya
reciben sus datos vía props desde los shells que sí escuchan `useSSE`.

### Auth/permisos

Sin cambios de roles ni `UserPermissions`. `UsersTable`/`UserFormDrawer` (extraídos de
`UsuariosSection`) siguen operando bajo la misma guarda de permisos que ya tiene el shell
`AdminClient` (no se duplica ni se relaja ningún chequeo de rol al extraer).

### Riesgos

- **Migrar modales a montaje condicional puede introducir flicker o perder animaciones de
  entrada/salida** si algún modal depende de una transición CSS que asume que el nodo ya existe
  en el DOM antes de abrirse — mitigar revisando cada uno visualmente (o con
  `e2e-playwright-tester`) después de migrar, no solo con el test de caracterización.
- **`VentaSection.tsx` tiene 2 modales inline** (Carrito mobile + Checkout) más acoplados al
  flujo de venta que los demás — es el de mayor riesgo del bloque 4 porque toca el checkout de
  Posnet ya auditado en Fase 3. El estado del checkout (polling del terminal, `ON_TERMINAL`, etc.)
  vive en el propio `VentaSection`, no en el wrapper del modal, así que migrar a montaje
  condicional no debería tocar el ciclo de vida del polling — **pero antes de mergear este
  bloque, que `mercadopago-integrator` confirme que ningún `useEffect` del polling depende
  implícitamente de que el nodo del modal exista** (en vez de cortar por su propia lógica de
  éxito/error/cancelación).
- **`Ticket.tsx` es la pantalla que ve el cliente en vivo** (polling/SSE de estado del pedido).
  Hoy las dos listas usan `key` distintas (`` `${it.drinkId}-${i}` `` en "Ticket de Control" vs.
  `i` en "Recibo de Pago") — al extraer `TicketItemRow`, el `key` debe seguir viniendo del
  `.map()` del padre (no del componente extraído) para no romper el reconciliation de React.
- Deuda conocida que esta fase **no** resuelve pero roza: `useSSE` centralizado (los shells que
  usan estos modales siguen con el mismo hook grande de Fase 3).

### Alternativas consideradas

- **Sacar `Drink.vibe` del dominio en vez de mostrarlo** — descartada en brainstorming: es más
  invasiva (toca `packages/shared`, `apps/api` completo y el seed) para eliminar un dato que en
  realidad tiene contenido de producto real cargado.
- **Migrar solo los modales sin bug confirmado, dejando los 3 ya parcheados de Fase 3B como
  están** — descartada: mantener dos patrones distintos (montaje condicional + workaround de
  refs) para el mismo problema es más deuda, no menos: se decidió unificar todo a un solo patrón.
- **Extraer `TicketItemRow` con dos componentes separados en vez de uno con `showPrice?`** —
  descartada por ahora: la duplicación real (ícono + búsqueda de trago + badge de cantidad) es
  mayor que la diferencia de layout, así que una sola prop condicional alcanza sin sobre-diseñar.

---

## Tareas

### Bloque 1 — Tests de `services/*.ts` ✅ *(completo)*

- [x] `apps/web/src/services/api-client.test.ts` — cliente base (headers, manejo de error HTTP).
- [x] `apps/web/src/services/auth.service.test.ts`.
- [x] `apps/web/src/services/cash-sales.service.test.ts`.
- [x] `apps/web/src/services/config.service.test.ts`.
- [x] `apps/web/src/services/drinks.service.test.ts`.
- [x] `apps/web/src/services/events.service.test.ts`.
- [x] `apps/web/src/services/mercadopago.service.test.ts`.
- [x] `apps/web/src/services/orders.service.test.ts`.
- [x] `apps/web/src/services/printer.service.test.ts`.
- [x] `apps/web/src/services/tickets.service.test.ts`.
- [x] `apps/web/src/services/users.service.test.ts`.
- [x] Revisión SOLID de los 10 servicios con `expert-react-frontend-engineer`: consistentes,
  todos wrappers delgados sobre `apiFetch` sin lógica propia ni manejo de error divergente. Se
  corrigieron 2 hallazgos triviales: `events.service.ts` tenía 4 tipos importados inline
  (`import("@cocktrail/shared").Drink` etc.) en vez de en el `import type` del tope (único de los
  10 con ese estilo); `PrinterStatus.configured` estaba tipado como literal `true` en vez de
  `boolean`.
- [x] `pnpm --filter web typecheck` + `pnpm --filter web test` en verde (207/207, antes 161) +
  `eslint` en 0.

### Bloque 2 — `Drink.vibe` visible en la carta ✅ *(completo)*

- [x] Confirmado: `apps/web/src/app/carta/page.tsx` arma la grilla y renderiza
  `<DrinkCard key={d.id} {...d} .../>` — al spreadear el `Drink` completo, `vibe` ya viaja solo,
  sin necesidad de tocar el caller (lo mismo aplica a `VentaSection.tsx` en `/caja`, que usa el
  mismo spread).
- [x] `apps/web/src/components/shared/DrinkCard.tsx` — la prop `vibe?` ahora se renderiza como
  subtítulo uppercase bajo el nombre en ambas variantes (lista "regular" y banner
  "promo/trending"), solo si viene cargado.
- [x] `apps/web/src/components/shared/DrinkCard.test.tsx` — 3 tests nuevos: vibe visible en
  variante regular, vibe vacío no rompe nada, vibe visible en variante promo/banner.
- [x] `pnpm --filter web typecheck` + `pnpm --filter web test` en verde (210/210, antes 207) +
  `eslint` en 0 en los archivos tocados.

### Bloque 3 — `Toast` compartido + `TicketItemRow` ✅ *(completo)*

- [x] Extraído `apps/web/src/components/shared/Toast.tsx` (variante éxito/error, `title`/`badge`
  opcionales para el caso "Nuevo pedido #12" de barra, timer con ref para no reiniciarse en
  re-renders del padre). Se agregó el keyframe `shrinkWidth` a `globals.css` (antes solo vivía
  inline en `BarraClient.tsx`, por lo que no habría animado fuera de esa pantalla).
- [x] `apps/web/src/components/shared/Toast.test.tsx` — 4 tests (mensaje+cierre, title/badge,
  auto-dismiss, timer no se reinicia si `onClose` cambia de identidad).
- [x] `apps/web/src/components/barra/PendingOrdersList.tsx` — `ToastItem` local reemplazado por
  `Toast`; su test existente sigue en verde sin cambios (mismo texto, mismo aria-label).
- [x] `GeneralSection.tsx`/`PagosSection.tsx`/`CartaSection.tsx` (settings) — toast de éxito
  migrado a `Toast`, y agregado `Toast` de error (antes `console.error` sin feedback visual) en
  guardar/cargar (Pagos, General) y guardar/borrar/toggle (Carta). Test de error nuevo por cada
  catch.
- [x] Extraído `apps/web/src/components/carta/TicketItemRow.tsx` (props: `item`, `drink`
  resuelto, `showPrice?`) — el `ICON_MAP` se movió con él; el `key` de cada fila lo sigue
  pasando cada `.map()` del padre con su propio esquema (`${it.drinkId}-${i}` en "Ticket de
  Control", `i` en "Recibo de Pago" — no se unificaron, tal como marcó `architect-reviewer`).
- [x] `Ticket.tsx` usa `TicketItemRow` en ambas secciones, sin el `drinks.find` duplicado.
- [x] `TicketItemRow.test.tsx` nuevo (sin precio / con precio / ícono fallback); `Ticket.test.tsx`
  existente sigue en verde sin cambios.
- [x] `pnpm --filter web typecheck` + `pnpm --filter web test` en verde (222/222, antes 210) +
  `eslint` en 0 en todos los archivos de este bloque (el lint global del repo tiene 21 errores
  preexistentes en archivos no tocados por Fase 3C — ver nota abajo).

> **Hallazgo no planeado, fuera de alcance de esta fase**: `pnpm --filter web lint` sobre todo
> `apps/web` reporta 21 errores preexistentes (reglas `react-hooks/refs`, `react-hooks/purity`,
> `react-hooks/set-state-in-effect` de una versión de `eslint-plugin-react-hooks` más estricta) en
> archivos que Fase 3C no toca: `LogsSection.tsx`, `QrSection.tsx`, `AnimatedNumber.tsx`,
> `Sparkline.tsx`, `orderStatus.ts`. Ya estaban así antes de esta rama (confirmado corriendo lint
> sobre el commit previo a Bloque 1). El criterio de cierre "`eslint` en 0" de esta spec se
> entiende por archivos tocados en Fase 3C, no por el repo completo — limpiar esa deuda
> preexistente queda pendiente para una fase aparte.

### Bloque 4 — Modales a montaje condicional + partición de god-components

> **Hallazgo que redujo el alcance real de este bloque**: al auditar los 9 "modales candidatos"
> antes de tocar nada, 5 de los 9 **ya estaban bien** y no entraron a la migración:
> - `apps/web/src/components/caja/VentaSection.tsx` (Modal 1 Carrito, Modal 2 Checkout) — ya
>   usaban `{ isCartOpen && ... }` / `{ isCheckoutOpen && ... }`, confirmado por
>   `mercadopago-integrator` antes de descartar el ítem (ver hallazgo abajo).
> - `apps/web/src/components/barra/CancelOrderModal.tsx` y `ManualRedeemModal.tsx` — nunca
>   tuvieron el patrón "siempre montado + `return null`"; sus padres (`BarraClient.tsx` vía
>   `PendingOrdersList`) ya los montan condicionalmente (`{cancelOrder && <CancelOrderModal .../>}`,
>   `{manualRedeemOrder && <ManualRedeemModal .../>}`).
> Los 4 que sí tenían el bug real (`CashSaleModal`, `OpenNightModal` modo `edit`,
> `CloseNightModal`, `SafeDeleteModal`) se migraron — pero `CashSaleModal` terminó **eliminado**
> del todo, no migrado (ver hallazgo siguiente). De paso se corrigió el roadmap: `SafeDeleteModal`
> nunca se usó desde `caja/Sidebar.tsx` (solo `CartaSection.tsx` y `UsuariosSection.tsx` de
> settings).

> **Hallazgo mayor: `CashSaleModal` era una feature muerta, no un bug de montaje** — se eliminó
> por completo en vez de migrarse. La verificación E2E post-migración reveló que el botón que
> debía abrir el modal (`setCashOpen(true)`) **nunca existió en ningún commit** de todo el
> historial del repo (`git log -p -S "setCashOpen"` solo encuentra el `setCashOpen(false)` del
> `onClose`) — el modal era inalcanzable desde el día uno. Al investigar el propósito de la
> feature antes de simplemente resucitarla con un botón: `apps/web/src/lib/totals.ts` documenta
> explícitamente que "las ventas en efectivo **del barman** cuentan como efectivo pero no suman
> tragos" — es decir, la feature se diseñó para que el **barman** cargue un cobro en efectivo sin
> pasar por el checkout digital, pero el único lugar donde se llegó a montar el trigger fue
> `/admin` (rol dueño/encargado), y `/caja` (donde sí se opera el cobro real, con
> efectivo/débito/QR + impresión de ticket vía `VentaSection.tsx`) nunca tuvo ningún control
> equivalente. Confirmado con el usuario en vivo que no hay un caso de uso real distinto del que
> ya cubre `VentaSection` — se decidió **eliminar** en vez de reubicar: borrados
> `apps/web/src/components/admin/CashSaleModal.tsx` (+ su test) y
> `apps/web/src/services/cash-sales.service.ts` (+ su test), que quedó sin ningún otro
> consumidor en todo `apps/web` una vez eliminado el modal. Se mantiene intacto el backend
> (`apps/api/src/modules/cash-sales/`, la tabla `cash_sales`, `computeTotals`) porque sigue siendo
> necesario para los totales/sync de eventos ya cerrados — la eliminación fue solo del frontend
> huérfano, no del modelo de dominio.

- [x] **Antes de tocar el checkout**: `mercadopago-integrator` confirmó que el polling del Posnet
  en `useCheckout.ts` vive a nivel de `VentaSection` (no del modal) y corta por su propia lógica
  (`stopPolling()` en éxito/error/cancelación) — nunca dependió del montaje del modal. Al revisar
  el código de paso se descubrió que `VentaSection.tsx` ya usaba montaje condicional real, así que
  no había nada que migrar ahí.
- [x] ~~`apps/web/src/components/admin/CashSaleModal.tsx`~~ — eliminado por completo (ver
  hallazgo arriba), no migrado.
- [x] `apps/web/src/components/admin/OpenNightModal.tsx` + padre `AdminClient.tsx` — ídem para el
  modo `edit` (`{ editKeywordOpen && <OpenNightModal mode="edit" .../> }`); el modo `open` ya
  estaba condicionado por el propio `if (!event)` del shell, sin cambios ahí.
- [x] `apps/web/src/components/shared/CloseNightModal.tsx` + padres `AdminClient.tsx` y
  `apps/web/src/app/caja/CajaClient.tsx` — migrado a `{ modalOpen && <CloseNightModal .../> }` /
  `{ event && closeModalOpen && <CloseNightModal .../> }`. Se simplificó la derivación de
  `prevTrigger` (open/hasSummary) a un chequeo directo de `hasSummary` — ya no hace falta
  resetear nada al cerrar porque el remount de React ya arranca en blanco. `isMounted`/
  `pendingTimers` se mantienen (protegen contra el desmontaje real, que ahora sí ocurre).
- [x] `apps/web/src/components/shared/SafeDeleteModal.tsx` + sus padres (`CartaSection.tsx` y
  `UsuariosSection.tsx` de `settings/`) — simplificado: se eliminó el wrapper `ConfirmForm` +
  `key={expectedText}` (workaround redundante una vez que el padre monta/desmonta de verdad) y el
  prop `isOpen`; los padres migraron a `{ deleteConfirm && <SafeDeleteModal .../> }`.
- [x] Tests actualizados: se sacaron los 4 tests "no renderiza nada cuando open/isOpen es false"
  (ya no aplican, el prop no existe) y se reescribieron los tests de "resync al reabrir" para
  reflejar el nuevo comportamiento (unmount + remount en vez de alternar una prop). 218/218 tests
  (bajó de 222 por los 4 tests eliminados, no por regresión), `pnpm --filter web typecheck` +
  `eslint` en 0 en todos los archivos tocados.
- [x] Test de caracterización antes/después por cada modal migrado: abrir con datos A, cerrar,
  reabrir con datos B, confirmar que no queda estado de A visible.
- [x] Extraídos `apps/web/src/components/settings/UsersTable.tsx` y
  `apps/web/src/components/settings/UserFormDrawer.tsx` desde `UsuariosSection.tsx` (593→265
  líneas), reusando `SafeDeleteModal` (ya migrado a montaje condicional). Constantes compartidas
  (`ROLE_META`/`PERMISSION_LABELS`/`PERMISSIONS_BY_ROLE`/`INITIAL_PERMISSIONS`) movidas a
  `usuariosConstants.ts`. Tests de caracterización de ambos.
- [x] Extraídos `apps/web/src/components/settings/DrinksTable.tsx` y
  `apps/web/src/components/settings/DrinkFormModal.tsx` desde `CartaSection.tsx` (658→261
  líneas) — el formulario incluye el input de `vibe` del bloque 2. `ICONS_LIST` movido a
  `cartaConstants.ts`. Tests de caracterización de ambos.
- [x] `UsuariosSection.tsx` y `CartaSection.tsx` quedan como shells orquestadores (listado +
  estado global), sin lógica de formulario/tabla inline.
- [x] Verificación visual/E2E de los modales migrados con `e2e-playwright-tester`: 5/6 casos
  (`OpenNightModal`, `CloseNightModal`, `CartaSection`+`vibe`+`SafeDeleteModal`,
  `UsuariosSection`, badges de `vibe` en `/carta`) PASS sin regresiones. El 6º caso
  (`CashSaleModal`) fue el que reveló el hallazgo de la feature muerta de arriba — terminó en
  eliminación, no en verificación de migración. `pnpm --filter web build` en verde.

### Cierre de fase

- [x] `pnpm typecheck` (api + web) en verde.
- [x] `pnpm --filter web lint` en 0 en todos los archivos tocados por Fase 3C (el repo completo
  tiene 21 errores preexistentes sin relación, documentados como R11 en `docs/ROADMAP.md`).
- [x] `pnpm --filter web test` completo en verde: 223/223 (161 al cierre de Fase 3B → 232 en el
  pico del Bloque 4 → 223 tras eliminar `CashSaleModal`/`cash-sales.service` y sus tests).
- [x] `pnpm --filter web build` en verde.
- [x] Actualizado `docs/ROADMAP.md`: Fase 3C marcada completa, los 6 hallazgos no-mecánicos +
  3 mecánicos movidos de "deuda" a "resuelto" en la sección de Fase 3B, documentada la
  eliminación de `CashSaleModal`/`cash-sales.service.ts` como decisión de esta fase, y agregado
  R11 (deuda de lint preexistente descubierta, sin relación con Fase 3C).
- [x] Marcado `docs/specs/03-auditoria-web/fase-3c-deuda-web-componentes.md` como `estado: done`.
- [x] Commit de cierre siguiendo la convención del repo (sin co-author de Claude).

> Implementar con **Plan Mode** dado el tamaño del bloque 4 (9 modales + 2 god-components). Ir
> tildando `- [x]` en esta checklist a medida que se completa cada tarea.
