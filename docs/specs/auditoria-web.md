# Auditoría de apps/web — modularización de god-components + tests (Fase 3)

**Estado**: approved
**Fecha**: 2026-07-01

> Fase 3 de la iniciativa de auditoría (ver `docs/ROADMAP.md`): **API** (Fase 2, completa,
> `docs/specs/auditoria-api.md`) → **Web** (esta spec) → **E2E post-refactor** (Fase 4, pendiente).

---

## Problema / Por qué

`apps/web` tiene tres "god-components" que concentran casi toda la lógica de sus pantallas en un
solo archivo: `AdminClient.tsx` (3418 líneas, 41 `useState`), `CajaClient.tsx` (2182 líneas) y
`BarraClient.tsx` (1517 líneas). Cada uno mezcla fetch de datos, estado local, lógica de negocio y
JSX de presentación en el mismo lugar. `AdminClient.tsx` ya demostró que se puede modularizar bien:
su sección "Configuración" está dividida en 4 sub-componentes (`GeneralSection`, `CartaSection`,
`PagosSection`, `UsuariosSection`), pero el resto de sus vistas (Dashboard, Historial de ventas,
Productos, Monitoreo en vivo) sigue todo inline.

Además, `apps/web` no tiene **ningún test**: no hay test runner instalado (ni Vitest, ni RTL, ni
nada), cero archivos `*.test.tsx`. Cualquier cambio en estas pantallas hoy se verifica solo a mano
en el navegador.

Esto le hace difícil a cualquiera (agente o humano) tocar una de estas pantallas sin arrastrar
efectos colaterales a otras partes del mismo archivo, y hace que agregar una feature nueva en
`/admin`, `/caja` o `/barra` sea cada vez más riesgoso a medida que el archivo crece.

## Objetivo

- `AdminClient.tsx`, `CajaClient.tsx` y `BarraClient.tsx` quedan reducidos a **shells de
  navegación** (routing entre vistas/pestañas + estado compartido mínimo, como sesión del usuario
  actual o el evento activo), con sus vistas grandes extraídas a componentes propios.
- Cada vista extraída tiene su propio componente (y su propio hook de datos si la lógica de
  fetch/estado lo amerita), siguiendo el mismo patrón que ya usa la sección "Configuración" de
  `AdminClient.tsx`.
- Cada vista extraída pasa por una **auditoría SOLID/clean code** (separación de responsabilidades,
  prop drilling excesivo, lógica de negocio mezclada con presentación) y se corrige lo que
  corresponda.
- Lo que se extrae/toca en esta fase queda con **tests de caracterización** (Vitest + React Testing
  Library) que capturan su comportamiento real antes y después del refactor.
- Queda un test runner instalado y scripteado en `apps/web` que cualquiera puede correr localmente.

## Historias de usuario

- Como **desarrollador** quiero poder abrir el archivo de una vista puntual de `/admin` (ej.
  "Historial de ventas") sin tener que navegar un archivo de 3000+ líneas para entender o modificar
  solo esa parte.
- Como **desarrollador** quiero que un cambio en una vista extraída me avise automáticamente si
  rompió el comportamiento existente, igual que ya pasa en `apps/api` desde la Fase 2.
- Como **dueño del proyecto** quiero que el frontend quede tan sólido como el backend antes de
  invertir tiempo en pulir la UI de caja (Fase siguiente del roadmap) o en definir el flujo nuevo de
  pedido online con Mercado Pago.

## Criterios de aceptación

- **Dado** `AdminClient.tsx` después del refactor, **cuando** se lo abre, **entonces** ya no
  contiene inline la lógica ni el JSX de Dashboard, Historial, Productos ni Monitoreo — cada una es
  un componente propio en `apps/web/src/components/admin/`.
- **Dado** el mismo tratamiento aplicado después a `CajaClient.tsx` y `BarraClient.tsx`, **cuando**
  se los abre, **entonces** están igualmente reducidos a shells de navegación.
- **Dado** cualquier vista extraída, **cuando** se corre `pnpm --filter cocktrail-app test` (nuevo
  script), **entonces** existen tests de caracterización con RTL, con los servicios de
  `apps/web/src/services/*.ts` mockeados (sin pegarle a la API real).
- **Dado** el código ya auditado, **cuando** se corre `pnpm --filter cocktrail-app exec tsc
  --noEmit` y `pnpm --filter cocktrail-app build`, **entonces** ambos terminan sin errores.
