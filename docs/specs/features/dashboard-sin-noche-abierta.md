# Dashboard sin noche abierta + fix torta + detalle de noche

**Estado**: done
**Fecha**: 2026-07-14

---

## Problema / Por qué

El panel `/admin` (rol `admin`), tab **Monitoreo** (`DashboardSection.tsx`), está pensado para
leer "cómo va la noche" de un vistazo. Hoy tiene tres problemas detectados en uso real (capturas
del dashboard con la noche cerrada):

1. **Sin noche abierta, el Dashboard miente visualmente.** `totals` se deriva de `orders=[]`
   (todo en $0) y se compara contra la última noche cerrada, mostrando "Ventas Totales $0",
   "Tickets Totales 0", "Unidades Vendidas 0", todos con "-100% vs. Última Noche" en rojo. Un
   dueño que abre `/admin` sin haber abierto la noche todavía lee esto como una caída de ventas,
   no como ausencia de operación.
2. **La torta "Distribución por Canal" pinta colores con total $0.** `customPaymentBreakdown`
   (`AdminClient.tsx`) usa porcentajes hardcodeados de fallback (efectivo 45%, tarjeta 35%,
   QR 15%, otros 5%) cuando `totals.total === 0`, en vez de dejar cada canal en 0%. El filtro que
   debería ocultarlos (`total > 0 || pct > 0`) los deja pasar porque `pct` es no-cero. Resultado:
   el donut se ve "lleno" (4 colores, segmentos de tamaño creíble) con el centro diciendo "$0" —
   lectura contradictoria.
3. **El detalle de una noche en Historial repite datos y le faltan dos.** En "Historial de
   Noches" (`NightComparator.tsx`, ver un única noche sin comparador), "Totales Consolidados del
   Día" y "Detalle de Sesiones Individuales" muestran los mismos números cuando esa noche tuvo
   una sola sesión (el caso típico) — no hay nada nuevo que aporte el segundo bloque. Además, el
   trago más vendido de esa noche puntual y cuánto duró la operación no están destacados como
   datos propios (solo se puede inferir mirando la lista completa de tragos o restando horarios a
   mano).

**Para quién**: el dueño del boliche (rol `admin`), que entra a `/admin` en cualquier momento
—antes de abrir la noche, durante, o al otro día— y espera que los números que ve se lean sin
ambigüedad.

---

## Objetivo

Que el Dashboard de Monitoreo muestre, de entrada y sin noche abierta, los datos reales de la
**última noche cerrada** (en vez de ceros comparados contra sí mismos), que la torta de canales
nunca "invente" datos visuales cuando el total es $0, y que el detalle de una noche en Historial
no repita información y muestre destacados el trago más vendido y la duración de esa noche.

---

## Historias de usuario

- Como **admin**, quiero que al entrar a `/admin` sin haber abierto la noche todavía, el
  Dashboard me muestre los números reales de la última noche que tuve, para saber "cómo venía"
  sin tener que ir a Historial.
- Como **admin**, quiero que ese estado (sin noche abierta) no muestre ninguna comparación
  porcentual contra nada, porque no hay una operación en curso para comparar.
- Como **admin**, quiero que cuando sí abro la noche, el Dashboard vuelva a comparar la noche en
  curso contra la última noche cerrada (comportamiento actual), sin cambios.
- Como **admin**, quiero que la torta "Distribución por Canal" nunca muestre segmentos de color
  cuando no hubo ninguna venta — un anillo gris y $0/0% en cada método es lo único honesto.
- Como **admin**, quiero ver, al mirar el detalle de una noche puntual en Historial, cuál fue el
  trago más vendido esa noche y cuánto duró la operación, sin tener que calcularlo yo.
- Como **admin**, quiero que si esa noche tuvo una sola sesión, no se repita la misma información
  dos veces en pantalla.

---

## Criterios de aceptación

### Dashboard — estado sin noche abierta
1. **Given** no hay ninguna noche abierta (`openNight == null`) y existe al menos una noche en el
   historial, **when** el admin entra al tab Monitoreo, **then** las 3 `MetricCard` (Ventas
   Totales, Tickets Totales, Unidades Vendidas), "Ventas por Hora", "Productos Más Vendidos",
   "Distribución por Canal" y "Hora Pico de Ventas" muestran los datos de la **última noche
   cerrada** (`historyEvents[0]`), no ceros.
