# Simplificar Dashboard de /admin

**Estado**: done
**Fecha**: 2026-07-05

---

## Problema / Por qué

El panel `/admin` (rol `admin`, a veces `caja`/`barman` con permisos acotados) tiene hoy dos
vistas que se pisan entre sí: **Monitoreo** (Dashboard, la pantalla de entrada) y
**Estadísticas**. Entre las dos suman 9+ bloques de información con un ~70% de solapamiento
(mismo gráfico de ventas por hora, mismo donut de métodos de pago, mismo ranking de productos,
repetido con distinto formato visual).

El resultado es una pantalla de entrada abrumadora: 4 métricas con sparkline individual, un
gráfico de barras, top productos, donut de pagos, un bloque de "insights" generados, una tabla de
comparación contra la noche anterior (con sparkline por fila), y un feed de actividad reciente —
todo en una sola vista, antes de que el dueño/cajera puedan encontrar el número que buscan.

Separado de esto, pero descubierto durante el mismo análisis: el modal de "Cerrar Noche" simula
un proceso de carga de 3.2 segundos con mensajes ficticios ("Consolidando arqueo...",
"Archivando evento...") que no reflejan trabajo real — es teatro de UI que demora sin necesidad
una acción que ya es prácticamente instantánea. Y dos tabs del sidebar (`general`, `qr`) quedaron
sin botón de acceso — código muerto, mismo patrón que `CashSaleModal` (eliminado en la Fase 3C).

**Para quién**: el dueño del boliche (rol `admin`) que entra a `/admin` durante o después de la
noche para ver cómo va la venta — necesita leer el estado del negocio de un vistazo, no analizar
un dashboard de BI.

---

## Objetivo

Que `/admin` tenga **una sola vista de resumen** (Dashboard/Monitoreo) que muestre solo la
información que informa una decisión real, sin duplicar datos entre pantallas y sin gráficos
decorativos. El resto de las vistas (Historial de Noches, Auditoría de Tickets) quedan igual —
ya tienen un rol claro y sin solapamiento.

Adicionalmente: que "Cerrar Noche" no simule un proceso que no existe, y que no quede código de
pantallas inalcanzables en el sidebar.

---

## Historias de usuario

- Como **admin**, quiero ver un Dashboard con pocos números clave (ventas, tickets, unidades,
  método de pago, qué se vende más, a qué hora) para saber cómo va la noche sin tener que
  interpretar gráficos redundantes.
- Como **admin**, quiero que "Ticket Promedio" no aparezca en ningún lado del Dashboard, porque no
  es un dato que use para tomar ninguna decisión.
- Como **admin**, quiero que la comparación contra la noche anterior sea legible de un vistazo
  (lista simple), no una segunda tabla de gráficos que repite los mismos 4 números de arriba.
- Como **admin**, quiero cerrar la noche sin esperar una animación de carga que no representa
  trabajo real.
- Como **cualquier rol con acceso a `/admin`**, quiero que el sidebar solo muestre pantallas que
  realmente andan — sin tabs fantasma.

---

## Criterios de aceptación

1. **Given** un admin entra a `/admin`, **when** carga la pestaña "Monitoreo", **then** ve una
   sola vista de Dashboard con: 3 métricas (Ventas Totales, Tickets Totales, Unidades Vendidas,
   cada una con valor + delta %, sin sparkline individual), el gráfico de Ventas por Hora
   (toggle Costo/Vasos), Top Productos, Donut de Métodos de Pago, Hora Pico de Ventas, y una
   lista de Comparativa vs. noche anterior (3 líneas: Ventas/Tickets/Unidades, con delta %, sin
   sparkline por fila).
2. **Given** el Dashboard fusionado, **when** se revisa cualquier parte de la pantalla,
   **then** no aparece en ningún lado el dato "Ticket Promedio" (ni como card, ni segmentado por
   canal, ni en la comparativa).
3. **Given** el Dashboard fusionado, **then** no aparecen los bloques "Actividad Reciente" ni
   "Smart Insights" (ambos removidos, no ocultos condicionalmente).