- **Dado** un hallazgo de `architect-reviewer`/`expert-react-frontend-engineer`, **cuando** el fix
  es chico y de bajo riesgo, **entonces** se aplica directo; si es estructural, se documenta como
  tarea explícita antes de implementarlo (vía `/plan` + `/tasks`).
- **Dado** que la Fase 3 se da por terminada, **cuando** se revisa `docs/ROADMAP.md`, **entonces**
  está marcada como completa y aparece registrada la Fase 4 (E2E post-refactor) como próximo paso.

## Fuera de alcance

- No se agregan tests a componentes o servicios que **no** se tocan en esta fase (`Ticket.tsx`,
  `DrinkCard.tsx`, `apps/web/src/services/*.ts` existentes, etc.) — solo lo que se extrae o
  refactoriza directamente.
- No se cambia el comportamiento observable de ninguna pantalla salvo que sea el fix explícito de
  una violación SOLID detectada — esto no es una fase de features nuevas ni de rediseño visual.
- No se define ni se implementa el flujo nuevo de barra con Mercado Pago web + canje de ticket
  virtual (mencionado por el usuario como algo a futuro, todavía sin diseñar) — queda fuera
  explícitamente de esta fase.
- No se tocan las 4 sub-secciones de Configuración ya extraídas (`GeneralSection`, `CartaSection`,
  `PagosSection`, `UsuariosSection`) salvo que aparezca un hallazgo puntual al auditarlas de paso.
- No se hacen tests E2E de flujos completos todavía (es la Fase 4, posterior a este refactor).

## Plan técnico

### Enfoque

Se instala Vitest + React Testing Library en `apps/web` (mock de servicios, sin pegarle a la API
real). Se recorren los 3 god-components en el orden fijado (`AdminClient` → `CajaClient` →
`BarraClient`); dentro de `AdminClient`, cada `activeTab` que sigue inline se extrae a su propio
componente en `components/admin/`, moviendo junto los sub-componentes/helpers que le pertenecen
exclusivamente y subiendo al shell (o a un hook compartido) lo que consumen dos o más vistas. Antes
de extraer, se limpia el código muerto ya detectado (ver Riesgos). El patrón se repite en
`CajaClient`/`BarraClient` una vez validado con `AdminClient`.

### Archivos/módulos afectados

**Setup (una vez, antes de tocar componentes):**
- `apps/web/package.json` — nuevas devDependencies: `vitest`, `@vitejs/plugin-react`, `jsdom`,
  `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`. Scripts
  `test`, `test:watch`.
- `apps/web/vitest.config.ts` — `environment: "jsdom"`, `setupFiles` con `@testing-library/jest-dom`.

**`AdminClient.tsx` (3418 líneas → shell), `activeTab` con 9 valores:**
- `components/admin/DashboardSection.tsx` (`activeTab === "monitoreo"`, hoy L1331-1799) + su test.
- `components/admin/EstadisticasSection.tsx` (`"estadisticas"`, hoy L1800-1937) + su test. Se
  mantiene tal cual aunque hoy sea inalcanzable desde la UI (ver Riesgos) — no se decide su
  destino en esta fase.
- `components/admin/HistorialSection.tsx` (`"historial"`, hoy L1939-2471, con su fetch
  `eventsService.getHistory()`) + su test.
- `components/admin/LogsSection.tsx` (`"logs"`, hoy L2524-3044, con `ordersService.getAuditLogs`
  y la cancelación de tickets) + su test.
- `components/admin/QrSection.tsx` (`"qr"`, hoy L2474-2521) + su test.
- `hooks/useAdminAnalytics.ts` — extrae el `useMemo` de ~35 valores derivados (L827-978) del que
  hoy dependen Monitoreo y Estadísticas, para no duplicarlo entre los dos componentes nuevos.
- `components/shared/MetricCard.tsx`, `Sparkline.tsx`, `AnimatedNumber.tsx`, `EmptyCard.tsx` —
  compartidos entre ≥2 vistas (`MetricCard` lo usan Monitoreo e Historial), se mueven a un módulo
  común en vez de duplicarse.
- `components/admin/TopProductsList.tsx`, `ComparisonRow.tsx` — exclusivos de Monitoreo, migran
  junto con `DashboardSection`.
- **Eliminar** (código muerto confirmado, sin callers): `Kpi`, `OrderRow`, `statusToBadge`,
  `formatDuration` (~115 líneas).
