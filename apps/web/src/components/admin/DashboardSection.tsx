"use client";

import {
  LayoutDashboard,
  TrendingUp,
  Wine,
  Tag,
  DollarSign,
  Activity,
  Bell,
  CalendarDays,
  Download,
  CheckCircle,
  Undo,
  Users,
  Palette,
} from "lucide-react";

import PaymentDonut from "@/components/analytics/PaymentDonut";
import Sparkline from "@/components/shared/Sparkline";
import MetricCard from "@/components/shared/MetricCard";
import EmptyCard from "@/components/shared/EmptyCard";

import { exportHistoryCSV, downloadCSV } from "@/lib/analytics";
import type { AdminAnalytics } from "@/hooks/useAdminAnalytics";

import type {
  CashSale,
  EventSummary,
  EventTotals,
  NightEvent,
  Order,
} from "@cocktrail/shared";

export type AuditLogEntry = {
  id: string;
  action: string;
  description: string;
  operator: string;
  created_at: string;
};

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
  event: NightEvent | null;
  orders: Order[];
  cashSales: CashSale[];
  totals: EventTotals;
  historyEvents: EventSummary[];
  systemLogs: AuditLogEntry[];
  customPaymentBreakdown: PaymentBreakdownEntry[];
  isFirstLoad: boolean;
  isTabTransitioning: boolean;
  // activeTab solo se usa como `key` para reiniciar la animación de entrada al
  // volver a esta vista — se pasa tal cual estaba en AdminClient.
  activeTab: string;
  chartMetric: "sales" | "glasses";
  setChartMetric: (metric: "sales" | "glasses") => void;
  isBosko: boolean;
  barColorClass: string;
};

/**
 * Vista "Dashboard/Monitoreo" del panel admin — extraída de AdminClient.tsx
 * sin cambios de comportamiento. Los valores derivados (productRevenue,
 * avgTicket, hourlyData, etc.) salen de useAdminAnalytics, el mismo hook que
 * usa la vista Estadísticas.
 */
