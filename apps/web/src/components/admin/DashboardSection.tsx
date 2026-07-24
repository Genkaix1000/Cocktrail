"use client";

import {
  TrendingUp,
  Wine,
  Tag,
  Activity,
  CalendarDays,
} from "lucide-react";

import PaymentDonut from "@/components/analytics/PaymentDonut";
import MetricCard from "@/components/shared/MetricCard";

import { formatNightDateLong } from "@/lib/analytics";
import type { AdminAnalytics } from "@/hooks/useAdminAnalytics";
import type { DeltaInfo, HourlySlot, ProductRevenue } from "@/lib/analytics";
import type { LucideIcon } from "lucide-react";

import type { EventSummary, EventTotals } from "@cocktrail/shared";

type PaymentBreakdownEntry = {
  method: string;
  label: string;
  total: number;
  count: number;
  pct: number;
  color: string;
};

type Props = {
  analytics: AdminAnalytics;
  totals: EventTotals;
  historyEvents: EventSummary[];
  customPaymentBreakdown: PaymentBreakdownEntry[];
  isFirstLoad: boolean;
  isTabTransitioning: boolean;
  activeTab: string;
  isNightOpen: boolean;
};

const cardShell =
  "bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-card";

/**
 * Vista "Dashboard/Monitoreo" del panel admin — fusiona lo que antes eran
 * "Monitoreo" + "Estadísticas" en una sola vista de resumen (ver
 * docs/specs/features/simplificar-dashboard-admin.md). Los valores derivados
 * (productRevenue, hourlyData, peakHour, etc.) salen de useAdminAnalytics.
 */