- `AdminClient.tsx` queda con: `activeTab`/`handleTabChange`/breadcrumbs, `event`/`orders`/
  `cashSales` + el `useSSE` global, `currentUser`/tema, sidebar, y los modales globales
  (abrir/cerrar noche).
- Las 4 rutas legacy (`admin/productos/page.tsx`, `admin/settings/page.tsx`, `admin/qr/page.tsx`,
  `admin/historial/page.tsx`) no cambian — siguen redirigiendo a `/admin?tab=X`.

**`CajaClient.tsx` (2182 líneas → shell), `activeTab: "venta" | "historial" | "metricas"`:**
- `components/caja/VentaSection.tsx` (grid de productos + carrito, hoy ~L1114-1298/1550-1592) +
  `hooks/useCheckout.ts` (estado de checkout/pagos/Posnet, hoy L319-336 y L582-723) + tests.
- `components/caja/HistorialSection.tsx` (hoy ~L1299-1412/1396-1460, con scroll infinito) + test.
- `components/caja/MetricasSection.tsx` (hoy ~L1413-1549/772-864) + test.
- `hooks/usePrinterStatus.ts` — extrae el polling de impresora (hoy L333-379).
- `CompactDrinkCard`, `mapStatus`, `getItemsPreview`, `formatDayMonth`/`formatHourMinute` (hoy
  L72-263) migran con la sección que los usa (venta / historial respectivamente).
- `CajaClient.tsx` queda con: `currentUser`, `event`/`orders`/`cashSales` + `useSSE` global,
  `activeTab`, sidebar, `CloseNightModal`.

**`BarraClient.tsx` (1517 líneas → shell), sin `activeTab` (pantalla única con overlays):**
- `hooks/useOfflineScanQueue.ts` — **movida como unidad atómica** toda la lógica de cola offline +
  `handleScan` + `useScannerInput` (hoy L93, 120-139, 219-315, 317-320, 321-379). Ver Riesgos: es
  el bloque más sensible de toda la fase.
- `components/barra/PendingOrdersList.tsx` (hoy ~L774-950, `fetchPendingOrders`) + test.
- `components/barra/ManualRedeemModal.tsx` (hoy ~L951-1064) + test.
- `components/barra/CancelOrderModal.tsx` (hoy ~L1065-1200) + test.
- `components/barra/DevPanel.tsx` (hoy ~L1201-1287, ya condicionado a
  `NODE_ENV === "development"`) — se extrae igual para sacarlo del bundle de shell, sin agregarle
  tests (no corre en producción).
- `RecentScanCard`, `EmptyScanSlot`, `SectionTitle`, `Stat`, `Sep`, `ToastItem`,
  `getPendingStatus` (hoy L1293-1516) migran con la sección que los usa; `SectionTitle`/`Stat`/
  `Sep` van a `components/shared/` por ser genéricos.
- `BarraClient.tsx` queda con: `currentUser`, `event`/`eventRef` + `useSSE` global, `barCode`,
  el hero de últimos escaneos, y el layout general.

### Cambios de datos

- **Sin migraciones nuevas** — esta fase no toca `supabase/migrations/` ni el esquema.
- **Sin cambios en `packages/shared/src/domain.ts`** — no se tocan contratos de dominio (ya se
  simplificó `OrderStatus` en la rama previa, `simplificar-estados-pedido-y-cajavip`, de la que
  parte esta fase).
- **Sin impacto en sync local↔cloud ni en offline-first** — es un refactor de presentación/estado
  de React; los servicios de `apps/web/src/services/*.ts` que llaman a la API no cambian su
  contrato, solo qué componente los invoca.

### Real-time

No se agregan eventos SSE nuevos. Los 3 componentes siguen consumiendo el mismo canal
(`apps/web/src/lib/useSSE.ts`) con los mismos handlers que ya tienen
(`order.created`, `order.updated`, `cash_sale.added`, `event.closed`, `event.opened`) — el
`useSSE` central se queda en cada shell (`AdminClient`/`CajaClient`/`BarraClient`) porque sus
handlers tocan estado de varias vistas a la vez (ej. en `BarraClient`, el handler de SSE actualiza
`pendingOrders`, `recentScans`, `deliveredCount` y `devOrders` en el mismo callback). No se
descompone el `useSSE` en esta fase — es justamente el mayor punto de acoplamiento cruzado
detectado y separarlo mal podría introducir bugs de sincronización; queda documentado como
hallazgo estructural (ver Riesgos), no se toca salvo que aparezca un problema concreto al mover
las vistas que consumen sus datos.

