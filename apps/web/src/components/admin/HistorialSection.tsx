"use client";

import { useMemo, useState } from "react";
import {
  History,
  TrendingUp,
  CalendarDays,
  Download,
} from "lucide-react";

import MetricCard from "@/components/shared/MetricCard";
import NightRecords from "@/components/analytics/NightRecords";
import NightComparator from "@/components/analytics/NightComparator";
import Toast from "@/components/shared/Toast";

import { groupNightsByDay } from "@/lib/analytics";
import { exportHistorialPdf } from "@/lib/pdfExport";
import { useTheme } from "@/components/ThemeProvider";
import { formatShortDate } from "@/lib/utils";

import type { AdminAnalytics } from "@/hooks/useAdminAnalytics";
import type { UnifiedNightDay } from "@/lib/analytics";
import type { EventSummary } from "@cocktrail/shared";

type Props = {
  analytics: AdminAnalytics;
  historyEvents: EventSummary[];
  historyLoaded: boolean;
  isTabTransitioning: boolean;
  isBosko: boolean;
  // Puente Historial → Logs: AdminClient decide qué hacer con el timestamp
  // (setea filtros/activeTab de la vista Logs, que sigue inline). Esta
  // sección no conoce nada de LogsSection, solo invoca el callback.
  onRedirectToLogs: (ts: number) => void;
};

const cardShell =
  "bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-card";

// "Esta Semana" (semana calendario, lun-dom) y "Este Mes" (desde el día 1)
// son ventanas distintas que pueden solaparse solo parcialmente — al
// arrancar un mes, "esta semana" puede incluir días del mes anterior que
// "este mes" no cuenta. Mostrar el rango de fechas de cada card evita que
// esa diferencia se lea como una cuenta mal hecha.
function formatDateRange(start: number, end: number): string {
  return `${formatShortDate(start)}–${formatShortDate(end)}`;
}

/**
 * Vista "Historial de Noches" del panel admin. `historyEvents`/
 * `historyLoaded` viven en el shell (AdminClient) porque useAdminAnalytics
 * y DashboardSection también dependen de esos datos.
 * Simplificada (ver docs/specs/features/simplificar-historial-noches.md): la tabla
 * "Detalle por Noche" (filtro por mes, sort, paginación, popup) se
 * eliminó — `NightComparator` la reemplaza con un selector único de
 * detalle/comparación sobre `unifiedHistoryDays`.
 */
export default function HistorialSection({
  analytics,
  historyEvents,
  historyLoaded,
  isTabTransitioning,
  isBosko,
  onRedirectToLogs,
}: Props) {
  const { weeklyDelta, monthlyDelta, allTotal, nightRecords } = analytics;
  const { logoUrl, useLogoUrl, textLogoValue } = useTheme();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // `Date.now()` es impuro: se fija una sola vez al montar para calcular los
  // rangos de fecha de "Esta Semana"/"Este Mes" sin variar en renders
  // sucesivos (mismo patrón que ConfirmView en CloseNightModal.tsx).
  const [now] = useState(() => Date.now());
  const weekRange = formatDateRange(weeklyDelta.thisWeekStart, now);
  const monthRange = formatDateRange(monthlyDelta.thisMonthStart, now);

  const unifiedHistoryDays: UnifiedNightDay[] = useMemo(
    () => groupNightsByDay(historyEvents),
    [historyEvents],
  );

  return (
    <div className="space-y-8 w-full">
      {!historyLoaded || isTabTransitioning ? (
        <div className="space-y-6 animate-dashboard-in">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div className="space-y-2">
              <div className="h-8 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg w-52 animate-pulse" />
              <div className="h-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg w-72 animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-[var(--accent-primary)]/30 rounded-2xl p-5 animate-pulse h-[125px]" />
            {[1, 2].map((i) => (
              <div key={i} className={`${cardShell} p-5 animate-pulse h-[125px]`} />
            ))}
          </div>
          <div className={`${cardShell} p-5 animate-pulse h-[100px]`} />
          <div className={`${cardShell} p-5 animate-pulse h-[250px]`} />
        </div>
      ) : (
        <div key="historial" className="flex flex-col gap-8">
          <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
            <div>
              <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight select-none">
                Historial de Noches
              </h1>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1.5">
                Cada noche cerrada se archiva acá con sus totales, pedidos y ventas
              </p>
            </div>
            {historyEvents.length > 0 && (
              <button
                type="button"
                disabled={isExporting}
                onClick={async () => {
                  setIsExporting(true);
                  try {
                    await exportHistorialPdf({ historyEvents, isBosko, logoUrl, useLogoUrl, textLogoValue });
                  } catch {
                    setExportError("No se pudo generar el PDF. Intentá de nuevo.");
                  } finally {
                    setIsExporting(false);
                  }
                }}
                className="h-10 px-4 rounded-full bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-app)] text-[13px] font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-[0.98] shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={14} strokeWidth={1.8} />
                <span>{isExporting ? "Generando…" : "Exportar PDF"}</span>
              </button>
            )}
          </div>

          {exportError && (
            <Toast variant="error" message={exportError} onClose={() => setExportError(null)} />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <MetricCard
              label="Esta Semana"
              value={weeklyDelta.thisWeek}
              isCurrency
              delta={weeklyDelta.delta}
              icon={CalendarDays}
              subtitle={weekRange}
              featured
            />
            <MetricCard
              label="Este Mes"
              value={monthlyDelta.thisMonth}
              isCurrency
              delta={monthlyDelta.delta}
              icon={TrendingUp}
              subtitle={monthRange}
            />
            <MetricCard
              label="Total Archivado"
              value={allTotal}
              isCurrency
              delta={{ label: `${historyEvents.length} noches`, direction: "up", value: 0, pct: 0 }}
              icon={History}
              subtitle="acumulado"
            />
          </div>

          <NightRecords records={nightRecords} isBosko={isBosko} />

          <div className="w-full">
            <NightComparator
              nights={unifiedHistoryDays}
              isBosko={isBosko}
              onRedirectToLogs={onRedirectToLogs}
            />
          </div>
        </div>
      )}
    </div>
  );
}
