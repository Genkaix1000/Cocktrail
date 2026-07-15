# Reemplazar export CSV por PDF profesional

**Estado**: done
**Fecha**: 2026-07-14

---

## Problema / Por qué

El panel `/admin` tiene hoy dos botones de exportación (uno en el Dashboard de Monitoreo, otro en
Historial de Noches) que generan un CSV plano con los datos históricos de noches archivadas
(`exportHistoryCSV`/`downloadCSV` en `lib/analytics.ts`). Un CSV no es un formato pensado para
leer o mostrar — el dueño del boliche necesita abrirlo en una planilla y armar sus propias tablas
para poder mirar cómo viene facturando, mostrárselo a alguien, o guardarlo como registro
presentable de un período.

Además, el dato "semanal"/"mensual" que hoy existe en el sistema (`weeklyDelta`/`monthlyDelta` en
`useAdminAnalytics`) es solo "esta semana" y "este mes" — un número aislado, sin poder ver cómo
vino evolucionando semana a semana o mes a mes desde que el local usa el sistema.

**Para quién**: el dueño del boliche (rol `admin`), que quiere un documento prolijo y con
identidad de marca para revisar la facturación acumulada, la evolución semanal/mensual, y el
detalle de cada noche trabajada — sin depender de abrir un CSV en otra herramienta.

---

## Objetivo

Que el panel `/admin` tenga un único botón "Exportar" (en Historial de Noches) que genere un
**PDF** con identidad visual de marca (logo, paleta de colores), con: un resumen general
(facturación total acumulada, cantidad de noches, trago estrella), una tabla de facturación por
semana, una tabla de facturación por mes, y una tabla con el detalle de cada noche archivada. El
CSV deja de existir como opción.

---

## Historias de usuario

- Como **admin**, quiero un solo botón de exportar (no uno distinto por pantalla) para no
  preguntarme cuál usar.
- Como **admin**, quiero que lo que descargo sea un PDF prolijo con el logo/nombre de mi local y
  sus colores, no una planilla cruda, para poder mostrarlo o archivarlo como está.
- Como **admin**, quiero ver de un vistazo cuánto facturé en total, en cuántas noches, y cuál es
  mi trago estrella, al abrir el documento.
- Como **admin**, quiero ver la evolución de mi facturación semana a semana y mes a mes, no solo
  el número de la semana/mes actual.
- Como **admin**, quiero un detalle de cada noche que tuve (fecha, cuánto recaudé, tickets
  emitidos, el trago que más vendí, cuánto duró), sin tener que abrir cada noche una por una en
  Historial.
- Como **admin**, quiero que el documento se pueda generar sin conexión a internet, igual que el
  resto del sistema.

---

## Criterios de aceptación

### Botón único
1. **Given** el panel `/admin`, **then** existe un único botón "Exportar", ubicado en Historial
   de Noches — el botón "Exportar" que hoy existe en el Dashboard de Monitoreo ya no está.
2. **Given** se hace click en "Exportar", **when** hay al menos una noche archivada, **then** se
   descarga un archivo PDF (no CSV).

### Contenido del documento
3. **Given** el PDF generado, **then** su portada muestra: el logo o nombre del local (según lo
   configurado en el tema), el título "Reporte de Facturación", la fecha y hora de generación, y 3
   datos destacados: Total Facturado (acumulado de todo el historial), Total de Noches
   (cantidad de noches archivadas), y Trago Estrella (el más vendido, ventana de 30 días).
4. **Given** el PDF, **then** incluye una tabla "Facturación Semanal" con una fila por cada semana
   calendario (lunes a domingo) que tuvo al menos una noche archivada, mostrando el rango de
   fechas de esa semana, la cantidad de noches, y el total facturado — ordenada de la semana más
   reciente a la más antigua.
5. **Given** el PDF, **then** incluye una tabla "Facturación Mensual" con el mismo criterio, una
   fila por mes calendario con al menos una noche archivada (mes, cantidad de noches, total
   facturado), de más reciente a más antiguo.
