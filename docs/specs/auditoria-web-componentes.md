# Auditoría de apps/web — componentes sueltos + deuda de Fase 3

**Estado**: draft
**Fecha**: 2026-07-04

> Continuación de la Fase 3 (`docs/specs/auditoria-web.md`, estado `done`, rama
> `refactor/auditoria-web`): esa fase modularizó los 3 god-components
> (`AdminClient`/`CajaClient`/`BarraClient`) pero dejó fuera de alcance ~22 componentes que ya
> existían en `apps/web/src/components/` antes de esa auditoría. Esta spec cierra esa brecha antes
> de pasar a la Fase 4 del roadmap (E2E post-refactor).

---

## Problema / Por qué

La Fase 3 dejó `apps/web/src/components/` con dos clases de componentes: los extraídos durante esa
fase (con test de caracterización y auditoría SOLID vía `architect-reviewer`/
`expert-react-frontend-engineer`) y ~22 componentes preexistentes que nunca se tocaron —
explícitamente listados como fuera de alcance en `docs/specs/auditoria-web.md` ("Fuera de alcance").
Ninguno de estos tiene test, y ninguno pasó por revisión arquitectónica.

Entre ellos hay componentes que tocan los flujos más sensibles del sistema: `CloseNightModal.tsx`
(599 líneas — cierre de noche + sync a Supabase Cloud), `Ticket.tsx` (372 líneas — impresión
térmica), `settings/UsuariosSection.tsx` (585 líneas — gestión de usuarios/roles, superficie de
auth) y `settings/CartaSection.tsx` (644 líneas, el componente sin tocar más grande de todos). Un
bug en cualquiera de estos no tiene red de contención: se detecta a mano en el navegador, igual que
pasaba con los god-components antes de la Fase 3.

Además, la Fase 3 dejó documentados 5 hallazgos concretos que no se resolvieron por estar fuera del
criterio de "fix de bajo riesgo" en ese momento (ver `docs/ROADMAP.md`, sección Fase 3): un bug real
en `ToastItem` (Barra), lógica duplicada en `dynamicAlerts` (Dashboard), una pestaña inalcanzable
desde la UI, y dos puntos de deuda estructural (`useSSE` centralizado, `renderSidebar` inline). Esta
deuda quedó anotada pero nadie volvió a tocarla.

## Objetivo

- Los ~22 componentes de `apps/web/src/components/` que hoy no tienen test quedan con **test de
  caracterización** (Vitest + React Testing Library), mismo patrón que ya usa el resto del repo
  desde la Fase 3.
- Cada uno pasa por la misma auditoría SOLID/clean code de la Fase 3 (`architect-reviewer` +
  `expert-react-frontend-engineer`, y `expert-nextjs-developer` si aparece alguna duda de Server/
  Client Components), con los mismos criterios de fix: bugs reales y violaciones chicas se corrigen
  en la misma fase; hallazgos estructurales grandes quedan documentados, no se implementan acá.
- Se resuelven los 5 hallazgos ya documentados en `docs/ROADMAP.md` (Fase 3) que sean de bajo
  riesgo (`ToastItem`, `dynamicAlerts`, el link faltante de "estadísticas", `renderSidebar`); el
  que sea deuda estructural mayor (`useSSE` centralizado) se evalúa igual que los demás — si al
  auditar aparece una forma de bajo riesgo de resolverlo, se hace; si no, se re-documenta como
  deuda para más adelante, sin forzarlo.
- Al cerrar, `apps/web` queda sin ninguna "segunda clase" de componentes: todo lo que vive en
  `components/` tiene test y pasó auditoría, igual que `app/*/*Client.tsx` y sus vistas extraídas.

## Historias de usuario

- Como **desarrollador** quiero que un cambio en `CloseNightModal.tsx` o `Ticket.tsx` (los flujos
  más sensibles: cierre de noche + sync, impresión térmica) me avise si rompió algo, en vez de
  depender de probarlo a mano cada vez.
- Como **desarrollador** quiero poder tocar `settings/UsuariosSection.tsx` (gestión de roles) con la
  misma confianza que ya tengo en el resto del repo desde las Fases 2 y 3.
