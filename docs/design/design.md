# Design system — Bosko UI (Cocktrail)

Guía de convenciones visuales para el refactor del front.
Skin oficial: **Bosko**. Referencias: [`reference/bosko-light.png`](./reference/bosko-light.png) · [`reference/bosko-dark.png`](./reference/bosko-dark.png).

> El look legacy (crema `#fffef2` + verde botella monocromo en dark) **no** es referencia.
> Se reemplaza por completo. Los tokens de abajo son la fuente de verdad nueva.

---

## 1. Principios generales

- **Component-first**: tarjetas, botones, métricas, badges, topbar y sidebar son reutilizables; no estilos one-off por pantalla.
- **Shared → esta carpeta**: todo elemento que se repita entre rutas (admin, caja, login…) se documenta acá y se implementa una sola vez en `apps/web/src/components/`. Las specs de feature deben apuntar a estas convenciones, no reinventarlas.
- **Jerarquía de superficies (anidación)** — light:
  1. `--bg-app` (`#FFFFFF`) — fondo de página (**más blanco**).
  2. `--bg-panel` (`#F4F5F6`) — topbar, sidebar, canvas del dashboard (**blanco gris**).
  3. `--bg-surface` (`#FFFFFF`) — cards KPI / widgets (mismo blanco que el fondo), sobre el panel.
  4. Panel anidado **dentro** de una card → otra vez `--bg-panel`.
  - Dark: app (más profundo) → panel → surface (cards elevadas); anidar en surface vuelve a panel.
- **Acento**: verde esmeralda (productividad, completado, crecimiento).
- **Layout**: shell tipo app (sidebar + main) con grid bento (cards con gutters generosos).
- **Border radius**:
  | Elemento | Radio |
  |---|---|
  | Contenedor / shell principal | `24px` (`1.5rem`) |
  | Tarjetas y secciones | `16px`–`20px` (`1rem`–`1.25rem`) |
  | Botones y badges | `8px`–`12px` (semi-pill) |
  | Inputs destacados / search (si existe) | pill (`9999px`) |

---

## 2. Design tokens

Nombres semánticos. Al implementar, mapear a CSS variables en `apps/web/src/app/globals.css`
(hoy: `--ink-*`, `--accent-*` — se migran en Fase 1; no mezclar ambos sistemas).

### 2.1 Modo claro (`light`)

```css
:root[data-theme="light"],
:root:not(.dark) {
  /* Superficies */
  --bg-app: #FFFFFF;           /* fondo página — más blanco */
  --bg-panel: #F4F5F6;         /* topbar / sidebar / canvas — blanco gris */
  --bg-surface: #FFFFFF;       /* cards KPI — blanco del fondo */
  --bg-surface-elevated: var(--bg-panel);
  --bg-input: var(--bg-panel);

  /* Bordes */
  --border-subtle: #E5E7EB;
  --border-strong: #D1D5DB;

  /* Tipografía */
  --text-primary: #111827;
  --text-secondary: #6B7280;
  --text-tertiary: #9CA3AF;
  --text-on-accent: #FFFFFF;

  /* Marca / acento */
  --accent-primary: #155339;
  --accent-primary-hover: #0E3A27;
  --accent-bright: #10B981;
  --accent-surface: #E6F4ED;
  --accent-text: #155339;

  /* Estados / badges */
  --badge-success-bg: #DCFCE7;
  --badge-success-text: #166534;
  --badge-warning-bg: #FEF3C7;
  --badge-warning-text: #92400E;
  --badge-danger-bg: #FEE2E2;
  --badge-danger-text: #991B1B;

  /* Elevación */
  --shadow-card: 0 4px 20px rgba(0, 0, 0, 0.04);
}
```

### 2.2 Modo oscuro (`dark`)

Dark Bosko **no es monocromo**: carbón + esmeralda brillante + badges de estado tintados.
Elevación por contraste de superficie (o glow sutil de borde), no sombra negra gruesa.

```css
:root.dark,
:root[data-theme="dark"] {
  /* Superficies */
  --bg-app: #111315;
  --bg-panel: #1A1D21;
  --bg-surface: #22262C;
  --bg-surface-elevated: #2A2F36;
  --bg-input: var(--bg-surface);

  /* Bordes */
  --border-subtle: #2D323B;
  --border-strong: #374151;

  /* Tipografía */
  --text-primary: #F3F4F6;
  --text-secondary: #9CA3AF;
  --text-tertiary: #6B7280;
  --text-on-accent: #FFFFFF;

  /* Marca / acento */
  --accent-primary: #10B981;
  --accent-primary-hover: #059669;
  --accent-bright: #34D399;
  --accent-surface: #0F382C;
  --accent-text: #34D399;

  /* Featured KPI / widgets especiales */
  --accent-featured: #10B981;
  --accent-featured-deep: #0F382C;

  /* Estados / badges */
  --badge-success-bg: #064E3B;
  --badge-success-text: #A7F3D0;
  --badge-warning-bg: #451A03;
  --badge-warning-text: #FDE68A;
  --badge-danger-bg: #451212;
  --badge-danger-text: #FECACA;

  --shadow-card: 0 0 0 1px var(--border-subtle);
}
```