4. **Given** el sidebar de `/admin`, **when** se revisa la sección "Operación", **then** ya no
   existe un ítem/tab "Estadísticas" — su contenido útil (Hora Pico) ya está fusionado en
   Monitoreo.
5. **Given** un admin abre "Cerrar Noche" y confirma con su contraseña, **when** el pedido de
   cierre está en curso, **then** se muestra un estado de carga simple (spinner) mientras se
   espera la respuesta real del backend — sin pasos ni mensajes inventados ni demora artificial.
6. **Given** el código de `/admin`, **then** no existen los componentes `GeneralSection` (usado
   solo por el tab muerto `general`) ni `QrSection` (usado solo por el tab muerto `qr`), ni
   ninguna referencia a `activeTab === "general"` / `activeTab === "qr"`.
7. El resto de las vistas del panel (**Historial de Noches**, **Auditoría de Tickets**, **Carta**,
   **Gestión de Staff**, **Mercado Pago**) no cambian de comportamiento.
8. `pnpm typecheck`, `eslint` y la suite de tests de `apps/web` (incluidos los tests de
   caracterización existentes de `DashboardSection`/`EstadisticasSection`, que se van a
   actualizar o fusionar según corresponda) pasan en verde. `next build` de punta a punta sin
   errores.

---

## Fuera de alcance

- Cambios en **Historial de Noches** y **Auditoría de Tickets** — ya están bien definidas, sin
  solapamiento, no se tocan.
- Cambios de backend, esquema de datos o `useAdminAnalytics` más allá de lo que deje de usarse al
  sacar los bloques removidos (no se agregan endpoints ni columnas nuevas).
- Rediseño visual/de estilo del resto del panel (`Carta`, `Gestión de Staff`, `Mercado Pago`).
- Reconectar o rediseñar el flujo `/carta` + QR de mesa — eso es explícitamente Fase 7 del
  roadmap; acá solo se elimina el tab `qr` por estar muerto hoy, no se decide su futuro.
- Cualquier configuración de branding/logo (lo que hacía `GeneralSection`) — se elimina el tab sin
  reemplazo; si el dueño necesita cambiar el logo/branding en el futuro, es una feature aparte a
  spec-ear cuando haya un pedido concreto.
- Tests E2E Playwright de `/caja`/`/admin` (Fase 4 del roadmap, no esta spec).

---

## Preguntas abiertas

Ninguna — todas las decisiones de alcance (qué bloque se mantiene, fusiona o elimina) ya se
validaron con el usuario en la sesión de brainstorming previa a esta spec.

---

## Plan técnico

### Enfoque

Feature 100% `apps/web`, sin tocar `apps/api` ni Supabase — no hay cambios de datos, de sync ni de
SSE, es una reorganización de UI que consume los mismos `totals`/`orders`/`cashSales`/`historyEvents`
que ya llegan a `AdminClient.tsx` por `useEventState`. La estrategia es: (1) recortar
`DashboardSection.tsx` a los bloques que sobreviven, (2) portar el widget "Hora Pico" de
`EstadisticasSection.tsx` al Dashboard recortado, (3) eliminar `EstadisticasSection.tsx` y su tab del
sidebar/router de `AdminClient.tsx`, (4) sacar la secuencia de `setTimeout` de `CloseNightModal.tsx`
y reemplazarla por un loading real atado a la promesa de `onConfirm`, (5) eliminar `GeneralSection`/
`QrSection` y sus tabs muertos. Se hace en ese orden porque el paso 2 depende de tener claro qué
campos de `useAdminAnalytics` sobreviven antes de tocar el hook.

### Archivos/módulos afectados

