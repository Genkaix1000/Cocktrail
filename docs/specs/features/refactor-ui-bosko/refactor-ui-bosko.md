# Refactor UI — Bosko (overview)

**Estado**: `draft`  
**Fecha**: 2026-07-24  
**Design system**: [`docs/design/`](../../../design/README.md) · [`design.md`](../../../design/design.md)  
**Referencias**: [light](../../../design/reference/bosko-light.png) · [dark](../../../design/reference/bosko-dark.png)  
**Specs de esta carpeta**: [`admin-dashboard.md`](./admin-dashboard.md) · [`dashboard-kpis.md`](./dashboard-kpis.md) · [`dashboard-charts.md`](./dashboard-charts.md) · [`crud-carta.md`](./crud-carta.md)  
**Referencia CRUD**: [`crud-table-ref.png`](../../../design/reference/crud-table-ref.png)


---

## Problema / Por qué

El front usa un look legacy (crema + verde botella, dark monocromo) que no escala a un panel
de operación denso: poco contraste de estado, pocos tokens semánticos, jerarquía de nav confusa.

Queremos unificar la UI bajo el skin oficial **Bosko** (light + dark con grises, acento esmeralda,
badges de color, layout bento), empezando por `/admin` y avanzando por fases sin romper datos ni flujos.

---

## Objetivo

1. Design system documentado (tokens, componentes compartidos, a11y) y referencias versionadas.
2. Migrar el front por fases **visuales**, sin cambiar la lógica ni el set de KPIs actuales.
3. Empezar por el shell de `/admin` ([`admin-dashboard.md`](./admin-dashboard.md)); después dashboard metrics, resto de tabs, luego `/caja`.

---

## Componentes compartidos

Todo elemento que se repita entre pantallas (topbar, sidebar, botones, badges, night CTA, modales base)
**se define en [`docs/design/`](../../../design/README.md)** y se implementa una sola vez en
`apps/web/src/components/`. Las specs de fase no inventan variantes locales: extienden o referencian
el design system.

---

## Historias de usuario

- Como **admin**, quiero que `/admin` se vea prolijo en claro y oscuro, sin perder las métricas que ya uso.
- Como **equipo**, quiero tokens y convenciones escritas para no reinventar botones/badges/modales en cada PR.
- Como **caja**, más adelante quiero la misma familia visual en `/caja`.

---

## Criterios de aceptación (globales)

1. **Given** el repo, **then** existe `docs/design/` con `design.md`, README e imágenes light/dark de referencia Bosko.
2. **Given** cualquier fase de implementación, **when** se toca UI, **then** se usan tokens/convenciones de `design.md` (no el look legacy).
3. **Given** fases sobre admin, **then** no cambian los datos ni el set de KPIs de specs previas del dashboard (solo el envoltorio visual), salvo que una spec diga lo contrario.
4. **Given** modo dark, **then** no es monocromo: carbón + esmeralda + badges, como `bosko-dark.png`.
5. **Given** modo light, **then** fondo de app gris neutro y cards surface claro, como `bosko-light.png`.
6. **Given** un componente usado en más de una ruta, **then** está documentado en `docs/design/` y no duplicado ad-hoc.

---

## Fases

| Fase | Estado | Alcance | Spec |
|---|---|---|---|
| **0 — Docs** | `done` | Design system + overview + referencias | esta + `docs/design/` |
| **1 — Shell admin** | `done` | Tokens + topbar + sidebar + night CTA | [`admin-dashboard.md`](./admin-dashboard.md) |
| **2 — Dashboard KPIs** | `done` | `MetricCard` featured (Ventas) + estándar; misma data | [`dashboard-kpis.md`](./dashboard-kpis.md) |
| **2b — Dashboard charts** | `done` | Barras/donut con stripes Bosko | [`dashboard-charts.md`](./dashboard-charts.md) |
| **3 — Resto admin** | pendiente | Historial, Logs, settings CRUD/modales | empieza en [`crud-carta.md`](./crud-carta.md) |
| **4 — Caja** | en curso | `/caja` shell + sidebar + métricas/historial/modales alineados a Bosko; Venta POS sigue con tokens `ink-*` (compat) | (spec futura) |
| **5 — Login y restos** | pendiente | Login + menores; `/carta`/`/barra` pueden diferirse | (spec futura) |

### Detalle Fase 0

- [x] `docs/design/` (README + `design.md` + `bosko-light/dark.png`)
- [x] Carpeta `docs/specs/features/refactor-ui-bosko/`
- [x] Overview (este archivo) + [`admin-dashboard.md`](./admin-dashboard.md)
- [x] Entrada en `docs/specs/README.md`

---

## Fuera de alcance

- Cambios de negocio, APIs o permisos.
- Rediseño de `/carta` / `/barra` ligado a Fase 7 de producto (salvo decisión explícita).
- Actualizar `ROADMAP.md` hasta aprobar el arranque de Fase 1.
- Search global, mail, notificaciones, Ayuda — sin feature detrás.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Tokens nuevos rompen pantallas no migradas | Migrar por fases; admin primero |
| Dark monocromo se cuela por clases legacy | Checklist light+dark vs PNG de referencia |
| Scope creep | Visual only; KPIs y flujos intactos |
| Duplicar chrome (topbar/sidebar) por pantalla | Shared → `docs/design/` + un solo componente |