- Como **dueño del proyecto** quiero que la deuda que quedó anotada en el roadmap después de la
  Fase 3 no se acumule indefinidamente, sino que se resuelva en la próxima fase de auditoría, como
  ya se hizo con la deuda de Fase 2 (credencial hardcodeada, endpoints sin auth).

## Criterios de aceptación

- **Dado** cualquiera de los ~22 componentes listados en "Fuera de alcance" de
  `docs/specs/auditoria-web.md`, **cuando** se corre `pnpm --filter cocktrail-app test`, **entonces**
  existe al menos un test de caracterización para ese componente (servicios de
  `apps/web/src/services/*.ts` mockeados, sin pegarle a la API real) — salvo `barra/DevPanel.tsx`,
  que se mantiene sin test por no correr en producción (mismo criterio ya aceptado en Fase 3).
- **Dado** cada componente auditado, **cuando** `architect-reviewer`/`expert-react-frontend-engineer`
  encuentra un bug real o una violación chica, **entonces** se corrige en la misma tarea; si es
  estructural, se documenta explícitamente (no se implementa sin pasar por `/plan`+`/tasks` aparte).
- **Dado** el hallazgo de `ToastItem` (Barra) que resetea su timer de dismiss en cada re-render,
  **cuando** se cierra esta fase, **entonces** el bug está corregido (el timer no se reinicia por un
  `onClose` recreado en cada render del padre).
- **Dado** `dynamicAlerts` en `DashboardSection` (duplica reglas que ya cubre
  `generateInsights()`/`smartInsights`), **cuando** se audita, **entonces** se resuelve la
  duplicación (usar una sola fuente de alertas) o se documenta explícitamente por qué no, si aparece
  una razón de producto para mantener ambas.
- **Dado** `renderSidebar` inline en `CajaClient`/`BarraClient`, **cuando** se audita de paso (por
  tocar componentes cercanos), **entonces** se extrae a un componente propio si el fix es de bajo
  riesgo, o se re-documenta si no lo es.
- **Dado** el código ya auditado, **cuando** se corre `pnpm --filter cocktrail-app exec tsc --noEmit`,
  `pnpm --filter cocktrail-app exec eslint .` y `pnpm --filter cocktrail-app build`, **entonces**
  los tres terminan sin errores.
- **Dado** que esta fase se da por terminada, **cuando** se revisa `docs/ROADMAP.md`, **entonces**
  queda marcada como completa, con los hallazgos que sigan sin resolver (si los hay) documentados
  con la misma nota explícita usada en fases anteriores.

## Fuera de alcance

- **`useSSE` centralizado en los 3 shells**: si al auditar no aparece una forma de bajo riesgo de
  descomponerlo, **no se fuerza** en esta fase — sigue siendo la misma decisión tomada en Fase 3
  (alto riesgo de romper sincronización sin tests de integración real de SSE).
- No se cambia el comportamiento observable de ninguna pantalla salvo los fixes explícitos de bugs
  reales o violaciones SOLID detectadas — no es una fase de features nuevas ni de rediseño visual.
- No se tocan los componentes ya auditados en Fase 3 (`components/admin/*`, `components/caja/*`,
  `components/barra/*` salvo `DevPanel.tsx` que ya está en esta lista, `components/shared/*`) salvo
  que un hallazgo de esta fase los toque de refilón (ej. si se extrae `renderSidebar`, eso vive en
  el shell, no en esos componentes).
- No se define ni implementa Fase 4 (E2E con Playwright) — sigue siendo la fase siguiente del
  roadmap, después de esta.
- No se toca `apps/web/src/services/*.ts` salvo que un test lo requiera mockear (sin cambiar su
  contrato).
- Sin migraciones nuevas ni cambios en `packages/shared/src/domain.ts`.

## Plan técnico

### Enfoque

Se agrupan los 22 componentes en **4 bloques por área/riesgo** (no por orden alfabético): primero
los triviales/presentacionales sin servicio (para calibrar el patrón de test con costo bajo),
después `analytics/*` (todos puramente presentacionales, reciben datos ya calculados por prop —
paralelizables entre sí sin riesgo de pisarse), después `settings/*` (tocan servicios reales:
`config`, `drinks`, `users`) y al final los modales/flujos críticos (`CloseNightModal`, `Ticket`,
`TicketLive`, `CashSaleModal`, `OpenNightModal`, `ThemeProvider`), que se hacen de a uno. Dentro de
cada bloque, mismo ciclo que Fase 2/3: test de caracterización → auditoría
(`architect-reviewer`/`expert-react-frontend-engineer`) → fix de bajo riesgo si aplica → typecheck +
lint + build → commit. Los 5 hallazgos de deuda de Fase 3 se resuelven en el bloque del componente
que tocan (`ToastItem`/`renderSidebar` no están en esta lista — viven en `PendingOrdersList.tsx` y
en los shells `CajaClient`/`BarraClient` respectivamente — se abordan como una tarea aparte al
cierre, no dentro de un bloque de los 22).

