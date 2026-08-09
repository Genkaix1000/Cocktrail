# Help Center + Tours por Sección

> Tours guiados por sección + onboarding general. Alcance: **admin + caja**.
>
> **UX actual:** no hay panel/sheet de categorías. El `?` del topbar corre la
> **ayuda general**. Cada sección tiene su propio `?` contextual.

---

## 1. Motivación

Ayuda donde estás (sección) + onboarding corto (navegar + Mercado Pago +
instalar app si hace falta). Sin un catálogo compactado de tours.

---

## 2. Arquitectura

```
components/help/
  HelpCenterProvider.tsx  — context + first-visit + wrappea TourProvider
  SectionHelpButton.tsx   — "?" contextual por sección
  helpTours.ts            — categorías, steps, localStorage

components/tour/
  TourProvider.tsx        — runSteps + resume OAuth Pagos
  TourOverlay.tsx         — spotlight + progreso por paso
  tourSteps.ts            — buildPagosSteps (categoría Pagos)
```

### Flujo

```
Topbar "?"     → startGeneralTour()
Section "?"    → startTour(category)
First visit    → mark seen + startGeneralTour() a los 600ms
OAuth resume   → buildPagosSteps (sin panel)
```

### Persistencia

| Clave | Uso |
|-------|-----|
| `cocktrail_help_general_seen` | First-visit ya corrió |
| `cocktrail_help_done` | JSON categorías completadas |
| `cocktrail_tour_resume` | Retoma post-OAuth Pagos |

---

## 3. Tour general (topbar)

**Admin** (si no `display-mode: standalone`):
1. Instalá la app (`pwa-install` en Sistema)
2. Bienvenida
3. Navegación (sidebar)
4. Vinculá Mercado Pago (`mp-card`)
5. Listo — menciona el `?` por sección

**Caja** (si no standalone): install tip → bienvenida → menú → listo.

---

## 4. Tours por sección

| Rol | Categoría | `SectionHelpButton` en |
|-----|-----------|-------------------------|
| admin | dashboard | DashboardSection |
| admin | historial | HistorialSection (admin) |
| admin | auditoria | LogsSection |
| admin | carta | CartaSection |
| admin | staff | UsuariosSection |
| admin | pagos | PagosSection (dynamic MP) |
| admin | sistema | SistemaSection |
| caja | venta | VentaSection toolbar |
| caja | caja-historial | HistorialSection (caja) |
| caja | metricas | MetricasSection |

### 4.1 Admin — Dashboard (8 pasos)

| # | ID | Target | Título | Cuerpo |
|---|----|--------|--------|--------|
| 1 | `dash-header` | `[data-tour="night-status"]` | Panel de monitoreo | Acá ves el resumen de tu negocio. Si hay una noche abierta, los datos se actualizan solos en tiempo real. Si no, ves el resumen de la última noche registrada. |
| 2 | `dash-sanidad` | `[data-tour="sistema-sanidad"]` | Sanidad del sistema | Te avisa si algo necesita atención: Mercado Pago sin vincular, cambios en la base de datos, o migraciones pendientes. Si está todo verde, no hace falta hacer nada. |
| 3 | `dash-metrics` | `[data-tour="dashboard-metrics"]` | Métricas principales | Ingreso neto (facturación menos comisiones de MP), tickets totales, y unidades vendidas. Cada tarjeta compara contra la última noche cuando hay historial. |
| 4 | `dash-hourly` | `[data-tour="hourly-chart"]` | Ventas por hora | Gráfico de barras con la recaudación hora por hora. La barra más alta es la hora pico. Pasá el mouse sobre cada barra para ver el monto exacto. |
| 5 | `dash-products` | `[data-tour="top-products"]` | Productos más vendidos | Top 5 de tragos por recaudación bruta. Te muestra cuántas unidades de cada uno se vendieron y el subtotal. |
| 6 | `dash-donut` | `[data-tour="payment-donut"]` | Desglose de pagos | Distribución por método de pago: efectivo, QR, débito, crédito. Cada porción muestra el porcentaje y el monto. |
| 7 | `dash-peak` | `[data-tour="peak-hour"]` | Hora pico | La hora de mayor recaudación de la noche. Cuando la noche está abierta, muestra el badge "En vivo" y se actualiza automáticamente. |
| 8 | `dash-footer` | `[data-tour="dashboard-footer"]` | Actualización en vivo | El punto verde significa que el monitoreo está activo y los datos llegan en tiempo real por SSE. Si se corta la conexión, se reintenta automáticamente. |

