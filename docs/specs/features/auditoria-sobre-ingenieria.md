# Auditoría de sobre-ingeniería (ponytail-audit)

**Estado**: done
**Fecha**: 2026-07-23

---

## Problema / Por qué

El repo acumuló grasa de iteraciones rápidas: código muerto sin referencias, utilidades
duplicadas en api y web, abstracciones de un solo consumidor, dependencias redundantes que la
plataforma ya cubre, y docs/config huérfanas. El `tsc --noEmit` y los tests no detectan esto — es
deuda de mantenimiento pura que hace cada cambio más lento y ruidoso.

Se corrió `ponytail-audit` sobre el árbol completo (no diff) para encontrar solo esto: nada de
bugs, nada de perf, nada de corrección. Solo qué borrar.

---

## Objetivo

Bajar la línea de mantenimiento del repo eliminando código muerto, deduplicando lógica compartida,
reemplazando wrappers innecesarios con lo que ya da la plataforma (Node, Express 5, browser), y
colapsando abstracciones de un solo uso. Todo verificado con `tsc --noEmit` (api + web) y las suites
de tests (api: 33 files / 459 tests, web: 60 files / 396 tests).

---

## Qué se hizo

### Código muerto (delete)

| Archivo / zona | Qué se borró | Líneas |
|---|---|---|
| `apps/api/src/data/seed-history.ts` | `seedHistoryDemo` + helpers — nunca importado en el repo | 136 |
| `apps/api/src/modules/events/events.service.ts` | `seedClosedEvent()` — solo llamado por el seed muerto | 16 |
| `packages/shared/src/domain.ts` | `PaymentStatus`, `PaymentProofInput`, `EventStatus` — tipos exportados pero nunca importados por ningún consumidor. Quedan inlines donde se usan internamente. | 14 |
| `apps/web/src/components/ThemeProvider.tsx` | `MANAGED_VARS`, `clearCustomVars()`, `applyThemeColors()` — CSS vars que nunca se setean. El único efecto era `setAttribute("data-theme","bosko")` que ya está en el layout. | 20 |
| Raíz | `.opencode/` (61MB con sus propios `node_modules/`), `.gemini/skills/` (byte-idéntico a `.cursor/skills/`), `.cursor/rules/ponytail.mdc` (duplicado de la skill) | 61MB |
| Raíz | `.env` + `.env.example` — ningún código del monorepo los lee (cada app tiene su propio `.env`) | 43 |
| `supabase/` | `.env` (byte-idéntico a `.env.example`), `migrations/schema.sql` (dump stale excluido del runner), `.branches/` | 171 |
| `docs/` | `fases-mp/` (10 archivos, plan especulativo pre-implementación, specs reales en `specs/mercadopago/`), `mp/` (9 archivos, dumps de API de MP), `template.md` | ~4500 |
| `pnpm-workspace.yaml` | `msw: false` — `msw` no está en el árbol de dependencias | 1 |
| `.gitignore` | `.turbo/`, `.playwright-mcp/`, `paso*-summary.png`, `.agents/`, `.agent/`, `skills-lock.json` — entradas para paths que no existen | 8 |
| `.vscode/settings.json` | `**/.source` en search/files/watcher (3 entradas) — directorio inexistente | 3 |

### Duplicación eliminada (shrink / stdlib)

| Qué | Dónde estaba duplicado | Dónde quedó |
|---|---|---|
| `computeTotals()` (71 líneas) | `apps/api/src/shared/utils/totals.ts` + `apps/web/src/lib/totals.ts` — byte-idéntico | `packages/shared/src/domain.ts`. Todos los imports actualizados. |
| `parseArgs()` (15 líneas) | `reset-data.ts` + `cleanup-empty-nights.ts` | `apps/api/src/scripts/args.ts`. Importado por ambos + tests. |
| `formatDuration()` | `CloseNightModal.tsx` + `analytics.ts` | Importa de `analytics.ts`. |
| `formatMoney()` | `NightComparator.tsx` + `pdfExport.tsx` | `@/lib/utils.ts`. |
| `formatShortDate()` + `MONTHS_SHORT` | `HistorialSection.tsx` + `pdfExport.tsx` | `@/lib/utils.ts`. |
| `isBrowser()` | `activeOrder.ts` + `pendingSales.ts` | `@/lib/utils.ts`. |
| `orderStatus` metadata | `lib/orderStatus.ts` (STATUS_META) + `barra/orderStatus.ts` (getPendingStatus) | `getPendingStatus` inlined en sus 2 consumidores. |

