"use client";

import { Banknote, Loader2, X } from "lucide-react";
import { type FormEvent, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function CashSaleModal({ open, onClose }: Props) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function reset() {
    setAmount("");
    setDescription("");
    setError(null);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Ingresá un monto positivo");
      }
      const res = await fetch("/api/cash-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsed,
          description: description.trim() || "Venta directa en barra",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo registrar la venta");
      }
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0f172a] border border-[#1e293b] w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center justify-center">
              <Banknote size={20} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight leading-none">
                Venta en efectivo
              </h2>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">
                Cobro directo en barra
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

        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Monto
            </span>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">
                $
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={100}
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-[#020617] border border-[#1e293b] rounded-xl pl-9 pr-4 py-3 text-white outline-none focus:border-emerald-500/60 transition-colors"
                placeholder="5500"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Descripción (opcional)
            </span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-[#020617] border border-[#1e293b] rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/60 transition-colors"
              placeholder="2 Fernet"
            />
          </label>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !amount}
            className="mt-2 h-12 bg-emerald-500 text-emerald-950 font-black rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-emerald-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Registrando…
              </>
            ) : (
              <>
                <Banknote size={16} strokeWidth={3} />
                Registrar venta
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
