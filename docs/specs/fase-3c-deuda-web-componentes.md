# Fase 3C — Deuda documentada de la Fase 3B (auditoría web componentes)

**Estado**: draft
**Fecha**: 2026-07-05
**Diseño validado**: [`docs/plans/2026-07-05-fase-3c-design.md`](../plans/2026-07-05-fase-3c-design.md)

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

### Bloque 1 — Tests de `services/*.ts`

- [ ] `apps/web/src/services/api-client.test.ts` — cliente base (headers, manejo de error HTTP).
- [ ] `apps/web/src/services/auth.service.test.ts`.
- [ ] `apps/web/src/services/cash-sales.service.test.ts`.
- [ ] `apps/web/src/services/config.service.test.ts`.
- [ ] `apps/web/src/services/drinks.service.test.ts`.
- [ ] `apps/web/src/services/events.service.test.ts`.
- [ ] `apps/web/src/services/mercadopago.service.test.ts`.
- [ ] `apps/web/src/services/orders.service.test.ts`.
- [ ] `apps/web/src/services/printer.service.test.ts`.
- [ ] `apps/web/src/services/tickets.service.test.ts`.
- [ ] `apps/web/src/services/users.service.test.ts`.
- [ ] Revisión SOLID de los 10 servicios con `expert-react-frontend-engineer` (¿responsabilidad
  única, manejo de error consistente entre ellos?) — corregir lo de bajo riesgo, documentar el
  resto como hallazgo si no entra en esta fase.
- [ ] `pnpm --filter web typecheck` + `pnpm --filter web test` en verde antes de pasar al bloque 2.

### Bloque 2 — `Drink.vibe` visible en la carta

- [ ] Confirmar en `apps/web/src/app/carta/` qué componente arma la grilla de tragos y le pasa
  props a `DrinkCard` (no asumir el nombre del archivo sin verificar).
- [ ] `apps/web/src/components/shared/DrinkCard.tsx` — usar la prop `vibe?` (línea 25) para
  renderizar un badge/subtítulo bajo el nombre del trago.
- [ ] Componente identificado en la tarea anterior — pasar `drink.vibe` a `DrinkCard`.
- [ ] `apps/web/src/components/shared/DrinkCard.test.tsx` — cubrir el render con y sin `vibe`.
- [ ] `pnpm --filter web typecheck` + `pnpm --filter web test` en verde.

### Bloque 3 — `Toast` compartido + `TicketItemRow`

- [ ] Extraer `apps/web/src/components/shared/Toast.tsx` desde `ToastItem` (hoy local en
  `apps/web/src/components/barra/PendingOrdersList.tsx`), con variante éxito/error.
- [ ] `apps/web/src/components/shared/Toast.test.tsx` — test de caracterización del timer (no
  reintroducir el bug de Fase 3B donde se reseteaba con cada re-render del padre).
- [ ] `apps/web/src/components/barra/PendingOrdersList.tsx` — reemplazar el `ToastItem` local por
  el import de `Toast`; confirmar que su test existente sigue en verde.
- [ ] `apps/web/src/components/settings/GeneralSection.tsx` — migrar el toast de éxito ad-hoc a
  `Toast` y agregar variante de error en el `catch` de guardar/cargar.
- [ ] `apps/web/src/components/settings/PagosSection.tsx` — agregar `Toast` de error en el
  `catch` de guardar/cargar (hoy solo `console.error`).
- [ ] `apps/web/src/components/settings/CartaSection.tsx` — agregar `Toast` de error en los
  `catch` de guardar/borrar/toggle (hoy solo `console.error`).
- [ ] Actualizar/agregar tests de caracterización de las 3 secciones de settings para cubrir el
  camino de error con feedback visible.
- [ ] Extraer `apps/web/src/components/carta/TicketItemRow.tsx` (props: `item`, `drink`
  resuelto, `showPrice?`) — el `key` de cada fila se sigue pasando desde el `.map()` del padre,
  no desde adentro del componente extraído.
- [ ] `apps/web/src/components/carta/Ticket.tsx` — usar `TicketItemRow` en las dos secciones
  ("Ticket de Control" sin precio, "Recibo de Pago" con precio), eliminando el `drinks.find`
  duplicado.