2. **Given** ese mismo estado, **then** ninguna `MetricCard` muestra delta/porcentaje ni la
   leyenda "vs. Última Noche" — en su lugar, un subtítulo identifica de qué noche son los datos
   (ej. "Noche del 14 jul").
3. **Given** ese mismo estado, **then** la card "Comparativa" no aparece en absoluto (no tiene
   sentido sin una noche en curso).
4. **Given** no hay ninguna noche abierta **y tampoco** existe ninguna noche en el historial
   (local nuevo, nunca operó), **then** se mantiene el estado vacío actual del Dashboard, sin
   cambios.
5. **Given** hay una noche abierta (`openNight != null`), **then** el Dashboard se comporta
   exactamente igual que hoy: métricas de la noche en curso, comparación contra
   `historyEvents[0]` con deltas %, y card "Comparativa" visible.

### Torta "Distribución por Canal"
6. **Given** el total real de ventas de los datos que alimentan el Dashboard es $0 (ya sea de una
   noche en curso recién abierta, o de una última noche cerrada sin ventas), **when** se renderiza
   "Distribución por Canal", **then** cada canal de pago tiene `pct: 0` y `total: 0` reales — no
   se usan porcentajes de relleno.
7. **Given** ese mismo estado, **then** el anillo del donut se dibuja completo en un gris neutro,
   sin segmentos de color por canal.
8. **Given** ese mismo estado, **then** la leyenda de métodos de pago (Efectivo/Tarjeta/
   Transferencia) muestra `$0 · 0 ops · 0%` en cada fila, sin el punto de color activo.
9. **Given** el total real es mayor a $0, **then** el comportamiento de la torta no cambia
   respecto a hoy (colores reales por canal, según proporción real).

### Historial — detalle de una sola noche
10. **Given** el admin elige ver el detalle de una sola noche en Historial (sin seleccionar una
    2da noche para comparar), **then** el dato que hoy se muestra como "Pedidos" pasa a llamarse
    "Tickets Emitidos" (mismo valor, sin cambio de cálculo).
11. **Given** ese mismo detalle, **then** se muestra un dato destacado "Top Trago" con el nombre
    del trago más vendido **de esa noche puntual** (no de una ventana de 30 días).
12. **Given** ese mismo detalle, **then** se muestra un dato destacado "Duración" con el tiempo
    total operado esa noche (de apertura a cierre, o de la sesión más temprana a la más tardía si
    hubo más de una sesión ese día), en formato legible (ej. "4h 12m").
13. **Given** esa noche tuvo **una sola sesión**, **then** el bloque "Detalle de Sesiones
    Individuales" no se muestra — el horario de esa sesión (y quién la cerró) se muestra como un
    dato secundario dentro del bloque principal, sin repetir los totales.
14. **Given** esa noche tuvo **dos o más sesiones** (reapertura el mismo día calendario),
    **then** el bloque "Detalle de Sesiones Individuales" se sigue mostrando igual que hoy, una
    fila por sesión.
15. **Given** el selector "Noche A / Noche B" para comparar dos noches, **then** no cambia de
    comportamiento respecto a hoy (no se toca en esta feature).

### General
16. `pnpm typecheck` (api + web) y la suite de tests de `apps/web` pasan en verde. `next build`
    sin errores.

---

## Fuera de alcance

- Cambios de backend, esquema de datos, Supabase o sync local↔cloud — toda la feature vive en
  `apps/web`, consumiendo datos que ya llegan por HTTP/SSE.
- Cambios en cómo se calculan los números (`computeDelta`, `getLastNightTotals`,
  `computeNightRecords`, etc. en `lib/analytics.ts`) — se reutiliza lo que ya existe o se
  extiende con el mismo criterio, no se rediseña la lógica de cómputo.
- Sacar o simplificar el selector "Noche A / Noche B" de Historial — se evaluó explícitamente y
  se decidió mantenerlo tal cual.
- Agregar plata por trago (subtotal) o desglose completo de canales de pago (Tarjeta/QR/
  Transferencia por separado) al detalle de una noche — evaluado y descartado por ahora.
- Rediseño visual/de estilo del resto del panel admin (Carta, Gestión de Staff, Mercado Pago).
- Cualquier cambio al flujo de abrir/cerrar noche en sí (`CloseNightModal`, palabra clave, etc.).

---

## Preguntas abiertas