6. **Given** el PDF, **then** incluye una tabla "Detalle Noche por Noche" con **una fila por cada
   noche archivada** (todas, sin recortar ni paginar los datos), mostrando: fecha, recaudado,
   tickets emitidos, trago más vendido esa noche, y duración de la noche.
7. **Given** cualquier hoja del PDF, **then** tiene un pie de página con el número de página y la
   fecha/hora en que se generó el documento.

### Identidad visual
8. **Given** el PDF, **then** usa fondo blanco y texto oscuro (no el tema oscuro de la app) —
   pensado para imprimirse o leerse cómodo en pantalla.
9. **Given** el PDF, **then** los acentos de color (títulos, líneas de tabla, logo) usan el color
   de marca activo (verde si el local usa el skin Bosko, azul en el skin genérico) — mismo color
   que ya se usa en pantalla para esos casos.
10. **Given** el dueño configuró una imagen de logo en el tema, **then** esa imagen aparece en la
    portada del PDF. **Given** no configuró ninguna, **then** aparece el nombre de marca como
    texto estilizado (mismo texto que se ve hoy en el resto de la app).

### Generación local
11. **Given** el sistema corriendo sin conexión a internet (modo local-first normal), **then** la
    generación y descarga del PDF funciona igual — no depende de ningún servicio externo ni del
    backend.

### Limpieza
12. **Given** el código del proyecto, **then** ya no existen `exportHistoryCSV` ni `downloadCSV`
    en `lib/analytics.ts`, ni ningún botón que genere un archivo `.csv`.

### General
13. `pnpm typecheck` (api + web) y la suite de tests de `apps/web` pasan en verde. `next build`
    sin errores.

---

## Fuera de alcance

- Cambios de backend, Supabase, migraciones o SSE — la generación del PDF es 100% `apps/web`,
  igual que era el CSV.
- Mantener el CSV como alternativa — se elimina por completo, no convive con el PDF.
- Filtros de rango de fechas o selección parcial de noches para el export — el PDF siempre incluye
  todo el historial disponible.
- Envío del PDF por email/WhatsApp o cualquier integración de compartir — solo se descarga
  localmente, como hacía el CSV.
- Exports separados por pantalla (uno corto en Dashboard, uno completo en Historial) — se decidió
  un único PDF completo y un único botón.
- Una sección extensa por noche (con tragos vendidos y sesiones individuales, como el detalle que
  ya existe en pantalla) — el detalle noche por noche del PDF es una tabla compacta de 5 columnas,
  no una réplica de esa vista.
- Diseño/paginación especial para historiales muy grandes (cientos de noches) — la tabla de
  detalle simplemente sigue agregando filas y páginas; no hay límite ni resumen truncado.

---

## Preguntas abiertas

Ninguna — todas las decisiones de alcance y diseño (formato PDF vs. CSV, librería
`@react-pdf/renderer`, paleta blanca con acentos de marca, estructura del documento, qué datos
entran en cada tabla) ya se validaron con el usuario en la sesión de brainstorming previa a esta
spec (ver `docs/plans/2026-07-14-export-pdf-historial-design.md`).

---

## Plan técnico

### Enfoque

Feature 100% `apps/web`, sin backend/Supabase/SSE. Se agrega `@react-pdf/renderer` (nueva
dependencia) y un módulo nuevo `apps/web/src/lib/pdfExport.tsx` que arma el `<Document>` y dispara
la descarga — reemplaza a `exportHistoryCSV`/`downloadCSV` (que se eliminan) como único punto de
exportación. La librería se importa con `await import("@react-pdf/renderer")` **dentro** de la
función exportadora (no en el top-level del módulo): evita que su código de browser-only
(fuentes, canvas) se evalúe durante el server-render de este client component, y difiere el costo
de bundle hasta que el admin realmente hace click en "Exportar". Dos piezas de cómputo se
**extraen y reusan** en vez de duplicarse: el agrupado de `historyEvents` por día calendario (hoy
inline en `HistorialSection.tsx`, se saca a `lib/analytics.ts` como `groupNightsByDay`) y
`formatEventDuration` (hoy local a `NightComparator.tsx`, se mueve a `lib/analytics.ts` — mismo
patrón que ya se aplicó con `formatNightDateLong` en la feature anterior). Se agregan 2 funciones
nuevas de agregación (semanal y mensual, sobre *todo* el historial, no solo semana/mes actual).

