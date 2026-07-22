# Simplificar Historial de Noches

**Estado**: done
**Fecha**: 2026-07-05

---

## Problema / Por qué

"Historial de Noches" (rol `admin`, sección Operación) hoy muestra **8 tarjetas + 2 widgets
interactivos** en una sola pantalla: 4 `MetricCard` (Esta Semana / Este Mes / Total Archivado /
Promedio Noche), 4 tarjetas de "récords" (Mejor Noche / Peor Noche / Noche Más Larga / Trago
Estrella), un "Comparador de Noches" (elegís 2 noches y compara 6 filas de datos) y una tabla
"Detalle por Noche" ordenable y paginada (con un popup de detalle al hacer click en una fila).

Según literatura de UX de dashboards (ver research citado en la conversación previa — UXPin,
Smashing Magazine, Aufait UX, entre otros), la memoria de trabajo humana procesa de forma
confiable **entre 5 y 9 elementos por pantalla**; por encima de ese rango la tasa de error y el
abandono suben. Historial de Noches hoy duplica ese presupuesto. Además, varios de esos datos no
son **accionables** (no cambian ninguna decisión del dueño del boliche): "Promedio Noche" no
tiene comparación ni tendencia; "Peor Noche"/"Noche Más Larga"/"Mejor Noche" son curiosidades
históricas sin contexto de *por qué* pasó eso. El Comparador de Noches y la tabla de Detalle
hacen tareas parecidas (elegir una o más noches y ver sus números) con dos mecánicas de
interacción distintas, lo que suma carga sin sumar información nueva.

De paso, se detectó un link muerto ("Ver todos" en "Productos Más Vendidos" del Dashboard) que no
lleva a ningún lado — se corrige en la misma pasada por ser un fix trivial de una sola línea.

**Para quién**: el dueño del boliche (rol `admin`) que entra a Historial de Noches para saber
cómo viene facturando la semana/el mes, y ocasionalmente quiere mirar el detalle de una noche
puntual o comparar dos.

---

## Objetivo

Que Historial de Noches muestre solo información **accionable** (algo que informa una decisión
real) con una única forma de explorar el detalle de noches puntuales, en vez de dos mecánicas de
selección redundantes.

---

## Historias de usuario

- Como **admin**, quiero ver de un vistazo cuánto facturé esta semana, este mes y en total
  archivado, sin tarjetas adicionales que no cambian ninguna decisión.
- Como **admin**, quiero saber cuál es mi trago estrella (para stock/promociones) sin que se
  mezcle con curiosidades históricas como "la noche más larga" o "la peor noche".
- Como **admin**, quiero un único selector para elegir una noche puntual y ver su detalle, o
  elegir dos y compararlas — sin tener que aprender dos mecánicas distintas (una tabla ordenable
  con popup, y un comparador de dropdowns aparte) para lo mismo.
- Como **admin**, quiero que "Ver todos" en Productos Más Vendidos (Dashboard) no aparezca si no
  lleva a ningún lado.

---

## Criterios de aceptación

1. **Given** un admin entra a "Historial de Noches", **then** ve solo 3 `MetricCard`: Esta
   Semana, Este Mes, Total Archivado (con su rango de fechas / delta ya existentes) — "Promedio
   Noche" ya no aparece.
2. **Given** la misma pantalla, **then** de los 4 "récords" solo sobrevive **Trago Estrella**
   (ventana de últimos 30 días, con fallback a todo el historial, como ya se implementó) — Mejor
   Noche, Peor Noche y Noche Más Larga se eliminan.
3. **Given** la pantalla, **when** el admin quiere ver el detalle de una noche o comparar dos,
   **then** existe **un único selector** (no dos mecánicas separadas): elegir 1 noche muestra su
   detalle (totales, sesiones, tragos vendidos — el mismo contenido que hoy tiene el popup de la
   tabla), elegir una 2da noche muestra la comparación lado a lado (mismo contenido que hoy tiene
   `NightComparator`, sin el dato "Ticket Promedio" ya eliminado).
4. **Given** el criterio anterior, **then** ya no existe la tabla paginada/ordenable "Detalle por
   Noche" como mecanismo separado de exploración — el selector único la reemplaza.
5. **Given** el Dashboard (Monitoreo), **then** "Productos Más Vendidos" ya no muestra el link
   "Ver todos".
