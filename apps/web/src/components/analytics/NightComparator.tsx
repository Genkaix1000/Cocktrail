"use client";

import { useState, useMemo } from "react";
import { GitCompareArrows, ChevronDown } from "lucide-react";
import type { EventSummary } from "@cocktrail/shared";

type Props = {
  nights: EventSummary[];
  isBosko: boolean;
};

const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatNightDate(ts: number): string {
  const d = new Date(ts);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString("es-AR")}`;
}

function formatEventDuration(startedAt: number, closedAt?: number): string {
  if (!closedAt) return "—";
  const ms = closedAt - startedAt;
  const totalMin = Math.round(ms / 60000);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

function getDurationMs(e: EventSummary): number | null {
  if (!e.closedAt) return null;
  return e.closedAt - e.startedAt;
}

function computeDeltaPct(a: number, b: number): string {
  if (b === 0 && a === 0) return "—";
  if (b === 0) return "+100%";
  const pct = Math.round(((a - b) / b) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

type ComparisonRow = {
  label: string;
  valueA: string;
  valueB: string;
  rawA: number;
  rawB: number;
  /** "higher" means higher wins, "lower" means lower wins */
  winMode: "higher" | "lower";
  delta: string;
};

function buildRows(a: EventSummary, b: EventSummary): ComparisonRow[] {
  const totalA = a.totals.total;
  const totalB = b.totals.total;

  const ticketsA = a.orderCounter;
  const ticketsB = b.orderCounter;

  const avgA = ticketsA > 0 ? Math.round(totalA / ticketsA) : 0;
  const avgB = ticketsB > 0 ? Math.round(totalB / ticketsB) : 0;

  const webSalesA = a.totals.webTotal;
  const webSalesB = b.totals.webTotal;

  const efA = a.totals.efectivoTotal;
  const efB = b.totals.efectivoTotal;

  const topA = a.totals.drinksSold[0];
  const topB = b.totals.drinksSold[0];

  const durA = getDurationMs(a);
  const durB = getDurationMs(b);

  return [
    {
      label: "Total Facturado",
      valueA: formatMoney(totalA),
      valueB: formatMoney(totalB),
      rawA: totalA,
      rawB: totalB,
      winMode: "higher",
      delta: computeDeltaPct(totalA, totalB),
    },
    {
      label: "Tickets Emitidos",
      valueA: String(ticketsA),
      valueB: String(ticketsB),
      rawA: ticketsA,
      rawB: ticketsB,
      winMode: "higher",
      delta: computeDeltaPct(ticketsA, ticketsB),
    },
    {
      label: "Ticket Promedio",
      valueA: formatMoney(avgA),
      valueB: formatMoney(avgB),
      rawA: avgA,
      rawB: avgB,
      winMode: "higher",
      delta: computeDeltaPct(avgA, avgB),
    },
    {
      label: "Ventas Web",
      valueA: formatMoney(webSalesA),
      valueB: formatMoney(webSalesB),
      rawA: webSalesA,
      rawB: webSalesB,
      winMode: "higher",
      delta: computeDeltaPct(webSalesA, webSalesB),
    },
    {
      label: "Efectivo",
      valueA: formatMoney(efA),
      valueB: formatMoney(efB),
      rawA: efA,
      rawB: efB,
      winMode: "higher",
      delta: computeDeltaPct(efA, efB),
    },
    {
      label: "Top Trago",
      valueA: topA ? `${topA.name} (×${topA.qty})` : "—",
      valueB: topB ? `${topB.name} (×${topB.qty})` : "—",
      rawA: topA?.qty ?? 0,
      rawB: topB?.qty ?? 0,
      winMode: "higher",
      delta: topA && topB ? computeDeltaPct(topA.qty, topB.qty) : "—",
    },
    {
      label: "Duración",
      valueA: formatEventDuration(a.startedAt, a.closedAt),
      valueB: formatEventDuration(b.startedAt, b.closedAt),
      rawA: durA ?? 0,
      rawB: durB ?? 0,
      winMode: "lower",
      delta:
        durA !== null && durB !== null ? computeDeltaPct(durA, durB) : "—",
    },
  ];
}

export default function NightComparator({ nights, isBosko }: Props) {
  const accentColor = isBosko ? "text-[#4ade80]" : "text-blue";
  const accentBg = isBosko ? "bg-[#4ade80]/10" : "bg-blue/10";
  const accentBorder = isBosko ? "border-[#4ade80]/20" : "border-blue-line";

  const sortedNights = useMemo(
    () =>
      [...nights]
        .filter((n) => n.closedAt)
        .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)),
    [nights],
  );

  const [idxA, setIdxA] = useState(0);
  const [idxB, setIdxB] = useState(1);

  const nightA = sortedNights[idxA];
  const nightB = sortedNights[idxB];

  const rows = useMemo(() => {
    if (!nightA || !nightB) return [];
    return buildRows(nightA, nightB);
  }, [nightA, nightB]);

  if (sortedNights.length < 2) {
    return (
      <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className={`w-8 h-8 rounded-xl ${accentBg} border ${accentBorder} flex items-center justify-center`}
          >
            <GitCompareArrows size={15} className={accentColor} />
          </div>
          <h3 className="text-ink-50 text-[13px] font-semibold">
            Comparador de Noches
          </h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <p className="text-ink-500 text-[12px] text-center">
            Se necesitan al menos 2 noches cerradas para comparar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div
          className={`w-8 h-8 rounded-xl ${accentBg} border ${accentBorder} flex items-center justify-center`}
        >
          <GitCompareArrows size={15} className={accentColor} />
        </div>
        <div>
          <h3 className="text-ink-50 text-[13px] font-semibold">
            Comparador de Noches
          </h3>
          <p className="text-ink-500 text-[10px] uppercase tracking-[0.18em] font-bold mt-0.5">
            Seleccioná dos noches
          </p>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <NightSelector
          label="Noche A"
          nights={sortedNights}
          value={idxA}
          onChange={setIdxA}
          accentColor={accentColor}
        />
        <NightSelector
          label="Noche B"
          nights={sortedNights}
          value={idxB}
          onChange={setIdxB}
          accentColor={accentColor}
        />
      </div>

      {/* Comparison grid */}
      {nightA && nightB && (
        <div className="flex flex-col gap-0">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_auto_1fr] gap-2 mb-2 px-1">
            <div />
            <div className={`text-[10px] font-bold uppercase tracking-[0.18em] text-center ${accentColor}`}>
              {formatNightDate(nightA.closedAt ?? nightA.startedAt)}
            </div>
            <div className="w-14" />
            <div className={`text-[10px] font-bold uppercase tracking-[0.18em] text-center ${accentColor}`}>
              {formatNightDate(nightB.closedAt ?? nightB.startedAt)}
            </div>
          </div>

          {/* Rows */}
          {rows.map((row, idx) => {
            const aWins =
              row.winMode === "higher"
                ? row.rawA > row.rawB
                : row.rawA < row.rawB;
            const bWins =
              row.winMode === "higher"
                ? row.rawB > row.rawA
                : row.rawB < row.rawA;
            const isDelta = row.delta !== "—";
            const isPositiveDelta = row.delta.startsWith("+");

            return (
              <div
                key={row.label}
                className={`grid grid-cols-[1fr_1fr_auto_1fr] gap-2 items-center px-3 py-2.5 rounded-xl ${
                  idx % 2 === 0 ? "bg-ink-800/30" : ""
                }`}
              >
                {/* Label */}
                <span className="text-ink-400 text-[11px] font-medium">
                  {row.label}
                </span>

                {/* Value A */}
                <span
                  className={`font-mono text-[12px] font-bold text-center ${
                    aWins ? accentColor : "text-ink-300"
                  }`}
                >
                  {row.valueA}
                </span>

                {/* Delta badge */}
                <div className="w-14 flex items-center justify-center">
                  {isDelta ? (
                    <span
                      className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                        isPositiveDelta
                          ? "bg-green-soft text-green border border-green-line"
                          : "bg-danger-soft text-danger border border-danger-line"
                      }`}
                    >
                      {row.delta}
                    </span>
                  ) : (
                    <span className="text-ink-600 text-[10px]">—</span>
                  )}
                </div>

                {/* Value B */}
                <span
                  className={`font-mono text-[12px] font-bold text-center ${
                    bWins ? accentColor : "text-ink-300"
                  }`}
                >
                  {row.valueB}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ──────────────── Night Selector ──────────────── */

function NightSelector({
  label,
  nights,
  value,
  onChange,
  accentColor,
}: {
  label: string;
  nights: EventSummary[];
  value: number;
  onChange: (idx: number) => void;
  accentColor: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentColor}`}
      >
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full appearance-none bg-ink-850 border border-ink-700 rounded-xl px-3 py-2 pr-8 text-ink-50 text-[12px] font-medium cursor-pointer focus:outline-none focus:border-ink-600 transition-colors"
        >
          {nights.map((n, idx) => (
            <option key={n.id} value={idx}>
              {formatNightDate(n.closedAt ?? n.startedAt)} —{" "}
              {formatMoney(n.totals.total)}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none"
        />
      </div>
    </div>
  );
}