Ninguna — todas las decisiones de alcance (los 2 estados del Dashboard, el tratamiento de la
torta en $0, qué datos sumar/ocultar en el detalle de noche, mantener el comparador A/B) ya se
validaron con el usuario en la sesión de brainstorming previa a esta spec (ver
`docs/plans/features/2026-07-14-dashboard-sin-noche-abierta-design.md`).

---

## Plan técnico

### Enfoque

Feature 100% `apps/web`, sin backend/Supabase/SSE nuevos. La idea central: hoy `AdminClient.tsx`
computa `totals`/`orders`/`eventStartedAt` **siempre desde la noche en curso** (`orders` vía
`useEventState`) y se los pasa directo a `useAdminAnalytics` y a `DashboardSection`. El cambio es
que `AdminClient` decide **qué fuente de datos usar** según `isNightOpen = !!event` — la noche en
curso (comportamiento actual) o `historyEvents[0]` (última noche cerrada, que ya trae `totals` y
`orders` completos en su `EventSummary`) — y pasa el resultado ya resuelto río abajo. Ni
`useAdminAnalytics` ni `DashboardSection` necesitan saber de dónde salieron los datos, solo si
hay que mostrar comparación (`isNightOpen`). En paralelo, dos fixes acotados: `customPaymentBreakdown`
(saca el fallback hardcodeado + no filtra canales cuando el total es real $0) y `PaymentDonut`
(pinta gris cuando no hay datos reales). Por último, `NightDetailView` dentro de
`NightComparator.tsx` gana 2 datos derivados de campos que ya existen (`night.totals.drinksSold[0]`
para Top Trago, `night.closedAt - night.startedAt` + `formatDuration` ya existente para Duración)
y oculta su bloque de sesiones cuando `night.sessions.length === 1`.

### Archivos/módulos afectados

**`apps/web/src/app/admin/AdminClient.tsx`** — pieza central del cambio:
- Agregar `const isNightOpen = event?.status === "activo";` (mismo criterio que ya usa el sidebar
  en la línea 479, `(!event || event.status !== "activo")`).
- Agregar un `useMemo` `dashboardTotals`/`dashboardOrders`/`dashboardStartedAt`:
  ```ts
  const lastNight = historyEvents[0] ?? null;
  const dashboardTotals = isNightOpen ? totals : (lastNight?.totals ?? EMPTY_TOTALS);
  const dashboardOrders = isNightOpen ? orders : (lastNight?.orders ?? []);
  const dashboardStartedAt = isNightOpen ? event?.startedAt : lastNight?.startedAt;
  ```
  (`EMPTY_TOTALS` — objeto `EventTotals` en cero, para el caso sin noche abierta y sin historial;
  puede vivir como constante local o exportarse de `lib/totals.ts` si ya existe algo equivalente —
  confirmar con `grep` antes de crear uno nuevo).
- `useAdminAnalytics(dashboardTotals, dashboardStartedAt, dashboardOrders, historyEvents)` en vez
  de los valores en vivo directos (línea 240 hoy).
- `customPaymentBreakdown`: cambiar la dependencia de `totals` a `dashboardTotals` (línea 174 y el
  `useMemo` dep array línea 214), y sacar los fallbacks hardcodeados `45/35/15/5` → `0`. Además,
  el `.filter(b => b.total > 0 || b.pct > 0)` final solo debe aplicarse cuando
  `dashboardTotals.total > 0`; cuando es `0`, se devuelven los 4 métodos tal cual (todos en
  `total:0, count:0, pct:0`) para que la leyenda de `PaymentDonut` los pinte en cero en vez de
  desaparecer.
- Props a `DashboardSection` (líneas 586-598): pasar `totals={dashboardTotals}`,
  `customPaymentBreakdown` ya recalculado, y agregar 2 props nuevas: `isNightOpen={isNightOpen}` y
  `lastNightClosedAt={lastNight?.closedAt}` (para el subtítulo "Noche del 14 jul" cuando
  `!isNightOpen`).

**`apps/web/src/components/admin/DashboardSection.tsx`**:
- `Props`: agregar `isNightOpen: boolean` y `lastNightClosedAt?: number`.
- 3 `MetricCard` (líneas 178-202): cuando `!isNightOpen`, `subtitle` pasa de
  `` `vs. ${lastNightName}` `` a un texto formateado desde `lastNightClosedAt` (ver helper nuevo
  abajo, ej. "Noche del 14 jul"), y no se pasa `delta` (o se pasa `undefined` — confirmar que
  `MetricCard` ya soporta `delta` opcional, ya lo hizo opcional para `sparklineData` en la spec
  `simplificar-dashboard-admin`; revisar si `delta` también lo es).