### Archivos/módulos afectados

**Bloque A — triviales/presentacionales sin servicio (calibración del patrón):**
- `BrandLogo.tsx` (63L), `DrinkSkeleton.tsx` (31L), `OSHeadbar.tsx` (153L), `SafeDeleteModal.tsx`
  (117L, genérico — confirmar que no tiene acoplamiento oculto a un dominio particular),
  `DrinkCard.tsx` (177L, usado en `/carta`, sin service propio — recibe el `Drink` por prop).

**Bloque B — `components/analytics/*` (7 archivos, todos presentacionales vía `@/lib/analytics`):**
- `NightRecords.tsx`, `SmartInsights.tsx`, `RevenueByProduct.tsx`, `OperationalVelocity.tsx`,
  `PaymentDonut.tsx`, `NightEvolutionChart.tsx`, `NightComparator.tsx`. Ninguno llama a
  `services/*.ts` directo — reciben tipos de `@/lib/analytics` ya calculados por el padre
  (`DashboardSection`/`EstadisticasSection`, ya auditados en Fase 3). Tests con datos de fixture,
  sin mockear servicios. Es el bloque más paralelizable (7 componentes independientes entre sí).

**Bloque C — `components/settings/*` (4 archivos, tocan servicios reales):**
- `GeneralSection.tsx` (454L, `configService` — ya lo tocó el otro dev recientemente en
  `origin/develop`, bloqueo de tema a "Bosko"; auditar sobre el estado ya mergeado).
- `PagosSection.tsx` (210L, `configService`, `SafeConfig` — credenciales de Mercado Pago
  enmascaradas, confirmar que ningún token en claro llega al cliente).
- `UsuariosSection.tsx` (585L, `usersService.list/update/create/delete` — superficie de auth/roles,
  el más sensible de este bloque).
- `CartaSection.tsx` (644L, `drinksService` — el componente sin tocar más grande del repo).

**Bloque D — modales y flujos críticos (uno por uno, no en paralelo):**
- `ThemeProvider.tsx` (199L, `useSSE` — consume `theme.changed`; envuelve toda la app en
  `layout.tsx`, cualquier bug acá es global).
- `OpenNightModal.tsx` (127L, `eventsService.open` — abre la noche con palabra clave).
- `CloseNightModal.tsx` (599L, recibe `totals`/`summary` ya calculados y un callback `onConfirm`
  desde el shell — no llama servicios directo, pero el flujo que dispara es el cierre de noche +
  sync; el componente en sí es más UI de confirmación/loading que lógica de negocio).
- `CashSaleModal.tsx` (141L, `cashSalesService`).
- `Ticket.tsx` (372L, `drinksService`, `STATUS_META` — el ticket que se imprime/muestra).
- `TicketLive.tsx` (97L, `useSSE`, `eventsService`, `clearActiveOrder` — pantalla del ticket del
  cliente en `/carta`, congelada funcionalmente hasta Fase 7 pero igual necesita test para no
  romperse con cambios en `useSSE`/`activeOrder`).
- `barra/DevPanel.tsx`: sin test (ya excluido explícitamente en la spec, no corre en producción) —
  solo pasa por una revisión rápida de que sigue condicionado a `NODE_ENV === "development"`.

**Deuda de Fase 3 a resolver (fuera de los 22, pero dentro de esta fase por decisión ya tomada):**
- `components/barra/PendingOrdersList.tsx` — fix de `ToastItem` (memoizar `onClose` con
  `useCallback` en el padre, o mover el `onClose` a un `ref` dentro de `ToastItem` para que el
  timer no dependa de la identidad de la función).