### 4.2 Admin — Historial de Noches (4 pasos)

| # | ID | Target | Título | Cuerpo |
|---|----|--------|--------|--------|
| 1 | `hist-list` | `[data-tour="night-records"]` | Lista de noches | Cada tarjeta representa una noche cerrada con sus totales: facturación, tickets, unidades, duración y métodos de pago. |
| 2 | `hist-compare` | `[data-tour="night-comparator"]` | Comparativa entre noches | Seleccioná dos o más noches para compararlas lado a lado. Ideal para ver tendencias (finde vs. entre semana, o cómo creció el negocio). |
| 3 | `hist-detail` | `[data-tour="night-detail"]` | Detalle de una noche | Click en cualquier tarjeta para expandir y ver el desglose completo de esa noche. |
| 4 | `hist-delete` | `[data-tour="delete-night"]` | Eliminar noche | Si registraste una noche por error o de prueba, la podés borrar. El sistema te pide confirmación para evitar accidentes. |

### 4.3 Admin — Auditoría de Tickets (demo hardcodeado)

`onStart` inyecta tickets de ejemplo en `LogsSection` (`lib/auditTourDemo`) sin API ni noche abierta.
`onEnd` / "Salir del demo" los quita.

| # | ID | Target | Título | Notas |
|---|----|--------|--------|--------|
| 1 | `audit-demo` | `audit-header` | Demo con tickets de ejemplo | `animateNav: logs` |
| 2 | `audit-nav` | `audit-nav` | Navegar por fecha | 2 días en el demo |
| 3 | `audit-filters` | `audit-filter-cancelados` | Filtrá cancelados | `advanceOnClick` |
| 4 | `audit-filters-all` | `audit-filter-todos` | Volvé a Todos | `advanceOnClick` |
| 5 | `audit-search` | `audit-search` | Buscador | |
| 6 | `audit-table` | `logs-table` | Tabla de tickets | |
| 7 | `audit-pagination` | `audit-pagination` | Paginación | >10 tickets en el día reciente |

### 4.4 Admin — Carta (4 pasos)

| # | ID | Target | Título | Cuerpo |
|---|----|--------|--------|--------|
| 1 | `carta-table` | `[data-tour="carta-toolbar"]` | Tabla de tragos | Lista de todos los productos disponibles para la venta. Cada fila muestra nombre, precio, categoría y si está activo o desactivado. |
| 2 | `carta-new` | `[data-tour="nuevo-trago"]` | Agregar trago | D de alta un nuevo producto: nombre, precio de venta, costo, y categoría. El trago aparece automáticamente en la caja. |
| 3 | `carta-cats` | `[data-tour="carta-categories"]` | Categorías | Organizá los tragos en categorías (ej. Fernet, Vodka, Cerveza). Las categorías agrupan los productos en la grilla de la caja. |
| 4 | `carta-cols` | `[data-tour="column-picker"]` | Personalizar columnas | Elegí qué columnas mostrar en la tabla: costo, stock, categoría, etc. La selección se guarda en tu navegador. |

### 4.5 Admin — Gestión de Staff (3 pasos)

| # | ID | Target | Título | Cuerpo |
|---|----|--------|--------|--------|
| 1 | `staff-table` | `[data-tour="staff-table"]` | Tabla de usuarios | Lista de todo el personal: administradores, bartenders, y cajeros. Cada uno tiene su rol que determina qué puede hacer. |
| 2 | `staff-new` | `[data-tour="nuevo-usuario"]` | Agregar usuario | D de alta un nuevo miembro del equipo: nombre, PIN de acceso (4 dígitos) y rol (admin, caja, o ambos). |
| 3 | `staff-edit` | `[data-tour="user-form"]` | Editar usuario | Cambiá el PIN, nombre o rol de un usuario existente. También podés desactivarlo sin borrarlo para que no pueda ingresar. |