### Archivos/módulos afectados

**Dependencia nueva**
- `apps/web/package.json` — agregar `@react-pdf/renderer` (última versión estable, compatible con
  React 19). Sin dependencias de servidor/canvas nativo adicionales — el renderer de
  `@react-pdf/renderer` es puro JS/WASM, corre en el browser sin instalar nada del sistema
  operativo (relevante para el deploy en la mini-PC del boliche, ver `docs/DEPLOY.md`).

**`lib/analytics.ts` — cómputo reusable**
- Extraer el `useMemo` de agrupado por día (`HistorialSection.tsx` líneas ~80-142) a una función
  pura exportada `groupNightsByDay(historyEvents: EventSummary[]): UnifiedNightDay[]` — mismo
  cuerpo, sin cambios de lógica. `HistorialSection.tsx` pasa a llamarla dentro de su `useMemo` en
  vez de tener la lógica inline.
- Mover `formatEventDuration(startedAt: number, closedAt?: number): string` desde
  `NightComparator.tsx` (función local, no exportada) a `lib/analytics.ts` (exportada).
  `NightComparator.tsx` pasa a importarla en vez de definirla.
- Agregar `computeWeeklyBreakdown(historyEvents: EventSummary[]): { weekStart: number; weekEnd:
  number; nightsCount: number; total: number }[]` — agrupa **todo** el historial (no solo la
  semana actual, a diferencia de `computeWeeklyDelta` que no se toca) por semana calendario
  (reusando el helper `getWeekStart` ya existente en este archivo), sumando `total` y contando
  noches por semana, ordenado de más reciente a más antigua.
- Agregar `computeMonthlyBreakdown(historyEvents: EventSummary[]): { monthStart: number;
  monthLabel: string; nightsCount: number; total: number }[]` — mismo criterio agrupando por mes
  calendario, sin tocar `computeMonthlyDelta`.
- Eliminar `exportHistoryCSV` y `downloadCSV` (sin más callers tras el reemplazo).

**`apps/web/src/lib/pdfExport.tsx` (archivo nuevo)**
- Exporta `async function exportHistorialPdf(input: { historyEvents: EventSummary[]; isBosko:
  boolean; logoUrl: string; useLogoUrl: boolean; textLogoValue: string }): Promise<void>`.
- Dentro de la función: `const { pdf, Document, Page, View, Text, Image, StyleSheet } = await
  import("@react-pdf/renderer");` — import dinámico, ver Enfoque.
- Computa con los helpers de `lib/analytics.ts`: `allTotal` (suma de `historyEvents`),
  `computeNightRecords(historyEvents)` (Trago Estrella, ya existe), `computeWeeklyBreakdown`,
  `computeMonthlyBreakdown` (nuevas), `groupNightsByDay(historyEvents)` (nueva, para la tabla de
  detalle — cada fila usa `night.orderCounter` como Tickets Emitidos, `night.totals.drinksSold[0]`
  como Top Trago, `formatEventDuration(night.startedAt, night.closedAt)` como Duración — **los
  mismos 3 datos y el mismo cálculo** que ya usa `NightDetailView` en pantalla, garantiza que el
  PDF no muestre números distintos a los que el admin ya vio en Historial).
- Arma los estilos con `StyleSheet.create({...})`: paleta fondo blanco/texto oscuro, acento
  `#4ade80` si `isBosko` sino el azul de marca (mismo criterio que `getAccentColors`, pero como
  valores de color planos — `@react-pdf/renderer` no entiende clases Tailwind).
- Logo: si `useLogoUrl && logoUrl`, resuelve la URL a absoluta (`new URL(logoUrl,
  window.location.origin).toString()`) y la pasa a `<Image src={...} />`; si no, un `<Text>` con
  `textLogoValue` en fuente serif-itálica simulada (`Times-Italic`, la fuente core más cercana —
  no se registran fuentes remotas, ver Riesgos).