- Bloque "Comparativa" (líneas 262-298): envolver en `{isNightOpen && (...)}` — no se renderiza en
  absoluto sin noche abierta.
- Footer (línea 319, "Iniciado a las {startedAtStr} hs"): condicionar el texto — con
  `isNightOpen` sigue igual; sin noche abierta, cambiar a algo como "Última noche — iniciada a las
  {startedAtStr} hs" para no leerse como que hay una operación corriendo ahora mismo. Mismo
  criterio para cualquier copy tipo "Monitoreo Activo" si vive en este archivo o en `AdminClient`
  (confirmar con `grep "Monitoreo Activo"` antes de tocar).
- "Ventas por Hora", "Productos Más Vendidos", "Hora Pico de Ventas": **sin cambios de código** —
  ya consumen `hourlyData`/`productRevenue`/`peakHour` del hook, que ahora recibe los datos
  correctos según el estado gracias al cambio en `AdminClient`.

**`apps/web/src/lib/analytics.ts`** — nuevo helper de formato:
- Agregar `formatNightDate(ts: number): string` (ej. "Noche del 14 de julio" o "14 jul", a
  definir el formato exacto en `/tasks` mirando el resto de copys de Historial) para el subtítulo
  de las `MetricCard` sin noche abierta. Evaluar si conviene extraer/reusar la lógica de
  `formatShortDate`/`MONTHS_SHORT` que hoy vive local a `HistorialSection.tsx` en vez de duplicar
  el array de meses — si se extrae, `HistorialSection.tsx` pasa a importarla desde acá.

**`apps/web/src/components/analytics/PaymentDonut.tsx`**:
- Círculo de fondo (líneas 67-74, gris `ink-800`): sin cambios, ya cumple el rol de "anillo vacío"
  cuando no hay segmentos de color encima.
- Segmentos por canal (líneas 76-90): con los `pct:0` reales que ahora puede traer `breakdown`
  (ver cambio en `AdminClient`), el `strokeDasharray`/`segmentLength` calculado da 0 — no se
  dibuja arco de color. No debería requerir cambio de lógica, pero agregar un test que lo
  confirme (ver Tests).
- Total central (líneas 92-104): sin cambios de lógica — ya muestra `$0` correctamente; opcional
  atenuar el color (`accentColor` → gris) cuando `total === 0`, a definir en `/tasks` si suma
  claridad visual.
- Leyenda (líneas 108-143): hoy el punto de color de cada fila usa `entry.color` siempre. Agregar
  condicional: si `total === 0`, el punto se pinta con un gris neutro (ej. `ink-600`) en vez de
  `entry.color`, para las 4 filas. La rama "Sin datos de pago disponibles" (línea 141,
  `breakdown.length === 0`) deja de alcanzarse en el caso `total === 0` porque `AdminClient` ya no
  filtra esos 4 métodos — sigue existiendo como fallback defensivo si en algún momento `breakdown`
  llega vacío por otra razón.

**`apps/web/src/components/analytics/NightComparator.tsx`** (componente `NightDetailView`,
líneas 342-468):
- Línea 387 (label "Pedidos" del bloque día) y línea 446 (label "Pedidos" por sesión): renombrar
  ambas a "Tickets Emitidos" (mismo valor `night.orderCounter`/`session.orderCounter`, sin cambio
  de cálculo).
- Agregar dato destacado **Top Trago**: `night.totals.drinksSold[0]` — ya viene ordenado
  descendente por `qty` (calculado en el `useMemo` de `HistorialSection.tsx` que arma
  `unifiedHistoryDays`, línea 116: `.sort((a,b) => b.qty - a.qty)`), no hace falta llamar
  `computeNightRecords` de nuevo. Si `drinksSold.length === 0`, mostrar un placeholder ("—" o
  similar, mismo criterio que otros datos vacíos del panel).
- Agregar dato destacado **Duración**: `formatDuration(night.closedAt - night.startedAt)` —
  `formatDuration` ya existe en `lib/analytics.ts` (líneas 132-142), solo hay que importarlo en
  este archivo.