### 4.6 Admin — Pagos (4 pasos)

| # | ID | Target | Título | Cuerpo |
|---|----|--------|--------|--------|
| 1 | `pagos-mp-status` | `[data-tour="mp-card"]` | Estado de Mercado Pago | Te muestra si tu cuenta de MP está vinculada y activa. Sin esto no se puede cobrar con QR ni usar Posnet. |
| 2 | `pagos-mp-link` | `[data-tour="vinculame"]` | Vincular cuenta | Conectá tu cuenta de Mercado Pago en un click. Te redirige a MP para autorizar, y volvés automáticamente. |
| 3 | `pagos-pdv` | `[data-tour="pdv-section"]` | Puntos de venta (PDV) | Cada PDV representa una caja registradora o sucursal. Necesitás al menos uno para que MP sepa de dónde vienen los cobros. |
| 4 | `pagos-posnet` | `[data-tour="agregar-posnet"]` | Agregar Posnet | Si tenés un Posnet físico, ingresá su número de serie acá para que la caja pueda cobrar con tarjeta por ese dispositivo. |

### 4.7 Admin — Sistema (4 pasos)

| # | ID | Target | Título | Cuerpo |
|---|----|--------|--------|--------|
| 1 | `sys-theme` | `[data-tour="sistema-theme"]` | Personalización visual | Cambiá el nombre del bar, logo, colores y modo oscuro/claro. Todo se aplica al instante en admin y caja. |
| 2 | `sys-sanidad` | `[data-tour="sistema-sanidad-full"]` | Salud del sistema | Diagnóstico completo: conexión a la base de datos, estado de Mercado Pago, migraciones, y versiones. |
| 3 | `sys-migrations` | `[data-tour="migrations-banner"]` | Estado de migraciones | Muestra si hay cambios pendientes en la base de datos. Si ves un aviso acá, significa que el schema necesita atención. |
| 4 | `sys-install` | `[data-tour="pwa-install"]` | Instalar la app | Guía para instalar Bosko en tu celular o tablet. Detecta automáticamente si estás en Android o iOS y te da las instrucciones correctas. |

### 4.8 Caja — Nueva Venta (4 pasos)

| # | ID | Target | Título | Cuerpo |
|---|----|--------|--------|--------|
| 1 | `venta-grid` | `[data-tour="product-grid"]` | Grilla de productos | Todos los tragos disponibles organizados por categoría. Tocá un producto para agregarlo al carrito. |
| 2 | `venta-cart` | `[data-tour="cart-sidebar"]` | Carrito lateral | Acá se arma la cuenta. Podés cambiar cantidades, agregar propina, y dividir el pago entre varios métodos. |
| 3 | `venta-checkout` | `[data-tour="checkout"]` | Checkout y cobro | Elegí el método de pago (efectivo, QR, débito, crédito) y cerrá la cuenta. Si usás QR o tarjeta, el cobro se procesa por Mercado Pago. |
| 4 | `venta-shortcuts` | — | Atajos de teclado | La caja soporta atajos para velocidad: Enter para agregar al carrito, Escape para cancelar, teclas 1-9 para cantidades. |

### 4.9 Caja — Historial de Ventas (3 pasos)

| # | ID | Target | Título | Cuerpo |
|---|----|--------|--------|--------|
| 1 | `caja-hist-list` | `[data-tour="order-list"]` | Órdenes de la noche | Lista de todas las cuentas cerradas en la noche actual. Cada una muestra hora, monto y bartender. |
| 2 | `caja-hist-filters` | `[data-tour="order-filters"]` | Filtros | Buscá órdenes por bartender, método de pago o monto aproximado para encontrar rápido una cuenta. |
| 3 | `caja-hist-print` | `[data-tour="order-print"]` | Reimprimir ticket | ¿El cliente quiere otra copia? Seleccioná la orden y reimprimí el ticket en la impresora configurada. |

### 4.10 Caja — Métricas (3 pasos)

