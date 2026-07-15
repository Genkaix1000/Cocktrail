"use client";

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import type { PaymentBreakdown } from "@/lib/analytics";

type Props = {
  breakdown: PaymentBreakdown[];
  total: number;
  isBosko: boolean;
};

export default function PaymentDonut({ breakdown, total, isBosko }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Delay to trigger CSS transition on mount
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const size = 180;
  const strokeWidth = 25;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Build segments (offset acumulado sin mutar variables externas)
  const segments = breakdown.reduce<
    Array<PaymentBreakdown & { segmentLength: number; dashOffset: number }>
  >((acc, b) => {
    const cumulativeOffset = acc.reduce((sum, s) => sum + s.segmentLength, 0);
    const segmentLength = (b.pct / 100) * circumference;
    const dashOffset = circumference - cumulativeOffset;
    acc.push({ ...b, segmentLength, dashOffset });
    return acc;
  }, []);

  const accentColor = isBosko ? "#4ade80" : "#6db3f2";

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col justify-between h-[380px] shadow-lg">
      {/* Title */}
      <div className="flex items-center justify-between shrink-0">
        <h3 className="text-[12px] font-bold text-ink-100 uppercase tracking-widest flex items-center gap-2.5 select-none">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
            <CreditCard size={13} />
          </div>
          <span>Distribución por Canal</span>
        </h3>
        <span className="text-[10px] font-mono text-ink-400 px-1.5 py-0.5 bg-ink-800 rounded tabular">
          {breakdown.length}
        </span>
      </div>

      {/* Donut SVG */}
      <div className="flex justify-center shrink-0 my-1">
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
            role="img"
            aria-label={`Distribución de pagos por canal, total $${total.toLocaleString("es-AR")}`}
          >
            {/* Background ring */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="var(--ink-800, #1e293b)"
              strokeWidth={strokeWidth}
            />
            {/* Data segments */}
            {segments.map((seg) => (
              <circle
                key={seg.method}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${mounted ? seg.segmentLength : 0} ${circumference}`}
                strokeDashoffset={-seg.dashOffset + circumference}
                strokeLinecap="butt"
                className="transition-all duration-700 ease-out"
              />
            ))}
          </svg>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400">
              Total
            </span>
            <span
              className="font-mono text-[20px] font-bold leading-none"
              style={{ color: accentColor }}
            >
              ${total.toLocaleString("es-AR")}
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      {breakdown.length > 0 ? (
        <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[95px] no-scrollbar shrink-0">
          {breakdown.map((b) => (
            <div
              key={b.method}
              className="flex items-center gap-3 py-1 border-t border-ink-850 first:border-t-0"
            >
              {/* Colored dot — gris cuando no hubo ninguna venta real (total === 0) */}
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: total === 0 ? "var(--ink-600, #475569)" : b.color }}
              />
              {/* Label */}
              <span className="text-[13px] text-ink-200 flex-1 min-w-0 truncate">
                {b.label}
              </span>
              {/* Count */}
              <span className="text-[10px] text-ink-500 font-mono tabular">
                {b.count} ops
              </span>
              {/* Amount */}
              <span className="font-mono text-[13px] text-ink-100 tabular text-right min-w-[80px]">
                ${b.total.toLocaleString("es-AR")}
              </span>
              {/* Pct */}
              <span className="font-mono text-[11px] text-ink-400 tabular text-right w-[38px]">
                {b.pct}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-[13px] text-ink-500 flex-1 flex items-center justify-center">
          Sin datos de pago disponibles
        </div>
      )}
    </div>
  );
}