6. El botón "Exportar CSV" (`exportHistoryCSV`) y el bridge a "Auditoría de Tickets" (desde el
   detalle de una noche) siguen funcionando igual que hoy.
7. `pnpm typecheck`, `eslint` (sin errores nuevos) y la suite de tests de `apps/web` (actualizando
   los tests de caracterización afectados: `HistorialSection.test.tsx`, `NightComparator.test.tsx`,
   `DashboardSection.test.tsx`) pasan en verde. `next build` de punta a punta sin errores.

---

## Fuera de alcance

- Cambios de backend, esquema de datos o SSE — sigue siendo una feature 100% `apps/web`.
- Auditoría de Tickets y Carta/Staff/Mercado Pago — no se tocan.
- Cualquier funcionalidad nueva de exportación/filtrado más allá de lo que ya existe
  (`exportHistoryCSV`).
- Rediseño visual del resto del panel admin.
- La limpieza de deuda preexistente ya documentada en el roadmap (`useAdminAnalytics` con campos
  sin consumidor, `NightEvolutionChart.tsx`) — sigue fuera de esta spec.

---

## Preguntas abiertas

Ninguna — alcance y decisiones (qué se elimina, qué sobrevive, cómo se unifica el selector) ya
validados con el usuario en la sesión de brainstorming previa a esta spec.

---

## Plan técnico

### Enfoque

Feature 100% `apps/web`, sin cambios de datos/backend/SSE — mismo criterio que
`simplificar-dashboard-admin`. Estrategia en 4 pasos: (1) recortar `HistorialSection.tsx` a 3
`MetricCard` y sacar `NightRecords` del árbol de render (o dejarlo mostrando solo Trago Estrella —
ver alternativas), (2) extender `NightComparator.tsx` para que la selección de "Noche B" sea
opcional — sin B, muestra el detalle de una sola noche (el mismo contenido que hoy tiene el popup
de la tabla); con B, muestra la comparación que ya existe, (3) eliminar la tabla
"Detalle por Noche" (filtro por mes, sort, paginación, popup) de `HistorialSection.tsx` una vez
que el componente extendido cubre ese caso de uso, (4) sacar el link "Ver todos" de
`TopProductsList` en `DashboardSection.tsx` (fix de una línea, mismo commit).

### Archivos/módulos afectados

**Historial de Noches — métricas**
- `apps/web/src/components/admin/HistorialSection.tsx` — sacar la `MetricCard` "Promedio Noche"
  (queda en 3 cards: Esta Semana / Este Mes / Total Archivado). Sacar el `import NightRecords` y
  su render, o cambiar qué le pasamos (ver nota de Trago Estrella abajo).
- `apps/web/src/hooks/useAdminAnalytics.ts` — `avgNight` deja de consumirse desde esta vista;
  sacarlo del `return` del hook (mismo criterio que se aplicó con `avgTicket` en la spec
  anterior). Verificar con `grep` que no quede otro consumidor antes de sacarlo.

**Trago Estrella (único record que sobrevive)**
- `apps/web/src/lib/analytics.ts` — `computeNightRecords` hoy devuelve un array de hasta 4
  `NightRecord` (`best`/`worst`/`longest`/`star_drink`). Se recorta para que solo compute y
  devuelva el récord `star_drink` (se sacan los bloques `best`/`worst`/`longest` de la función).
  El tipo `NightRecord["type"]` pierde `"best"|"worst"|"longest"` — revisar `NightRecord` en
  `lib/analytics.ts` y `RECORD_EMOJI` en `NightRecords.tsx` si ese componente sigue existiendo.
- `apps/web/src/components/analytics/NightRecords.tsx` — con un solo tipo de record, el grid de
  `md:grid-cols-2` ya no tiene sentido (queda una sola tarjeta). Dos caminos: (a) simplificar este
  componente a una única tarjeta compacta de "Trago Estrella", o (b) eliminarlo y renderizar la
  tarjeta de Trago Estrella directo en `HistorialSection.tsx` (ver Alternativas — se recomienda
  (a) para no romper el test de caracterización existente más de lo necesario).

