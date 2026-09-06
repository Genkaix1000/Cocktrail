"use client";

import { useId, useState, useMemo } from "react";
import {
  GitCompareArrows,
  ChevronDown,
  FileText,
  User,
  Banknote,
  QrCode,
  Ticket,
  Clock,
  Wine,
} from "lucide-react";
import type { UnifiedNightDay } from "@/lib/analytics";
import { formatNightDateLong, formatEventDuration } from "@/lib/analytics";
import { formatHm, formatMoney } from "@/lib/utils";
import { displayRevenue } from "@cocktrail/shared";

type Props = {
  nights: UnifiedNightDay[];
  isBosko: boolean;
  onRedirectToLogs: (ts: number) => void;
};

function formatNightDate(ts: number): string {
  const d = new Date(ts);
  const wd = d.toLocaleDateString("es-AR", { weekday: "short" }).replace(/[.,]/g, "");
  const mo = d.toLocaleDateString("es-AR", { month: "short" });
  return `${wd} ${d.getDate()} ${mo}`;
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
  const totalA = displayRevenue(a.totals);
  const totalB = displayRevenue(b.totals);
  const ticketsA = a.orderCounter;
  const ticketsB = b.orderCounter;
  const qrSalesA = a.totals.qrTotal;
  const qrSalesB = b.totals.qrTotal;
  const efA = a.totals.efectivoTotal;
  const efB = b.totals.efectivoTotal;
  const topA = a.totals.drinksSold[0];
  const topB = b.totals.drinksSold[0];
  const durA = getDurationMs(a);
  const durB = getDurationMs(b);

  const revenueLabel =
    a.totals.netTotal != null || b.totals.netTotal != null
      ? "Ingreso neto"
      : "Recaudado";

  return [
    {
      label: revenueLabel,
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
      label: "QR",
      valueA: formatMoney(qrSalesA),
      valueB: formatMoney(qrSalesB),
      rawA: qrSalesA,
      rawB: qrSalesB,
      winMode: "higher",
      delta: computeDeltaPct(qrSalesA, qrSalesB),
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

const cardShell =
  "bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-card";

/**
 * Selector único de Historial de Noches: elegir 1 noche muestra su detalle
 * (totales + sesiones individuales, lo que antes vivía en un popup aparte),
 * elegir una 2da noche muestra la comparación lado a lado. Reemplaza la
 * tabla "Detalle por Noche" + su popup (ver
 * docs/specs/features/simplificar-historial-noches.md).
 */
export default function NightComparator({ nights, isBosko, onRedirectToLogs }: Props) {
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
      <div className={`${cardShell} p-5`}>
        <SectionHeader isComparing={false} />
        <div className="flex items-center justify-center py-8">
          <p className="text-[var(--text-tertiary)] text-[13px] text-center">
            Todavía no hay noches archivadas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${cardShell} p-5`}>
      <SectionHeader isComparing={isComparing} />

      <div className="grid grid-cols-2 gap-3 mb-5">
        <NightSelector
          label="Noche A"
          nights={sortedNights}
          value={idxA}
          onChange={setIdxA}
        />
        <NightSelector
          label="Noche B"
          nights={sortedNights}
          value={idxB}
          onChange={setIdxB}
          allowNone
        />
      </div>

      {isComparing && nightA && nightB ? (
        <div className="flex flex-col gap-0">
          <div className="grid grid-cols-[1fr_1fr_auto_1fr] gap-2 mb-2 px-1">
            <div />
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-center text-[var(--accent-text)]">
              {formatNightDate(nightA.closedAt ?? nightA.startedAt)}
            </div>
            <div className="w-14" />
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-center text-[var(--accent-text)]">
              {formatNightDate(nightB.closedAt ?? nightB.startedAt)}
            </div>
          </div>

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
                  idx % 2 === 0 ? "bg-[var(--bg-panel)]" : ""
                }`}
              >
                <span className="text-[var(--text-secondary)] text-[12px] font-medium">
                  {row.label}
                </span>

                <span
                  className={`font-mono text-[13px] font-bold text-center tabular ${
                    aWins ? "text-[var(--accent-text)]" : "text-[var(--text-primary)]"
                  }`}
                >
                  {row.valueA}
                </span>

                <div className="w-14 flex items-center justify-center">
                  {isDelta ? (
                    <span
                      className={`font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        isPositiveDelta
                          ? "bg-[var(--success-soft)] text-[var(--success-base)]"
                          : "bg-[var(--danger-soft)] text-[var(--danger-base)]"
                      }`}
                    >
                      {row.delta}
                    </span>
                  ) : (
                    <span className="text-[var(--text-tertiary)] text-[10px]">—</span>
                  )}
                </div>

                <span
                  className={`font-mono text-[13px] font-bold text-center tabular ${
                    bWins ? "text-[var(--accent-text)]" : "text-[var(--text-primary)]"
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

function SectionHeader({ isComparing }: { isComparing: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-full border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-primary)]">
        <GitCompareArrows size={15} strokeWidth={1.8} />
      </div>
      <div>
        <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
          Detalle de Noches
        </h3>
        <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
          {isComparing ? "Comparando dos noches" : "Elegí una segunda noche para comparar"}
        </p>
      </div>
    </div>
  );
}

function NightDetailView({
  night,
  isBosko: _isBosko,
  onRedirectToLogs,
}: {
  night: UnifiedNightDay;
  isBosko: boolean;
  onRedirectToLogs: (ts: number) => void;
}) {
  const topDrink = night.totals.drinksSold[0];
  const hasSingleSession = night.sessions.length === 1;
  const singleSession = hasSingleSession ? night.sessions[0] : undefined;

  const metrics = [
    {
      icon: Banknote,
      label: night.totals.netTotal != null ? "Ingreso neto" : "Recaudado",
      value: `$${displayRevenue(night.totals).toLocaleString("es-AR")}`,
      accent: true,
    },
    {
      icon: QrCode,
      label: "QR",
      value: `$${night.totals.qrTotal.toLocaleString("es-AR")}`,
      sub: `${night.totals.qrCount}`,
    },
    {
      icon: Banknote,
      label: "Efectivo",
      value: `$${night.totals.efectivoTotal.toLocaleString("es-AR")}`,
      sub: `${night.totals.efectivoCount}`,
    },
    {
      icon: Ticket,
      label: "Tickets Emitidos",
      value: String(night.orderCounter),
    },
    {
      icon: Wine,
      label: "Top Trago",
      value: topDrink ? `${topDrink.name} (×${topDrink.qty})` : "—",
    },
    {
      icon: Clock,
      label: "Duración",
      value: formatEventDuration(night.startedAt, night.closedAt),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h4 className="text-[16px] font-semibold text-[var(--text-primary)]">
          Noche del {formatNightDateLong(night.closedAt ?? night.startedAt)}
        </h4>
        <p className="text-[12px] text-[var(--text-secondary)] font-mono mt-0.5">
          {hasSingleSession && singleSession ? (
            <>
              {formatHm(singleSession.startedAt)} hs →{" "}
              {singleSession.closedAt ? `${formatHm(singleSession.closedAt)} hs` : "Abierto"}
              {" · "}Cerrado por: {singleSession.closedBy || "desconocido"}
            </>
          ) : (
            <>{night.sessions.length} sesiones unificadas</>
          )}
        </p>
      </div>

      {/* Grid estilo CloseNightModal / Dashboard KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className={`rounded-2xl p-4 border flex flex-col gap-2 min-w-0 ${
                m.accent
                  ? "bg-[var(--accent-primary)] dark:bg-[var(--accent-featured)] border-transparent text-[var(--text-on-accent)]"
                  : "bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-primary)]"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Icon
                  size={13}
                  strokeWidth={1.8}
                  className={m.accent ? "text-white/70" : "text-[var(--accent-primary)]"}
                />
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                    m.accent ? "text-white/70" : "text-[var(--text-tertiary)]"
                  }`}
                >
                  {m.label}
                </span>
              </div>
              <span className="font-mono text-[18px] font-bold tabular leading-tight truncate">
                {m.value}
              </span>
              {m.sub && (
                <span
                  className={`text-[11px] font-mono tabular ${
                    m.accent ? "text-white/55" : "text-[var(--text-tertiary)]"
                  }`}
                >
                  {m.sub}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {night.totals.drinksSold.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
            Tragos vendidos
          </span>
          <div className="flex gap-2 flex-wrap">
            {night.totals.drinksSold.map((d) => (
              <span
                key={d.drinkId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)]"
              >
                <span className="font-mono font-bold text-[var(--accent-text)]">×{d.qty}</span>
                <span>{d.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {!hasSingleSession && (
        <div className="space-y-3">
          <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-[0.12em] block">
            Detalle de Sesiones Individuales
          </span>

          {night.sessions.map((session, sIdx) => (
            <div
              key={session.id}
              className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-4 flex flex-col gap-3"
            >
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-xs bg-[var(--accent-surface)] text-[var(--accent-text)]">
                    {sIdx + 1}
                  </span>
                  <span className="text-xs font-mono text-[var(--text-secondary)]">
                    {formatHm(session.startedAt)} hs →{" "}
                    {session.closedAt ? `${formatHm(session.closedAt)} hs` : "Abierto"}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                  <User size={11} />
                  <span>Cerrado por: {session.closedBy || "desconocido"}</span>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    {session.totals.netTotal != null ? "Ingreso neto" : "Recaudado"}
                  </span>
                  <span className="text-[var(--text-primary)] font-bold tabular">
                    ${displayRevenue(session.totals).toLocaleString("es-AR")}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    QR
                  </span>
                  <span className="text-[var(--text-secondary)] tabular">
                    ${session.totals.qrTotal.toLocaleString("es-AR")} ({session.totals.qrCount})
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    Efectivo
                  </span>
                  <span className="text-[var(--text-secondary)] tabular">
                    ${session.totals.efectivoTotal.toLocaleString("es-AR")} ({session.totals.efectivoCount})
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                    Tickets
                  </span>
                  <span className="text-[var(--text-secondary)] tabular">{session.orderCounter}</span>
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
          className="h-10 px-5 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] text-[13px] font-semibold flex items-center gap-2 transition-all cursor-pointer select-none active:scale-[0.98]"
        >
          <FileText size={14} strokeWidth={1.8} />
          <span>Ver Auditoría de Tickets</span>
        </button>
      </div>
    </div>
  );
}

function NightSelector({
  label,
  nights,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  nights: UnifiedNightDay[];
  value: number;
  onChange: (idx: number) => void;
  allowNone?: boolean;
}) {
  const selectId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={selectId}
        className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-text)]"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full appearance-none bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 pr-8 text-[var(--text-primary)] text-[13px] font-medium cursor-pointer focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
        >
          {allowNone && (
            <option value={NONE}>— Ver solo Noche A —</option>
          )}
          {nights.map((n, idx) => (
            <option key={idx} value={idx}>
              {formatNightDate(n.closedAt ?? n.startedAt)} —{" "}
              {formatMoney(displayRevenue(n.totals))}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
        />
      </div>
    </div>
  );
}