### Abstracciones de un solo uso colapsadas (yagni)

| Archivo eliminado | Consumidor | Dónde se inlineó |
|---|---|---|
| `Sep.tsx` (3 líneas) | `BarraClient.tsx` | `<span className="w-px h-6 bg-ink-800" />` |
| `Stat.tsx` (32 líneas) | `BarraClient.tsx` (3 usos) | JSX inline en el mismo archivo |
| `SectionTitle.tsx` (19 líneas) | `BarraClient.tsx` | JSX inline |
| `EmptyCard.tsx` (7 líneas) | `DashboardSection.tsx` | `<div>` con Tailwind inline |
| `EmptyState.tsx` (22 líneas) | `NightRecords.tsx` | JSX inline |
| `AnimatedNumber.tsx` (44 líneas) | `MetricCard.tsx` | `{value.toLocaleString("es-AR")}` directo |
| `Sparkline.tsx` (38 líneas) | `MetricCard.tsx` | Eliminado — el prop `sparklineData` nunca se pasaba |
| `TicketItemRow.tsx` (80 líneas) | `Ticket.tsx` | Función local + ICON_MAP movidos a `Ticket.tsx` |
| `accentColors.ts` (15 líneas) | `NightRecords.tsx` + `NightComparator.tsx` | Ternario inline `isBosko ? "text-[#4ade80]" : "text-blue"` |
| `config/env.ts` (1 línea) | `api-client.ts` + `useSSE.ts` | `process.env.NEXT_PUBLIC_API_URL ?? ""` inline |
| `AuditLogsService` (clase, 39 líneas) | 6 controladores | `logAction()` + `getLatestLogs()` como funciones exportadas. Se eliminó el parámetro DI `auditLogsService` de los controladores — llaman directo. |
| `toCP437` (33 líneas) | `printer.service.ts` | El mapa CP437 + la función se movieron adentro de `printer.service.ts`. Se borró `printer.charset.ts`. |
| Rate limiters (5 × 9 líneas) | `rate-limit.ts` | Factory `limiter(windowMs, max, message)` — 49 → 15 líneas. |

### Dependencias y wrappers nativos reemplazados (native)

| Qué | Antes | Después |
|---|---|---|
| `cookie-parser` | Dependencia + `app.use(cookieParser())` en `app.ts` | Express 5 ya tiene `req.cookies` nativo. Se borró la dep y el middleware. |
| `randomUUID()` fallback | Hand-rolled en `bar-sessions.service.ts` con regex | `crypto.randomUUID()` — soportado en todos los browsers target (Chrome/Edge/Safari modernos) |
| `sleep()` | Función wrapper de 3 líneas en `verify-sync.ts` | `await new Promise(r => setTimeout(r, delayMs))` inline |

### Tipos simplificados (yagni)

| Tipo | Antes | Después |
|---|---|---|
| `Theme` | `"bosko"` (single-element union, tautología) | `string` |
| `CustomTheme` | Redefinido idénticamente en `config.repository.ts` | Importa de `@cocktrail/shared` |
| `packages/shared/package.json` | `main` + `types` + `exports` (3 campos, mismo path) | Solo `exports` |
| `packages/shared/tsconfig.json` | `declaration: true` + `outDir: ./dist` (nunca se buildea) | Removidos |

---

## Verificación

- `pnpm --filter cocktrail-api exec tsc --noEmit` → limpio
- `pnpm --filter cocktrail-app exec tsc --noEmit` → limpio
- `pnpm --filter cocktrail-api test:unit` → 33 files, 459 tests pass
- `pnpm --filter cocktrail-app test` → 60 files, 396 tests pass (6 skipped)

---

## Neto

**~38 archivos eliminados, ~1 dependencia removida (`cookie-parser`), ~4700 líneas de código/docs/config menos, ~61MB de tooling huérfano recuperado.**
