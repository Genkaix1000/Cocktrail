"use client";

import {
  LayoutDashboard,
  TrendingUp,
  Wine,
  Tag,
  Activity,
  CalendarDays,
  Download,
} from "lucide-react";

import PaymentDonut from "@/components/analytics/PaymentDonut";
import MetricCard from "@/components/shared/MetricCard";
import EmptyCard from "@/components/shared/EmptyCard";

import { exportHistoryCSV, downloadCSV } from "@/lib/analytics";
import type { AdminAnalytics } from "@/hooks/useAdminAnalytics";
import type { DeltaInfo, ProductRevenue } from "@/lib/analytics";
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
  // activeTab solo se usa como `key` para reiniciar la animación de entrada al
  // volver a esta vista — se pasa tal cual estaba en AdminClient.
  activeTab: string;
  isBosko: boolean;
  barColorClass: string;
};

/**
 * Vista "Dashboard/Monitoreo" del panel admin — fusiona lo que antes eran
 * "Monitoreo" + "Estadísticas" en una sola vista de resumen (ver
 * docs/specs/simplificar-dashboard-admin.md). Los valores derivados
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
  isBosko,
  barColorClass,
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

  return (
    <>
      <style>{`
        @keyframes dashboardFadeIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-dashboard-in {
          animation: dashboardFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes growBar {
          from {
            transform: scaleY(0);
          }
          to {
            transform: scaleY(1);
          }
        }
        .animate-grow-bar {
          transform-origin: bottom;
          animation: growBar 0.75s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {isFirstLoad || isTabTransitioning ? (
        <div className="space-y-6 animate-dashboard-in">
          {/* Title Skeleton */}
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-ink-800 pb-5">
            <div className="space-y-2">
              <div className="h-8 bg-ink-900 border border-ink-850 rounded-lg w-52 animate-pulse" />
              <div className="h-4 bg-ink-900 border border-ink-850 rounded-lg w-72 animate-pulse" />
            </div>
          </div>
          {/* Row 1 Skeletons (3 Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-ink-900 border border-ink-800/80 rounded-2xl p-5 animate-pulse h-[125px] flex flex-col justify-between">
              <div className="h-3.5 bg-ink-850 rounded w-1/2" />
              <div className="h-8 bg-ink-850 rounded w-3/4" />
            </div>
            <div className="bg-ink-900 border border-ink-800/80 rounded-2xl p-5 animate-pulse h-[125px] flex flex-col justify-between">
              <div className="h-3.5 bg-ink-850 rounded w-1/2" />
              <div className="h-8 bg-ink-850 rounded w-3/4" />
            </div>
            <div className="bg-ink-900 border border-ink-800/80 rounded-2xl p-5 animate-pulse h-[125px] flex flex-col justify-between">
              <div className="h-3.5 bg-ink-850 rounded w-1/2" />
              <div className="h-8 bg-ink-850 rounded w-3/4" />
            </div>
          </div>
          {/* Row 2 Skeletons (3 Middle Grids) */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 animate-pulse h-[380px]" />
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 animate-pulse h-[380px]" />
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 animate-pulse h-[380px]" />
          </div>
          {/* Row 3 Skeletons (2 Small Widgets) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 animate-pulse h-[300px]" />
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 animate-pulse h-[300px]" />
          </div>
        </div>
      ) : (
        <div key={activeTab} className="space-y-6">
          {/* Dashboard Header Title & Action Row */}
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-ink-800 pb-5">
            <div>
              <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
                  <LayoutDashboard size={16} />
                </div>
                <span>Dashboard General</span>
              </h1>
              <p className="text-[13px] text-ink-400 mt-1">Resumen en tiempo real de tu negocio</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Date picker mock selector */}
              <div className="flex items-center gap-2 bg-ink-900 border border-ink-800 px-3.5 py-2 rounded-xl text-xs text-ink-300 font-medium">
                <CalendarDays size={14} className="text-ink-400" />
                <span>Hoy, {new Date().toLocaleDateString("es-AR", { day: 'numeric', month: 'long' })}</span>
              </div>
              <button
                onClick={() => {
                  const csv = exportHistoryCSV(historyEvents);
                  downloadCSV(csv, "cocktrail_dashboard_export.csv");
                }}
                className="h-10 px-4 rounded-xl bg-ink-800 hover:bg-ink-750 text-ink-100 hover:text-ink-50 text-[11px] font-bold uppercase tracking-[0.08em] flex items-center gap-2 border border-ink-700 transition-all cursor-pointer select-none active:scale-[0.97]"
              >
                <Download size={14} />
                <span>Exportar</span>
              </button>
            </div>
          </div>

          {/* Row 1: 3 Metric Cards (número + delta, sin sparkline) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard
              label="Ventas Totales"
              value={totals.total}
              isCurrency
              delta={deltaTotal}
              icon={TrendingUp}
              color="#10b981"
            />
            <MetricCard
              label="Tickets Totales"
              value={totalOps}
              delta={deltaTickets}
              icon={Tag}
              color="#3b82f6"
            />
            <MetricCard
              label="Unidades Vendidas"
              value={totalDrinkUnits}
              delta={deltaUnits}
              icon={Wine}
              color="#f97316"
            />
          </div>

          {/* Row 2: Charts and Products (Height Unified to h-[380px]) */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* Ventas por Hora — solo pesos, sin toggle (ver docs/specs/simplificar-dashboard-admin.md) */}
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col justify-between h-[380px] shadow-lg">
              <h3 className="text-[12px] font-bold text-ink-100 uppercase tracking-widest flex items-center gap-2.5 select-none shrink-0">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
                  <Activity size={13} />
                </div>
                <span>Ventas por Hora</span>
              </h3>

              {/* Graph bars mapping */}
              <div className="relative h-[270px] flex items-end justify-between gap-1.5 pt-6 pb-2 px-1 border-b border-ink-800/80">
                {/* Grid lines de referencia (solo máximo y mitad, para no saturar) */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-[28px] pt-[20px]">
                  {[1, 0.5].map((ratio) => {
                    const maxVal = Math.max(...hourlyData.map((s) => s.totalSales), 1000) * 1.25;
                    const lineVal = Math.round(maxVal * ratio);
                    return (
                      <div key={ratio} className="w-full relative flex items-center">
                        <span className="absolute left-1 -top-2 text-[9px] font-mono font-bold text-ink-200 bg-ink-900 border border-ink-750 px-2 py-0.5 rounded shadow-md z-10 select-none">
                          ${lineVal.toLocaleString("es-AR")}
                        </span>
                        <div className="w-full border-t border-ink-800/25 border-dashed" />
                      </div>
                    );
                  })}
                </div>

                {hourlyData.map((slot) => {
                  const maxVal = Math.max(...hourlyData.map((s) => s.totalSales), 1000) * 1.25;
                  const heightPct = (slot.totalSales / maxVal) * 100;
                  return (
                    <div key={slot.label} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                      <div className="w-full relative h-[200px] flex items-end">
                        <div
                          className={`w-full rounded-t bg-gradient-to-t transition-all duration-300 group-hover:brightness-110 animate-grow-bar ${barColorClass}`}
                          style={{ height: `${Math.max(4, heightPct)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono font-bold text-ink-300 mt-2 truncate">
                        {slot.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Productos Más Vendidos */}
            <TopProductsList products={productRevenue} />

            {/* Métodos de Pago */}
            <PaymentDonut breakdown={customPaymentBreakdown} total={totals.total} isBosko={isBosko} />
          </div>

          {/* Row 3: Comparativa (sin sparklines) & Hora Pico */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Comparativa */}
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
              <div className="flex justify-between items-center shrink-0 mb-1">
                <h3 className="text-[12px] font-bold text-ink-100 uppercase tracking-widest flex items-center gap-2.5 select-none">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
                    <TrendingUp size={13} />
                  </div>
                  <span>Comparativa</span>
                </h3>
                <span className="text-[10px] font-mono text-ink-400 px-2 py-0.5 bg-ink-800 rounded border border-ink-750">
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

            {/* Hora Pico */}
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col gap-2 justify-center">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-400 flex items-center gap-2">
                <Activity size={12} /> Hora Pico de Ventas
              </span>
              <span className="font-mono text-[26px] font-bold leading-none text-accent">
                {peakHour}
              </span>
              <span className="text-[10px] text-ink-400">Franja con mayor recaudación bruta</span>
            </div>
          </div>

          {/* Bottom footer status */}
          <div className="flex justify-between items-center text-[10px] text-ink-500 pt-2 border-t border-ink-850">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green shadow-[0_0_0_3px_rgba(74,222,128,0.2)] animate-pulse" />
                Monitoreo Activo
              </span>
              <span>Iniciado a las {startedAtStr} hs</span>
            </div>
            <span>Los datos se actualizan automáticamente en tiempo real (SSE) con respaldo de 30 segundos</span>
          </div>
        </div>
      )}
    </>
  );
}

function TopProductsList({ products }: { products: ProductRevenue[] }) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col justify-between min-w-0 h-[380px] shadow-lg">
      <div className="flex justify-between items-center">
        <h3 className="text-[12px] font-bold text-ink-100 uppercase tracking-widest flex items-center gap-2.5 select-none">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
            <Wine size={13} />
          </div>
          <span>Productos Más Vendidos</span>
        </h3>
        <span className="text-[10px] text-accent font-bold hover:underline cursor-pointer">Ver todos</span>
      </div>

      {products.length === 0 ? (
        <EmptyCard text="Aún no hay ventas esta noche" />
      ) : (
        <div className="flex flex-col gap-3 overflow-y-auto no-scrollbar flex-1">
          {products.slice(0, 5).map((d, i) => (
            <div key={d.drinkId} className="flex items-center justify-between py-1.5 border-b border-ink-850 last:border-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-6 h-6 rounded-lg font-mono text-[11px] font-bold flex items-center justify-center shrink-0 ${
                  i === 0 ? "bg-accent/20 text-accent border border-accent/30" : "bg-ink-800 text-ink-400"
                }`}>
                  {i + 1}
                </span>
                <span className="text-[14px] font-medium text-ink-50 truncate leading-tight">
                  {d.name}
                </span>
              </div>
              <div className="flex items-center gap-6 shrink-0 font-mono text-xs tabular">
                <span className="text-ink-400">{d.qty} vasos</span>
                <span className="text-ink-100 font-bold">${d.subtotal.toLocaleString("es-AR")}</span>
              </div>
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
  isCurrency
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
    <div className="flex items-center justify-between py-2 border-b border-ink-850 last:border-b-0 h-11">
      <div className="flex items-center gap-2 text-ink-300 text-xs min-w-[110px]">
        <Icon size={13} className="text-ink-400" />
        <span>{label}</span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="font-mono text-ink-100 text-xs font-bold tabular">
          {isCurrency && "$"}
          {currentVal.toLocaleString("es-AR")}
        </span>
        <span className={`font-bold font-mono text-[11px] tabular w-[45px] text-right ${isUp ? "text-green" : "text-danger"}`}>
          {isUp ? `+${deltaPct}%` : `${deltaPct}%`}
        </span>
      </div>
    </div>
  );
}
