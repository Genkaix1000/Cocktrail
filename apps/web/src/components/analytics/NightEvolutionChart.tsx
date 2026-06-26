"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import type { NightPoint } from "@/lib/analytics";

type Props = {
  points: NightPoint[];
  movingAvg: (number | null)[];
  isBosko: boolean;
};

export default function NightEvolutionChart({
  points,
  movingAvg,
  isBosko,
}: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 md:p-6">
        <div className="flex flex-col gap-1 mb-6">
          <h3 className="text-[12px] font-bold text-ink-100 uppercase tracking-widest">
            Evolución de Facturación
          </h3>
          <p className="text-[10px] text-ink-500">
            Últimas noches con media móvil
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <BarChart3 size={32} className="text-ink-600" />
          <span className="text-[13px] text-ink-500">
            Sin datos de noches anteriores
          </span>
          <span className="text-[11px] text-ink-600">
            Cerrá al menos una noche para ver la evolución
          </span>
        </div>
      </div>
    );
  }

  // Chart geometry
  const chartHeight = 280;
  const paddingTop = 20;
  const paddingBottom = 50;
  const paddingLeft = 50;
  const paddingRight = 16;
  const drawableHeight = chartHeight - paddingTop - paddingBottom;

  const barCount = points.length;
  // Responsive SVG: we compute an intrinsic width
  const barGap = barCount > 10 ? 4 : 8;
  const barWidth = barCount > 10 ? 22 : 32;
  const chartWidth = Math.max(
    400,
    paddingLeft + paddingRight + barCount * (barWidth + barGap)
  );

  const maxTotal = Math.max(...points.map((p) => p.total), 1);
  // Round up to nearest nice number for grid
  const gridMax = Math.ceil(maxTotal / 10000) * 10000 || maxTotal;

  const scaleY = (val: number) =>
    paddingTop + drawableHeight - (val / gridMax) * drawableHeight;

  // Grid lines (4 lines)
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
    y: scaleY(gridMax * frac),
    label: `$${Math.round(gridMax * frac).toLocaleString("es-AR")}`,
  }));

  // Moving average line points
  const avgPoints: string[] = [];
  movingAvg.forEach((val, i) => {
    if (val !== null) {
      const x =
        paddingLeft + i * (barWidth + barGap) + barWidth / 2;
      const y = scaleY(val);
      avgPoints.push(`${x},${y}`);
    }
  });

  // Colors
  const barGradientStart = isBosko
    ? "rgba(74,222,128,0.15)"
    : "rgba(109,179,242,0.15)";
  const barGradientEnd = isBosko ? "#4ade80" : "#6db3f2";
  const barHoverGlow = isBosko
    ? "rgba(74,222,128,0.35)"
    : "rgba(109,179,242,0.35)";

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 md:p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[12px] font-bold text-ink-100 uppercase tracking-widest">
            Evolución de Facturación
          </h3>
          <p className="text-[10px] text-ink-500">
            Últimas {points.length} noches con media móvil
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: barGradientEnd }}
            />
            <span className="text-[9px] text-ink-400 uppercase tracking-wider">
              Revenue
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded-full bg-amber-400" />
            <span className="text-[9px] text-ink-400 uppercase tracking-wider">
              Media móvil
            </span>
          </div>
        </div>
      </div>

      {/* Chart wrapper (horizontally scrollable on small screens) */}
      <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
        <svg
          width={chartWidth}
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="select-none"
        >
          <defs>
            <linearGradient id="barGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={barGradientStart} />
              <stop offset="100%" stopColor={barGradientEnd} />
            </linearGradient>
            <linearGradient id="barGradHover" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={barHoverGlow} />
              <stop offset="100%" stopColor={barGradientEnd} />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {gridLines.map((g, i) => (
            <g key={i}>
              <line
                x1={paddingLeft - 6}
                y1={g.y}
                x2={chartWidth - paddingRight}
                y2={g.y}
                stroke="var(--ink-800, #1e293b)"
                strokeWidth={1}
                strokeDasharray={i > 0 && i < gridLines.length - 1 ? "4 4" : "0"}
                opacity={0.5}
              />
              <text
                x={paddingLeft - 10}
                y={g.y + 3}
                textAnchor="end"
                fill="var(--ink-500, #64748b)"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
              >
                {g.label}
              </text>
            </g>
          ))}

          {/* Bars */}
          {points.map((p, i) => {
            const x = paddingLeft + i * (barWidth + barGap);
            const barH = (p.total / gridMax) * drawableHeight;
            const y = paddingTop + drawableHeight - barH;
            const isHovered = hoveredIdx === i;

            return (
              <g
                key={p.id}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                {/* Invisible wider hit area */}
                <rect
                  x={x - barGap / 2}
                  y={paddingTop}
                  width={barWidth + barGap}
                  height={drawableHeight + paddingBottom}
                  fill="transparent"
                />
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(2, barH)}
                  rx={3}
                  fill={isHovered ? "url(#barGradHover)" : "url(#barGrad)"}
                  className="transition-all duration-200"
                />
                {/* Hover glow */}
                {isHovered && (
                  <rect
                    x={x - 1}
                    y={y - 1}
                    width={barWidth + 2}
                    height={Math.max(4, barH + 2)}
                    rx={4}
                    fill="none"
                    stroke={barGradientEnd}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                )}
                {/* X-axis label */}
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - paddingBottom + 14}
                  textAnchor="end"
                  fill={
                    isHovered
                      ? "var(--ink-100, #f1f5f9)"
                      : "var(--ink-500, #64748b)"
                  }
                  fontSize={9}
                  fontFamily="ui-monospace, monospace"
                  transform={`rotate(-45, ${x + barWidth / 2}, ${chartHeight - paddingBottom + 14})`}
                >
                  {p.date}
                </text>
              </g>
            );
          })}

          {/* Moving average polyline */}
          {avgPoints.length > 1 && (
            <polyline
              points={avgPoints.join(" ")}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.85}
            />
          )}
          {/* Avg dots */}
          {movingAvg.map((val, i) => {
            if (val === null) return null;
            const x =
              paddingLeft + i * (barWidth + barGap) + barWidth / 2;
            const y = scaleY(val);
            return (
              <circle
                key={`avg-${i}`}
                cx={x}
                cy={y}
                r={3}
                fill="#fbbf24"
                stroke="var(--ink-900, #0f172a)"
                strokeWidth={2}
              />
            );
          })}
        </svg>
      </div>

      {/* Tooltip */}
      {hoveredIdx !== null && points[hoveredIdx] && (
        <div className="bg-ink-950 border border-white/10 rounded-xl p-3.5 shadow-2xl flex flex-col gap-1.5 animate-in fade-in duration-100">
          <span className="text-[10px] font-bold text-ink-300 border-b border-white/5 pb-1">
            {points[hoveredIdx]!.date}
          </span>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1">
            <span className="text-[11px] text-ink-300">Total:</span>
            <span className="font-mono text-[11px] font-bold text-ink-50 text-right">
              ${points[hoveredIdx]!.total.toLocaleString("es-AR")}
            </span>
            <span className="text-[11px] text-ink-300">Ventas Web:</span>
            <span className="font-mono text-[11px] text-ink-200 text-right">
              ${points[hoveredIdx]!.web.toLocaleString("es-AR")}
            </span>
            <span className="text-[11px] text-ink-300">Efectivo:</span>
            <span className="font-mono text-[11px] text-ink-200 text-right">
              ${points[hoveredIdx]!.efectivo.toLocaleString("es-AR")}
            </span>
            <span className="text-[11px] text-ink-300">Pedidos:</span>
            <span className="font-mono text-[11px] text-ink-200 text-right">
              {points[hoveredIdx]!.orderCount}
            </span>
          </div>
          {movingAvg[hoveredIdx] !== null &&
            movingAvg[hoveredIdx] !== undefined && (
              <div className="flex justify-between text-[10px] border-t border-white/5 pt-1.5 mt-0.5">
                <span className="text-amber-400 font-bold">Media móvil:</span>
                <span className="font-mono text-amber-400">
                  ${movingAvg[hoveredIdx]!.toLocaleString("es-AR")}
                </span>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