- Arma el árbol `<Document><Page>...</Page></Document>` con las 4 secciones de la spec (portada,
  semanal, mensual, detalle noche por noche) + `<Text fixed render={({pageNumber, totalPages}) =>
  ...} />` para el pie de página.
- `const blob = await pdf(<HistorialDocument .../>).toBlob();` y dispara la descarga con el mismo
  patrón DOM que ya usaba `downloadCSV` (crear `URL.createObjectURL(blob)`, `<a download>`,
  click, revoke) — se reimplementa acá en 5 líneas, no vale la pena mantener `downloadCSV`
  genérico solo para este único caller.

**`apps/web/src/components/admin/HistorialSection.tsx`**
- Sacar el import de `exportHistoryCSV`/`downloadCSV`; agregar `import { exportHistorialPdf }
  from "@/lib/pdfExport"` y `import { useTheme } from "@/components/ThemeProvider"` (para
  `logoUrl`/`useLogoUrl`/`textLogoValue` — el componente ya recibe `isBosko` por prop, no hace
  falta agregar 3 props nuevas encadenadas desde `AdminClient`, alcanza con leer el contexto
  directo ya que este componente vive dentro del mismo árbol de `ThemeProvider`).
- Agregar estado local `isExporting` (boolean) — el botón se deshabilita y cambia de texto
  ("Generando...") mientras `await exportHistorialPdf(...)` está en curso (un historial grande
  puede tardar un instante en armar el PDF completo).
- El botón pasa de "Exportar CSV" a "Exportar" (o "Exportar PDF" — a definir en `/tasks`), `onClick`
  async que llama `exportHistorialPdf({ historyEvents, isBosko, logoUrl, useLogoUrl,
  textLogoValue })`.

**`apps/web/src/components/admin/DashboardSection.tsx`**
- Eliminar el botón "Exportar" completo (líneas ~172-181) y el `import { exportHistoryCSV,
  downloadCSV, ... }` pasa a importar solo lo que siga usando (`formatNightDateLong` sigue
  necesitándose ahí, ver feature anterior). Confirmar con `grep` que el ícono `Download` de
  `lucide-react` no queda importado sin uso tras sacar el botón.

**`apps/web/src/components/analytics/NightComparator.tsx`**
- Sacar la definición local de `formatEventDuration`, importarla de `@/lib/analytics` (ya se hizo
  el mismo movimiento con `formatNightDateLong` en la feature anterior — mismo patrón).

**Tests**
- `apps/web/src/lib/analytics.test.ts` (o donde vivan los tests de este archivo) — agregar casos
  para `groupNightsByDay` (extraída, mismo comportamiento que el `useMemo` que reemplaza),
  `computeWeeklyBreakdown`, `computeMonthlyBreakdown` (nuevas — casos: historial vacío, 1 semana,
  varias semanas/meses con distinta cantidad de noches cada una).
- `apps/web/src/lib/pdfExport.test.tsx` (nuevo) — no renderiza el PDF real (evitar depender del
  motor de fuentes en el entorno de test), pero puede testear que `exportHistorialPdf` no tira con
  historial vacío/con datos, y que arma los estilos/colores esperados según `isBosko` — a definir
  el alcance exacto de testeo en `/tasks` según qué tan fácil sea mockear `@react-pdf/renderer` en
  `vitest`.
- `apps/web/src/components/admin/HistorialSection.test.tsx` — actualizar: sacar aserciones sobre
  "Exportar CSV"/`exportHistoryCSV`, agregar caso del botón "Exportar" (PDF) con estado
  `isExporting`.
- `apps/web/src/components/admin/DashboardSection.test.tsx` — sacar cualquier aserción sobre el
  botón "Exportar" que ya no existe ahí.

### Cambios de datos

Ninguno. Sin migraciones, sin cambios en `packages/shared/src/domain.ts` — todo se deriva de
`historyEvents: EventSummary[]` que ya llega a `HistorialSection.tsx` por prop (cargado por
`AdminClient.tsx` vía `eventsService.getHistory()`).

### Real-time