- `components/admin/DashboardSection.tsx` — resolver `dynamicAlerts` vs `generateInsights()`.
- `app/admin/AdminClient.tsx` — agregar acceso en la UI a `activeTab === "estadisticas"` (o
  documentar por qué no, si al revisar aparece una razón de producto).
- `app/caja/CajaClient.tsx` / `app/barra/BarraClient.tsx` — evaluar extraer `renderSidebar`; si el
  fix es de bajo riesgo (mismo patrón ya usado para extraer secciones en Fase 3), se hace.

### Cambios de datos

- **Sin migraciones nuevas** — no se toca `supabase/migrations/`.
- **Sin cambios en `packages/shared/src/domain.ts`** — no se tocan contratos de dominio.
- **Sin impacto en sync local↔cloud ni offline-first**: es la misma naturaleza de cambio que Fase 3
  (tests + fixes de presentación), ningún componente de esta lista participa del `sync.service.ts`.

### Real-time

Dos componentes consumen `useSSE` directo: `ThemeProvider.tsx` (evento `theme.changed`) y
`TicketLive.tsx` (eventos de pedido del cliente). Los tests de caracterización de ambos mockean
`useSSE` (no se abre un `EventSource` real en jsdom) — mismo patrón que ya usan los tests de los
shells desde Fase 3. No se agregan eventos SSE nuevos ni se modifica `sse-manager.ts`.

### Auth/permisos

- `settings/UsuariosSection.tsx` es la única superficie de gestión de roles/permisos
  (`UserPermissions`) de todo este bloque — los tests deben cubrir alta/edición/baja de usuario y
  que los checkboxes de permisos mapeen correctamente al payload que espera `usersService`.
- `CloseNightModal.tsx` está condicionado por el permiso `closeNight` en el shell que lo abre (no
  dentro del propio modal) — se verifica que el modal en sí no duplique ese chequeo, solo lo reciba
  ya resuelto.
- El resto de los componentes no introduce lógica de permisos nueva.

### Riesgos

- **`UsuariosSection.tsx` y `CartaSection.tsx`** son los de mayor superficie (585 y 644 líneas) sin
  ningún test hoy — el riesgo real no es el refactor en sí, sino escribir el primer test de
  caracterización sobre un componente grande sin red de contención previa; mitigación: cubrir primero
  los casos "camino feliz" (listar/crear/editar/borrar) antes que los edge cases, igual que se hizo
  con `LogsSection`/`HistorialSection` en Fase 3.
- **`ThemeProvider.tsx` envuelve toda la app** (`layout.tsx`) — cualquier test mal armado o fix
  aplicado ahí tiene blast radius global; se prueba a mano en el navegador además del test (mismo
  criterio de "Riesgos" que usó la spec de Fase 3 para regresiones visuales).
- **`settings/GeneralSection.tsx` fue tocado recientemente por otro desarrollador** (merge de
  `origin/develop`, bloqueo de skin a "Bosko") — auditar sobre el código ya mergeado, no sobre una
  versión vieja; si aparece una inconsistencia con ese cambio reciente, se coordina antes de tocarlo.
- **`CloseNightModal.tsx` dispara el flujo más crítico del sistema** (cierre de noche + sync a
  cloud) aunque el componente en sí no llame servicios directo — el test de caracterización debe
  cubrir el contrato completo de `onConfirm`/estados de loading/error, no solo el render.
- Igual que en Fase 3: mover/tocar componentes puede introducir regresiones visuales sutiles que RTL
  no capta — se verifica cada bloque a mano en `pnpm dev` antes del commit de ese bloque.

### Alternativas consideradas

- **Auditar por orden alfabético** — descartado: no agrupa por riesgo ni permite paralelizar
  `analytics/*` (que son independientes entre sí) separado de los flujos críticos (que conviene
  hacer de a uno).
- **Resolver la deuda de Fase 3 en una spec separada** — descartado en el brainstorming: el usuario
  prefirió resolverla en esta misma fase para no reabrir `PendingOrdersList`/`DashboardSection` dos
  veces.
- **Forzar la descomposición de `useSSE` en esta fase aprovechando que se tocan `ThemeProvider` y
  `TicketLive`** — descartado: son consumidores de `useSSE`, no el hook en sí; tocar el hook central
  sigue fuera de alcance según la spec, salvo que aparezca un fix de bajo riesgo puntual.

## Tareas

