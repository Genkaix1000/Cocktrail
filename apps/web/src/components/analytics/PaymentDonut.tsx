"use client";

import { useEffect, useMemo, useState } from "react";
import { paymentChannelColor, type PaymentBreakdown } from "@/lib/analytics";

type Props = {
  breakdown: PaymentBreakdown[];
  total: number;
};

type Segment = PaymentBreakdown & {
  len: number;
  offset: number;
  color: string;
};

export default function PaymentDonut({ breakdown, total }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const size = 180;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const channels = useMemo(() => {
    const withColors = breakdown.map((b) => ({
      ...b,
      color: b.color || paymentChannelColor(b.method),
    }));
    if (total <= 0) return withColors;
    return withColors.filter((b) => b.total > 0).sort((a, b) => b.total - a.total);
  }, [breakdown, total]);

  const dominant = channels.find((b) => b.total > 0) ?? null;

  const segments = useMemo(() => {
    let offset = 0;
    return channels.map((b) => {
      const len = total > 0 ? (b.total / total) * circumference : 0;
      const seg: Segment = { ...b, len, offset };
      offset += len;
      return seg;
    });
  }, [channels, total, circumference]);

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 flex flex-col justify-between h-[380px] shadow-card">
      <div className="shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)] select-none">
            Distribución por Canal
          </h3>
          <span className="text-[11px] font-medium text-[var(--text-tertiary)] tabular px-2 py-0.5 rounded-full bg-[var(--bg-panel)]">
            {channels.length}
          </span>
        </div>
        <p className="text-[11px] text-[var(--text-tertiary)] mt-1 select-none">
          % sobre facturado bruto
        </p>
      </div>

      <div className="flex justify-center shrink-0 my-1">
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
            role="img"
            aria-label={
              dominant
                ? `${dominant.label} ${dominant.pct}%, total $${total.toLocaleString("es-AR")}`
                : `Sin ventas, total $0`
            }
          >
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth={strokeWidth}
            />
            {segments.map((seg) =>
              seg.len > 0 ? (
                <circle
                  key={seg.method}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${mounted ? seg.len : 0} ${circumference}`}
                  strokeDashoffset={-seg.offset}
                  strokeLinecap="butt"
                  className="transition-all duration-700 ease-out"
                />
              ) : null,
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
            <span className="font-mono text-[28px] font-bold leading-none tabular text-[var(--text-primary)]">
              {dominant ? `${Math.round((dominant.total / total) * 100)}%` : "0%"}
            </span>
            <span className="text-[11px] font-medium text-[var(--text-secondary)] mt-1.5 truncate max-w-full">
              {dominant ? dominant.label : "Sin ventas"}
            </span>
          </div>
        </div>
      </div>

      {channels.length > 0 ? (
        <div className="flex flex-col gap-2.5 shrink-0">
          {total > 0 && (
            <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-[var(--bg-panel)] gap-px">
              {segments.map((seg) =>
                seg.len > 0 ? (
                  <div
                    key={seg.method}
                    style={{
                      width: `${(seg.total / total) * 100}%`,
                      background: seg.color,
                    }}
                    title={`${seg.label}: ${seg.pct}%`}
                  />
                ) : null,
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {channels.map((b) => {
              const pct = total > 0 ? Math.round((b.total / total) * 100) : 0;
              return (
                <span
                  key={b.method}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-panel)] text-[12px] text-[var(--text-secondary)]"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: total > 0 && b.total > 0 ? b.color : "var(--border-strong)" }}
                  />
                  <span className="truncate max-w-[9rem]">{b.label}</span>
                  <span className="font-mono text-[11px] tabular text-[var(--text-tertiary)]">{pct}%</span>
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-[13px] text-[var(--text-tertiary)] flex-1 flex items-center justify-center">
          Sin datos de pago disponibles
        </div>
      )}
    </div>
  );
}