Sin cambios. El export no consume SSE — se dispara bajo demanda con los datos ya cargados en el
cliente en ese momento (mismo comportamiento que el CSV, que tampoco refrescaba antes de exportar).

### Auth/permisos

Sin cambios — sigue detrás del mismo guard de `/admin` (rol `admin`, permiso `historial`), la
generación es 100% client-side sobre datos que el navegador ya tiene cargados.

### Riesgos

- **No registrar fuentes remotas**: `@react-pdf/renderer` permite `Font.register` con una URL
  (ej. Google Fonts) para tipografías custom — **no usar esa opción**, rompería la generación
  offline (el sistema es local-first, sin depender de internet). Se usan las fuentes core del PDF
  (Helvetica/Times), que sí soportan acentos y ñ del español (WinAnsiEncoding).
- **`logoUrl` relativo**: el theme guarda rutas tipo `/bosko.webp` (servidas desde
  `apps/web/public/`) — `@react-pdf/renderer` necesita una URL resoluble por su fetcher interno;
  hay que confirmar en `/tasks` que `new URL(logoUrl, window.location.origin)` funciona tal cual
  vía LAN (`http://192.168.0.248:3000/bosko.webp`) y no solo en `localhost`, ya que el sistema se
  usa mayormente por IP LAN (ver `docs/DEPLOY.md`).
- **Tamaño/tiempo de generación con historiales grandes**: la tabla de detalle no pagina ni
  recorta (por diseño, spec §Fuera de alcance) — con muchos meses de uso el PDF puede crecer a
  varias decenas de páginas. No es un bug, pero conviene verificar manualmente con un historial
  con muchas noches (o datos sintéticos) que la generación no cuelgue el browser.
- **Bundle size**: `@react-pdf/renderer` es una librería pesada (~1-2MB). El import dinámico
  dentro del handler evita que infle el bundle inicial de `/admin`, pero conviene confirmar con
  `next build` que efectivamente queda en un chunk separado (code-splitting automático de
  `import()`).
- **`isBosko` como prop vs. contexto**: `HistorialSection` ya recibe `isBosko` por prop (patrón
  existente, no se toca), pero para el PDF hace falta leer `logoUrl`/`useLogoUrl`/`textLogoValue`
  que hoy NO le llegan — se opta por leerlos directo de `useTheme()` en vez de agregar 3 props más
  encadenadas desde `AdminClient` (ver Alternativas).

### Alternativas consideradas

- **jsPDF + jspdf-autotable**: descartado en el brainstorming — layout imperativo más verboso para
  un documento con 3 tablas y una portada.
- **Generar el PDF en el backend** (Express, con una librería server-side como `pdfkit` o
  Puppeteer): descartado — rompería el modelo local-first sin ganar nada (los datos ya están en el
  cliente), y sumaría una dependencia pesada (Puppeteer/Chromium) al backend de la mini-PC sin
  necesidad.
- **`window.print()` con una hoja de estilos de impresión** (sin librería nueva): descartado en el
  brainstorming — no da un archivo descargable consistente, depende del diálogo de impresión del
  navegador, y no logra el nivel de control de diseño ("prolijo y profesional") pedido.
- **Pasar `logoUrl`/`useLogoUrl`/`textLogoValue` como props desde `AdminClient` en vez de leer
  `useTheme()` directo en `HistorialSection`**: descartado — son 3 props más para un dato que ya
  está disponible vía contexto en cualquier punto del árbol; leerlo directo es más simple y evita
  acoplar la firma de `HistorialSection` a datos de theming que no usa para nada más.
- **Mantener `exportHistoryCSV`/`downloadCSV` como funciones genéricas reusables**: descartado —
  tras sacar los 2 únicos callers no queda ningún consumidor; se elimina en vez de dejar código
  muerto "por las dudas" (mismo criterio aplicado a `GeneralSection`/`QrSection` en una spec
  anterior).

---

## Tareas

Sin migraciones ni backend — todo el trabajo es en `apps/web`. Orden pensado para que cada paso
deje el árbol compilando (helpers/cómputo primero, después el módulo de PDF, después los
callers).