**Dashboard fusionado**
- `apps/web/src/components/admin/DashboardSection.tsx` — sacar la 4ta `MetricCard` ("Ticket
  Promedio"), sacar `sparklineData` de las 3 `MetricCard` restantes, sacar el bloque "Insights"
  (`<SmartInsights>`) y el bloque "Actividad Reciente" completo (con su `systemLogs`/`AuditLogEntry`
  — deja de necesitarse esa prop), recortar "Comparativa" a 3 `ComparisonRow` (Ventas/Tickets/
  Unidades) sin `sparklineData` (quitar los `compXSparkline`/`buildComparativeSparkline` que
  correspondan a Ticket Promedio, y la prop `sparklineData` de `ComparisonRow`), y sumar un widget
  chico "Hora Pico" (portado de `EstadisticasSection.tsx`, usa `analytics.peakHour`, ya calculado).
- `apps/web/src/components/shared/MetricCard.tsx` — `sparklineData` pasa a **opcional**; el bloque
  `<Sparkline>` solo se renderiza si viene informado. Necesario para no tocar `HistorialSection.tsx`
  (sigue pasando sparklines a sus 4 `MetricCard`, sin cambios).
- `apps/web/src/components/admin/DashboardSection.test.tsx` — actualizar caracterización al nuevo
  contenido (menos cards, sin insights, sin actividad reciente, comparativa de 3 filas, hora pico
  nueva).

**Eliminar Estadísticas**
- `apps/web/src/components/admin/EstadisticasSection.tsx` + su test — **eliminar archivo**.
- `apps/web/src/app/admin/AdminClient.tsx` — sacar el `import EstadisticasSection`, el
  `case "estadisticas"` del `switch` de analytics (línea ~282), el bloque
  `{activeTab === "estadisticas" && ...}`, y el botón "Estadísticas" del sidebar (`renderSidebar`,
  ~línea 404-411).
- `apps/web/src/components/analytics/RevenueByProduct.tsx` — único consumidor era
  `EstadisticasSection`; **eliminar** archivo + test si no queda ningún otro import.
- `apps/web/src/components/analytics/SmartInsights.tsx` — único consumidor era `DashboardSection`
  (tras sacar el bloque de insights); **eliminar** archivo + test.

**Limpieza de `useAdminAnalytics`/`lib/analytics.ts` (dead code causado por esta spec)**
- `apps/web/src/hooks/useAdminAnalytics.ts` — sacar del `return`: `avgTicket`, `deltaAvgTicket`,
  `segmentedTicket`, `smartInsights` (nadie los consume tras los cambios de arriba). **Mantener**
  `peakHour`/`maxHourSales`/`hourlyData`/`productRevenue`/`paymentBreakdown` (siguen en uso) y
  también `webTotal`/`webCount`/`webPct`/`barraTotal`/`barraCount`/`barraPct`/`nightEvolution`/
  `movingAvg`/`cancellationInfo`/`digitalConversion`/`uniqueClients`/`deltaClients`/
  `operationalVelocity`/`maxDrinkQty` — estos últimos **ya estaban sin consumidor antes de esta
  spec** (ver Riesgos); no se tocan acá para no mezclar limpieza no pedida con esta feature.
- `apps/web/src/lib/analytics.ts` — sacar `generateInsights` y `computeSegmentedTicket` (quedan sin
  caller tras lo anterior); revisar sus tests unitarios co-ubicados y borrarlos junto con la función.
  `computeDelta` y el resto de funciones **no se tocan** (siguen en uso).

**Cierre de noche sin carga ficticia**
- `apps/web/src/components/shared/CloseNightModal.tsx` — sacar `fakeLoading`/`fakeLoadingStep` y los
  `setTimeout` `t1`/`t2`/`t3`/`t4` de `handleConfirm`; `onConfirm(password)` se llama directo,
  `submitting` (ya existente) controla un spinner simple durante el `await`. Eliminar
  `FakeLoadingView` (función interna, sin otros usos). Mantener el `try/catch` de error tal cual.
  `pendingTimers`/`isMounted` ya no hacen falta si no quedan timers pendientes por cancelar — pero
  revisar que `wiggle`/`confetti` (que sí usan timers propios en otro efecto) no se vean afectados.
- `apps/web/src/components/shared/CloseNightModal.test.tsx` — actualizar los tests que hoy
  aserten sobre `fakeLoading`/mensajes de `FakeLoadingView`.

**Tabs muertos**
- `apps/web/src/components/settings/GeneralSection.tsx` + test — **eliminar**. Solo se borra la UI
  de edición: los campos `logo_url`/`use_logo_url`/`logo_size`/`text_logo_value`/`text_logo_size` de
  la tabla `config` (`apps/api/src/modules/config/config.repository.ts`) siguen en uso — los lee
  `BrandLogo.tsx` (vía `config.service.ts`) para renderizar el logo en `/carta`, `/caja`, `/admin` y
  `/barra`. **No se toca la tabla `config` ni sus columnas.**
- `apps/web/src/components/admin/QrSection.tsx` + test — **eliminar**.
- `apps/web/src/app/admin/AdminClient.tsx` — sacar imports, los `case "general"`/`case "qr"` del
  switch de analytics, y los bloques `{activeTab === "general" && ...}` / `{activeTab === "qr" &&
  ...}`. Confirmar que ningún otro archivo importe estos dos componentes antes de borrarlos
  (`grep -rn` de sus nombres fuera de `AdminClient.tsx`).
- `apps/web/src/components/settings/usuariosConstants.ts:25` — la lista de tabs permitidos por rol
  admin incluye `"general"`; sacarlo de ahí también para que no quede una referencia a un tab que ya
  no existe.

### Cambios de datos

Ninguno. No hay migraciones, ni cambios en `packages/shared/src/domain.ts`, ni impacto en el sync
local↔cloud — todo lo que se toca ya vive en memoria del cliente, derivado de datos que ya llegan
por SSE/HTTP.

### Real-time

Sin cambios. El Dashboard fusionado sigue recibiendo `totals`/`orders`/`cashSales` vía
`useEventState` (SSE `order.created`/`order.updated`/`cash_sale.added`/`event.opened`/
`event.closed`) exactamente como antes — ningún handler se agrega ni se saca.

### Auth/permisos

Sin cambios de rol: el Dashboard fusionado sigue detrás del mismo guard de `/admin` (rol `admin`,
`authMiddleware`/`requireRole` en el backend no se tocan). Al sacar `"general"` de
`usuariosConstants.ts` hay que confirmar que no exista otro rol (`caja`/`barman`) con acceso
condicional a ese tab que dependa de esa constante — según el grep hecho durante el análisis, solo
aparece en la lista de `admin`.

### Riesgos

- **Campos ya muertos en `useAdminAnalytics` antes de esta spec** (`webTotal`/`webCount`/`webPct`/
  `barraTotal`/`barraCount`/`barraPct`/`nightEvolution`/`movingAvg`/`cancellationInfo`/
  `digitalConversion`/`uniqueClients`/`deltaClients`/`operationalVelocity`/`maxDrinkQty`, y el
  componente `NightEvolutionChart.tsx` que no se renderiza en ningún lado) — confirmado con `grep`
  que no tienen consumidor hoy. Es deuda preexistente, no introducida por esta spec; se deja
  documentada en el roadmap como candidato a limpieza aparte para no inflar el diff de esta feature.
- **`CloseNightModal`**: al sacar los timers `t1`-`t4`, el efecto de cleanup
  (`pendingTimers`/`isMounted`) puede quedar con código muerto parcial — hay que revisar con cuidado
  qué parte de ese `useEffect` sigue haciendo falta (el `isMounted` general puede seguir sirviendo
  para el `try/catch` de `onConfirm`, evitar `setError`/`setSubmitting` sobre un componente
  desmontado si el cierre de noche real tarda y el usuario cierra el modal).
- **Tests de caracterización existentes** (`DashboardSection.test.tsx`, `EstadisticasSection.test.tsx`,
  `CloseNightModal.test.tsx`) aseguran comportamiento actual — se reescriben como parte de esta
  spec, no se “ajustan” a la fuerza para que pasen; el criterio de aceptación #8 exige que la suite
  completa siga en verde con el comportamiento nuevo.
- **`MetricCard` con `sparklineData` opcional**: cambio de firma compartido con `HistorialSection`
  (y cualquier otro consumidor futuro) — bajo riesgo porque solo se agrega un caso opcional, no se
  cambia el contrato existente para quien ya pasa el dato.

### Alternativas consideradas

- **Mantener Estadísticas como vista separada, más liviana** (opción B de la fase de brainstorming):
  descartada por el usuario — se prefirió fusionar todo en un único Dashboard en vez de mantener dos
  pantallas con roles redefinidos, para no tener que decidir cada vez "¿esto lo miro en Monitoreo o
  en Estadísticas?".
  - **Sacar del todo la lista de Comparativa** (en vez de simplificarla a 3 líneas sin sparkline):
  descartada por el usuario — el delta por card ya cubre "cómo vamos", pero una lista compacta al
  pie sigue sirviendo como resumen sin tener que mirar las 3 cards por separado.
- **Reconectar `general`/`qr` en vez de eliminarlos**: descartada por el usuario — sin un caso de uso
  activo hoy (mismo criterio que `CashSaleModal` en la Fase 3C), se prefiere borrar código muerto en
  vez de mantenerlo "por las dudas".

---

## Tareas

Sin migraciones ni backend — todo el trabajo es en `apps/web`. Orden pensado para que cada paso
deje el árbol compilando (verificar consumidores antes de borrar, no al revés).

### 0. Verificación previa (no-destructiva)
- [ ] Confirmar con `grep -rn` que `GeneralSection`/`QrSection`/`RevenueByProduct`/`SmartInsights`/
  `NightEvolutionChart` no tienen más consumidores que los ya identificados en el plan (por si el
  código cambió desde el análisis). Si aparece alguno nuevo, actualizar el plan antes de seguir.
- [ ] Confirmar que `"general"` en `apps/web/src/components/settings/usuariosConstants.ts:25` no lo
  lee ningún otro rol (`caja`/`barman`) además de `admin`.

### 1. `MetricCard` compartido (base para el resto)
- [ ] `apps/web/src/components/shared/MetricCard.tsx` — hacer `sparklineData` opcional; renderizar
  el bloque `<Sparkline>` solo si viene informado.
- [ ] `apps/web/src/components/shared/MetricCard.test.tsx` — agregar caso sin `sparklineData` (no
  rompe el render). Confirmar que el test existente sin cambios sigue pasando (contrato viejo
  intacto).

### 2. Dashboard fusionado (`DashboardSection.tsx`)
- [ ] Sacar la `MetricCard` "Ticket Promedio" (card + `deltaAvgTicket` + `compAvgSparkline` +
  su `buildComparativeSparkline`).
- [ ] Sacar `sparklineData` de las 3 `MetricCard` restantes (Ventas/Tickets/Unidades).
- [ ] Sacar el bloque `<SmartInsights>` y el `import` correspondiente.
- [ ] Sacar el bloque completo "Actividad Reciente" (incluida la prop `systemLogs`/tipo
  `AuditLogEntry` si deja de usarse en `Props`).
- [ ] Recortar "Comparativa" a 3 `ComparisonRow` (Ventas/Tickets/Unidades) sin `sparklineData`;
  sacar el prop `sparklineData` de `ComparisonRow` si ya no lo usa nadie.
- [ ] Portar el widget "Hora Pico" (de `EstadisticasSection.tsx`) al layout del Dashboard, usando
  `analytics.peakHour` (ya calculado, sin cambios en el hook para este dato).
- [ ] Ajustar el grid/layout para que la pantalla quede prolija con los bloques que quedan (4→3
  metric cards, sin fila de insights/actividad).
- [ ] `apps/web/src/components/admin/DashboardSection.test.tsx` — reescribir la caracterización al
  nuevo contenido.

### 3. Eliminar Estadísticas
- [ ] Borrar `apps/web/src/components/admin/EstadisticasSection.tsx` y su test.
- [ ] `apps/web/src/app/admin/AdminClient.tsx`: sacar el `import EstadisticasSection`, el
  `case "estadisticas"` del switch de analytics, el bloque `{activeTab === "estadisticas" && ...}`
  y el botón "Estadísticas" del sidebar.
- [ ] Borrar `apps/web/src/components/analytics/RevenueByProduct.tsx` + test (sin consumidores
  tras el paso anterior).
- [ ] Borrar `apps/web/src/components/analytics/SmartInsights.tsx` + test (sin consumidores tras
  el paso 2).

### 4. Limpieza de `useAdminAnalytics` / `lib/analytics.ts`
- [ ] `apps/web/src/hooks/useAdminAnalytics.ts` — sacar del `return`: `avgTicket`,
  `deltaAvgTicket`, `segmentedTicket`, `smartInsights`. **No tocar** los demás campos marcados como
  deuda preexistente en el plan.
- [ ] `apps/web/src/lib/analytics.ts` — borrar `generateInsights` y `computeSegmentedTicket` (y sus
  tests co-ubicados), confirmando primero con `grep` que no quedó ningún caller.
- [ ] `apps/web/src/hooks/useAdminAnalytics.test.ts` (si existe) — actualizar el snapshot/aserciones
  de los campos que se sacaron.

### 5. Cerrar noche sin carga ficticia
- [ ] `apps/web/src/components/shared/CloseNightModal.tsx` — sacar `fakeLoading`/`fakeLoadingStep`,
  los `setTimeout` `t1`-`t4` y `FakeLoadingView`; `handleConfirm` llama `onConfirm(password)` directo
  usando el `submitting` ya existente para el estado de carga.
- [ ] Revisar el efecto de cleanup (`pendingTimers`/`isMounted`) y dejar solo lo que sigue haciendo
  falta (evitar `setError`/`setSubmitting` sobre un componente desmontado si el cierre real tarda).
- [ ] `apps/web/src/components/shared/CloseNightModal.test.tsx` — reescribir los tests que hoy
  dependen de `fakeLoading`/mensajes de `FakeLoadingView`; agregar caso de spinner simple durante
  el `await` de `onConfirm`.

### 6. Tabs muertos (`general`/`qr`)
- [ ] Borrar `apps/web/src/components/settings/GeneralSection.tsx` + test.
- [ ] Borrar `apps/web/src/components/admin/QrSection.tsx` + test.
- [ ] `apps/web/src/app/admin/AdminClient.tsx` — sacar imports, `case "general"`/`case "qr"` del
  switch de analytics, y los bloques `{activeTab === "general" && ...}` / `{activeTab === "qr" &&
  ...}`.
- [ ] `apps/web/src/components/settings/usuariosConstants.ts:25` — sacar `"general"` de la lista de
  tabs del rol `admin`.

### 7. Cierre
- [x] `pnpm typecheck` (api + web) en verde.
- [x] `eslint` en verde (sin errores nuevos; los pre-existentes de `HistorialSection`/
  `LogsSection`/`AnimatedNumber`/`Sparkline`/`Toast`/`orderStatus.ts` no se tocan, son deuda
  previa a esta spec).
- [x] `vitest run` en `apps/web` en verde — 233/233 (suite completa, no solo los archivos
  tocados).
- [x] `next build` de punta a punta sin errores (api + web).
- [x] **Verificación manual en vivo con el usuario** (en vez de `e2e-playwright-tester`): se probó
  `/admin` real durante la sesión, lo que encontró 3 bugs no cubiertos por la spec original
  (mismatch Semana/Mes, récords sobre todo el historial, warning de key en `NightComparator`) —
  los 3 corregidos, ver el detalle en `docs/ROADMAP.md`. Confirmado: Dashboard fusionado sin
  restos de Estadísticas/Insights/Actividad Reciente, sidebar sin botón "Estadísticas", cierre de
  noche sin la secuencia de mensajes falsos.
- [x] `docs/ROADMAP.md` actualizado: nueva sección "Feature — Simplificar Dashboard de `/admin`"
  (completa), con la deuda preexistente de `useAdminAnalytics`/`NightEvolutionChart` documentada
  para una limpieza aparte futura.
- [x] Estado de esta spec cambiado de `draft` a `done`.

---

**Notas de ejecución**: el paso 2 (Dashboard) y el paso 5 (CloseNightModal) son los de mayor
superficie de cambio visual — usar Plan Mode si se quiere revisar el layout antes de tocar el JSX.
Ir tildando `- [x]` a medida que se completa cada tarea.