- Bloque "Detalle de Sesiones Individuales" (líneas 411-452): envolver en
  `{night.sessions.length > 1 && (...)}`. Cuando `night.sessions.length === 1`, mostrar el
  horario (`sessions[0].startedAt`→`sessions[0].closedAt`) y `closedBy` como una línea chica
  dentro del bloque principal (cerca del header "Totales Consolidados del Día"), sin repetir
  Recaudado/Web/Efectivo/Tickets Emitidos.

### Cambios de datos

Ninguno. Sin migraciones, sin cambios a `packages/shared/src/domain.ts` (`EventSummary`/
`EventTotals`/`NightEvent` ya traen todos los campos que se necesitan — `orders`, `drinksSold`,
`startedAt`/`closedAt`), sin impacto en sync local↔cloud ni en el modelo offline-first — todo se
deriva de datos que `AdminClient.tsx` ya carga hoy (`useEventState` + `historyEvents` vía
`eventsService.getHistory()`).

### Real-time

Sin cambios de eventos SSE. `isNightOpen`/`dashboardTotals`/`dashboardOrders`/`dashboardStartedAt`
son derivados (`useMemo`) de `event`/`orders`/`historyEvents`, que ya se actualizan hoy vía SSE
(`event.opened`, `event.closed`, `order.created`, etc. en `useEventState.ts`) — al abrir o cerrar
la noche en vivo, el Dashboard va a recalcular y cambiar de estado automáticamente sin ningún
handler nuevo.

### Auth/permisos

Sin cambios. Todo el flujo sigue detrás del guard de `/admin` (rol `admin`, `authMiddleware`/
`requireRole` sin tocar); `historyEvents` ya se carga con el mismo permiso que usa hoy
`HistorialSection`.

### Riesgos

- **`MetricCard`/`ComparisonRow` con `delta` ausente**: hay que confirmar si `delta` ya es opcional
  en `MetricCard` (como se hizo con `sparklineData` en `simplificar-dashboard-admin`) antes de
  asumir que no renderizar la prop no rompe nada — revisar el componente antes de tocar
  `DashboardSection`.
- **`EMPTY_TOTALS` duplicado**: si ya existe una constante equivalente en `lib/totals.ts` o
  similar, reusarla en vez de crear una nueva — confirmar con `grep -rn "efectivoTotal: 0"` o
  similar antes de escribir una nueva.
- **`PaymentDonut` sin filtrar por `total===0`**: el cambio de que `customPaymentBreakdown` ya no
  filtre los 4 métodos cuando el total es 0 real puede afectar cualquier otro consumidor de
  `customPaymentBreakdown` si lo hay — confirmar con `grep -rn "customPaymentBreakdown"` que
  `DashboardSection`/`PaymentDonut` son los únicos consumidores antes de cambiar el filtro.
- **Copys ("Monitoreo Activo", "Iniciado a las...")** pueden vivir repartidos entre
  `DashboardSection.tsx` y `AdminClient.tsx` (footer/status bar) — hay que revisar ambos archivos
  para no dejar un mensaje que siga sonando "en vivo" cuando en realidad se están mostrando datos
  de la última noche.
- **Tests de caracterización** a reescribir: `DashboardSection.test.tsx` (casos con/sin noche
  abierta), `NightComparator.test.tsx` (Top Trago, Duración, ocultar sesión única), y si existen,
  tests de `PaymentDonut.tsx`/`AdminClient.tsx` sobre `customPaymentBreakdown`.

### Alternativas consideradas

- **Pasar `event`/`historyEvents` crudos a `DashboardSection` y resolver ahí qué fuente usar**:
  descartada — `AdminClient` ya es quien resuelve `totals`/`customPaymentBreakdown` hoy: mantener
  esa responsabilidad centralizada evita que `DashboardSection` (presentacional) tenga que conocer
  la forma de `EventSummary`/`NightEvent`.
- **Nuevo endpoint de backend `/api/events/last-night`**: descartado — `historyEvents[0]` ya está
  cargado en `AdminClient` (mismo array que usa Historial), no hace falta ida y vuelta al backend
  para un dato que ya existe en el cliente.
- **Calcular "Top Trago" de la noche con `computeNightRecords([night])`** (reusando la función que
  arma "Trago Estrella"): descartada a favor de leer directo `night.totals.drinksSold[0]` — ese
  array ya viene ordenado por cantidad desde `unifiedHistoryDays` en `HistorialSection.tsx`, evita
  una llamada extra y una ventana de tiempo (`windowDays`) que no aplica acá (es 1 sola noche, no
  un rango).