**Selector único (reemplaza Comparador + Tabla + Popup)**
- `apps/web/src/components/analytics/NightComparator.tsx` — cambios:
  - `idxB` pasa a admitir `-1` como "sin selección" (sentinel), con un primer `<option>` extra en
    el segundo `NightSelector` tipo "— Ver solo Noche A —".
  - Cuando `idxB === -1`: en vez del grid de comparación (`buildRows`/`rows.map`), renderizar el
    detalle de una sola noche — mismo contenido que hoy vive en el popup de
    `HistorialSection.tsx` (bloque "Totales Consolidados del Día" + "Tragos Vendidos" +
    "Detalle de Sesiones Individuales"). Ese JSX se puede extraer a un componente chico
    (`NightDetailCard` o similar) para reusarlo tal cual desde ambos lugares mientras se hace la
    migración, o portarlo directo si el popup se elimina en el mismo PR.
  - El botón "Ver Auditoría de Tickets" (con el callback `onRedirectToLogs`) se mueve del popup a
    este componente — `NightComparator` pasa a necesitar esa prop.
  - Type del prop `nights`: hoy declarado `EventSummary[]` pero en runtime recibe los "días
    unificados" de `HistorialSection` (`unifiedHistoryDays`, con `dateKey` en vez de `id`) vía un
    cast `as any[]`. Aprovechar este cambio para tipar correctamente ese shape (ya sea exportando
    el tipo de `unifiedHistoryDays` desde `HistorialSection.tsx` o moviendo ese cómputo a un
    helper compartido) y sacar el `as any[]`.
  - Renombrar el componente/archivo si el alcance ya no es solo "comparar" (sugerido:
    `NightExplorer.tsx`) — a definir en `/tasks`, no bloqueante para el plan.
- `apps/web/src/components/admin/HistorialSection.tsx` — eliminar por completo: el estado
  `selectedHistoryMonth`/`selectedHistoryDay`/`currentHistoryPage`/`historySortField`/
  `historySortDirection`, el `useMemo` `filteredAndSortedHistoryDays`/`paginatedHistoryDays`/
  `historyPaginationRange`, la función `handleHistorySort`, la barra de filtro por mes, la tabla
  completa (`<table>` con sort por columna), la paginación, y el popup "History Day Detail". El
  botón "Exportar CSV" se reubica junto al selector único (sigue llamando a `exportHistoryCSV`
  sobre `historyEvents` completo, sin cambios de lógica).
- `unifiedHistoryDays` (el `useMemo` que agrupa `historyEvents` por día calendario) **se
  mantiene** — sigue siendo la lista que alimenta el selector único, solo cambia quién la consume.

**Dashboard — fix del link muerto**
- `apps/web/src/components/admin/DashboardSection.tsx` — función `TopProductsList`: sacar el
  `<span>Ver todos</span>` (no tiene `onClick` ni `href` hoy, es texto suelto con estilos de link).

**Tests**
- `apps/web/src/components/admin/HistorialSection.test.tsx` — reescribir: sacar aserciones sobre
  la tabla/sort/paginación/popup, agregar aserciones sobre las 3 `MetricCard` + Trago Estrella +
  presencia del selector único.
- `apps/web/src/components/analytics/NightComparator.test.tsx` — agregar casos para `idxB = -1`
  (detalle de una sola noche) y el bridge a Auditoría de Tickets.
- `apps/web/src/components/analytics/NightRecords.test.tsx` (si existe) — actualizar a un solo
  tipo de record.
- `apps/web/src/components/admin/DashboardSection.test.tsx` — agregar aserción de que "Ver
  todos" no está en el DOM.

### Cambios de datos

Ninguno. Sin migraciones, sin cambios en `packages/shared/src/domain.ts`, sin impacto en sync
local↔cloud — todo se deriva de `historyEvents` que ya llega por HTTP (`eventsService.getHistory()`).

### Real-time

Sin cambios. Esta vista no consume SSE directamente (solo se recalcula cuando `historyEvents`
cambia, ya sea por el fetch inicial o porque `AdminClient` fuerza un refetch al cerrar una noche).

### Auth/permisos

Sin cambios — sigue detrás del mismo guard de `/admin` (rol `admin`, permiso `historial` en
`UserPermissions`/`PERMISSIONS_BY_ROLE`, sin tocar).

### Riesgos

- **`NightComparator` cambia de "solo comparación" a "detalle o comparación"**: es el componente
  de mayor riesgo del plan porque absorbe responsabilidad nueva (el contenido del popup) además
  de la que ya tenía. Mitigación: extraer el bloque de detalle a una función/componente propio
  antes de integrarlo, para poder testearlo aislado.