### 0. Setup

- [x] Crear rama `refactor/auditoria-web-componentes` desde el estado actual de
  `refactor/auditoria-web` (ya tiene mergeado `origin/develop`, commit `b567701`).
- [x] Confirmar que `pnpm --filter cocktrail-app test` sigue corriendo los 52 tests existentes en
  verde antes de agregar ninguno nuevo (baseline).

### 1. Bloque A — triviales/presentacionales sin servicio

- [x] `BrandLogo.tsx`: test de caracterización + revisión (`expert-react-frontend-engineer`).
  **Fix real aplicado**: `useTheme()` se llamaba dentro de un `try/catch` (hook condicional, error
  real de `react-hooks/rules-of-hooks`) — se agregó `useThemeSafe()` en `ThemeProvider.tsx`
  (devuelve `undefined` en vez de tirar) y `BrandLogo` ahora usa `useThemeSafe() ?? FALLBACK`.
- [x] `DrinkSkeleton.tsx`: test de render básico. Sin hallazgos (presentacional puro).
- [x] `OSHeadbar.tsx`: test de caracterización (`OSHeadbar` + `OSProfileFooter`) + revisión.
  **Hallazgo documentado sin resolver**: el archivo mezcla dos componentes sin relación fuerte
  (SRP de archivo) — separarlos tocaría imports en `CajaClient.tsx`/`AdminClient.tsx` (Fase 3, fuera
  de alcance), no se fuerza.
