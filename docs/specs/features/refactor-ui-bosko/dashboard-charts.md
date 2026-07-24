# Dashboard — Charts / widgets Bosko

**Estado**: `done`  
**Fecha**: 2026-07-24  
**Padre**: [`refactor-ui-bosko.md`](./refactor-ui-bosko.md)  
**Design system**: [`docs/design/design.md`](../../../design/design.md) §4.6 · §4.9  
**Predecesora**: [`dashboard-kpis.md`](./dashboard-kpis.md) (`done`)

---

## Problema / Por qué

Las KPI ya hablan Bosko (`--bg-surface` + featured). Charts y widgets del Dashboard
siguen en `ink-900` legacy. Fase 2b: mismo set de datos, solo envoltorio visual.

---

## Objetivo

Restylear **Ventas por Hora**, **Distribución por Canal**, **Productos Más Vendidos**,
**Hora Pico** y **Comparativa** al lenguaje Bosko (surface + stripes + un widget featured).

---

## Reglas cerradas

| Widget | Superficie | Acento / stripes |
|---|---|---|
| Ventas por Hora | `--bg-surface` card | Solo la franja **pico** (max `totalSales`) en `--accent-primary` sólido + pill flotante con `$`; resto con clase `bosko-stripe`. Puntas `rounded-t-xl`. |
| Donut canales | idem | Top **2** por `total` → sólido (`--accent-primary` / `--accent-bright`); resto → patrón SVG stripe. Centro = `%` + label del canal #1 (no el $ total). `total === 0` → anillo gris, centro `0%` / Sin ventas (sin puntos de color). |
| Productos | idem | Avatar círculo `--accent-surface`; nombre + `N unidades`; subtotal en pill. **Sin** botón “Ver todos / Filtro” (YAGNI). |
| Hora Pico | featured §4.9 | Fondo acento/oscuro; hora en mono grande; “En vivo” **solo** con noche abierta. |
| Comparativa | `--bg-surface` | Mismos 3 rows; sin cajitas de icono legacy. |

Headers de bloque: título limpio, **sin** icon-box `w-7 h-7`.

Datos / fórmulas: no tocar (`useAdminAnalytics`, breakdown, etc.).

---

## Criterios de aceptación

1. Cards de charts usan `--bg-surface` + borde sutil + `rounded-2xl` (no `ink-900`).
2. Barras: pico sólido + pill `$`; no-pico con `bosko-stripe`.
3. Donut: top-2 sólido / resto stripe; centro = canal dominante `%` + label.
4. `total === 0`: anillo neutro; leyenda sin puntos de color activo (comportamiento de [`dashboard-sin-noche-abierta`](../dashboard-sin-noche-abierta.md)).
5. Productos: lista tipo team row; sin CTA inventado.
6. Hora Pico: widget destacado; badge “En vivo” iff `isNightOpen`.
7. Comparativa: misma data, skin surface.
8. Light + dark OK vs tokens (no hex “blanco” fijo).

---

## Fuera de alcance

- Nuevas métricas, filtros, “Ver todos”.
- Charts de `/caja`.
- Nombrar la referencia externa en código/docs (skin = Bosko).