- **Pérdida de sort/filtro por mes/paginación de la tabla eliminada**: si el historial crece mucho
  (meses de uso), el `<select>` del selector único lista todas las noches sin agrupar por mes. Es
  una simplificación deliberada (pedida explícitamente por el usuario), pero si en la práctica el
  dropdown se vuelve largo de navegar, es candidato a revisar en una vuelta futura (no bloquea
  esta spec).
- **Tipo `nights: EventSummary[]` con cast `as any[]`**: al tocar `NightComparator` de todos
  modos, conviene corregir el tipo real (día unificado, no `EventSummary`) para no seguir
  arrastrando el `any`; bajo riesgo, achica deuda de paso.
- **Tests de caracterización con mayor superficie de reescritura** en esta spec que en la
  anterior — `HistorialSection.test.tsx` pierde varios casos (tabla/sort/paginación) y gana otros
  (selector único). Revisar que no quede cobertura huérfana de una funcionalidad que ya no existe.

### Alternativas consideradas

- **Eliminar `NightRecords.tsx` en vez de recortarlo a un solo record**: se descarta a favor de
  mantenerlo (con un único record) porque ya tiene su propio estado vacío (`EmptyState`) y test de
  caracterización — recortar la función que arma los datos (`computeNightRecords`) es más chico
  que reescribir el punto de render en `HistorialSection.tsx` para una tarjeta suelta.
- **Mantener la tabla "Detalle por Noche" y solo sacar el Comparador**: descartada por el usuario
  en el brainstorming previo — se prefirió un único patrón de interacción (el selector) en vez de
  mantener dos mecánicas para tareas parecidas.
- **Migrar directo a un componente nuevo (`NightExplorer.tsx`) en vez de extender
  `NightComparator.tsx` in place**: queda abierto para `/tasks` — extender in-place es más chico en
  este plan, pero si el archivo resultante queda muy cargado (selector + detalle + comparación),
  puede valer la pena partirlo en el momento de implementar.

---

## Tareas

Sin migraciones ni backend — todo el trabajo es en `apps/web`. Orden pensado para que cada paso
deje el árbol compilando.

### 0. Verificación previa (no-destructiva)
- [ ] `grep -rn "NightRecords\|NightComparator\|avgNight"` para confirmar consumidores actuales
  antes de tocar nada (por si algo cambió desde el análisis del plan).
- [ ] Confirmar que `NightRecord["type"]` (`lib/analytics.ts`) y `RECORD_EMOJI`
  (`NightRecords.tsx`) no se usan en ningún otro lado fuera de estos dos archivos.

### 1. Récords: recortar a solo Trago Estrella
- [ ] `apps/web/src/lib/analytics.ts` — en `computeNightRecords`, sacar los bloques `best`
  (Mejor Noche), `worst` (Peor Noche) y `longest` (Noche Más Larga); solo queda el cómputo de
  `star_drink`. Achicar `NightRecord["type"]` a `"star_drink"` si ya no hay otros usos del tipo.
- [ ] `apps/web/src/components/analytics/NightRecords.tsx` — simplificar a una sola tarjeta
  compacta de "Trago Estrella" (sin el grid `md:grid-cols-2` pensado para 4 tarjetas); mantener
  el `EmptyState` existente para cuando no hay datos.
- [ ] `apps/web/src/components/analytics/NightRecords.test.tsx` (si existe) — actualizar a un
  solo tipo de record.

### 2. Historial de Noches: sacar Promedio Noche
- [ ] `apps/web/src/components/admin/HistorialSection.tsx` — sacar la `MetricCard` "Promedio
  Noche" (queda en 3: Esta Semana / Este Mes / Total Archivado).
- [ ] `apps/web/src/hooks/useAdminAnalytics.ts` — sacar `avgNight` del `return` del hook una vez
  confirmado (paso 0) que no queda otro consumidor. Revisar si `filterRecentNights` sigue
  necesitándose (la sigue usando `computeNightRecords` para Trago Estrella) — no tocar esa
  función.

### 3. `NightComparator` → selector único (detalle o comparación)
- [ ] `apps/web/src/components/analytics/NightComparator.tsx` — tipar correctamente el prop
  `nights` (el shape real es el "día unificado" de `HistorialSection`, con `dateKey`, no
  `EventSummary`); sacar el cast `as any[]` del lado que lo llama una vez tipado. Decidir en este
  paso si el archivo se renombra a `NightExplorer.tsx` (si extenderlo in-place lo deja demasiado
  cargado) o se mantiene el nombre.
