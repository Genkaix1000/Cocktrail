"use client";

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { formatHm } from "@/lib/utils";
import type { EventSummary, EventTotals } from "@/types/domain";

type Props = {
  open: boolean;
  totals: EventTotals;
  pendingDeliveries: number;
  startedAt: number;
  summary: EventSummary | null;
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export default function CloseNightModal({
  open,
  totals,
  pendingDeliveries,
  startedAt,
  summary,
  onConfirm,
  onClose,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isSummary = summary !== null;

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cerrar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-ink-900 border border-ink-800 w-full max-w-md rounded-[22px] p-6 shadow-2xl animate-in slide-in-from-bottom-10">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isSummary
                  ? "bg-green-soft border-green-line"
                  : "bg-amber-soft border-amber-line"
              }`}
            >
              {isSummary ? (
                <CheckCircle2 size={20} className="text-green" />
              ) : (
                <AlertTriangle size={20} className="text-amber" />
              )}
            </div>
            <div>
              <h2 className="font-serif-italic text-[22px] text-ink-50 leading-none">
                {isSummary ? "Noche cerrada" : "Cerrar noche"}
              </h2>
              <p className="text-[10px] text-ink-400 uppercase tracking-[0.18em] font-medium mt-1.5">
                {isSummary ? "Resumen archivado" : "Acción irreversible"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="p-2 bg-ink-800 rounded-full text-ink-300 hover:text-ink-50 disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {isSummary ? (
          <SummaryView summary={summary!} onClose={onClose} />
        ) : (
          <ConfirmView
            totals={totals}
            pendingDeliveries={pendingDeliveries}
            startedAt={startedAt}
            submitting={submitting}
            error={error}
            onCancel={onClose}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── ConfirmView ───────────────────────────

function ConfirmView({
  totals,
  pendingDeliveries,
  startedAt,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  totals: EventTotals;
  pendingDeliveries: number;
  startedAt: number;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <p className="text-sm text-ink-300 mb-4 leading-relaxed">
        Vas a archivar el evento iniciado a las{" "}
        <span className="text-ink-50 font-mono tabular">
          {formatHm(startedAt)}
        </span>
        . Esta acción es definitiva.
      </p>

      <TotalsBlock totals={totals} />

      {pendingDeliveries > 0 && (
        <div className="mt-4 flex items-start gap-2 text-sm text-amber bg-amber-soft border border-amber-line rounded-xl px-3 py-2.5">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Tenés <strong>{pendingDeliveries}</strong> pedido
            {pendingDeliveries === 1 ? "" : "s"} sin entregar. Se archivarán
            igual.
          </span>
        </div>
      )}

      {error && (
        <div className="mt-4 text-sm text-danger bg-danger-soft border border-danger-line rounded-xl px-3 py-2.5">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 h-12 rounded-xl bg-ink-800 text-ink-100 font-medium text-sm uppercase tracking-[0.14em] hover:bg-ink-750 active:scale-95 transition-all disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="flex-1 h-12 rounded-xl bg-danger text-ink-50 font-semibold text-sm uppercase tracking-[0.14em] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Cerrando…
            </>
          ) : (
            "Confirmar cierre"
          )}
        </button>
      </div>
    </>
  );
}

// ─────────────────────────── SummaryView ───────────────────────────

function SummaryView({
  summary,
  onClose,
}: {
  summary: EventSummary;
  onClose: () => void;
}) {
  const duration =
    summary.closedAt && summary.startedAt
      ? formatDuration(summary.closedAt - summary.startedAt)
      : "—";

  const totalDrinks = summary.totals.drinksSold.reduce(
    (s, d) => s + d.qty,
    0,
  );

  return (
    <>
      <p className="text-sm text-ink-300 mb-4 leading-relaxed">
        El evento se archivó. Estos son los números finales.
      </p>

      <TotalsBlock totals={summary.totals} />

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Tragos" value={totalDrinks.toString()} />
        <Stat label="Pedidos" value={summary.orders.length.toString()} />
        <Stat label="Ventas $" value={summary.cashSales.length.toString()} />
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-ink-400 bg-ink-850 border border-ink-800 rounded-xl px-4 py-2.5">
        <span className="uppercase tracking-[0.18em] font-medium">Duración</span>
        <span className="font-mono text-ink-50 tabular">{duration}</span>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full h-12 rounded-xl bg-blue text-ink-950 font-semibold text-sm uppercase tracking-[0.14em] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all"
      >
        <Sparkles size={16} strokeWidth={2.5} />
        Empezar nueva noche
      </button>
    </>
  );
}

// ─────────────────────────── helpers ───────────────────────────

function TotalsBlock({ totals }: { totals: EventTotals }) {
  return (
    <div className="bg-ink-850 border border-ink-800 rounded-2xl divide-y divide-ink-800">
      <Row
        icon={<CreditCard size={14} className="text-blue" />}
        label="Transferencia"
        count={totals.transferenciaCount}
        value={totals.transferenciaTotal}
      />
      <Row
        icon={<Banknote size={14} className="text-green" />}
        label="Efectivo"
        count={totals.efectivoCount}
        value={totals.efectivoTotal}
      />
      <div className="flex items-center justify-between px-4 py-3 bg-blue-soft">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-blue">
          Total noche
        </span>
        <span className="font-mono text-xl text-ink-50 tabular">
          ${totals.total.toLocaleString("es-AR")}
        </span>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  count,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2 text-ink-200">
        {icon}
        <span className="text-xs font-medium uppercase tracking-[0.18em]">
          {label}
        </span>
        <span className="text-[10px] text-ink-400">({count})</span>
      </div>
      <span className="font-mono text-sm text-ink-50 tabular">
        ${value.toLocaleString("es-AR")}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-850 border border-ink-800 rounded-xl px-3 py-2.5 text-center">
      <div className="text-[9px] text-ink-400 uppercase tracking-[0.18em] font-medium mb-1">
        {label}
      </div>
      <div className="font-serif-italic text-[22px] text-ink-50 tabular">
        {value}
      </div>
    </div>
  );
}
