# Diseño: Dashboard sin noche abierta + fix torta + detalle de noche

**Fecha**: 2026-07-14
**Estado**: validado con el usuario, listo para `/spec`

---

## Contexto

Dos specs previas (`docs/specs/simplificar-dashboard-admin.md`,
`docs/specs/simplificar-historial-noches.md`, ambas `done`) ya redujeron el Dashboard de
`/admin` y el Historial de Noches a su forma actual. Esta vuelta ataca 3 problemas puntuales
detectados en uso real (capturas del dashboard con noche cerrada, ver conversación de
brainstorming):

1. Con la noche cerrada, el Dashboard muestra todo en $0 y "-100% vs. Última Noche" — lectura
   confusa (parece una caída de ventas, no ausencia de operación).
2. El gráfico de torta "Distribución por Canal" pinta colores/segmentos aunque el total sea $0.
3. El detalle de una sola noche en Historial repite datos entre "Totales Consolidados" y
   "Detalle de Sesiones Individuales" cuando hubo 1 sola sesión, y le faltan 2 datos destacados
   (Top Trago de esa noche puntual, Duración).

---

## 1. Dashboard: 2 estados según haya o no noche abierta

**Sin noche abierta** (`openNight == null`): el Dashboard deja de alimentarse de `totals`
(derivado de `orders=[]`, todo en $0) y pasa a usar `historyEvents[0]` (última noche cerrada,
ya expuesto por `getLastNightTotals()` en `lib/analytics.ts`) como fuente para **todos** los
bloques: Ventas Totales, Tickets, Unidades, Ventas por Hora, Productos Más Vendidos,
Distribución por Canal, Hora Pico. Sin card "Comparativa" ni deltas %: los 3 `MetricCard`
muestran el valor de la última noche con un subtítulo tipo "Noche del 14 jul" en vez de
"vs. Última Noche". Si tampoco hay ninguna noche en el historial, se mantiene el estado vacío
actual.

**Con noche abierta** (`openNight != null`): sin cambios — `totals` de la noche en curso vs.
`historyEvents[0]`, con deltas y card "Comparativa", tal cual hoy.

Fuera de alcance: no se toca cómo se calculan los números en `useAdminAnalytics`/
`lib/analytics.ts` (`getLastNightTotals`/`computeDelta` ya existen) — el cambio es de **qué
fuente de datos alimenta al Dashboard**, no de la lógica de cálculo.

---

## 2. Fix torta "Distribución por Canal"

**Root cause** (`apps/web/src/app/admin/AdminClient.tsx`, `customPaymentBreakdown`): cuando
`totals.total === 0`, se usan porcentajes hardcodeados de fallback (efectivo 45%, tarjeta 35%,
QR 15%, otros 5%) en vez de 0 real. El filtro `.filter(b => b.total > 0 || b.pct > 0)` los deja
pasar porque `pct` es no-cero.

**Fix**:
- Sacar el fallback hardcodeado — con total $0, cada canal queda en `pct: 0, total: 0` real.
- `PaymentDonut.tsx`: con total real $0, el anillo se dibuja completo en gris neutro (sin
  segmentos de color).
- Leyenda: cada método muestra `$0 · 0 ops · 0%`, sin puntito de color activo.

Aplica tanto al estado "sin noche abierta" (que ahora usa datos de la última noche, así que en
la práctica solo pasa en un local nuevo sin historial) como a "con noche abierta" recién
arrancada sin ventas.

---

## 3. Historial: detalle de una sola noche (`NightComparator`, `idxB === -1`)

**Cambios**:
1. Renombrar **"Pedidos" → "Tickets Emitidos"** (mismo dato, nombre más preciso).
2. Agregar **"Top Trago"** como dato destacado propio: el trago más vendido de esa noche
   puntual (mismo cálculo que `computeNightRecords` usa para "Trago Estrella", acotado a esa
   noche en vez de ventana de 30 días).
3. Agregar **"Duración"** como dato destacado: horas totales operando esa noche
   (`closedAt - startedAt`, o de la sesión más temprana a la más tardía si hubo reapertura),
   formato tipo "4h 12m".
4. **Ocultar "Detalle de Sesiones Individuales"** cuando hay 1 sola sesión — el horario/quién
   cerró de esa sesión única pasa a mostrarse como dato chico dentro del bloque principal, sin
   repetir los totales. Con 2+ sesiones (reapertura el mismo día), el bloque de detalle por
   sesión se mantiene igual que hoy.

**Layout resultante** (1 sola noche, sin comparador): Recaudado · Tickets Emitidos · Efectivo ·
Top Trago · Duración (5 datos destacados) + lista de tragos vendidos + (solo si 2+ sesiones)
detalle de sesiones.

Fuera de alcance (confirmado con el usuario): el selector "Noche A / Noche B" para comparar dos
noches se queda tal cual — no se simplifica ni se saca.

---

## Decisiones descartadas

- **Estado vacío + link a Historial** en vez de reusar el Dashboard con datos de la última
  noche: descartado, el usuario prefiere ver los datos reales de entrada.
- **Comparar última noche vs. la anterior a esa** (en vez de mostrar solo datos sin comparativa)
  cuando no hay noche abierta: descartado.
- **Ocultar la torta entera con estado vacío** en vez de anillo gris: descartado, se prefiere el
  anillo gris + leyenda en 0.
- **Sumar plata por trago o desglose completo de canales** al detalle de noche: descartado por
  ahora, no pedido explícitamente.
- **Sacar el comparador A/B** del Historial: descartado, se mantiene.

---

## Siguiente paso

Escribir la spec formal en `docs/specs/` con `/spec`, y de ahí `/plan` → `/tasks` →
implementación.