export default function DashboardSection({
  analytics,
  totals,
  historyEvents,
  customPaymentBreakdown,
  isFirstLoad,
  isTabTransitioning,
  activeTab,
  isNightOpen,
}: Props) {
  const {
    startedAtStr,
    deltaTotal,
    productRevenue,
    hourlyData,
    totalOps,
    totalDrinkUnits,
    deltaTickets,
    deltaUnits,
    peakHour,
  } = analytics;

  const lastNightName = historyEvents.length > 0 ? "Última Noche" : "Noche Anterior";
  const lastNightLabel = historyEvents.length > 0
    ? `Noche del ${formatNightDateLong(historyEvents[0]!.closedAt ?? historyEvents[0]!.startedAt)}`
    : "Sin noches registradas";

  const peakSales = Math.max(0, ...hourlyData.map((s) => s.totalSales));

  return (
    <>
      <style>{`
        @keyframes dashboardFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-dashboard-in {
          animation: dashboardFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes growBar {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        .animate-grow-bar {
          transform-origin: bottom;
          animation: growBar 0.75s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {isFirstLoad || isTabTransitioning ? (
        <div className="space-y-6 animate-dashboard-in">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
            <div className="space-y-2">
              <div className="h-8 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg w-52 animate-pulse" />
              <div className="h-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg w-72 animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-[var(--accent-primary)]/30 rounded-2xl p-5 animate-pulse h-[125px]" />
            <div className={`${cardShell} p-5 animate-pulse h-[125px]`} />
            <div className={`${cardShell} p-5 animate-pulse h-[125px]`} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className={`${cardShell} p-5 animate-pulse h-[380px]`} />
            <div className={`${cardShell} p-5 animate-pulse h-[380px]`} />
            <div className={`${cardShell} p-5 animate-pulse h-[380px]`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className={`${cardShell} p-5 animate-pulse h-[180px]`} />
            <div className={`${cardShell} p-5 animate-pulse h-[180px]`} />
          </div>
        </div>
      ) : (
        <div key={activeTab} className="flex flex-col gap-8">
          <div className="flex flex-col md:flex-row justify-between md:items-end gap-3">
            <div>
              <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight select-none">
                Dashboard General
              </h1>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1.5">
                {isNightOpen ? "Resumen en tiempo real de tu negocio" : "Resumen de la última noche registrada"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)] font-medium">
              <CalendarDays size={14} className="text-[var(--text-tertiary)]" />
              <span>Hoy, {new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long" })}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <MetricCard
              label="Ventas Totales"
              value={totals.total}
              isCurrency
              delta={isNightOpen ? deltaTotal : undefined}
              icon={TrendingUp}
              featured
              subtitle={`vs. ${lastNightName}`}
              noDeltaLabel={lastNightLabel}
            />
            <MetricCard
              label="Tickets Totales"
              value={totalOps}
              delta={isNightOpen ? deltaTickets : undefined}
              icon={Tag}
              subtitle={`vs. ${lastNightName}`}
              noDeltaLabel={lastNightLabel}
            />
            <MetricCard
              label="Unidades Vendidas"
              value={totalDrinkUnits}
              delta={isNightOpen ? deltaUnits : undefined}
              icon={Wine}
              subtitle={`vs. ${lastNightName}`}
              noDeltaLabel={lastNightLabel}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <HourlySalesChart slots={hourlyData} />

            <TopProductsList products={productRevenue} />

            <PaymentDonut breakdown={customPaymentBreakdown} total={totals.total} />
          </div>

          <div className={`grid grid-cols-1 gap-5 ${isNightOpen ? "md:grid-cols-2" : ""}`}>
            {isNightOpen && (
              <div className={`${cardShell} p-5 flex flex-col justify-between`}>
                <div className="flex justify-between items-center shrink-0 mb-1">
                  <h3 className="text-[15px] font-semibold text-[var(--text-primary)] select-none">
                    Comparativa
                  </h3>
                  <span className="text-[11px] font-medium text-[var(--text-tertiary)] px-2.5 py-1 rounded-full bg-[var(--bg-panel)]">
                    vs. {lastNightName}
                  </span>
                </div>

                <div className="flex flex-col justify-between flex-1 mt-3">
                  <ComparisonRow
                    label="Ventas"
                    icon={TrendingUp}
                    currentVal={totals.total}
                    delta={deltaTotal}
                    isCurrency
                  />
                  <ComparisonRow
                    label="Tickets"
                    icon={Tag}
                    currentVal={totalOps}
                    delta={deltaTickets}
                  />
                  <ComparisonRow
                    label="Unidades"
                    icon={Wine}
                    currentVal={totalDrinkUnits}
                    delta={deltaUnits}
                  />
                </div>
              </div>
            )}

            <div
              className={`rounded-2xl p-5 flex flex-col gap-3 justify-center min-h-[140px] shadow-card border border-transparent ${
                isNightOpen
                  ? "bg-[var(--accent-primary)] dark:bg-[var(--accent-featured)] text-[var(--text-on-accent)]"
                  : `${cardShell} text-[var(--text-primary)]`
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] font-medium uppercase tracking-[0.14em] flex items-center gap-2 ${
                    isNightOpen ? "text-white/70" : "text-[var(--text-tertiary)]"
                  }`}
                >
                  <Activity size={12} /> Hora Pico de Ventas
                </span>
                {isNightOpen && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/15 text-white">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    En vivo
                  </span>
                )}
              </div>
              <span
                className={`font-mono text-[32px] md:text-[36px] font-bold leading-none tracking-tight ${
                  isNightOpen ? "text-[var(--text-on-accent)]" : "text-[var(--accent-primary)]"
                }`}
              >
                {peakHour}
              </span>
              <span className={`text-[12px] ${isNightOpen ? "text-white/55" : "text-[var(--text-secondary)]"}`}>
                Mayor recaudación bruta de la noche
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center text-[10px] text-[var(--text-tertiary)] pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-4">
              {isNightOpen ? (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--success-base)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--success-base)_25%,transparent)] animate-pulse" />
                    Monitoreo Activo
                  </span>
                  <span>Iniciado a las {startedAtStr} hs</span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--border-strong)]" />
                    Última Noche Registrada
                  </span>
                  <span>Iniciada a las {startedAtStr} hs</span>
                </>
              )}
            </div>
            <span className="hidden md:inline">
              Los datos se actualizan automáticamente en tiempo real (SSE) con respaldo de 30 segundos
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function fmtMoneyCompact(v: number): string {
  if (v >= 100_000) return `$${Math.round(v / 1000)}k`;
  if (v >= 10_000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${v.toLocaleString("es-AR")}`;
}

function activeHourlyWindow(slots: HourlySlot[]): HourlySlot[] {
  const firstIdx = slots.findIndex((s) => s.totalSales > 0);
  if (firstIdx === -1) return slots.slice(-6);
  let lastIdx = slots.length - 1;
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i]!.totalSales > 0) {
      lastIdx = i;
      break;
    }
  }
  return slots.slice(firstIdx, lastIdx + 1);
}