| # | ID | Target | Título | Cuerpo |
|---|----|--------|--------|--------|
| 1 | `metr-totals` | `[data-tour="metrics-totals"]` | Totales de la noche | Facturación total, tickets emitidos, promedio por ticket y propinas acumuladas. |
| 2 | `metr-staff` | `[data-tour="metrics-staff"]` | Rendimiento del staff | Cuánto facturó cada bartender en la noche. Ideal para medir productividad del equipo. |
| 3 | `metr-payments` | `[data-tour="metrics-payments"]` | Desglose de pagos | Distribución de métodos de pago igual que en el dashboard, pero solo de la noche actual. |

### 4.11 Tour general (topbar "?")

**Admin:**
| # | ID | Target | Título | Cuerpo |
|---|----|--------|--------|--------|
| 1 | `gen-install` | `[data-tour="pwa-install"]` | Instalá la app | Solo si no está en PWA standalone. Guía para instalar Bosko según tu dispositivo (Android o iOS). |
| 2 | `gen-welcome` | — | ¡Bienvenido a Bosko! | Vamos a recorrer lo esencial para que empieces a operar. Son 3 pasos rápidos. |
| 3 | `gen-nav` | `[data-tour="sidebar"]` | Navegación | El panel izquierdo te lleva a todas las secciones. Se puede colapsar con la flecha para ganar espacio. |
| 4 | `gen-mp` | `[data-tour="mp-card"]` | Vinculá Mercado Pago | Es lo primero que necesitás hacer: conectar tu cuenta de MP para poder cobrar con QR y Posnet. |
| 5 | `gen-done` | — | ¡Listo! | Ya sabés lo esencial. Cada sección tiene su propio botón `?` para ayuda específica cuando la necesites. |

**Caja:**
| # | ID | Target | Título |
|---|----|--------|--------|
| 1 | `gen-caja-install` | — | Instalá la app (si navegador) |
| 2 | `gen-caja-welcome` | — | ¡Bienvenido a la caja! |
| 3 | `gen-caja-venta` | `[data-tour="product-grid"]` | Nueva Venta |
| 4 | `gen-caja-done` | — | ¡Listo! |

---

## 5. Data attributes necesarios (nuevos)

`data-tour="..."` a agregar en componentes existentes:

| Componente | Atributo | Elemento |
|-----------|----------|----------|
| `DashboardSection.tsx` | `sistema-sanidad` | SystemSanidadPanel wrapper |
| | `hourly-chart` | Gráfico Ventas por Hora |
| | `top-products` | Lista Productos Más Vendidos |
| | `peak-hour` | Card de Hora Pico |
| | `dashboard-footer` | Footer con estado + SSE |
| `HistorialSection.tsx` | `night-records` | Lista de noches |
| | `night-comparator` | NightComparator |
| | `night-detail` | Detalle expandido de noche |
| `LogsSection.tsx` | `logs-filters` | Barra de filtros |
| | `logs-table` | Tabla de auditoría |
| | `logs-detail` | Detalle expandido de ticket |
| `CartaSection.tsx` | `carta-categories` | Botón/panel categorías |
| `DrinksTable.tsx` | `column-picker` | ColumnPicker |
| `SistemaSection.tsx` | `sistema-theme` | Panel tema |
| | `sistema-sanidad-full` | SystemSanidadPanel (versión completa) |
| | `pwa-install` | Guía PWA |
| (Pagos) | ya existen: `mp-card`, `vinculame`, `pdv-section`, `agregar-posnet` | — |
| (Staff) | ya existen: `staff-table`, `nuevo-usuario`, `user-form` | — |
| (Carta) | ya existen: `carta-toolbar`, `nuevo-trago` | — |
| `CajaSessionOnboarding.tsx` | `bar-selector` | Selector de barra |
| `VentaSection.tsx` | `product-grid` | Grilla productos |
| | `cart-sidebar` | Sidebar carrito |
| | `checkout` | Panel checkout |
| `HistorialSection.tsx` (caja) | `order-list` | Lista órdenes |
| | `order-filters` | Filtros |
| | `order-print` | Botón reimprimir |
| `MetricasSection.tsx` | `metrics-totals` | Totales |
| | `metrics-staff` | Staff |
| | `metrics-payments` | Pagos |

---

## 6. Fuera de alcance

- Panel/sheet Help Center con lista de categorías
- `PwaInstallGuide` aparte (vive en Sistema)
- Videos / i18n / analytics