- [ ] Agregar sentinel `idxB = -1` ("— Ver solo Noche A —") como primera opción del `NightSelector`
  de "Noche B".
- [ ] Extraer el contenido del popup de `HistorialSection.tsx` ("Totales Consolidados del Día" +
  "Tragos Vendidos en el Día" + "Detalle de Sesiones Individuales" + botón "Ver Auditoría de
  Tickets") a un bloque/componente reusable dentro de `NightComparator.tsx` (o un archivo propio
  si queda muy largo), parametrizado por una noche + el callback `onRedirectToLogs`.
- [ ] Cuando `idxB === -1`: renderizar ese bloque de detalle para `nightA` en vez del grid de
  comparación. Cuando hay B: se mantiene el comportamiento actual (`buildRows`/grid).
- [ ] Agregar la prop `onRedirectToLogs` a `NightComparator` y conectarla al botón "Ver Auditoría
  de Tickets" del bloque de detalle.
- [ ] `apps/web/src/components/analytics/NightComparator.test.tsx` — agregar casos: detalle de
  una sola noche (sin B), bridge a Auditoría de Tickets, y mantener/adaptar los casos existentes
  de comparación con 2 noches.

### 4. Eliminar la tabla "Detalle por Noche" de `HistorialSection.tsx`
- [ ] Sacar el estado `selectedHistoryMonth`/`selectedHistoryDay`/`currentHistoryPage`/
  `historySortField`/`historySortDirection` y los `useMemo` derivados
  (`filteredAndSortedHistoryDays`/`paginatedHistoryDays`/`historyPaginationRange`) y la función
  `handleHistorySort`.
- [ ] Sacar la barra de filtro por mes, la tabla completa (`<table>` con headers ordenables), la
  paginación, y el popup "History Day Detail" (su contenido ya se migró al paso 3).
- [ ] Reubicar el botón "Exportar CSV" (sigue llamando `exportHistoryCSV(historyEvents)` sin
  cambios de lógica) junto al selector único de `NightComparator`.
- [ ] `unifiedHistoryDays` (el `useMemo` que agrupa por día calendario) se mantiene — ahora
  alimenta solo a `NightComparator`.
- [ ] `apps/web/src/components/admin/HistorialSection.test.tsx` — reescribir: sacar aserciones de
  tabla/sort/paginación/popup, agregar aserciones de las 3 `MetricCard` + Trago Estrella +
  presencia del selector único.

### 5. Dashboard: sacar "Ver todos"
- [ ] `apps/web/src/components/admin/DashboardSection.tsx` — en `TopProductsList`, sacar el
  `<span>Ver todos</span>` (texto suelto sin `onClick`/`href`).
- [ ] `apps/web/src/components/admin/DashboardSection.test.tsx` — agregar aserción de que "Ver
  todos" no está en el DOM.

### 6. Cierre
- [x] `pnpm typecheck` (api + web) en verde.
- [x] `eslint` en verde (sin errores nuevos respecto a la deuda pre-existente ya documentada).
- [x] `vitest run` en `apps/web` en verde — 236/236 (suite completa).
- [x] `next build` de punta a punta sin errores.
- [x] Verificación manual/E2E con el subagent `e2e-playwright-tester` (entorno con 5 noches
  archivadas reales): 3 metric cards + Trago Estrella confirmados; "Noche A" preseleccionada
  muestra el detalle completo; "Noche B" en default dice "— Ver solo Noche A —"; al elegir una
  2da noche se ve la comparación con delta % (sin "Ticket Promedio"); "Ver Auditoría de Tickets"
  navega correctamente a `/admin?tab=logs`; sin errores de consola. Ningún hallazgo — nada que
  corregir.
- [x] Actualizar `docs/ROADMAP.md`: agregada la sección "Feature — Simplificar Historial de
  Noches" (mismo formato que "Simplificar Dashboard de `/admin`").
- [x] Estado del header de esta spec cambiado de `draft` a `done`.

---

**Notas de ejecución**: el paso 3 (`NightComparator` → selector único) es el de mayor superficie
de cambio y el único con una decisión de diseño abierta (renombrar el archivo o no) — usar Plan
Mode si se quiere revisar el detalle antes de tocar el JSX. Ir tildando `- [x]` a medida que se
completa cada tarea.
