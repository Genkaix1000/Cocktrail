# Dashboard — KPI cards Bosko

**Estado**: `done`  
**Fecha**: 2026-07-24  
**Padre**: [`refactor-ui-bosko.md`](./refactor-ui-bosko.md)  
**Design system**: [`docs/design/design.md`](../../../design/design.md) §4.3  
**Referencias**: [light](../../../design/reference/bosko-light.png) · [dark](../../../design/reference/bosko-dark.png)  
**Predecesora**: [`admin-dashboard.md`](./admin-dashboard.md) (shell — `done`)

---

## Problema / Por qué

El shell de `/admin` ya habla Bosko; las tres KPI del Dashboard (`MetricCard`) siguen el look
legacy: bordes `ink-*`, sombra pesada, icono en cajita con color hex arbitrario, y las tres cards
compiten al mismo peso visual. La referencia muestra **una métrica featured** (fondo acento) y el
resto estándar (surface + borde sutil).

Las métricas en sí (Ventas / Tickets / Unidades + deltas) ya están validadas en
[`simplificar-dashboard-admin.md`](../simplificar-dashboard-admin.md) — no hay que cambiar datos.

---

## Objetivo

Restylear el envoltorio visual de las KPI del Dashboard (y el mismo componente en Historial) al
lenguaje Bosko: variante `featured` + estándar, tokens del design system, **mismas 3 métricas y
misma lógica de delta**.

---

## Decisión de mapeo (cerrada)

La referencia muestra 4 cards; Cocktrail tiene **3**. No se inventa una cuarta.

| Rol visual | KPI Cocktrail |
|---|---|
| Featured (fondo acento) | **Ventas Totales** |
| Estándar | **Tickets Totales** |
| Estándar | **Unidades Vendidas** |

Trend / “EN VIVO” / label vs. última noche: se mantienen con el comportamiento actual
(`delta` solo con noche abierta; `noDeltaLabel` / subtítulo cuando no).

---

## Historias de usuario

- Como **admin**, quiero que Ventas Totales destaque de un vistazo (card featured) sin perder Tickets y Unidades.
- Como **admin**, quiero los mismos números y deltas de siempre, solo con mejor lectura light/dark.
- Como **admin**, quiero que Historial use el mismo componente de card (sin un fork visual).

---

## Criterios de aceptación

### MetricCard (compartido)

1. **Given** `MetricCard` sin `featured`, **then** usa surface `--bg-surface`, borde `--border-subtle`, sombra `--shadow-card` (o equivalente), label `--text-secondary`, valor `--text-primary` tabular ~26–36px bold.
2. **Given** `MetricCard` con `featured`, **then**:
   - Light: fondo `--accent-primary`, texto `--text-on-accent`.
   - Dark: fondo `--accent-featured` o `--accent-featured-deep`, texto de alto contraste.
3. **Given** cualquier variante, **then** el icono va en círculo outline (sin cajita con `color` hex de fondo); en featured, círculo semitransparente sobre el acento.
4. **Given** un `delta`, **then** se muestra como pill/badge compacto (success/danger en estándar; contraste adecuado sobre featured).
5. **Given** sin `delta`, **then** se muestra `noDeltaLabel` / subtítulo como hoy (sin inventar deltas).
6. **Given** el componente, **then** está documentado en `docs/design/design.md` §4.3 (featured + estándar) y vive en `components/shared/` — no estilos one-off solo en Dashboard.

### Dashboard

7. **Given** el Dashboard de `/admin`, **then** hay exactamente **3** `MetricCard`: Ventas (`featured`), Tickets, Unidades — mismos `value` / `delta` / props de negocio que hoy.
8. **Given** el grid de KPIs, **then** sigue siendo una fila responsive (`sm:grid-cols-3` o equivalente); no se fuerza una 4ª celda vacía.
9. **Given** el header del Dashboard (“Dashboard General” + subtítulo), **then** se alinea al chrome Bosko (sin icon-box legacy ni `border-b` pesado que compita con las cards); no cambia el copy de negocio salvo ajuste tipográfico menor.
10. **Given** light y dark, **then** featured y estándar contrastan correctamente (checklist visual vs. referencias).

### Historial

11. **Given** Historial de Noches, **then** reutiliza el mismo `MetricCard` restyleado; **no** usa `featured` salvo decisión explícita de marcar la primera (default: las tres estándar, para no competir con el Dashboard).

### No-regresión de datos

12. **Given** `useAdminAnalytics` / `totals` / deltas, **then** no se modifican fórmulas ni el set de KPIs (prohibido agregar Ticket Promedio u otras métricas retiradas).

---

## Fuera de alcance

- Restyle de charts / widgets → [`dashboard-charts.md`](./dashboard-charts.md).
- Cambiar labels de negocio, orden de métricas, o umbrales de delta.
- `/caja` metricas.
- Skeletons: pueden heredar tokens en el mismo PR si es trivial; no es bloqueante.

---

## Plan técnico (alto nivel)

Al implementar (plan en `docs/plans/` si hace falta detalle):

1. Extender `MetricCard` con `featured?: boolean`; mapear clases a tokens Bosko; retirar dependencia de `color` hex para el look principal (o dejarlo opcional/deprecated).
2. `DashboardSection`: `featured` solo en Ventas Totales; pulir header.
3. `HistorialSection`: sin `featured` (default).
4. Actualizar tests que aserten estructura/clases legacy; smoke: siguen existiendo las 3 cards y el valor de ventas.

### Archivos previstos

- `apps/web/src/components/shared/MetricCard.tsx` (+ test si aplica)
- `apps/web/src/components/admin/DashboardSection.tsx` (+ test)
- `apps/web/src/components/admin/HistorialSection.tsx` (consumo)
- `docs/design/design.md` §4.3 (si hace falta afinar tras implementar)

---

## Tareas

- [x] `MetricCard`: variantes featured + estándar con tokens Bosko
- [x] Dashboard: Ventas `featured`; Tickets/Unidades estándar
- [x] Header Dashboard alineado a Bosko
- [x] Historial: mismo componente, sin featured
- [x] Tests en verde (Dashboard / Historial / MetricCard)
- [x] §4.3 design system al día si el PR introduce detalle nuevo

---

## Referencias de código hoy

- KPI: `apps/web/src/components/shared/MetricCard.tsx`
- Dashboard: `apps/web/src/components/admin/DashboardSection.tsx` (fila de 3 cards ~L173)
- Historial: `apps/web/src/components/admin/HistorialSection.tsx`
- Analytics: `apps/web/src/hooks/useAdminAnalytics.ts` (**no tocar lógica**)
- Spec de contenido previo: `docs/specs/features/simplificar-dashboard-admin.md`