- [x] `SafeDeleteModal.tsx`: test de caracterización (confirmar/cancelar/reset). **Fix real
  aplicado**: `setState` síncrono dentro de un `useEffect` de reset (`react-hooks/set-state-in-effect`)
  — se extrajo un subcomponente `ConfirmForm` montado solo con `isOpen`, `key={expectedText}`, el
  reset ahora es gratis por mount/unmount. De paso se sacó un copy desactualizado ("registros
  in-memory", el sistema usa Supabase Postgres).
- [x] `DrinkCard.tsx`: test de caracterización (regular/promo/trending, cantidad, callbacks). **Fix
  real aplicado**: botones +/- sin `aria-label` (inaccesibles para lectores de pantalla) — se
  agregaron. **Hallazgo documentado sin resolver**: prop `vibe` nunca se lee dentro del componente
  (dead code, su origen real es el modelo `Drink` de `CartaSection.tsx` — se revisa en Bloque C).
- [x] `pnpm --filter cocktrail-app exec tsc --noEmit` + `eslint` (BrandLogo/DrinkSkeleton/OSHeadbar/
  SafeDeleteModal/DrinkCard) + `test` en verde (21/21). **Nota**: `eslint` sobre `ThemeProvider.tsx`
  sigue marcando un `set-state-in-effect` preexistente (mismo patrón que se corrigió en
  `SafeDeleteModal`, pero en el efecto de sync de tema vía SSE) — queda para el Bloque D, donde ese
  archivo se audita completo. Commit del bloque A.

### 2. Bloque B — `components/analytics/*` (paralelizable)

- [x] `NightRecords.tsx`: test con `NightRecord[]` de fixture.
- [x] `SmartInsights.tsx`: test con `SmartInsight[]` de fixture.
- [x] `RevenueByProduct.tsx`: test con `ProductRevenue[]` de fixture.
- [x] `OperationalVelocity.tsx`: test con `OperationalVelocityType` de fixture (incluye
  `formatDuration`).
- [x] `PaymentDonut.tsx`: test con `PaymentBreakdown` de fixture. **Fix real aplicado**: el cálculo
  de segmentos del donut mutaba una variable `cumulativeOffset` externa dentro de un `.map`
  (`react-hooks/immutability`, error real de ESLint — reasignar una variable capturada durante el
  render puede dar resultados inconsistentes entre renders). Reescrito como `reduce` puro sin
  mutación externa. Además se agregó `role="img"`/`aria-label` al SVG (sin nombre accesible).
- [x] `NightEvolutionChart.tsx`: test con `NightPoint[]` de fixture. **Fix real aplicado**: los
  `<linearGradient>` usaban IDs fijos (`barGrad`/`barGradHover`) — si el componente se monta más de
  una vez en la misma página, todas las instancias resuelven `url(#id)` contra el primer gradiente
  del DOM, rompiendo los colores de las demás. Se generan IDs únicos por instancia con `useId()`.
  Se agregó también `aria-label` al SVG.
- [x] `NightComparator.tsx`: test de caracterización (no importa tipos de `@/lib/analytics` a
  diferencia de los otros 6 — recibe `EventSummary[]` de `@cocktrail/shared` y calcula sus propias
  filas de comparación). **Fixes reales aplicados**: `key={n.id || (n as any).dateKey || idx}` tenía
  un cast `any` muerto (`dateKey` no existe en `EventSummary`/`NightEvent`, `id` es `string`
  requerido) — simplificado a `key={n.id}`; selects sin `<label>` asociado — se agregó `useId()` +
  `<label htmlFor>` en `NightSelector`.
- [x] `architect-reviewer` + `expert-react-frontend-engineer` auditan el bloque completo (7
  componentes chicos, revisión conjunta). **Hallazgos documentados sin resolver** (para no ampliar
  el alcance ya extenso de esta fase): (1) duplicación del patrón `accentColor`/`accentBg`/
  `accentBorder` según `isBosko` repetido literal en los 7 componentes — candidato a un hook
  compartido `useAccentColors(isBosko)`; (2) duplicación del estado-vacío con emoji en
  `NightRecords`/`RevenueByProduct`/`NightEvolutionChart` — candidato a `<EmptyState>` compartido.
- [x] `pnpm --filter cocktrail-app exec tsc --noEmit` + `eslint` + `test` en verde (15/15). Commit
  del bloque B.

### 3. Bloque C — `components/settings/*`

- [ ] `GeneralSection.tsx`: test de caracterización **sobre el estado ya mergeado de
  `origin/develop`** (skin fijo a "Bosko", sin selector de tema). Auditoría
  (`expert-react-frontend-engineer` + `expert-nextjs-developer` si hay dudas de Server/Client
  Components). Mockear `configService`.
- [ ] `PagosSection.tsx`: test de caracterización con `SafeConfig` mockeado — confirmar
  explícitamente en el test que ningún token de Mercado Pago en claro se renderiza (solo el
  enmascarado que ya expone `configService`).
- [ ] `UsuariosSection.tsx`: tests de caracterización — listar, crear, editar (incluyendo mapeo de
  checkboxes a `UserPermissions`), borrar, con `usersService` mockeado. Camino feliz primero, edge
  cases (error de red, validación) después.
- [ ] `CartaSection.tsx`: tests de caracterización — listar, crear, editar, borrar trago, con
  `drinksService` mockeado.
- [ ] `architect-reviewer` audita el bloque completo (foco en duplicación entre las 4 secciones y
  prop drilling). Fixes de bajo riesgo si aparecen.
- [ ] `pnpm --filter cocktrail-app exec tsc --noEmit` + `eslint` + `test` en verde. Commit del
  bloque C.

### 4. Bloque D — modales y flujos críticos (uno por uno)

- [ ] `ThemeProvider.tsx`: test de caracterización con `useSSE` mockeado (evento `theme.changed`).
  Verificación manual en navegador además del test (blast radius global, envuelve `layout.tsx`).
- [ ] `OpenNightModal.tsx`: test de caracterización (apertura con palabra clave, `eventsService.open`
  mockeado, casos de error).
- [ ] `CloseNightModal.tsx`: test de caracterización del contrato completo (`onConfirm`, estados de
  loading/error, render de `totals`/`summary`). No requiere mockear servicios (los recibe por prop),
  pero sí verificar que no duplica el chequeo de permiso `closeNight`.
- [ ] `CashSaleModal.tsx`: test de caracterización con `cashSalesService` mockeado.
- [ ] `Ticket.tsx`: test de caracterización con `drinksService` mockeado y los distintos
  `STATUS_META` (estados del pedido).
- [ ] `TicketLive.tsx`: test de caracterización con `useSSE`/`eventsService`/`clearActiveOrder`
  mockeados.
- [ ] `barra/DevPanel.tsx`: sin test — solo confirmar que sigue condicionado a
  `NODE_ENV === "development"` y no se coló en ningún bundle de producción.
- [ ] `architect-reviewer` + `expert-react-frontend-engineer` auditan el bloque (uno por uno, no en
  conjunto por ser los de mayor riesgo). Fixes de bajo riesgo si aparecen.
- [ ] `pnpm --filter cocktrail-app exec tsc --noEmit` + `eslint` + `test` + `pnpm --filter
  cocktrail-app build` en verde. Commit del bloque D.

### 5. Deuda de Fase 3 (documentada en `docs/ROADMAP.md`)

- [ ] `components/barra/PendingOrdersList.tsx`: fix del bug real de `ToastItem` (timer de dismiss se
  resetea en cada re-render por `onClose` inline nuevo) — memoizar con `useCallback` en el padre o
  mover el callback a un `ref` interno del propio `ToastItem`. Ajustar/agregar test que cubra que el
  timer no se reinicia entre renders.
- [ ] `components/admin/DashboardSection.tsx`: resolver la duplicación `dynamicAlerts` vs
  `generateInsights()`/`smartInsights` — usar una sola fuente, o documentar explícitamente en el
  código por qué coexisten si aparece una razón de producto real.
- [ ] `app/admin/AdminClient.tsx`: agregar acceso en la UI a `activeTab === "estadisticas"` (botón o
  link) o documentar explícitamente por qué se mantiene inalcanzable — es una decisión de producto,
  no puramente técnica; confirmar con el usuario antes de exponerla si hay dudas.
- [ ] `app/caja/CajaClient.tsx` / `app/barra/BarraClient.tsx`: evaluar extraer `renderSidebar` a un
  componente propio (mismo patrón ya usado para las demás secciones en Fase 3). Si el fix resulta de
  alcance mayor al esperado, re-documentar como deuda en vez de forzarlo.
- [ ] `pnpm --filter cocktrail-app exec tsc --noEmit` + `eslint` + `test` + `build` en verde. Commit
  de este bloque.

### 6. Cierre de la fase

- [ ] Correr `pnpm --filter cocktrail-app test` completo (todos los bloques) — confirmar conteo
  final de tests.
- [ ] Correr `pnpm typecheck` (api + web) y `pnpm --filter cocktrail-app build` de punta a punta.
- [ ] Actualizar `docs/ROADMAP.md`: marcar esta fase como completa, remover de "Hallazgos
  documentados" (Fase 3) los puntos resueltos en la tarea 5, y dejar anotado cualquier hallazgo
  nuevo que haya quedado sin resolver (ej. si `useSSE` centralizado sigue sin tocarse, o si
  `apps/web/src/services/*.ts` queda pendiente de auditoría como se anotó en "Preguntas abiertas").
- [ ] Cambiar el estado de esta spec (`docs/specs/auditoria-web-componentes.md`) de `draft`/
  `approved` a `done`.

> **Nota de implementación**: igual que en Fases 2 y 3, conviene implementar con **Plan Mode**,
> bloque por bloque (A → B → C → D → deuda de Fase 3), tildando `- [x]` a medida que cada bloque
> corre en verde antes de pasar al siguiente. El bloque B (`analytics/*`) es el único candidato
> real a paralelizar entre sí (7 componentes independientes); el resto conviene secuencial por el
> riesgo creciente de cada bloque.

## Preguntas abiertas

- Ninguna de alcance/criterio: el brainstorming previo a esta spec ya definió que se auditan los 22
  componentes completos, se resuelve la deuda documentada de Fase 3 dentro de esta misma fase, y se
  aplica el mismo criterio conservador de fixes (bajo riesgo sí, estructural grande no) que en
  Fase 2/3.
- Queda para `/plan`: el orden concreto de auditoría de los 22 componentes (por riesgo, por área, o
  por tamaño) y si conviene agruparlos por carpeta (`settings/`, `analytics/`, sueltos) para
  paralelizar con distintos agentes especializados.
- **`apps/web/src/services/*.ts` queda explícitamente sin analizar en esta fase** — es la capa que
  llama a la API desde el frontend y hoy no tiene auditoría propia (ni en Fase 3, ni acá). Esta spec
  solo la toca como mock en los tests de los componentes. Falta decidir en una fase futura (o una
  spec aparte) si se audita con el mismo criterio SOLID/tests que el resto del repo.
- **`useSSE` centralizado**: confirmado con el usuario — no se toca en esta fase salvo que aparezca
  un fix de bajo riesgo al auditar los componentes cercanos (ver "Fuera de alcance").
