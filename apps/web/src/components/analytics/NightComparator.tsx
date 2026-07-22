"use client";

import { useId, useState, useMemo } from "react";
import { GitCompareArrows, ChevronDown, FileText, User } from "lucide-react";
import type { UnifiedNightDay } from "@/lib/analytics";
import { formatNightDateLong, formatEventDuration } from "@/lib/analytics";
import { getAccentColors } from "@/lib/accentColors";
import { formatHm } from "@/lib/utils";

type Props = {
  nights: UnifiedNightDay[];
  isBosko: boolean;
  // Puente Historial → Logs: mismo callback que antes vivía en el popup de
  // HistorialSection.tsx — este componente absorbió ese contenido al
  // unificarse con el selector (ver docs/specs/features/simplificar-historial-noches.md).
  onRedirectToLogs: (ts: number) => void;
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

function getDurationMs(e: UnifiedNightDay): number | null {
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

function buildRows(a: UnifiedNightDay, b: UnifiedNightDay): ComparisonRow[] {
  const totalA = a.totals.total;
  const totalB = b.totals.total;

  const ticketsA = a.orderCounter;
  const ticketsB = b.orderCounter;

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

/** Sentinel de "sin segunda noche seleccionada" — ver Noche B en el selector. */
const NONE = -1;

/**
 * Selector único de Historial de Noches: elegir 1 noche muestra su detalle
 * (totales + sesiones individuales, lo que antes vivía en un popup aparte),
 * elegir una 2da noche muestra la comparación lado a lado. Reemplaza la
 * tabla "Detalle por Noche" + su popup (ver
 * docs/specs/features/simplificar-historial-noches.md).
 */
export default function NightComparator({ nights, isBosko, onRedirectToLogs }: Props) {
  const { accentColor, accentBg, accentBorder } = getAccentColors(isBosko);

  const sortedNights = useMemo(
    () =>
      [...nights]
        .filter((n) => n.closedAt)
        .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)),
    [nights],
  );

  const [idxA, setIdxA] = useState(0);
  const [idxB, setIdxB] = useState(NONE);

  const nightA = sortedNights[idxA];
  const nightB = idxB !== NONE ? sortedNights[idxB] : undefined;
  const isComparing = nightB !== undefined;

  const rows = useMemo(() => {
    if (!nightA || !nightB) return [];
    return buildRows(nightA, nightB);
  }, [nightA, nightB]);

  if (sortedNights.length === 0) {
    return (
      <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5">
        <SectionHeader accentColor={accentColor} accentBg={accentBg} accentBorder={accentBorder} isComparing={false} />
        <div className="flex items-center justify-center py-8">
          <p className="text-ink-500 text-[12px] text-center">
            Todavía no hay noches archivadas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5">
      <SectionHeader accentColor={accentColor} accentBg={accentBg} accentBorder={accentBorder} isComparing={isComparing} />

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
          allowNone
        />
      </div>

      {isComparing && nightA && nightB ? (
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
                <span className="text-ink-400 text-[11px] font-medium">
                  {row.label}
                </span>

                <span
                  className={`font-mono text-[12px] font-bold text-center ${
                    aWins ? accentColor : "text-ink-300"
                  }`}
                >
                  {row.valueA}
                </span>

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
      ) : (
        nightA && (
          <NightDetailView
            night={nightA}
            isBosko={isBosko}
            onRedirectToLogs={onRedirectToLogs}
          />
        )
      )}
    </div>
  );
}

/* ──────────────── Section Header ──────────────── */

function SectionHeader({
  accentColor,
  accentBg,
  accentBorder,
  isComparing,
}: {
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  isComparing: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <div
        className={`w-8 h-8 rounded-xl ${accentBg} border ${accentBorder} flex items-center justify-center`}
      >
        <GitCompareArrows size={15} className={accentColor} />
      </div>
      <div>
        <h3 className="text-ink-50 text-[13px] font-semibold">
          Detalle de Noches
        </h3>
        <p className="text-ink-500 text-[10px] uppercase tracking-[0.18em] font-bold mt-0.5">
          {isComparing ? "Comparando dos noches" : "Elegí una segunda noche para comparar"}
        </p>
      </div>
    </div>
  );
}

/* ──────────────── Night Detail View (ex-popup de HistorialSection) ──────────────── */

function NightDetailView({
  night,
  isBosko,
  onRedirectToLogs,
}: {
  night: UnifiedNightDay;
  isBosko: boolean;
  onRedirectToLogs: (ts: number) => void;
}) {
  const topDrink = night.totals.drinksSold[0];
  const hasSingleSession = night.sessions.length === 1;
  const singleSession = hasSingleSession ? night.sessions[0] : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h4 className="font-serif-italic text-[16px] text-ink-50">
          Noche del {formatNightDateLong(night.closedAt ?? night.startedAt)}
        </h4>
        <p className="text-[11px] text-ink-400 font-mono mt-0.5">
          {hasSingleSession && singleSession ? (
            <>
              {formatHm(singleSession.startedAt)} hs → {singleSession.closedAt ? `${formatHm(singleSession.closedAt)} hs` : "Abierto"}
              {" · "}Cerrado por: {singleSession.closedBy || "desconocido"}
            </>
          ) : (
            <>{night.sessions.length} sesiones unificadas</>
          )}
        </p>
      </div>

      {/* Unified Totals */}
      <div className="bg-ink-950 border border-ink-800 rounded-2xl p-5 flex flex-col gap-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-400 border-b border-ink-850 pb-2">
          Totales Consolidados del Día
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400 font-mono">Recaudado</span>
            <span className="font-mono font-bold text-[20px] text-ink-50">
              ${night.totals.total.toLocaleString("es-AR")}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue font-mono">Web Total</span>
            <span className="font-mono text-[14px] text-ink-200">
              ${night.totals.webTotal.toLocaleString("es-AR")} <span className="text-ink-500 text-xs">({night.totals.webCount})</span>
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-green font-mono">Efectivo</span>
            <span className="font-mono text-[14px] text-ink-200">
              ${night.totals.efectivoTotal.toLocaleString("es-AR")} <span className="text-ink-500 text-xs">({night.totals.efectivoCount})</span>
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400 font-mono">Tickets Emitidos</span>
            <span className="font-mono text-[14px] text-ink-200">
              {night.orderCounter}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400 font-mono">Top Trago</span>
            <span className="font-mono text-[14px] text-ink-200 truncate">
              {topDrink ? `${topDrink.name} (×${topDrink.qty})` : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400 font-mono">Duración</span>
            <span className="font-mono text-[14px] text-ink-200">
              {formatEventDuration(night.startedAt, night.closedAt)}
            </span>
          </div>
        </div>

        {night.totals.drinksSold.length > 0 && (
          <div className="border-t border-ink-850 pt-3 flex flex-col gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">Tragos Vendidos en el Día</span>
            <div className="flex gap-2.5 flex-wrap">
              {night.totals.drinksSold.map((d) => (
                <span key={d.drinkId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-ink-900 border border-ink-800 text-[12px] text-ink-200">
                  <span className="font-mono font-bold text-accent">×{d.qty}</span>
                  <span>{d.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sessions — solo si hubo reapertura el mismo día; con 1 sola sesión ya se
          muestra el horario/cerrado-por arriba, repetirlo acá sería ruido. */}
      {!hasSingleSession && (
        <div className="space-y-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-400 block mb-1">
            Detalle de Sesiones Individuales
          </span>

          {night.sessions.map((session, sIdx) => (
            <div key={session.id} className="bg-ink-950/45 border border-ink-850 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-ink-850 pb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-xs ${isBosko ? "bg-[#4ade80]/10 text-[#4ade80]" : "bg-blue/10 text-blue"}`}>
                    {sIdx + 1}
                  </span>
                  <span className="text-xs font-mono text-ink-300">
                    {formatHm(session.startedAt)} hs → {session.closedAt ? `${formatHm(session.closedAt)} hs` : "Abierto"}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-ink-850 text-ink-300 border border-ink-750">
                  <User size={11} className="text-ink-400" />
                  <span>Cerrado por: {session.closedBy || "desconocido"}</span>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">Recaudado</span>
                  <span className="text-ink-100 font-bold">${session.totals.total.toLocaleString("es-AR")}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">Web</span>
                  <span className="text-ink-300">${session.totals.webTotal.toLocaleString("es-AR")} ({session.totals.webCount})</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">Efectivo</span>
                  <span className="text-ink-300">${session.totals.efectivoTotal.toLocaleString("es-AR")} ({session.totals.efectivoCount})</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">Tickets Emitidos</span>
                  <span className="text-ink-300">{session.orderCounter}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onRedirectToLogs(night.closedAt || night.startedAt)}
          className={`h-10 px-4.5 rounded-xl text-ink-950 text-xs font-black uppercase tracking-[0.08em] flex items-center gap-2 transition-all cursor-pointer select-none active:scale-[0.95] ${
            isBosko ? "bg-[#4ade80]" : "bg-blue"
          }`}
        >
          <FileText size={14} />
          <span>Ver Auditoría de Tickets</span>
        </button>
      </div>
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
  allowNone,
}: {
  label: string;
  nights: UnifiedNightDay[];
  value: number;
  onChange: (idx: number) => void;
  accentColor: string;
  allowNone?: boolean;
}) {
  const selectId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={selectId}
        className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accentColor}`}
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full appearance-none bg-ink-850 border border-ink-700 rounded-xl px-3 py-2 pr-8 text-ink-50 text-[12px] font-medium cursor-pointer focus:outline-none focus:border-ink-600 transition-colors"
        >
          {allowNone && (
            <option value={NONE}>— Ver solo Noche A —</option>
          )}
          {nights.map((n, idx) => (
            <option key={idx} value={idx}>
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