- [ ] `apps/web/src/components/carta/Ticket.test.tsx` — actualizar/agregar test que confirme que
  ambas secciones renderizan igual cantidad de ítems con los datos correctos.
- [ ] `pnpm --filter web typecheck` + `pnpm --filter web test` en verde.

### Bloque 4 — Modales a montaje condicional + partición de god-components

- [ ] **Antes de tocar el checkout**: pedir a `mercadopago-integrator` que confirme que el
  `useEffect` de polling del Posnet en `VentaSection.tsx` corta por su propia lógica de
  éxito/error/cancelación y no depende implícitamente de que el nodo del modal exista.
- [ ] `apps/web/src/components/admin/CashSaleModal.tsx` + padre
  `apps/web/src/app/admin/AdminClient.tsx` — migrar a `{ cashOpen && <CashSaleModal .../> }`,
  borrar el workaround `prevOpen`.
- [ ] `apps/web/src/components/admin/OpenNightModal.tsx` + padre `AdminClient.tsx` — ídem, borrar
  workaround de resync.
- [ ] `apps/web/src/components/shared/CloseNightModal.tsx` + padres `AdminClient.tsx` y
  `apps/web/src/app/caja/CajaClient.tsx` — ídem, borrar `isMounted`/`pendingTimers`.
- [ ] `apps/web/src/components/shared/SafeDeleteModal.tsx` + sus padres (`CartaSection.tsx`,
  `UsuariosSection.tsx`, `apps/web/src/components/caja/Sidebar.tsx`) — migrar a montaje
  condicional en cada uno.
- [ ] `apps/web/src/components/barra/CancelOrderModal.tsx` + padre (vía
  `PendingOrdersList.tsx`/`BarraClient.tsx`) — migrar a montaje condicional.
- [ ] `apps/web/src/components/barra/ManualRedeemModal.tsx` + padre — ídem.
- [ ] `apps/web/src/components/caja/VentaSection.tsx` — Modal 1 (Carrito mobile) y Modal 2
  (Checkout Posnet) inline: migrar ambos a montaje condicional, verificando que el polling del
  terminal sigue funcionando igual (ver tarea de `mercadopago-integrator` arriba).
- [ ] Test de caracterización antes/después por cada modal migrado: abrir con datos A, cerrar,
  reabrir con datos B, confirmar que no queda estado de A visible.
- [ ] Extraer `apps/web/src/components/settings/UsersTable.tsx` y
  `apps/web/src/components/settings/UserFormDrawer.tsx` desde `UsuariosSection.tsx`, reusando
  `SafeDeleteModal` (ya migrado a montaje condicional en la tarea anterior). Tests de
  caracterización de ambos.
- [ ] Extraer `apps/web/src/components/settings/DrinksTable.tsx` y
  `apps/web/src/components/settings/DrinkFormModal.tsx` desde `CartaSection.tsx` (el formulario
  incluye el input de `vibe` del bloque 2). Tests de caracterización de ambos.
- [ ] `UsuariosSection.tsx` y `CartaSection.tsx` quedan como shells orquestadores (listado +
  estado global), sin lógica de formulario/tabla inline.
- [ ] Verificación visual/E2E de los modales migrados con `e2e-playwright-tester` (foco en el
  checkout de `VentaSection.tsx` por ser el de mayor riesgo).

### Cierre de fase

- [ ] `pnpm typecheck` (api + web) en verde.
- [ ] `pnpm --filter web lint` en 0.
- [ ] `pnpm --filter web test` completo en verde (contar total de tests antes/después).
- [ ] `pnpm --filter web build` en verde.
- [ ] Actualizar `docs/ROADMAP.md`: marcar Fase 3C como completa, mover los 6 hallazgos resueltos
  fuera de la lista de deuda de Fase 3B, y resolver los findings mecánicos restantes
  (`accentColor` en `analytics/*`, `EmptyState` duplicado, `OSHeadbar.tsx`, validación
  inalcanzable de `CashSaleModal`) directo en la misma rama si no se hicieron antes.
- [ ] Marcar `docs/specs/fase-3c-deuda-web-componentes.md` como `estado: done`.
- [ ] Commit de cierre siguiendo la convención del repo (sin co-author de Claude).

> Implementar con **Plan Mode** dado el tamaño del bloque 4 (9 modales + 2 god-components). Ir
> tildando `- [x]` en esta checklist a medida que se completa cada tarea.
