"use client";

import { Activity, Receipt, TrendingUp, Wine } from "lucide-react";
import { useMemo } from "react";

import MetricCard from "@/components/shared/MetricCard";
import type { EventTotals, NightEvent, Order } from "@cocktrail/shared";

type Props = {
  event: NightEvent | null;
  activeNightOrders: Order[];
  totals: EventTotals;
};

const cardShell =
  "bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-card";

function fmtMoneyCompact(v: number): string {
  if (v >= 100_000) return `$${Math.round(v / 1000)}k`;
  if (v >= 10_000) return `$${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${v.toLocaleString("es-AR")}`;
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

/**
 * Vista "Métricas" de caja — misma data; skin Bosko (MetricCard + barras stripe).
 */
export default function MetricasSection({ event, activeNightOrders, totals }: Props) {
  const totalDrinkUnits = useMemo(
    () => totals.drinksSold.reduce((s, d) => s + d.qty, 0),
    [totals],
  );

  const totalOps = useMemo(
    () => totals.efectivoCount + totals.qrCount + totals.debitoCount,
    [totals],
  );

  const avgTicket = useMemo(
    () => (totalOps > 0 ? Math.round(totals.total / totalOps) : 0),
    [totals, totalOps],
  );

  const hourlyData = useMemo(() => {
    if (!event) return [];
    const startHourDate = new Date(event.startedAt);
    startHourDate.setMinutes(0, 0, 0);

    const slots: { label: string; hour: number; totalSales: number; totalCount: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const currentTs = startHourDate.getTime() + i * 3600 * 1000;
      const hr = new Date(currentTs).getHours();
      slots.push({
        label: `${String(hr).padStart(2, "0")}:00`,
        hour: hr,
        totalSales: 0,
        totalCount: 0,
      });
    }

    for (const order of activeNightOrders) {
      if (order.status === "cancelado") continue;
      const hr = new Date(order.createdAt).getHours();
      const slot = slots.find((s) => s.hour === hr);
      if (slot) {
        slot.totalSales += order.total;
        slot.totalCount += 1;
      }
    }

    return slots;
  }, [event, activeNightOrders]);

  const peakSales = Math.max(0, ...hourlyData.map((s) => s.totalSales));
  const niceMax = niceAxisMax(peakSales);
  const peakIndex = hourlyData.findIndex((s) => peakSales > 0 && s.totalSales === peakSales);
  const peakHour =
    peakIndex >= 0 && peakSales > 0 ? `${hourlyData[peakIndex]!.label} hs` : "—";
  const yTop = fmtMoneyCompact(niceMax);
  const yMid = fmtMoneyCompact(Math.round(niceMax / 2));

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <style>{`
        @keyframes growBar {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        .animate-grow-bar {
          transform-origin: bottom;
          animation: growBar 0.75s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      <section className="flex flex-col gap-1">
        <h1 className="text-[28px] md:text-[32px] font-bold leading-none text-[var(--text-primary)]">
          Métricas de Venta
        </h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">
          Revisión horaria del flujo de dinero y tickets registrados en el transcurso del evento.
        </p>
        <p className="text-[13px] text-[var(--text-primary)] mt-2 font-mono tabular">
          {totals.netTotal != null ? (
            <>
              Ingreso neto ${totals.netTotal.toLocaleString("es-AR")}
              {" · "}Facturado ${totals.total.toLocaleString("es-AR")}
              {totals.mpFeeTotal != null && (
                <>
                  {" · "}Comisiones MP ${totals.mpFeeTotal.toLocaleString("es-AR")}
                </>
              )}
              {totals.mpFeesPending ? ` (${totals.mpFeesPending} fee pend.)` : ""}
            </>
          ) : (
            <>Facturado ${totals.total.toLocaleString("es-AR")}</>
          )}
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Ticket Promedio"
          value={avgTicket}
          isCurrency
          delta={null}
          icon={Receipt}
          subtitle="Sobre transacciones cobradas"
          noDeltaLabel="EN VIVO"
        />
        <MetricCard
          label="Tragos Vendidos"
          value={totalDrinkUnits}
          delta={null}
          icon={Wine}
          subtitle="Unidades servidas en barra"
          noDeltaLabel="EN VIVO"
        />
        <div
          className={`${cardShell} p-5 flex justify-between min-w-0 h-[125px] relative overflow-hidden`}
        >
          <div className="flex flex-col justify-between h-full pr-3 flex-1 min-w-0">
            <span className="text-[12px] font-medium text-[var(--text-secondary)] truncate">
              Hora Pico de Ventas
            </span>
            <div className="text-[32px] font-bold leading-none tracking-tight font-mono tabular text-[var(--text-primary)]">
              {peakHour}
            </div>
            <span className="text-[11px] text-[var(--text-tertiary)]">Mayor recaudación bruta</span>
          </div>
          <div className="w-10 h-10 rounded-full border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-primary)] shrink-0">
            <Activity size={18} strokeWidth={1.8} />
          </div>
        </div>
      </div>

      <div className={`${cardShell} p-5 flex flex-col h-[380px]`}>
        <div className="flex items-baseline justify-between gap-3 shrink-0 mb-4 select-none">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <TrendingUp size={14} className="text-[var(--accent-primary)]" />
            Facturación por Hora
          </h3>
          {peakIndex >= 0 && peakSales > 0 && (
            <span className="text-[11px] font-medium text-[var(--text-tertiary)] truncate">
              Pico{" "}
              <span className="text-[var(--accent-text)] font-semibold">
                {hourlyData[peakIndex]!.hour}h
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

              {hourlyData.map((slot, idx) => {
                const isPeak = idx === peakIndex && peakSales > 0;
                const heightPct = peakSales > 0 ? (slot.totalSales / niceMax) * 100 : 0;
                return (
                  <div
                    key={slot.label}
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
              {hourlyData.map((slot, idx) => (
                <div key={`lbl-${slot.label}`} className="flex-1 min-w-0 max-w-[52px] text-center">
                  <span
                    className={`text-[10px] font-mono tabular ${
                      idx === peakIndex && peakSales > 0
                        ? "text-[var(--accent-text)] font-semibold"
                        : "text-[var(--text-tertiary)]"
                    }`}
                  >
                    {slot.label.slice(0, 2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
