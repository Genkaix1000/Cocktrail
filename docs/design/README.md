# Design system — Bosko UI

Fuente de verdad visual para el refactor del front de Cocktrail.
Skin oficial: **Bosko** (bento, esmeralda, light + dark con grises — no monocromo).

## Contenido

| Archivo | Para qué |
|---|---|
| [`design.md`](./design.md) | Principios, tokens light/dark, tipografía, convenciones por componente, a11y |
| [`reference/bosko-light.png`](./reference/bosko-light.png) | Referencia visual — modo claro |
| [`reference/bosko-dark.png`](./reference/bosko-dark.png) | Referencia visual — modo oscuro |
| [`reference/bosko-sidebar.png`](./reference/bosko-sidebar.png) | Detalle sidebar (pill activo, iconos sin caja, widget flotante) |

## Componentes compartidos

Elementos que se repiten entre pantallas (topbar, sidebar, botones, badges, night CTA, etc.)
**se documentan acá** y se implementan como componentes reutilizables bajo `apps/web/src/components/`.
No copiar estilos one-off por ruta: si algo aparece en admin y luego en caja, vive en el design system.

## Specs de implementación

| Spec | Alcance |
|---|---|
| [`refactor-ui-bosko.md`](../specs/features/refactor-ui-bosko/refactor-ui-bosko.md) | Overview + fases globales |
| [`admin-dashboard.md`](../specs/features/refactor-ui-bosko/admin-dashboard.md) | Shell `/admin`: topbar, sidebar, night CTA |
| [`dashboard-kpis.md`](../specs/features/refactor-ui-bosko/dashboard-kpis.md) | KPI cards: featured Ventas + estándar |

## Cómo usarlo

- **Al implementar UI**: leer `design.md` antes de inventar colores, radios o variantes.
- **En PRs visuales**: linkear la spec de fase + captura light/dark de referencia.
- **No fragmentar aún**: menús, botones y popups van como secciones en `design.md`.
  CRUD (§4.8) ya está ahí; si crece, partir a `crud.md` en esta carpeta.

## Fuera de alcance de esta carpeta

- Código vivo en `apps/web` (se migra en las fases de las specs).
- El look legacy crema/botella monocromo: se retira al migrar; no es referencia.
