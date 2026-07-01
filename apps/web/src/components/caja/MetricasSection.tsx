"use client";

import { TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";

import type { CashSale, NightEvent, Order } from "@cocktrail/shared";
import type { computeTotals } from "@/lib/totals";

type Totals = ReturnType<typeof computeTotals>;

type Props = {
  event: NightEvent | null;
  /** Órdenes/ventas en efectivo de la noche activa, ya filtradas por el shell. */
  activeNightOrders: Order[];
  activeNightCashSales: CashSale[];
  totals: Totals;
};

/**
 * Vista "Métricas" de caja — extraída de CajaClient.tsx sin cambios de
 * comportamiento: gráfico de facturación por hora con tooltip interactivo y
 * los 3 widgets de estadísticas (ticket promedio, tragos vendidos, hora pico).
 * Toda la lógica derivada (`hourlyData`, `maxHourSales`, `peakHour`,
 * `totalDrinkUnits`, `totalOps`, `avgTicket`) era exclusiva de esta vista en
 * el shell original — se movió acá completa.
 */
export default function MetricasSection({ event, activeNightOrders, activeNightCashSales, totals }: Props) {
  const [activeHoverSlot, setActiveHoverSlot] = useState<number | null>(null);

  const totalDrinkUnits = useMemo(() => {
    return totals.drinksSold.reduce((s, d) => s + d.qty, 0);
  }, [totals]);

  const totalOps = useMemo(() => {
    return totals.efectivoCount + totals.qrCount + totals.debitoCount;
  }, [totals]);

  const avgTicket = useMemo(() => {
    return totalOps > 0 ? Math.round(totals.total / totalOps) : 0;
  }, [totals, totalOps]);

  const hourlyData = useMemo(() => {
    if (!event) return [];
    const startTs = event.startedAt;
    const startHourDate = new Date(startTs);
    startHourDate.setMinutes(0, 0, 0);

    const slots: {
      label: string;
      hour: number;
      digitalSales: number;
      digitalCount: number;
      cashSales: number;
      cashCount: number;
      totalSales: number;
    }[] = [];

    // Generar exactamente 10 franjas horarias a partir de la hora de inicio del evento
    for (let i = 0; i < 10; i++) {
      const currentTs = startHourDate.getTime() + i * 3600 * 1000;
      const hrDate = new Date(currentTs);
      const hr = hrDate.getHours();
      slots.push({
        label: `${String(hr).padStart(2, "0")}:00`,
        hour: hr,
        digitalSales: 0,
        digitalCount: 0,
        cashSales: 0,
        cashCount: 0,
        totalSales: 0,
      });
    }

    for (const order of activeNightOrders) {
      if (order.status === "cancelado") continue;
      const orderDate = new Date(order.createdAt);
      const hr = orderDate.getHours();
      const slot = slots.find((s) => s.hour === hr);
      if (slot) {
        slot.digitalSales += order.total;
        slot.digitalCount += 1;
        slot.totalSales += order.total;
      }
    }

    for (const sale of activeNightCashSales) {
      const saleDate = new Date(sale.createdAt);
      const hr = saleDate.getHours();
      const slot = slots.find((s) => s.hour === hr);
      if (slot) {
        slot.cashSales += sale.amount;
        slot.cashCount += 1;
        slot.totalSales += sale.amount;
      }
    }

    return slots;
  }, [event, activeNightOrders, activeNightCashSales]);

  const maxHourSales = useMemo(() => {
    if (hourlyData.length === 0) return 1000;
    const max = Math.max(...hourlyData.map((s) => s.totalSales));
    return max > 0 ? max : 1000;
  }, [hourlyData]);

  const peakHour = useMemo(() => {
    if (hourlyData.length === 0) return "—";
    const sorted = [...hourlyData].sort((a, b) => b.totalSales - a.totalSales);
    if (sorted[0] && sorted[0].totalSales > 0) {
      return `${sorted[0].label} hs`;
    }
    return "—";
  }, [hourlyData]);

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
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
          <div className="px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono border border-accent/25 text-accent bg-ink-850">
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
                  <div className="absolute bottom-[105%] left-1/2 -translate-x-1/2 w-[210px] bg-ink-950 border border-ink-800 rounded-xl p-3 shadow-2xl z-20 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                    <span className="text-[10px] font-bold text-ink-300 border-b border-ink-800 pb-1">
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
                    <div className="flex justify-between text-[11px] font-bold border-t border-ink-800 pt-1.5 mt-1.5 text-accent">
                      <span>Total:</span>
                      <span className="font-mono">${slot.totalSales.toLocaleString("es-AR")}</span>
                    </div>
                  </div>
                )}

                {/* Bar Graphic */}
                <div className="w-full relative h-[185px] flex items-end">
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-accent/30 to-accent/80 transition-all duration-300 group-hover:brightness-125"
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Widget A: Avg ticket */}
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">
            Ticket Promedio
          </span>
          <span className="font-mono text-[26px] font-bold leading-none text-accent">
            ${avgTicket.toLocaleString("es-AR")}
          </span>
          <span className="text-[10px] text-ink-400">Calculado sobre transacciones cobradas</span>
        </div>

        {/* Widget B: Drinks sold */}
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">
            Tragos Vendidos
          </span>
          <span className="font-mono text-[26px] font-bold leading-none text-ink-50">
            {totalDrinkUnits} <span className="text-xs text-ink-400 font-sans font-medium">unidades</span>
          </span>
          <span className="text-[10px] text-ink-400">Volumen físico total servido en barra</span>
        </div>

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
    </div>
  );
}