### 0. Verificación previa (no-destructiva)
- [x] `grep -rn "exportHistoryCSV\|downloadCSV"` en todo `apps/web/src` — confirmar que los únicos
  callers siguen siendo `DashboardSection.tsx` y `HistorialSection.tsx` (ya confirmado en el plan,
  reconfirmar por si cambió algo desde el análisis).
- [x] `grep -n "Download" apps/web/src/components/admin/DashboardSection.tsx` — confirmar si el
  ícono de `lucide-react` queda sin otro uso tras sacar el botón "Exportar", para sacarlo del
  import también.
- [x] Confirmar la última versión estable de `@react-pdf/renderer` compatible con React 19 (revisar
  su changelog/peerDependencies antes de instalar).

### 1. Dependencia nueva
- [x] `apps/web/package.json` — agregar `@react-pdf/renderer` (`pnpm --filter cocktrail-app add
  @react-pdf/renderer`).
- [x] Confirmar con `next build` que el import dinámico separa la librería en su propio chunk (no
  infla el bundle inicial de `/admin`).

### 2. Cómputo reusable en `lib/analytics.ts`
- [x] Extraer el `useMemo` de agrupado por día de `HistorialSection.tsx` (líneas ~80-142) a
  `groupNightsByDay(historyEvents: EventSummary[]): UnifiedNightDay[]`, exportada — mismo cuerpo,
  sin cambios de lógica.
- [x] `HistorialSection.tsx` — reemplazar la lógica inline por una llamada a `groupNightsByDay`
  dentro de su `useMemo` existente.
- [x] Mover `formatEventDuration(startedAt, closedAt?)` de `NightComparator.tsx` (función local) a
  `lib/analytics.ts` (exportada) — mismo patrón que `formatNightDateLong` en la feature anterior.
- [x] `NightComparator.tsx` — sacar la definición local, importar `formatEventDuration` desde
  `@/lib/analytics`.
- [x] Agregar `computeWeeklyBreakdown(historyEvents): { weekStart; weekEnd; nightsCount; total
  }[]` — agrupa todo el historial por semana calendario (reusar `getWeekStart`), ordenado
  descendente.
- [x] Agregar `computeMonthlyBreakdown(historyEvents): { monthStart; monthLabel; nightsCount;
  total }[]` — mismo criterio por mes calendario.
- [x] Eliminar `exportHistoryCSV` y `downloadCSV` de `lib/analytics.ts`.
- [x] Tests de `lib/analytics.ts` — casos para `groupNightsByDay` (extraída, mismo comportamiento
  que antes), `computeWeeklyBreakdown`/`computeMonthlyBreakdown` (historial vacío, 1 semana/mes,
  varias semanas/meses con distinta cantidad de noches).

### 3. Módulo de generación del PDF (`apps/web/src/lib/pdfExport.tsx`, nuevo)
- [x] Crear el archivo con `async function exportHistorialPdf(input: { historyEvents; isBosko;
  logoUrl; useLogoUrl; textLogoValue }): Promise<void>`, con el import dinámico de
  `@react-pdf/renderer` dentro de la función (no en el top-level del módulo).
- [x] Armar los estilos (`StyleSheet.create`) — fondo blanco, texto oscuro, acento
  `#4ade80`/azul según `isBosko`, tipografías core (Helvetica/Times — **no** `Font.register` con
  URL remota, ver riesgo de offline).
- [x] Portada: logo (`<Image>` con `logoUrl` resuelto a absoluta vía `new URL(logoUrl,
  window.location.origin)`) o `<Text>` con `textLogoValue` como fallback; título "Reporte de
  Facturación"; fecha/hora de generación; 3 destacados (Total Facturado = suma de
  `historyEvents`, Total de Noches = `historyEvents.length`, Trago Estrella =
  `computeNightRecords(historyEvents)[0]`).
- [x] Sección "Facturación Semanal": tabla desde `computeWeeklyBreakdown`.
- [x] Sección "Facturación Mensual": tabla desde `computeMonthlyBreakdown`.
- [x] Sección "Detalle Noche por Noche": tabla desde `groupNightsByDay(historyEvents)`, 1 fila por
  noche — Fecha, Recaudado, Tickets Emitidos (`night.orderCounter`), Top Trago
  (`night.totals.drinksSold[0]`), Duración (`formatEventDuration(night.startedAt,
  night.closedAt)`).
