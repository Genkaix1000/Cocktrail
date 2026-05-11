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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f172a] border border-[#1e293b] w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isSummary
                  ? "bg-emerald-500/15 border-emerald-500/30"
                  : "bg-amber-500/15 border-amber-500/30"
              }`}
            >
              {isSummary ? (
                <CheckCircle2 size={20} className="text-emerald-400" />
              ) : (
                <AlertTriangle size={20} className="text-amber-400" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight leading-none">
                {isSummary ? "Noche cerrada" : "Cerrar noche"}
              </h2>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">
                {isSummary ? "Resumen archivado" : "Acción irreversible"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="p-2 bg-[#1e293b] rounded-full text-slate-400 hover:text-white disabled:opacity-40"
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
      <p className="text-sm text-slate-400 mb-4">
        Vas a archivar el evento iniciado a las{" "}
        <span className="text-white font-mono">
          {new Date(startedAt).toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        . Esta acción es definitiva.
      </p>

      <TotalsBlock totals={totals} />

      {pendingDeliveries > 0 && (
        <div className="mt-4 flex items-start gap-2 text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Tenés <strong>{pendingDeliveries}</strong> pedido
            {pendingDeliveries === 1 ? "" : "s"} sin entregar. Se archivarán
            igual.
          </span>
        </div>
      )}

      {error && (
        <div className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 h-12 rounded-xl bg-[#1e293b] text-slate-200 font-bold text-sm uppercase tracking-wider hover:bg-[#334155] active:scale-95 transition-all disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="flex-1 h-12 rounded-xl bg-red-500 text-red-50 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-red-400 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
      <p className="text-sm text-slate-400 mb-4">
        El evento se archivó. Estos son los números finales.
      </p>

      <TotalsBlock totals={summary.totals} />

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Tragos" value={totalDrinks.toString()} />
        <Stat
          label="Pedidos"
          value={summary.orders.length.toString()}
        />
        <Stat
          label="Ventas $"
          value={summary.cashSales.length.toString()}
        />
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500 bg-[#020617]/50 border border-[#1e293b] rounded-xl px-4 py-2.5">
        <span className="uppercase tracking-widest font-bold">Duración</span>
        <span className="font-mono text-white">{duration}</span>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full h-12 rounded-xl bg-[#38bdf8] text-[#020617] font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#7dd3fc] active:scale-95 transition-all"
      >
        <Sparkles size={16} strokeWidth={3} />
        Empezar nueva noche
      </button>
    </>
  );
}

// ─────────────────────────── helpers ───────────────────────────

function TotalsBlock({ totals }: { totals: EventTotals }) {
  return (
    <div className="bg-[#020617]/50 border border-[#1e293b] rounded-2xl divide-y divide-[#1e293b]/60">
      <Row
        icon={<CreditCard size={14} className="text-[#38bdf8]" />}
        label="Transferencia"
        count={totals.transferenciaCount}
        value={totals.transferenciaTotal}
      />
      <Row
        icon={<Banknote size={14} className="text-emerald-400" />}
        label="Efectivo"
        count={totals.efectivoCount}
        value={totals.efectivoTotal}
      />
      <div className="flex items-center justify-between px-4 py-3 bg-[#38bdf8]/5">
        <span className="text-xs font-black uppercase tracking-widest text-[#38bdf8]">
          Total noche
        </span>
        <span className="font-mono text-xl font-black text-white">
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
      <div className="flex items-center gap-2 text-slate-300">
        {icon}
        <span className="text-xs font-bold uppercase tracking-widest">
          {label}
        </span>
        <span className="text-[10px] text-slate-500">({count})</span>
      </div>
      <span className="font-mono text-sm font-bold text-white">
        ${value.toLocaleString("es-AR")}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#020617]/50 border border-[#1e293b] rounded-xl px-3 py-2.5 text-center">
      <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1">
        {label}
      </div>
      <div className="text-lg font-black text-white">{value}</div>
    </div>
  );
}
