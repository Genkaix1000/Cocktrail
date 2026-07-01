"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";

import PaymentDonut from "@/components/analytics/PaymentDonut";
import RevenueByProduct from "@/components/analytics/RevenueByProduct";

import type { AdminAnalytics } from "@/hooks/useAdminAnalytics";
import type { EventTotals } from "@cocktrail/shared";

type Props = {
  analytics: AdminAnalytics;
  totals: EventTotals;
  isBosko: boolean;
  barColorClass: string;
};

/**
 * Vista "Estadísticas" del panel admin — extraída de AdminClient.tsx sin
 * cambios de comportamiento. Hoy es inalcanzable desde la UI (no hay botón
 * que setee activeTab === "estadisticas", solo se llega con ?tab=estadisticas
 * a mano); se extrae igual tal cual está, decisión de producto fuera de
 * alcance de esta auditoría. Los valores derivados salen de useAdminAnalytics,
 * el mismo hook que usa DashboardSection — se recibe por prop en vez de
 * volver a llamarlo.
 */
export default function EstadisticasSection({
  analytics,
  totals,
  isBosko,
  barColorClass,
}: Props) {
  const { hourlyData, maxHourSales, segmentedTicket, paymentBreakdown, peakHour, productRevenue } =
    analytics;

  const [activeHoverSlot, setActiveHoverSlot] = useState<number | null>(null);

  return (
    <div className="space-y-6 max-w-5xl">
      <section className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-ink-400 flex items-center gap-2">
          <TrendingUp size={12} /> Dashboard de Negocio
        </span>
        <h1 className="font-serif-italic text-[30px] leading-none text-ink-50">
          Métricas de Venta
        </h1>
        <p className="text-[12px] text-ink-400 mt-1">
          Revisión horaria del flujo de dinero y tickets registrados en el transcurso del evento.
        </p>
      </section>

      {/* Hourly sales bar chart */}
      <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 md:p-6 flex flex-col gap-6 relative min-w-0">
        <div className="flex justify-between items-center">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-[12px] font-bold text-ink-100 uppercase tracking-widest">
              Facturación por Hora
            </h3>
            <p className="text-[10px] text-ink-500">Volumen combinado de tickets en pesos ($)</p>
          </div>
          <div className="px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono border border-accent/20 text-accent bg-ink-800">
            EN VIVO
          </div>
        </div>

        {/* Graph bars mapping */}
        <div className="relative h-[280px] flex items-end justify-between gap-1.5 md:gap-3 pt-8 pb-2 px-1 border-b border-ink-800/80">

          {/* Grid lines in background */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-[28px] pt-[32px]">
            <div className="w-full border-t border-ink-800/30 border-dashed" />
            <div className="w-full border-t border-ink-800/30 border-dashed" />
            <div className="w-full border-t border-ink-800/30 border-dashed" />
          </div>

          {hourlyData.map((slot) => {
            const heightPct = (slot.totalSales / maxHourSales) * 100;
            const isHovered = activeHoverSlot === slot.hour;

            return (
              <div
                key={slot.label}
                className="flex-1 flex flex-col items-center group relative cursor-pointer"
                onMouseEnter={() => setActiveHoverSlot(slot.hour)}
                onMouseLeave={() => setActiveHoverSlot(null)}
              >
                {/* Custom Interactive Tooltip card */}
                {isHovered && (
                  <div className="absolute bottom-[105%] left-1/2 -translate-x-1/2 w-[210px] bg-ink-950 border border-white/10 rounded-xl p-3 shadow-2xl z-20 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                    <span className="text-[10px] font-bold text-ink-300 border-b border-white/5 pb-1">
                      Franja: {slot.label} a {String((slot.hour + 1) % 24).padStart(2, "0")}:00 hs
                    </span>
                    <div className="flex justify-between text-[11px] text-ink-100 mt-1">
                      <span>Digitales:</span>
                      <span className="font-mono font-bold">${slot.digitalSales.toLocaleString("es-AR")}</span>
                    </div>
                    <div className="flex justify-between text-[9px] text-ink-500">
                      <span>({slot.digitalCount} pedidos)</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-ink-100 mt-1">
                      <span>Barra:</span>
                      <span className="font-mono font-bold">${slot.cashSales.toLocaleString("es-AR")}</span>
                    </div>
                    <div className="flex justify-between text-[9px] text-ink-500">
                      <span>({slot.cashCount} ventas)</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold border-t border-white/5 pt-1.5 mt-1.5 text-accent">
                      <span>Total:</span>
                      <span className="font-mono">${slot.totalSales.toLocaleString("es-AR")}</span>
                    </div>
                  </div>
                )}

                {/* Bar Graphic */}
                <div className="w-full relative h-[185px] flex items-end">
                  <div
                    className={`w-full rounded-t bg-gradient-to-t transition-all duration-300 group-hover:brightness-110 ${barColorClass}`}
                    style={{ height: `${Math.max(4, heightPct)}%` }}
                  />
                </div>

                {/* Bar Label */}
                <span className="text-[9px] font-mono font-medium text-ink-400 mt-2 truncate">
                  {slot.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Statistics overview widgets below the chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Widget A: Segmented Ticket */}
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col gap-4 min-w-0">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">
              Ticket Promedio
            </span>
            <span className="font-mono text-[26px] font-bold leading-none text-accent">
              ${segmentedTicket.general.toLocaleString("es-AR")}
            </span>
          </div>
          <div className="flex flex-col gap-2 border-t border-ink-800 pt-3">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-ink-400">Página Web</span>
              <span className="font-mono font-bold text-ink-100">${segmentedTicket.digital.toLocaleString("es-AR")}</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-ink-400">Ventas Barra</span>
              <span className="font-mono font-bold text-ink-100">${segmentedTicket.barra.toLocaleString("es-AR")}</span>
            </div>
          </div>
        </div>

        {/* Widget B: Payment Donut */}
        <PaymentDonut breakdown={paymentBreakdown} total={totals.total} isBosko={isBosko} />

        {/* Widget C: Peak Hour */}
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">
            Hora Pico de Ventas
          </span>
          <span className="font-mono text-[26px] font-bold leading-none text-accent">
            {peakHour}
          </span>
          <span className="text-[10px] text-ink-400">Franja con mayor recaudación bruta</span>
        </div>
      </div>

      {/* Revenue by Product */}
      <RevenueByProduct products={productRevenue} isBosko={isBosko} />
    </div>
  );
}
