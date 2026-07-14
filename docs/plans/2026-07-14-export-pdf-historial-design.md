# Diseño: Reemplazar export CSV por PDF profesional

**Fecha**: 2026-07-14
**Estado**: validado con el usuario, listo para `/spec`

---

## Contexto

El panel `/admin` tiene hoy dos botones de exportación que generan CSV (`exportHistoryCSV`/
`downloadCSV` en `lib/analytics.ts`): "Exportar" en el Dashboard (`DashboardSection.tsx`,
`cocktrail_dashboard_export.csv`) y "Exportar CSV" en Historial de Noches
(`HistorialSection.tsx`, `cocktrail_historial.csv`). El dueño del boliche pidió reemplazar esto
por un **PDF prolijo y profesional**, con branding Bosko (logo + paleta de marca) y datos que
"realmente sumen": facturación total, desglose semanal y mensual, y detalle noche por noche de
todo lo archivado hasta el momento.

---

## 1. Alcance

- **Un solo botón "Exportar"**, ubicado en Historial de Noches (se saca el de Dashboard — ya no
  tiene sentido ahí ahora que el Dashboard muestra datos de la última noche, no un resumen
  histórico separado).
- **El PDF reemplaza al CSV por completo** — `exportHistoryCSV`/`downloadCSV` se eliminan de
  `lib/analytics.ts`, junto con ambos botones de CSV existentes.
- **Generación 100% en el cliente**, sin backend, sin internet — coherente con el modelo
  local-first del sistema. Librería: **`@react-pdf/renderer`** (componentes React declarativos
  `<Document>`/`<Page>`/`<View>`/`<Text>`, layout tipo flexbox) — elegida sobre `jsPDF` por ser
  más mantenible para un documento con varias secciones repetidas (tablas semanal/mensual/noche
  por noche).

---

## 2. Paleta y branding

- **Fondo blanco, texto oscuro** — pensado para imprimir/leer en pantalla, no una copia del tema
  oscuro de la app (que gastaría tinta y se vería mal impreso).
- **Acentos de color de marca** solo en títulos, líneas de tablas y el logo: verde Bosko
  (`#4ade80`) si `isBosko`, azul (`#6db3f2`/similar) si no — mismo criterio que
  `getAccentColors(isBosko)` ya usa en pantalla.
- **Logo**: si el dueño configuró una imagen (`logoUrl` del tema, vía `useTheme`/`ThemeProvider`),
  se embebe esa imagen en la portada. Si no, se usa el nombre de marca como texto estilizado
  (`textLogoValue`, ej. "Bosko") — mismo fallback que ya implementa `BrandLogo.tsx`.

---

## 3. Estructura del documento

1. **Portada / Resumen**: logo/nombre + "Reporte de Facturación" + fecha de generación. 3 números
   destacados: **Total Facturado** (`allTotal`, ya calculado), **Total de Noches**
   (`historyEvents.length`), **Trago Estrella** (últimos 30 días, `computeNightRecords`).
2. **Facturación Semanal**: tabla, 1 fila por semana calendario con al menos una noche archivada —
   columnas Semana (rango de fechas) / Noches / Total Facturado, de más reciente a más antigua.
3. **Facturación Mensual**: misma idea, 1 fila por mes — Mes / Noches / Total Facturado.
4. **Detalle Noche por Noche**: tabla compacta, 1 fila por noche archivada (todas, sin límite) —
   Fecha / Recaudado / Tickets Emitidos / Trago Top / Duración. Mismos 5 datos que ya se muestran
   en el detalle de una noche en Historial (feature anterior), por consistencia.
5. **Pie de página** en cada hoja: número de página + "Generado el [fecha/hora]".

**Cálculos nuevos requeridos** (no existen hoy, se agregan a `lib/analytics.ts` con el mismo
patrón que `unifiedHistoryDays` — agrupar por día — ya usa en `HistorialSection.tsx`):
- Agrupar `historyEvents` por semana calendario (lun-dom), sumando totales por semana.
- Agrupar `historyEvents` por mes calendario, sumando totales por mes.

Todo lo demás (Total Facturado, Trago Estrella, Tickets Emitidos/Top Trago/Duración por noche) ya
existe calculado (`useAdminAnalytics`, `computeNightRecords`, y los mismos campos que usa
`NightDetailView` en `NightComparator.tsx` tras la feature de dashboard-sin-noche-abierta).

---

## Decisiones descartadas

- **Mantener el CSV como opción alternativa** junto al PDF: descartado — un solo camino de
  exportación, sin duplicar botones ni mantenimiento.
- **jsPDF + jspdf-autotable**: descartado a favor de `@react-pdf/renderer` — layout declarativo
  más prolijo para un documento con varias tablas repetidas.
- **Fondo oscuro (tema de la app) en el PDF**: descartado — poco práctico para imprimir.
- **Dos exports distintos** (uno corto en Dashboard, uno completo en Historial): descartado — un
  solo PDF completo, un solo botón, en Historial.
- **Una sección completa por noche** (en vez de tabla compacta): descartado — con muchas noches
  archivadas el documento se volvería enorme; se prefiere 1 fila compacta por noche.
- **Solo los 2 números actuales de semana/mes** (sin desglose histórico): descartado — el usuario
  quiere una tabla completa semana a semana y mes a mes, no solo el dato de la semana/mes actual.

---

## Siguiente paso

Escribir la spec formal en `docs/specs/` con `/spec`, y de ahí `/plan` → `/tasks` →
implementación.