---

## Tareas

Sin migraciones ni backend — todo el trabajo es en `apps/web`. Orden pensado para que cada paso
deje el árbol compilando (verificar antes de asumir, tocar los "productores" de datos antes que
los "consumidores").

### 0. Verificación previa (no-destructiva)
- [x] `grep -rn "delta" apps/web/src/components/shared/MetricCard.tsx` — confirmar si la prop
  `delta` ya es opcional (como lo es `sparklineData` desde `simplificar-dashboard-admin`) o hay
  que hacerla opcional en este paso.
- [x] `grep -rn "EventTotals" apps/web/src/lib/totals.ts apps/web/src/lib/analytics.ts` —
  confirmar si ya existe una constante/objeto "totales en cero" reusable antes de crear
  `EMPTY_TOTALS` nuevo.
- [x] `grep -rn "customPaymentBreakdown"` en todo `apps/web/src` — confirmar que
  `DashboardSection.tsx`/`PaymentDonut.tsx` son los únicos consumidores antes de cambiar el
  filtro de canales en cero.
- [x] `grep -rn "Monitoreo Activo\|Iniciado a las"` en `apps/web/src/components/admin/` y
  `apps/web/src/app/admin/` — listar todos los lugares con copy "en vivo" que puedan necesitar
  ajuste de texto cuando `!isNightOpen`.
- [x] Confirmar en `apps/web/src/components/analytics/NightRecords.tsx`/`lib/analytics.ts` que no
  hay otro consumidor de `computeNightRecords` con firma distinta que se vea afectado al no
  tocarlo (esta spec no lo modifica, solo confirma que sigue sin uso cruzado).

### 1. Helper de fecha para el subtítulo del Dashboard
- [x] `apps/web/src/lib/analytics.ts` — agregar `formatNightDate(ts: number): string` (formato
  tipo "Noche del 14 de julio" o "14 jul" — definir mirando los copys existentes de
  `HistorialSection.tsx`/`NightComparator.tsx` para consistencia).
- [x] Evaluar si conviene extraer `formatShortDate`/`MONTHS_SHORT` (hoy locales a
  `HistorialSection.tsx`) a este mismo archivo para no duplicar el array de meses; si se extrae,
  actualizar el import en `HistorialSection.tsx`.
- [x] Agregar test unitario de `formatNightDate` (co-ubicado con los tests existentes de
  `lib/analytics.ts` si los hay).

### 2. `AdminClient.tsx` — resolver la fuente de datos según `isNightOpen`
- [x] Agregar `isNightOpen = event?.status === "activo"` (mismo criterio que ya usa el sidebar).
- [x] Agregar `EMPTY_TOTALS` (si el paso 0 confirmó que no existe ya) y el `useMemo` que resuelve
  `dashboardTotals`/`dashboardOrders`/`dashboardStartedAt` según `isNightOpen`, usando
  `historyEvents[0]` como fuente cuando no hay noche abierta.
- [x] Cambiar `useAdminAnalytics(...)` para recibir `dashboardTotals`/`dashboardStartedAt`/
  `dashboardOrders` en vez de los valores en vivo.
- [x] `customPaymentBreakdown`: cambiar la dependencia de `totals` a `dashboardTotals`, sacar los
  fallbacks hardcodeados `45/35/15/5` (pasan a `0`), y condicionar el `.filter(...)` final para
  que solo se aplique cuando `dashboardTotals.total > 0` (con total 0 real, se devuelven los 4
  métodos en cero sin filtrar).
- [x] Pasar `totals={dashboardTotals}`, `isNightOpen={isNightOpen}` y
  `lastNightClosedAt={lastNight?.closedAt}` como props nuevas/actualizadas a `DashboardSection`.
- [x] Revisar y ajustar cualquier copy "en vivo" detectado en el paso 0 (footer/status bar) según
  `isNightOpen`.

### 3. `DashboardSection.tsx` — 2 estados
- [x] Agregar `isNightOpen: boolean` y `lastNightClosedAt?: number` a `Props`.
- [x] Las 3 `MetricCard` (Ventas/Tickets/Unidades): con `!isNightOpen`, `subtitle` pasa a
  `formatNightDate(lastNightClosedAt)` y no se pasa `delta` (confirmar impacto del paso 0 sobre
  `MetricCard`).
