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

import { exportHistoryCSV, downloadCSV } from "@/lib/analytics";

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

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatShortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

// "Esta Semana" (semana calendario, lun-dom) y "Este Mes" (desde el día 1)
// son ventanas distintas que pueden solaparse solo parcialmente — al
// arrancar un mes, "esta semana" puede incluir días del mes anterior que
// "este mes" no cuenta. Mostrar el rango de fechas de cada card evita que
// esa diferencia se lea como una cuenta mal hecha.
function formatDateRange(start: number, end: number): string {
  return `${formatShortDate(start)}–${formatShortDate(end)}`;
}
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/**
 * Vista "Historial de Noches" del panel admin. `historyEvents`/
 * `historyLoaded` viven en el shell (AdminClient) porque useAdminAnalytics
 * y DashboardSection también dependen de esos datos.
 * Simplificada (ver docs/specs/simplificar-historial-noches.md): la tabla
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

  // `Date.now()` es impuro: se fija una sola vez al montar para calcular los
  // rangos de fecha de "Esta Semana"/"Este Mes" sin variar en renders
  // sucesivos (mismo patrón que ConfirmView en CloseNightModal.tsx).
  const [now] = useState(() => Date.now());
  const weekRange = formatDateRange(weeklyDelta.thisWeekStart, now);
  const monthRange = formatDateRange(monthlyDelta.thisMonthStart, now);

  // Memoized unified days
  const unifiedHistoryDays: UnifiedNightDay[] = useMemo(() => {
    const groups: { [dateKey: string]: EventSummary[] } = {};
    for (const e of historyEvents) {
      const closedAt = e.closedAt ?? e.startedAt;
      const dateKey = new Date(closedAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(e);
    }

    return Object.entries(groups).map(([dateKey, sessions]) => {
      const latestClosedAt = Math.max(...sessions.map(s => s.closedAt ?? s.startedAt));
      const earliestStartedAt = Math.min(...sessions.map(s => s.startedAt));

      const webTotal = sessions.reduce((sum, s) => sum + s.totals.webTotal, 0);
      const webCount = sessions.reduce((sum, s) => sum + s.totals.webCount, 0);
      const efectivoTotal = sessions.reduce((sum, s) => sum + s.totals.efectivoTotal, 0);
      const efectivoCount = sessions.reduce((sum, s) => sum + s.totals.efectivoCount, 0);
      const qrTotal = sessions.reduce((sum, s) => sum + (s.totals.qrTotal || 0), 0);
      const qrCount = sessions.reduce((sum, s) => sum + (s.totals.qrCount || 0), 0);
      const debitoTotal = sessions.reduce((sum, s) => sum + (s.totals.debitoTotal || 0), 0);
      const debitoCount = sessions.reduce((sum, s) => sum + (s.totals.debitoCount || 0), 0);
      const total = sessions.reduce((sum, s) => sum + s.totals.total, 0);
      const orderCounter = sessions.reduce((sum, s) => sum + s.orderCounter, 0);

      const drinksMap: { [drinkId: number]: { drinkId: number; name: string; qty: number; subtotal: number } } = {};
      for (const s of sessions) {
        for (const d of s.totals.drinksSold) {
          if (!drinksMap[d.drinkId]) {
            drinksMap[d.drinkId] = { drinkId: d.drinkId, name: d.name, qty: 0, subtotal: 0 };
          }
          drinksMap[d.drinkId].qty += d.qty;
          drinksMap[d.drinkId].subtotal += d.subtotal || 0;
        }
      }
      const drinksSold = Object.values(drinksMap).sort((a, b) => b.qty - a.qty);

      const d = new Date(latestClosedAt);
      const monthLabel = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;

      return {
        dateKey,
        monthLabel,
        startedAt: earliestStartedAt,
        closedAt: latestClosedAt,
        sessions,
        totals: {
          total,
          webTotal,
          webCount,
          efectivoTotal,
          efectivoCount,
          qrTotal,
          qrCount,
          debitoTotal,
          debitoCount,
          drinksSold,
        },
        orderCounter,
      };
    });
  }, [historyEvents]);

  return (
    <div className="space-y-6 w-full">
      {!historyLoaded || isTabTransitioning ? (
        <div className="space-y-6 animate-dashboard-in">
          {/* Title Skeleton */}
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-ink-800 pb-5">
            <div className="space-y-2">
              <div className="h-8 bg-ink-900 border border-ink-850 rounded-lg w-52 animate-pulse" />
              <div className="h-4 bg-ink-900 border border-ink-850 rounded-lg w-72 animate-pulse" />
            </div>
          </div>

          {/* Cards Skeleton (3 Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-ink-900 border border-ink-800/80 rounded-2xl p-5 animate-pulse h-[125px] flex flex-col justify-between">
                <div className="h-3.5 bg-ink-850 rounded w-1/2" />
                <div className="h-8 bg-ink-850 rounded w-3/4" />
              </div>
            ))}
          </div>

          {/* Trago Estrella Skeleton */}
          <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 animate-pulse h-[100px] mt-4" />

          {/* Comparator Skeleton */}
          <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 animate-pulse h-[250px] mt-4" />
        </div>
      ) : (
        <div key="historial" className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-ink-800 pb-5">
            <div>
              <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
                  <History size={16} />
                </div>
                <span>Historial de Noches</span>
              </h1>
              <p className="text-[13px] text-ink-400 mt-1">
                Cada noche cerrada se archiva acá con sus totales, pedidos y ventas en efectivo
              </p>
            </div>
            {historyEvents.length > 0 && (
              <button
                onClick={() => {
                  const csv = exportHistoryCSV(historyEvents);
                  downloadCSV(csv, "cocktrail_historial.csv");
                }}
                className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-300 hover:text-ink-50 px-2.5 py-1.5 rounded bg-ink-800 border border-ink-700 transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <Download size={12} />
                <span>Exportar CSV</span>
              </button>
            )}
          </div>

          {/* Grids / Aggregations (Boxed style with sparklines and respective icons) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard
              label="Esta Semana"
              value={weeklyDelta.thisWeek}
              isCurrency
              delta={weeklyDelta.delta}
              icon={CalendarDays}
              color="#10b981"
              sparklineData={historyEvents.slice(0, 5).reverse().map(e => e.totals.total)}
              subtitle={weekRange}
            />
            <MetricCard
              label="Este Mes"
              value={monthlyDelta.thisMonth}
              isCurrency
              delta={monthlyDelta.delta}
              icon={TrendingUp}
              color="#3b82f6"
              sparklineData={historyEvents.slice(0, 5).reverse().map(e => e.totals.total)}
              subtitle={monthRange}
            />
            <MetricCard
              label="Total Archivado"
              value={allTotal}
              isCurrency
              delta={{ label: `${historyEvents.length} noches`, direction: "up", value: 0, pct: 0 }}
              icon={History}
              color="#a855f7"
              sparklineData={historyEvents.slice().reverse().map(e => e.totals.total)}
              subtitle="acumulado"
            />
          </div>

          {/* Trago Estrella */}
          <NightRecords records={nightRecords} isBosko={isBosko} />

          {/* Selector único: elegir 1 noche = detalle, elegir 2da = comparación */}
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
