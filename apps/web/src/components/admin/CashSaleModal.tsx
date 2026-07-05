"use client";

import { Banknote, Loader2, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { cashSalesService } from "@/services/cash-sales.service";

type Props = {
  onClose: () => void;
};

export default function CashSaleModal({ onClose }: Props) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await cashSalesService.add({
        amount: parsed,
        description: description.trim() || "Venta directa en barra",
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-ink-900 border border-ink-800 w-full max-w-md rounded-[22px] p-6 shadow-2xl animate-in slide-in-from-bottom-10">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-soft border border-green-line rounded-xl flex items-center justify-center">
              <Banknote size={20} className="text-green" />
            </div>
            <div>
              <h2 className="font-serif-italic text-[22px] text-ink-50 leading-none">
                Venta en efectivo
              </h2>
              <p className="text-[10px] text-ink-400 uppercase tracking-[0.18em] font-medium mt-1.5">
                Cobro directo en barra
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

        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">
              Monto
            </span>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 font-medium">
                $
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step="any"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-ink-850 border border-ink-750 rounded-xl pl-9 pr-4 py-3 text-ink-50 outline-none focus:border-green-line transition-colors tabular font-mono"
                placeholder="5500"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">
              Descripción (opcional)
            </span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-ink-850 border border-ink-750 rounded-xl px-4 py-3 text-ink-50 outline-none focus:border-green-line transition-colors"
              placeholder="2 Fernet"
            />
          </label>

          {error && (
            <div className="text-sm text-danger bg-danger-soft border border-danger-line rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !amount}
            className="mt-2 h-12 bg-green text-ink-950 font-semibold rounded-xl text-sm uppercase tracking-[0.14em] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Registrando…
              </>
            ) : (
              <>
                <Banknote size={16} strokeWidth={2.5} />
                Registrar venta
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