- [x] Pie de página en cada hoja: `<Text fixed render={({pageNumber, totalPages}) => ...}>` +
  fecha/hora de generación.
- [x] `const blob = await pdf(<HistorialDocument .../>).toBlob();` + descarga (crear
  `URL.createObjectURL`, `<a download>`, click, `revokeObjectURL`) — mismo patrón que tenía
  `downloadCSV`, reimplementado acá.
- [x] Definir el nombre del archivo descargado (ej. `reporte-facturacion-bosko.pdf` o similar con
  la fecha) — a definir al implementar, no bloqueante.

### 4. `HistorialSection.tsx` — conectar el botón
- [x] Sacar el import de `exportHistoryCSV`/`downloadCSV`; agregar `import { exportHistorialPdf }
  from "@/lib/pdfExport"` y `import { useTheme } from "@/components/ThemeProvider"`.
- [x] Agregar estado local `isExporting` (boolean).
- [x] Cambiar el botón "Exportar CSV" → "Exportar" (texto cambia a "Generando..." mientras
  `isExporting`, deshabilitado durante la generación); `onClick` async que llama
  `exportHistorialPdf({ historyEvents, isBosko, logoUrl, useLogoUrl, textLogoValue })` con
  try/catch (mostrar algún error simple si falla — a definir el patrón exacto de error al
  implementar, revisar si ya existe un `Toast`/patrón de error reusable en el proyecto).

### 5. `DashboardSection.tsx` — sacar el botón duplicado
- [x] Eliminar el botón "Exportar" completo y su `onClick`.
- [x] Limpiar imports que queden sin uso (`exportHistoryCSV`, `downloadCSV`, posiblemente
  `Download` de `lucide-react` — confirmar con el grep del paso 0).

### 6. Tests
- [x] `apps/web/src/lib/pdfExport.test.tsx` (nuevo) — al menos: `exportHistorialPdf` no tira con
  historial vacío ni con datos reales; verificar que dispara la descarga (mock de
  `URL.createObjectURL`/click). Evaluar si vale la pena mockear `@react-pdf/renderer` para testear
  contenido del documento o si alcanza con probar que la función no rompe — decidir alcance al
  implementar.
- [x] `apps/web/src/components/admin/HistorialSection.test.tsx` — sacar aserciones de "Exportar
  CSV"; agregar caso del botón "Exportar" (PDF) y su estado `isExporting`.
- [x] `apps/web/src/components/admin/DashboardSection.test.tsx` — sacar cualquier aserción sobre
  el botón "Exportar" que ya no existe ahí.

### 7. Cierre
- [x] `pnpm typecheck` (api + web) en verde.
- [x] `eslint` en verde (sin errores nuevos).
- [x] `vitest run` en `apps/web` en verde — suite completa.
- [x] `next build` de punta a punta sin errores.
- [x] Verificación manual: generar el PDF con el historial real del entorno de desarrollo, abrirlo
  y confirmar visualmente portada/tablas/pie de página, logo (o texto fallback) correcto, colores
  de marca, y que el logo carga bien accediendo por la IP LAN (no solo `localhost`) — ver riesgo
  del plan técnico. Si el subagent `e2e-playwright-tester` puede automatizar la descarga y
  verificar que el archivo se genera, usarlo; si no, verificación manual con Playwright/browser.
- [x] Actualizar `docs/ROADMAP.md` con una entrada breve para esta feature (mismo formato que las
  anteriores).
- [x] Cambiar el estado del header de esta spec de `draft` a `done`.

---

**Notas de ejecución**: el paso 3 (`pdfExport.tsx`) es el de mayor superficie nueva — usar Plan
Mode si se quiere revisar la estructura del documento antes de escribir el JSX de
`@react-pdf/renderer`. El resto de los pasos son mecánicos. Ir tildando `- [x]` a medida que se
completa cada tarea.