export default function DashboardSection({
  analytics,
  event,
  orders,
  cashSales,
  totals,
  historyEvents,
  systemLogs,
  customPaymentBreakdown,
  isFirstLoad,
  isTabTransitioning,
  activeTab,
  chartMetric,
  setChartMetric,
  isBosko,
  barColorClass,
}: Props) {
  const {
    avgTicket,
    startedAtStr,
    deltaTotal,
    productRevenue,
    hourlyData,
    peakHour,
    totalOps,
    totalDrinkUnits,
    deltaTickets,
    deltaAvgTicket,
    deltaUnits,
  } = analytics;

  // 1. Dynamic Alerts calculation based on active event stats
  const dynamicAlerts = (() => {
    const list: { id: string; text: string; time: string; color: string; dotColor: string }[] = [];
    if (productRevenue.length > 0) {
      const topProd = productRevenue[0];
      if (topProd.qty >= 2) {
        list.push({
          id: "demand-1",
          text: `Alta demanda: ${topProd.name} lidera la carta con ${topProd.qty} unidades vendidas`,
          time: "En vivo",
          color: "bg-blue-soft/10 border-blue-soft/20 text-blue",
          dotColor: "bg-blue"
        });
      }
    }
    if (avgTicket > 8000) {
      list.push({
        id: "ticket-high",
        text: `Ticket Elevado: Promedio de consumo actual supera los $${avgTicket.toLocaleString("es-AR")}`,
        time: "Hace unos minutos",
        color: "bg-amber-soft/10 border-amber-soft/20 text-amber",
        dotColor: "bg-amber"
      });
    }
    if (peakHour && peakHour !== "—") {
      list.push({
        id: "peak-1",
        text: `Pico registrado: Franja de mayor flujo en transacciones a las ${peakHour}`,
        time: "Actualizado",
        color: "bg-purple-soft/10 border-purple-soft/20 text-purple",
        dotColor: "bg-purple"
      });
    }
    if (list.length === 0) {
      list.push({
        id: "status-ok",
        text: "Operación estable: Ritmo de preparación y pedidos normal en todas las terminales",
        time: "En vivo",
        color: "bg-green-soft/10 border-green-soft/20 text-green",
        dotColor: "bg-green"
      });
    }
    return list;
  })();

  // 2. Comparison sparklines history from previous nights
  function buildComparativeSparkline(
    extract: (e: EventSummary) => number,
    fallback: number,
    fallbackRatio = 0.9,
  ): number[] {
    const hist = historyEvents.slice(0, 5).reverse().map(extract);
    return hist.length > 1 ? hist : [fallback * fallbackRatio, fallback];
  }

  const compSalesSparkline = buildComparativeSparkline((e) => e.totals.total, totals.total, 0.85);
  const compTicketsSparkline = buildComparativeSparkline(
    (e) => e.totals.efectivoCount + e.totals.qrCount + e.totals.debitoCount,
    totalOps,
  );
  const compAvgSparkline = buildComparativeSparkline((e) => {
    const ops = (e.totals.efectivoCount + e.totals.qrCount + e.totals.debitoCount) || 1;
    return Math.round(e.totals.total / ops);
  }, avgTicket);
  const compUnitsSparkline = buildComparativeSparkline(
    (e) => e.totals.drinksSold.reduce((s, d) => s + d.qty, 0),
    totalDrinkUnits,
  );

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
          {/* Row 1 Skeletons (4 Cards) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* Row 1: 4 Combined Metric Cards with Sparklines */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Ventas Totales"
              value={totals.total}
              isCurrency
              delta={deltaTotal}
              icon={TrendingUp}
              color="#10b981"
              sparklineData={hourlyData.map(s => s.totalSales)}
            />
            <MetricCard
              label="Tickets Totales"
              value={totalOps}
              delta={deltaTickets}
              icon={Tag}
              color="#3b82f6"
              sparklineData={hourlyData.map(s => s.totalCount)}
            />
            <MetricCard
              label="Ticket Promedio"
              value={avgTicket}
              isCurrency
              delta={deltaAvgTicket}
              icon={DollarSign}
              color="#a855f7"
              sparklineData={hourlyData.map(s => s.totalCount > 0 ? Math.round(s.totalSales / s.totalCount) : 0)}
            />
            <MetricCard
              label="Unidades Vendidas"
              value={totalDrinkUnits}
              delta={deltaUnits}
              icon={Wine}
              color="#f97316"
              sparklineData={hourlyData.map(s => Math.round(s.totalCount * 1.6))}
            />
          </div>

          {/* Row 2: Charts and Products (Height Unified to h-[380px]) */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* Ventas por Hora */}
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col justify-between h-[380px] shadow-lg">
              <div className="flex justify-between items-center shrink-0">
                <h3 className="text-[12px] font-bold text-ink-100 uppercase tracking-widest flex items-center gap-2.5 select-none">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
                    <Activity size={13} />
                  </div>
                  <span>Ventas por Hora</span>
                </h3>

                {/* Selector switcheable (Costo / Vaso) */}
                <div className="flex items-center gap-0.5 bg-ink-850 p-0.5 rounded-xl border border-ink-800 shrink-0">
                  <button
                    type="button"
                    onClick={() => setChartMetric("sales")}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all select-none cursor-pointer ${
                      chartMetric === "sales"
                        ? "bg-accent text-ink-950 shadow"
                        : "text-ink-400 hover:text-ink-200"
                    }`}
                    title="Ver costo en pesos ($)"
                  >
                    <DollarSign size={10} />
                    <span>Costo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMetric("glasses")}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all select-none cursor-pointer ${
                      chartMetric === "glasses"
                        ? "bg-accent text-ink-950 shadow"
                        : "text-ink-400 hover:text-ink-200"
                    }`}
                    title="Ver en vasos (uds)"
                  >
                    <Wine size={10} />
                    <span>Vasos</span>
                  </button>
                </div>
              </div>

              {/* Graph bars mapping */}
              <div className="relative h-[270px] flex items-end justify-between gap-1.5 pt-6 pb-2 px-1 border-b border-ink-800/80">
                {/* Grid lines in background with values (with 25% headroom to avoid overlaps) */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-[28px] pt-[20px]">
                  {[1, 0.75, 0.5, 0.25].map((ratio) => {
                    const maxVal = Math.max(
                      ...hourlyData.map((s) => (chartMetric === "sales" ? s.totalSales : s.totalGlasses)),
                      chartMetric === "sales" ? 1000 : 5
                    ) * 1.25;
                    const lineVal = Math.round(maxVal * ratio);
                    return (
                      <div key={ratio} className="w-full relative flex items-center">
                        <span className="absolute left-1 -top-2 text-[9px] font-mono font-bold text-ink-200 bg-ink-900 border border-ink-750 px-2 py-0.5 rounded shadow-md z-10 select-none">
                          {chartMetric === "sales" ? `$${lineVal.toLocaleString("es-AR")}` : `${lineVal} uds`}
                        </span>
                        <div className="w-full border-t border-ink-800/25 border-dashed" />
                      </div>
                    );
                  })}
                </div>

                {hourlyData.map((slot) => {
                  const slotVal = chartMetric === "sales" ? slot.totalSales : slot.totalGlasses;
                  const maxVal = Math.max(
                    ...hourlyData.map((s) => (chartMetric === "sales" ? s.totalSales : s.totalGlasses)),
                    chartMetric === "sales" ? 1000 : 5
                  ) * 1.25;
                  const heightPct = (slotVal / maxVal) * 100;
                  return (
                    <div key={slot.label} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                      <div className="w-full relative h-[200px] flex items-end">
                        <div
                          key={chartMetric + "-" + slot.label}
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
            <TopProductsList products={productRevenue} isBosko={isBosko} />

            {/* Métodos de Pago */}
            <PaymentDonut breakdown={customPaymentBreakdown} total={totals.total} isBosko={isBosko} />
          </div>

          {/* Row 3: Alerts & Comparison (Height Unified to h-[300px]) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Alertas y Notificaciones */}
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col justify-between h-[300px] shadow-lg">
              <h3 className="text-[12px] font-bold text-ink-100 uppercase tracking-widest flex items-center gap-2.5 shrink-0 select-none">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
                  <Bell size={13} />
                </div>
                <span>Alertas y Notificaciones</span>
              </h3>
              <div className="flex flex-col gap-3 overflow-y-auto no-scrollbar flex-1 my-3">
                {dynamicAlerts.map((alert) => (
                  <div key={alert.id} className={`flex items-start gap-3 p-2.5 rounded-xl border shrink-0 ${alert.color}`}>
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${alert.dotColor}`} />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold">{alert.text}</span>
                      <span className="text-[9px] font-mono opacity-80">{alert.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Comparativa */}
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col justify-between h-[300px] shadow-lg">
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
                  sparklineData={compSalesSparkline}
                  color="#10b981"
                  isCurrency
                />
                <ComparisonRow
                  label="Tickets"
                  icon={Tag}
                  currentVal={totalOps}
                  delta={deltaTickets}
                  sparklineData={compTicketsSparkline}
                  color="#3b82f6"
                />
                <ComparisonRow
                  label="Ticket Promedio"
                  icon={DollarSign}
                  currentVal={avgTicket}
                  delta={deltaAvgTicket}
                  sparklineData={compAvgSparkline}
                  color="#a855f7"
                  isCurrency
                />
                <ComparisonRow
                  label="Unidades"
                  icon={Wine}
                  currentVal={totalDrinkUnits}
                  delta={deltaUnits}
                  sparklineData={compUnitsSparkline}
                  color="#f97316"
                />
              </div>
            </div>
          </div>

          {/* Row 4: Recent activity (audit logs) full width */}
          <div className="w-full">
            {/* Actividad Reciente */}
            <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col gap-4 shadow-lg h-[340px]">
              <div className="flex justify-between items-center">
                <h3 className="text-[12px] font-bold text-ink-100 uppercase tracking-widest flex items-center gap-2.5 select-none">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
                    <Activity size={13} />
                  </div>
                  <span>Actividad Reciente</span>
                </h3>
                <span className="text-[10px] text-ink-400 font-medium">Historial de cambios en la app</span>
              </div>

              {systemLogs.length === 0 ? (
                <EmptyCard text="Sin actividad reciente registrada aún" />
              ) : (
                <div className="flex flex-col gap-2 overflow-y-auto no-scrollbar flex-1">
                  {systemLogs.map((log) => {
                    let colorClass = "bg-ink-800 text-ink-400";
                    let icon = <Activity size={12} />;
                    if (log.action.startsWith("order.created")) {
                      colorClass = "bg-green-soft/20 text-green border border-green/20";
                      icon = <CheckCircle size={12} />;
                    } else if (log.action.startsWith("order.cancelled")) {
                      colorClass = "bg-danger-soft/20 text-danger border border-danger/20";
                      icon = <Undo size={12} />;
                    } else if (log.action.startsWith("drink.")) {
                      colorClass = "bg-blue-soft/20 text-blue border border-blue/20";
                      icon = <Wine size={12} />;
                    } else if (log.action.startsWith("staff.")) {
                      colorClass = "bg-purple-soft/20 text-purple border border-purple/20";
                      icon = <Users size={12} />;
                    } else if (log.action.startsWith("config.")) {
                      colorClass = "bg-amber-soft/20 text-amber border border-amber/20";
                      icon = <Palette size={12} />;
                    } else if (log.action.startsWith("cash_sale.created")) {
                      colorClass = "bg-green-soft/20 text-green border border-green/20";
                      icon = <DollarSign size={12} />;
                    }

                    return (
                      <div key={log.id} className="flex items-center justify-between p-3 rounded-xl bg-ink-950/40 border border-ink-850 hover:border-ink-800 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                            {icon}
                          </div>
                          <div className="flex flex-col min-w-0 text-left">
                            <span className="text-xs text-ink-100 font-medium truncate">{log.description}</span>
                            <span className="text-[9px] text-ink-500 font-mono">Por: {log.operator}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-ink-400 font-mono shrink-0 pl-3">
                          {formatRelativeTime(log.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
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

function TopProductsList({ products, isBosko }: { products: any[]; isBosko: boolean }) {
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
                <span className="text-ink-400">{d.qty} uds.</span>
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
  sparklineData,
  color,
  isCurrency
}: {
  label: string;
  icon: any;
  currentVal: number;
  delta: any;
  sparklineData: number[];
  color: string;
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

      {/* Tiny Sparkline */}
      <div className="w-14 h-5 overflow-hidden select-none pointer-events-none shrink-0 mx-2">
        <Sparkline data={sparklineData.length > 0 ? sparklineData : [currentVal, currentVal]} color={color} />
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

function formatRelativeTime(ts: number | string): string {
  const ms = Date.now() - new Date(ts).getTime();
  const secs = Math.round(ms / 1000);
  if (secs < 60) return "Hace instantes";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days} d`;
}