### Auth/permisos

No cambia el modelo de auth. Los 3 shells siguen resolviendo `currentUser` vía
`authService.getMe()` y usando `hasPermission()`/`UserPermissions` para condicionar botones
(ej. cancelar tickets, cerrar noche) — esa lógica quiere quedarse en el shell o pasarse como prop
a la vista extraída, no se relocaliza a los componentes hijos de forma independiente (evita que
cada vista tenga que volver a resolver permisos por su cuenta).

### Riesgos

- **`useOfflineScanQueue` en `BarraClient` es el bloque de mayor riesgo de toda la fase**: mezcla
  side effects de `localStorage`, `navigator.onLine`, vibración y reintentos con `setInterval`.
  Se extrae como unidad atómica (no se descompone en piezas más chicas) y lleva tests de
  caracterización antes de tocar nada más de `BarraClient`.
- **`activeTab === "estadisticas"` es inalcanzable desde la UI hoy** (no hay botón/link que la
  setee, solo se llega tecleando `?tab=estadisticas`) — se extrae igual tal cual está (mismo
  comportamiento, ni mejor ni peor), sin decidir en esta fase si se expone un link o se deprecia;
  eso es una decisión de producto fuera del alcance de una auditoría de código.
- **Acoplamiento cruzado Historial→Logs en `AdminClient`** (`handleRedirectToAudit`, hoy L299,
  hace `setActiveTab("logs")` con filtros precargados desde Historial): al separar ambas vistas en
  componentes distintos, este puente tiene que resolverse con un callback pasado desde el shell
  (`onRedirectToLogs`), no con que `HistorialSection` importe o conozca detalles de `LogsSection`.
- **`useSSE` centralizado y acoplado** en los 3 componentes (detallado en "Real-time") — no se
  descompone en esta fase, queda documentado como deuda para una fase futura si hace falta.
- Mover componentes puede introducir regresiones visuales sutiles (spacing, z-index de modales)
  que los tests de RTL no capturan (RTL no verifica CSS real) — mitigación: verificar visualmente
  cada vista extraída en el navegador (`pnpm dev`) antes del commit de esa vista, además del test.

### Alternativas consideradas

- **Extraer por capa de hooks primero, UI después (2 pasadas)** — descartado en el brainstorming:
  divide el trabajo en el doble de commits/revisiones para el mismo resultado final: se prefiere
  extraer vista+hook juntos en una sola pasada por sección.
- **Descomponer el `useSSE` central en esta misma fase** (un hook por dominio: `useOrdersSSE`,
  `useCashSalesSSE`, etc.) — descartado por ahora: alto riesgo de romper sincronización en
  producción sin tests de integración real de SSE (RTL no simula EventSource fácilmente); queda
  como hallazgo estructural documentado, no como tarea de esta fase.
- **Playwright Component Testing en vez de RTL** — descartado en el brainstorming: más pesado de
  mantener y más lento, sin beneficio claro para tests de caracterización de componentes que ya
  van a validarse visualmente a mano durante el refactor.

## Tareas

### 0. Setup (bloquea todo lo demás)

- [ ] Crear rama `refactor/auditoria-web` desde el estado actual de
  `simplificar-estados-pedido-y-cajavip`.