### 2.3 Qué cambia respecto al look legacy

| Legacy | Bosko (nuevo) |
|---|---|
| Light: crema `#fffef2` + botella `#013e37` | Light: gris app `#F4F5F6` + esmeralda `#155339` |
| Dark: monocromo botella + manteca | Dark: carbón + verde brillante + badges de color |
| Escala `--ink-950`…`--ink-50` invertida por modo | Tokens semánticos (`--bg-*`, `--text-*`, `--accent-*`) |
| Acento = mismo verde que el texto | Acento dedicado; texto primario neutro |

---

## 3. Tipografía e iconografía

- **Fuente**: Inter (ya en el proyecto).
- **Iconos**: Lucide (lineales). Stroke habitual `1.75`–`2`.

| Rol | Tamaño | Peso |
|---|---|---|
| H1 / título de página | 28–32px | Bold 700 |
| H2 / título de sección / card | 18–20px | SemiBold 600 |
| KPI / métrica grande | 36–42px | Bold 700 |
| Body | 14px | Regular 400 / Medium 500 |
| Caption / etiqueta / badge | 12px | Medium 500 |
| Label de nav / sección sidebar | 11–12px, uppercase, tracking amplio | Medium 500 |
| Topbar · nombre de usuario | 14px | SemiBold 600 |
| Topbar · rol (línea secundaria) | 12px | Regular 400 · `--text-secondary` |

Números de KPI: `tabular-nums`.

---

## 4. Convenciones por componente

### 4.1 Sidebar (compartido)

Documentar e implementar como componente reutilizable (admin y, más adelante, caja si aplica).

- Contenedor tipo card: fondo `--bg-panel` sobre el `--bg-app` de la ventana, `border-radius: 24px`, margen — no full-bleed con borde derecho.
- **Sin divisores horizontales** (ni bajo el logo ni sobre la night card).
- **Logo** arriba, **alineado a la izquierda**, integrado al flujo (sin centrar ni línea debajo).
  Light → `--accent-primary` (color fuerte). Dark → `--text-primary`.
