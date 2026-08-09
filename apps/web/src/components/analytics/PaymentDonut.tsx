"use client";

import { useEffect, useMemo, useState } from "react";
import type { PaymentBreakdown } from "@/lib/analytics";

type Props = {
  breakdown: PaymentBreakdown[];
  total: number;
};

const SOLID_STROKES = ["var(--accent-primary)", "var(--accent-bright)"] as const;

export default function PaymentDonut({ breakdown, total }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const size = 180;
  const strokeWidth = 25;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const ranked = useMemo(
    () => [...breakdown].sort((a, b) => b.total - a.total),
    [breakdown],
  );
  const solidMethods = useMemo(() => {
    const set = new Set<string>();
    for (const b of ranked) {
      if (set.size >= 2) break;
      if (b.total > 0) set.add(b.method);
    }
    return set;
  }, [ranked]);

  const dominant = ranked.find((b) => b.total > 0) ?? null;

  const segments = breakdown.reduce<
    Array<PaymentBreakdown & { segmentLength: number; dashOffset: number; solidIndex: number }>
  >((acc, b) => {
    const cumulativeOffset = acc.reduce((sum, s) => sum + s.segmentLength, 0);
    const segmentLength = (b.pct / 100) * circumference;
    const dashOffset = circumference - cumulativeOffset;
    const solidIndex = [...solidMethods].indexOf(b.method);
    acc.push({ ...b, segmentLength, dashOffset, solidIndex });
    return acc;
  }, []);

  function strokeFor(seg: (typeof segments)[number]) {
    if (total === 0 || seg.total <= 0) return "transparent";
    if (seg.solidIndex >= 0) return SOLID_STROKES[seg.solidIndex]!;
    return "url(#bosko-donut-stripe)";
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 flex flex-col justify-between h-[380px] shadow-card">
      <div className="shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)] select-none">
            Distribución por Canal
          </h3>
          <span className="text-[11px] font-medium text-[var(--text-tertiary)] tabular px-2 py-0.5 rounded-full bg-[var(--bg-panel)]">
            {breakdown.length}
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
            <defs>
              <pattern
                id="bosko-donut-stripe"
                patternUnits="userSpaceOnUse"
                width="6"
                height="6"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="var(--bg-panel)" />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="6"
                  stroke="var(--border-strong)"
                  strokeWidth="2.5"
                />
              </pattern>
            </defs>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="var(--border-subtle)"
              strokeWidth={strokeWidth}
            />
            {segments.map((seg) => (
              <circle
                key={seg.method}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={strokeFor(seg)}
                strokeWidth={strokeWidth}
                strokeDasharray={`${mounted ? seg.segmentLength : 0} ${circumference}`}
                strokeDashoffset={-seg.dashOffset + circumference}
                strokeLinecap="butt"
                className="transition-all duration-700 ease-out"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
            <span className="font-mono text-[28px] font-bold leading-none tabular text-[var(--text-primary)]">
              {dominant ? `${dominant.pct}%` : "0%"}
            </span>
            <span className="text-[11px] font-medium text-[var(--text-secondary)] mt-1.5 truncate max-w-full">
              {dominant ? dominant.label : "Sin ventas"}
            </span>
          </div>
        </div>
      </div>

      {breakdown.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-2 shrink-0 pt-1">
          {breakdown.map((b) => {
            const solidIndex = [...solidMethods].indexOf(b.method);
            const isSolid = solidIndex >= 0 && total > 0 && b.total > 0;
            return (
              <span
                key={b.method}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-panel)] text-[12px] text-[var(--text-secondary)]"
              >
                {isSolid ? (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: SOLID_STROKES[solidIndex] }}
                  />
                ) : total === 0 || b.total <= 0 ? (
                  <span className="w-2 h-2 rounded-full shrink-0 bg-[var(--border-strong)]" />
                ) : (
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0 bosko-stripe border border-[var(--border-subtle)]"
                    aria-hidden
                  />
                )}
                <span className="truncate max-w-[9rem]">{b.label}</span>
                <span className="font-mono text-[11px] tabular text-[var(--text-tertiary)]">
                  {b.pct}%
                </span>
              </span>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-[13px] text-[var(--text-tertiary)] flex-1 flex items-center justify-center">
          Sin datos de pago disponibles
        </div>
      )}
    </div>
  );
}