- [ ] Instalar en `apps/web`: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`.
- [ ] Crear `apps/web/vitest.config.ts` (`environment: "jsdom"`, `setupFiles` con
  `@testing-library/jest-dom`).
- [ ] Agregar scripts `test`/`test:watch` en `apps/web/package.json`.
- [ ] Correr `pnpm --filter cocktrail-app test` (debe arrancar sin suites, solo valida que el
  runner levanta) antes de escribir el primer test real.

### 1. `AdminClient.tsx` — limpieza previa + shared components

- [ ] Eliminar código muerto confirmado sin callers: `Kpi`, `OrderRow`, `statusToBadge`,
  `formatDuration` (~L3307-3411 hoy).
- [ ] Extraer a `components/shared/`: `MetricCard.tsx`, `Sparkline.tsx`, `AnimatedNumber.tsx`,
  `EmptyCard.tsx` (compartidos entre ≥2 vistas de `AdminClient`).
- [ ] `pnpm --filter cocktrail-app exec tsc --noEmit` en verde tras la limpieza (antes de extraer
  ninguna vista).

### 2. `AdminClient.tsx` — extraer `DashboardSection` (`activeTab === "monitoreo"`)

- [ ] Extraer `hooks/useAdminAnalytics.ts` con el `useMemo` de ~35 valores derivados (hoy
  L827-978), consumido por Monitoreo y Estadísticas.
- [ ] Crear `components/admin/DashboardSection.tsx` (hoy L1331-1799) + migrar
  `TopProductsList.tsx`, `ComparisonRow.tsx`, `formatRelativeTime` junto con ella.
- [ ] Test de caracterización `DashboardSection.test.tsx` (servicios mockeados).
- [ ] `architect-reviewer` + `expert-react-frontend-engineer` auditan la sección; fixes chicos
  directo, estructurales documentados en Riesgos de la spec.
- [ ] `pnpm --filter cocktrail-app exec tsc --noEmit` + `pnpm --filter cocktrail-app build` en
  verde.
- [ ] Commit.

### 3. `AdminClient.tsx` — extraer `EstadisticasSection` (`activeTab === "estadisticas"`)

- [ ] Crear `components/admin/EstadisticasSection.tsx` (hoy L1800-1937), reutilizando
  `useAdminAnalytics()`. Se extrae tal cual está (sigue inalcanzable desde la UI — no se decide su
  destino en esta fase, ver Riesgos).
- [ ] Test de caracterización.
- [ ] Auditoría + fixes chicos.
- [ ] Typecheck + build en verde. Commit.

### 4. `AdminClient.tsx` — extraer `HistorialSection` (`activeTab === "historial"`)

- [ ] Crear `components/admin/HistorialSection.tsx` (hoy L1939-2471) con su fetch
  `eventsService.getHistory()` y el scroll/paginación propios.
- [ ] Resolver el puente `handleRedirectToAudit` (hoy L299, Historial→Logs) como callback
  `onRedirectToLogs` pasado desde el shell — no como import directo de `LogsSection`.
- [ ] Test de caracterización (incluye el caso de `onRedirectToLogs`).
- [ ] Auditoría + fixes chicos.
- [ ] Typecheck + build en verde. Commit.

### 5. `AdminClient.tsx` — extraer `LogsSection` (`activeTab === "logs"`)

- [ ] Crear `components/admin/LogsSection.tsx` (hoy L2524-3044) con `ordersService.getAuditLogs` y
  la cancelación de tickets (`ordersService.updateStatus(id, "cancelado")`).
- [ ] Recibe el filtro precargado desde `onRedirectToLogs` (tarea 4).
- [ ] Test de caracterización.
- [ ] Auditoría + fixes chicos.
- [ ] Typecheck + build en verde. Commit.

### 6. `AdminClient.tsx` — extraer `QrSection` (`activeTab === "qr"`) y cerrar el shell

- [ ] Crear `components/admin/QrSection.tsx` (hoy L2474-2521).
- [ ] Test de caracterización.
- [ ] Confirmar que `AdminClient.tsx` quedó reducido a shell: `activeTab`/breadcrumbs/sidebar,
  `event`/`orders`/`cashSales` + `useSSE` global, `currentUser`/tema, modales de abrir/cerrar
  noche.
- [ ] Typecheck + build en verde. Commit de cierre de `AdminClient`.

### 7. `CajaClient.tsx` — extraer `VentaSection` + checkout

- [ ] Crear `hooks/useCheckout.ts` (estado de checkout/pagos/Posnet, hoy L319-336 y L582-723) y
  `hooks/usePrinterStatus.ts` (polling de impresora, hoy L333-379).
- [ ] Crear `components/caja/VentaSection.tsx` (grid de productos + carrito, hoy ~L1114-1298 y
  L1550-2094), migrando `CompactDrinkCard` junto con ella.
- [ ] Test de caracterización (incluye flujo de checkout con `mercadopagoService` mockeado).
- [ ] Auditoría (`architect-reviewer` + `expert-react-frontend-engineer`) + fixes chicos.
- [ ] Typecheck + build en verde. Commit.

### 8. `CajaClient.tsx` — extraer `HistorialSection` y `MetricasSection`

- [ ] Crear `components/caja/HistorialSection.tsx` (hoy ~L1299-1412, scroll infinito), migrando
  `mapStatus`, `getItemsPreview`, `formatDayMonth`/`formatHourMinute`.
- [ ] Crear `components/caja/MetricasSection.tsx` (hoy ~L1413-1549 y L772-864).
- [ ] Tests de caracterización de ambas.
- [ ] Auditoría + fixes chicos.
- [ ] Confirmar que `CajaClient.tsx` quedó reducido a shell: `currentUser`, `event`/`orders`/
  `cashSales` + `useSSE` global, `activeTab`, sidebar, `CloseNightModal`.
- [ ] Typecheck + build en verde. Commit de cierre de `CajaClient`.

### 9. `BarraClient.tsx` — extraer `useOfflineScanQueue` (bloque de mayor riesgo)

- [ ] Extraer `hooks/useOfflineScanQueue.ts` como unidad atómica: estado de la cola (hoy L93),
  carga inicial desde `localStorage` (L120-139), `handleScan` completo (L219-315),
  `useScannerInput` (L317-320), sincronización al reconectar (`setInterval`, L321-379).
  **No descomponer en piezas más chicas.**
- [ ] Test de caracterización del hook (mock de `localStorage`, `navigator.onLine`,
  `ticketsService.redeem`) **antes** de extraer el resto de `BarraClient`.
- [ ] Typecheck + build en verde. Commit (solo este hook, aparte del resto de la vista).

### 10. `BarraClient.tsx` — extraer el resto de las secciones

- [ ] Crear `components/barra/PendingOrdersList.tsx` (hoy ~L774-950).
- [ ] Crear `components/barra/ManualRedeemModal.tsx` (hoy ~L951-1064), reutilizando
  `useOfflineScanQueue`/`handleScan` de la tarea 9.
- [ ] Crear `components/barra/CancelOrderModal.tsx` (hoy ~L1065-1200).
- [ ] Crear `components/barra/DevPanel.tsx` (hoy ~L1201-1287, `NODE_ENV === "development"`) — sin
  tests, no corre en producción.
- [ ] Migrar a `components/shared/`: `SectionTitle`, `Stat`, `Sep` (genéricos). Migrar con la
  sección que los usa: `RecentScanCard`, `EmptyScanSlot`, `ToastItem`, `getPendingStatus`.
- [ ] Tests de caracterización de `PendingOrdersList`, `ManualRedeemModal`, `CancelOrderModal`.
- [ ] Auditoría (`architect-reviewer` + `expert-react-frontend-engineer`, y `expert-nextjs-developer`
  si aparece alguna duda de Server/Client Components) + fixes chicos.
- [ ] Confirmar que `BarraClient.tsx` quedó reducido a shell: `currentUser`, `event`/`eventRef` +
  `useSSE` global, `barCode`, hero de últimos escaneos, layout general.
- [ ] Typecheck + build en verde. Commit de cierre de `BarraClient`.

### 11. Cierre de la fase

- [ ] Correr `pnpm --filter cocktrail-app exec tsc --noEmit` y `pnpm --filter cocktrail-app build`
  una vez más de punta a punta.
- [ ] Correr `pnpm --filter cocktrail-app test` completo.
- [ ] Actualizar `docs/ROADMAP.md`: marcar Fase 3 (auditoría Web) completa, agregar Fase 4 (E2E
  post-refactor) como próximo paso explícito, y dejar anotados los hallazgos estructurales no
  resueltos (`useSSE` centralizado en los 3 componentes, `activeTab === "estadisticas"`
  inalcanzable desde la UI).
- [ ] Cambiar el estado de esta spec (`docs/specs/auditoria-web.md`) de `approved` a `done`.

---

> **Nota de implementación**: igual que en la Fase 2, conviene implementar con **Plan Mode**
> componente por componente (no los 3 de una), tildando `- [x]` a medida que cada sección se
> completa y corre en verde antes de pasar a la siguiente.

## Preguntas abiertas

- Ninguna pendiente de decisión de producto: el enfoque (orden de componentes, estrategia de
  extracción por vista, stack de testing, qué se mockea, criterio de alcance de tests, rama,
  proceso por vista, criterio de "terminado") ya se validó en la sesión de brainstorming previa a
  esta spec. Quedan para `/plan`: el mapeo concreto de qué vistas exactas tiene cada componente (ej.
  nombres de pestañas de `CajaClient`/`BarraClient`, que no se relevaron en el brainstorming) y el
  detalle de qué hooks de datos hace falta extraer por vista.