- Grupos con header uppercase (`MENU`, `CONFIGURACIÓN`, `GENERAL`): ~10px, tracking amplio, `--text-tertiary`.
- **Ítem activo**: sin caja de fondo. Pill vertical grueso (~5px) con `border-radius` solo a la derecha, pegado al borde izquierdo del sidebar; hueco claro hasta el icono; icono + texto en bold y acento.
- **Ítems inactivos**: iconos outline **sin caja** de fondo; texto `--text-tertiary` (#9CA3AF), peso regular. Hover solo aclara el texto.
- **GENERAL**: `Sistema` + **Cerrar sesión**.
- **Ayuda**: no agregar hasta tener contenido real (YAGNI).
- Pie: **Night action card** flotante con margen (§4.10), no barra full-width con `border-top`.

Jerarquía de nav recomendada para `/admin`:

```
MENU
  Dashboard          (ex Monitoreo)
  Historial de Noches
  Auditoría de Tickets

CONFIGURACIÓN
  Carta
  Gestión de Staff
  Pagos              (ex Pagos + PDV/Posnets en una sola vista)

GENERAL
  Sistema
  Cerrar sesión
```

### 4.2 Topbar / headbar (compartido)

Componente compartido (`AppTopbar`). **Autónoma en el flujo**: va al inicio del scroll del
canvas (`--bg-panel`), **sin border/outline** y **sin sticky** — al scrollear se va con el contenido.
Las KPI debajo usan `--bg-surface` (blanco) sobre el mismo canvas.

**No** incluir mail ni notificaciones hasta que existan features.

Layout (izquierda → derecha):

1. **Enrutado / ubicación** (obligatorio): breadcrumb. Ej. `Administración / Dashboard`.
2. (Opcional futuro) search pill — **omitida** mientras no haya búsqueda global.
3. **Toggle día/noche**: botón circular (mismo lenguaje que iconos de utilidad de la ref).
4. **Usuario** (derecha): avatar circular + nombre (SemiBold) + rol (Regular, secondary).

### 4.3 KPI / Metric cards

Componente: `MetricCard` (`featured?: boolean`).

- **Featured** (Dashboard → Ventas Totales):
  - Light: fondo `--accent-primary`, texto `--text-on-accent`.
  - Dark: fondo `--accent-featured`.
  - Icono: círculo outline semitransparente; en featured se usa flecha `ArrowUpRight` (como la ref).
- **Estándar**: `--bg-surface` (blanco del fondo) sobre canvas `--bg-panel`, borde `1px --border-subtle`, sombra `--shadow-card`; icono Lucide en círculo outline con `--accent-primary`.
- Píldora de tendencia: badge success/danger (`--success-soft` / `--danger-soft`); sobre featured, pill blanca/10.
- **Datos**: métricas actuales de Cocktrail; solo cambia el envoltorio. Spec: [`dashboard-kpis.md`](../specs/features/refactor-ui-bosko/dashboard-kpis.md).
- Prop `color` hex: deprecated / ignorada.

### 4.4 Botones

| Variante | Estilo |
|---|---|
| Primary | Fondo `--accent-primary`, texto `--text-on-accent`, radius 8–12px |
| Secondary / outline | Fondo transparente o `--bg-surface`, borde `--border-strong`, texto `--text-primary` |
| Ghost / tertiary | Sin borde; hover `--bg-surface-elevated` |
| Danger | Fondo / borde danger |

### 4.5 Badges de estado

Par `*-bg` / `*-text` del tema. Pills compactos.

### 4.6 Charts y visualización

- Contenedor: `--bg-surface`, borde `--border-subtle`, `rounded-2xl`, `--shadow-card`.
- Barras activas / pico: `--accent-primary`, `rounded-t-xl`; secundarias: clase `.bosko-stripe`.
- Donut: top-2 canales → acento sólido; resto → patrón SVG stripe; centro = `%` + label del #1.
- Spec: [`dashboard-charts.md`](../specs/features/refactor-ui-bosko/dashboard-charts.md).

### 4.7 Modales / popups

Overlay semitransparente; panel `--bg-surface`, radius 16–20px; primary + secondary.

### 4.8 Forms / CRUD (tabla estándar)

**Referencia de layout** (estructura, no colores): [`reference/crud-table-ref.png`](./reference/crud-table-ref.png).  
**Skin**: solo tokens Bosko (§2). El azul del mock → `--accent-primary` / `--accent-bright`.  
**Plantilla de producto**: Carta — spec [`crud-carta.md`](../specs/features/refactor-ui-bosko/crud-carta.md).  
Staff / PDV / etc. reutilizan este patrón; no inventan otra tabla.

#### Anatomía (arriba → abajo)

```
[ Título sección (fuera de la card) ]

┌─ card `--bg-surface`, radius 16–20, borde `--border-subtle`, shadow `--shadow-card`
│  Toolbar
│    · Segmented (filtros de vista)     · Botón funnel (toggle fila filtros)
│    · Search (pill)                    · CTA primary “+ Nuevo …”
│  Tabla
│    · Header: labels UPPERCASE + sort  · ⚙ columnas (derecha)
│    · (opc.) Fila filtros por columna
│    · Filas de datos + pills de estado · Acciones fijas a la derecha
└─
[ Drawer / panel form create-edit ]
[ Toast / ConfirmRail ]
```

#### Toolbar

| Pieza | Comportamiento | Tokens |
|---|---|---|
| **Segmented** | 2–3 vistas mutuamente excluyentes (ej. Todos / En carta / Ocultos). Activo = fondo `--accent-primary`, texto `--text-on-accent`. Inactivo = `--bg-surface` + borde `--border-subtle`, texto `--text-primary`. Radius 8–12. | §2, botones §4.4 |
| **Funnel** | Botón cuadrado radius 8–12; activo = `--accent-surface` + icono `--accent-text`. Toggle **mostrar/ocultar** la fila de filtros de columna. Default **cerrado**. | |
| **Search** | Input pill (`9999px`) o radius alto; placeholder “Buscar…”. Sin dropdown de “campo” salvo que la entidad lo necesite de verdad. Icono/lupa en `--accent-primary`. | |
| **CTA Nuevo** | Primary §4.4 + icono `Plus`. Derecha de la toolbar. | |

No meter KPIs ni stats en esta toolbar.

#### Tabla

| Pieza | Regla |
|---|---|
| Contenedor | Una sola card; sin “card por fila”. |
| Header | Fondo sutil (`--bg-panel` o `--bg-surface-elevated`); labels `11–12px`, bold, uppercase, tracking amplio, `--text-secondary`. Sort: chevron; columna activa → `--accent-text`. |
| ⚙ Columnas | Última celda del header (antes o sobre acciones). Popover checklist: mostrar/ocultar columnas **opcionales**. Persistencia `localStorage` por entidad (`crud:<entity>:cols`). Columnas **obligatorias** (identidad + acciones) no se pueden apagar. |
| Fila filtros | Solo si funnel activo. Text texto en columnas free-text; `<select>` “Todos” en columnas categóricas. Inputs compactos, borde `--border-subtle`, focus ring acento. |
| Filas | Separador horizontal `--border-subtle`; sin bordes verticales. Hover `--bg-panel` / soft. Click fila → editar (si aplica). |
| Pills estado | §4.5 (`success` / `warning` / `danger` / accent-surface). Una pill por estado semántico; no arcoíris por celda. |
| Acciones | Columna **fija** (no configurable). Controles directos preferidos (ojo / trash); menú `⋯` solo si hay ≥4 acciones. |

#### Delete / feedback (ya acordado)

- **Reversible**: `ConfirmRail` en la fila (tinte `--danger-soft`, slide R→L) → toast + **Deshacer** (~5s) → DELETE diferido. Ver Carta actual.
- **Irreversible**: `SafeDeleteModal` (escribir nombre).
- Componentes: `ConfirmRail`, `Toast` (+ `action`), `SafeDeleteModal`.

#### Form

Un solo patrón por sección: **drawer/panel lateral** (mismo lenguaje que §4.7). Create y edit comparten el form.

#### Qué no hacer en CRUDs

- No clonar la paleta azul del mock.
- No DataTable genérico tipo AG Grid / TanStack Table “por las dudas”.
- No fila de filtros siempre visible (default off).
- No cards anidadas por fila ni hero overlays.
- No inventar columnas que el modelo no tiene.

### 4.9 Widgets especiales

Fondo oscuro / degradado esmeralda permitido **incluso en light** para herramientas activas.

### 4.10 Night action card (compartido)

Reemplaza el bloque tipo “promo”: **tarjeta flotante** con margen respecto a las paredes del sidebar
(no barra inferior full-bleed ni `border-top`). Fondo degradado oscuro + textura sutil; CTA pill integrado.

| Estado | Contenido | Estética |
|---|---|---|
| Noche **abierta** | Título + subtítulo + CTA **Cerrar noche**; secundario texto **Clave de la noche** (sin caja pesada). | Degradado oscuro / wave esmeralda. |
| Noche **cerrada** | Título + CTA **Abrir noche**. | Misma familia de widget oscuro. |

---

## 5. Accesibilidad y movimiento

- Contraste texto/fondo ≥ **4.5:1**.
- Transición de tema: `background-color`, `color`, `border-color` ~0.25s ease.
- Focus visible en controles.
- Light: `--shadow-card`. Dark: elevación por color / borde 1px.

---

## 6. Mapeo a código existente (guía futura)

| Hoy | Destino Bosko |
|---|---|
| [`globals.css`](../../apps/web/src/app/globals.css) (`--ink-*`, crema/botella) | Tokens §2 |
| [`ThemeProvider`](../../apps/web/src/components/ThemeProvider.tsx) | Light/dark Bosko (sin look legacy) |
| [`AdminClient`](../../apps/web/src/app/admin/AdminClient.tsx) sidebar | Sidebar §4.1 + Night card §4.10 |
| [`OSHeadbar`](../../apps/web/src/components/shared/OSHeadbar.tsx) | Legacy (caja/login); admin usa [`AppTopbar`](../../apps/web/src/components/shared/AppTopbar.tsx) |
| [`OSProfileFooter`](../../apps/web/src/components/shared/OSProfileFooter.tsx) | Perfil → topbar; logout → GENERAL; theme toggle en topbar |
| Night CTA | [`NightActionCard`](../../apps/web/src/components/shared/NightActionCard.tsx) §4.10 |
| [`MetricCard`](../../apps/web/src/components/shared/MetricCard.tsx) | §4.3 |
| [`BrandLogo`](../../apps/web/src/components/shared/BrandLogo.tsx) | Logo sidebar en `--text-primary` |
| [`ConfirmRail`](../../apps/web/src/components/shared/ConfirmRail.tsx) | §4.8 delete inline |
| [`Toast`](../../apps/web/src/components/shared/Toast.tsx) | Feedback + `action` (Deshacer) |
| Carta CRUD | Plantilla §4.8 · spec [`crud-carta.md`](../specs/features/refactor-ui-bosko/crud-carta.md) |
| [`crud-table-ref.png`](./reference/crud-table-ref.png) | Layout tabla (estructura) |

---

## 7. Qué no hacer

- No reintroducir crema/manteca ni dark monocromo botella.
- No inventar una tercera paleta por pantalla.
- No crear un archivo por átomo hasta que una sección de este doc se vuelva ingobernable.
- No cambiar datos ni lógica de KPI “porque el mockup muestra otros números”.
- No agregar search / mail / notificaciones / Ayuda sin feature real detrás.