- [x] Envolver el bloque "Comparativa" en `{isNightOpen && (...)}`.
- [x] Ajustar el texto del footer ("Iniciado a las...") para diferenciar `isNightOpen` de
  `!isNightOpen` (ej. "Última noche — iniciada a las... hs").
- [x] Confirmar que "Ventas por Hora"/"Productos Más Vendidos"/"Hora Pico de Ventas" no necesitan
  cambios de código (ya consumen datos del hook, que ahora vienen resueltos correctamente).
- [x] `apps/web/src/components/admin/DashboardSection.test.tsx` — agregar casos: `isNightOpen`
  (comportamiento actual, sin cambios) y `!isNightOpen` (datos de última noche, sin Comparativa,
  sin delta, subtítulo con fecha).

### 4. Fix torta "Distribución por Canal"
- [x] `apps/web/src/components/analytics/PaymentDonut.tsx` — leyenda: cuando `total === 0`, el
  punto de color de cada fila se pinta gris (ej. `ink-600`) en vez de `entry.color`.
- [x] Confirmar visualmente (o con test) que con `breakdown` de 4 entradas en `pct:0` el cálculo
  de segmentos (`strokeDasharray`/`segmentLength`) da 0 y no dibuja arcos de color — sin cambio de
  lógica esperado, solo agregar el caso de test.
- [x] Evaluar (opcional, a decidir en la implementación) atenuar el color del total central
  cuando `total === 0`.
- [x] Tests de `PaymentDonut` (crear si no existen, o extender): caso `total > 0` (sin cambios de
  comportamiento) y caso `total === 0` (anillo sin color, leyenda en gris/$0/0%).

### 5. Historial — `NightDetailView` en `NightComparator.tsx`
- [x] Renombrar el label "Pedidos" → "Tickets Emitidos" en el bloque día (línea ~387) y en el
  detalle por sesión (línea ~446).
- [x] Agregar dato destacado "Top Trago" usando `night.totals.drinksSold[0]` (con placeholder si
  el array está vacío).
- [x] Agregar dato destacado "Duración" usando `formatDuration(night.closedAt - night.startedAt)`
  (importar `formatDuration` desde `lib/analytics.ts`).
- [x] Envolver "Detalle de Sesiones Individuales" en `{night.sessions.length > 1 && (...)}`.
- [x] Cuando `night.sessions.length === 1`, mostrar horario + `closedBy` de esa única sesión como
  línea chica dentro del bloque principal (sin repetir los totales).
- [x] `apps/web/src/components/analytics/NightComparator.test.tsx` — agregar casos: label "Tickets
  Emitidos", Top Trago presente/vacío, Duración formateada, sesión única oculta vs. 2+ sesiones
  visibles, y confirmar que el modo comparación (`idxB !== -1`) no cambia.

### 6. Cierre
- [x] `pnpm typecheck` (api + web) en verde.
- [x] `eslint` en verde (sin errores nuevos).
- [x] `vitest run` en `apps/web` en verde — suite completa, no solo los archivos tocados.
- [x] `next build` de punta a punta sin errores.
- [x] Verificación manual/E2E con el subagent `e2e-playwright-tester`: probar los 2 estados reales
  del Dashboard (con noche abierta sin cambios visibles; sin noche abierta mostrando la última
  noche, sin Comparativa, sin deltas), la torta en $0 real (anillo gris, leyenda en cero) y el
  detalle de una noche en Historial (Tickets Emitidos, Top Trago, Duración, sesión única oculta,
  2+ sesiones visible, comparador A/B sin cambios).
- [x] Actualizar `docs/ROADMAP.md` con una entrada breve para esta feature (mismo formato que
  "Simplificar Dashboard de `/admin`"/"Simplificar Historial de Noches").
- [x] Cambiar el estado del header de esta spec de `draft` a `done`.

---

**Notas de ejecución**: los pasos 2 y 3 (`AdminClient`/`DashboardSection`) son los de mayor
superficie porque tocan el flujo de datos que alimenta todo el Dashboard — usar Plan Mode si se
quiere revisar el `useMemo` de resolución de fuente antes de tocar el JSX. El resto de los pasos
son independientes entre sí y pueden reordenarse. Ir tildando `- [x]` a medida que se completa
cada tarea.