function niceAxisMax(peak: number): number {
  const rawStep = peak / 2;
  let step = 5_000;
  if (rawStep > 100_000) step = 100_000;
  else if (rawStep > 50_000) step = 50_000;
  else if (rawStep > 25_000) step = 25_000;
  else if (rawStep > 10_000) step = 10_000;
  else if (rawStep > 5_000) step = 5_000;
  return Math.max(10_000, Math.ceil((peak || 10_000) / step) * step);
}

function HourlySalesChart({ slots }: { slots: HourlySlot[] }) {
  const activeSlots = activeHourlyWindow(slots);
  const peakSales = Math.max(0, ...activeSlots.map((s) => s.totalSales));
  const niceMax = niceAxisMax(peakSales);
  const peakIndex = activeSlots.findIndex(
    (s) => peakSales > 0 && s.totalSales === peakSales,
  );
  const dense = activeSlots.length > 8;
  const yTop = fmtMoneyCompact(niceMax);
  const yMid = fmtMoneyCompact(Math.round(niceMax / 2));

  return (
    <div className={`${cardShell} p-5 flex flex-col h-[380px]`}>
      <div className="flex items-baseline justify-between gap-3 shrink-0 mb-4 select-none">
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
          Ventas por Hora
        </h3>
        {peakIndex >= 0 && (
          <span className="text-[11px] font-medium text-[var(--text-tertiary)] truncate">
            Pico{" "}
            <span className="text-[var(--accent-text)] font-semibold">
              {activeSlots[peakIndex]!.hour}h
            </span>
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 flex gap-3">
          <div className="w-11 shrink-0 flex flex-col justify-between text-right select-none pt-1">
            <span className="text-[10px] font-mono tabular text-[var(--text-tertiary)] leading-none">
              {yTop}
            </span>
            <span className="text-[10px] font-mono tabular text-[var(--text-tertiary)] leading-none">
              {yMid}
            </span>
            <span className="text-[10px] font-mono tabular text-[var(--text-tertiary)] leading-none">
              $0
            </span>
          </div>

          <div className="relative flex-1 min-w-0 flex items-end gap-[6px] pt-7">
            <div className="absolute inset-0 pt-7 flex flex-col justify-between pointer-events-none">
              <div className="border-t border-dashed border-[var(--border-subtle)]" />
              <div className="border-t border-dashed border-[var(--border-subtle)]" />
              <div className="border-t border-[var(--border-subtle)]" />
            </div>

            {activeSlots.map((slot, idx) => {
              const isPeak = idx === peakIndex;
              const heightPct = peakSales > 0 ? (slot.totalSales / niceMax) * 100 : 0;

              return (
                <div
                  key={`${slot.label}-${idx}`}
                  className="relative z-10 flex-1 min-w-0 max-w-[52px] h-full flex items-end group"
                  title={
                    slot.totalSales > 0
                      ? `${slot.hour}h · $${slot.totalSales.toLocaleString("es-AR")}`
                      : `${slot.hour}h · sin ventas`
                  }
                >
                  {isPeak && (
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-20 px-2 py-0.5 rounded-full whitespace-nowrap text-[10px] font-semibold font-mono tabular bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-card">
                      {fmtMoneyCompact(slot.totalSales)}
                    </span>
                  )}
                  {!isPeak && slot.totalSales > 0 && (
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-20 px-1.5 py-0.5 rounded-md whitespace-nowrap text-[9px] font-mono tabular text-[var(--text-secondary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-card">
                      {fmtMoneyCompact(slot.totalSales)}
                    </span>
                  )}
                  <div
                    className={`w-full rounded-t-xl animate-grow-bar ${
                      isPeak ? "bg-[var(--accent-primary)]" : "bosko-stripe"
                    }`}
                    style={{
                      height: `${slot.totalSales > 0 ? Math.max(8, heightPct) : 4}%`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 shrink-0 mt-2">
          <div className="w-11 shrink-0" aria-hidden />
          <div className="flex-1 min-w-0 flex gap-[6px]">
            {activeSlots.map((slot, idx) => {
              const isPeak = idx === peakIndex;
              const showXLabel =
                !dense ||
                idx === 0 ||
                idx === activeSlots.length - 1 ||
                isPeak ||
                idx % 2 === 0;
              return (
                <div
                  key={`x-${slot.label}-${idx}`}
                  className="flex-1 min-w-0 max-w-[52px] text-center"
                >
                  <span
                    className={`text-[10px] font-medium leading-none select-none ${
                      isPeak
                        ? "text-[var(--accent-text)] font-semibold"
                        : "text-[var(--text-tertiary)]"
                    } ${showXLabel ? "opacity-100" : "opacity-0"}`}
                  >
                    {slot.hour}h
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TopProductsList({ products }: { products: ProductRevenue[] }) {
  return (
    <div className={`${cardShell} p-5 flex flex-col min-w-0 h-[380px]`}>
      <h3 className="text-[15px] font-semibold text-[var(--text-primary)] select-none shrink-0 mb-4">
        Productos Más Vendidos
      </h3>

      {products.length === 0 ? (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-panel)] p-6 text-center text-[13px] text-[var(--text-tertiary)]">
          Aún no hay ventas esta noche
        </div>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto no-scrollbar flex-1">
          {products.slice(0, 5).map((d) => (
            <div
              key={d.drinkId}
              className="flex items-center gap-3 py-2.5 px-1 rounded-xl hover:bg-[var(--bg-panel)] transition-colors"
            >
              <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-[var(--accent-surface)] text-[var(--accent-text)]">
                <Wine size={16} strokeWidth={1.8} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate leading-tight">
                  {d.name}
                </p>
                <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                  {d.qty} {d.qty === 1 ? "unidad" : "unidades"}
                </p>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full text-[12px] font-semibold font-mono tabular bg-[var(--bg-panel)] text-[var(--text-primary)] border border-[var(--border-subtle)]">
                ${d.subtotal.toLocaleString("es-AR")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ComparisonRow({
  label,
  icon: Icon,
  currentVal,
  delta,
  isCurrency,
}: {
  label: string;
  icon: LucideIcon;
  currentVal: number;
  delta: DeltaInfo | null;
  isCurrency?: boolean;
}) {
  const deltaPct = delta?.pct ?? 0;
  const isUp = deltaPct >= 0;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--border-subtle)] last:border-b-0 min-h-11">
      <div className="flex items-center gap-2 text-[var(--text-secondary)] text-xs min-w-[110px]">
        <Icon size={13} className="text-[var(--text-tertiary)]" />
        <span>{label}</span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="font-mono text-[var(--text-primary)] text-xs font-bold tabular">
          {isCurrency && "$"}
          {currentVal.toLocaleString("es-AR")}
        </span>
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            isUp
              ? "bg-[var(--success-soft)] text-[var(--success-base)]"
              : "bg-[var(--danger-soft)] text-[var(--danger-base)]"
          }`}
        >
          {isUp ? "↑" : "↓"} {Math.abs(deltaPct).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}
