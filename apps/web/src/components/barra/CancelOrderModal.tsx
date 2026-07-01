"use client";

import { AlertTriangle, MoreHorizontal, Slash } from "lucide-react";
import { useState } from "react";

import { ordersService } from "@/services/orders.service";
import type { Order } from "@cocktrail/shared";
import type { FlashData } from "./types";

type Props = {
  order: Order;
  onClose: () => void;
  /** Tras cancelar OK, para que el shell refresque `fetchPendingOrders`. */
  onConfirmed: () => void;
  triggerFlash: (data: FlashData) => void;
};

const CANCEL_REASONS = [
  { reason: "No podia canjearlo", label: "No podía canjearlo", icon: Slash },
  { reason: "No se canceló", label: "No se canceló", icon: AlertTriangle },
  { reason: "Otro", label: "Otro motivo", icon: MoreHorizontal },
] as const;

/**
 * Modal de dos pasos (confirmar → elegir motivo) de cancelación de ticket.
 * `step`/`reason`/`cancelling` quedan como estado local del componente en vez
 * de props controladas por el shell: siempre arrancan igual cuando se abre
 * (un pedido nuevo en `order`), así que no hay motivo para que el shell los
 * coordine — evita prop-drilling de 3 pares estado/setter.
 *
 * `customReason` (estado del shell original) se eliminó: un grep confirmó que
 * nunca se leía en el JSX — los 3 motivos son botones fijos, no hay textarea
 * de texto libre pese a lo que sugiere el nombre. Código muerto preexistente.
 */
export default function CancelOrderModal({ order, onClose, onConfirmed, triggerFlash }: Props) {
  const [step, setStep] = useState<"confirm" | "reason">("confirm");
  const [reason, setReason] = useState<string>("");
  const [cancelling, setCancelling] = useState(false);

  async function handleConfirmCancellation() {
    if (cancelling) return;

    setCancelling(true);
    try {
      await ordersService.updateStatus(order.id, "cancelado");
      triggerFlash({
        type: "duplicate",
        message: `Pedido #${order.displayNumber} cancelado por: "${reason}"`,
        displayNumber: order.displayNumber,
        items: order.items,
      });
      onConfirmed();
    } catch (err) {
      triggerFlash({
        type: "error",
        message: err instanceof Error ? err.message : "Error al cancelar ticket",
      });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-ink-900 border border-ink-800 w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col gap-5">
        {step === "confirm" ? (
          <>
            <div className="flex flex-col gap-1.5 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-soft border border-amber-line flex items-center justify-center text-amber">
                <AlertTriangle size={22} />
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight font-sans">
                ¿Cancelar este ticket?
              </h2>
              <p className="text-xs text-ink-400 font-sans">
                Esta acción modificará el estado del pedido a cancelado en el sistema.
              </p>
            </div>

            <div className="bg-ink-950/60 border border-ink-800 rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex justify-between items-center border-b border-ink-800 pb-2">
                <span className="font-mono text-sm font-black text-white">Pedido #{order.displayNumber}</span>
                <span className="font-mono text-[10px] text-ink-500">{order.token}</span>
              </div>
              <ul className="space-y-1.5">
                {order.items.map((it, idx) => (
                  <li key={idx} className="text-xs text-ink-300">
                    {it.qty}x <strong className="text-white font-semibold">{it.name}</strong>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-xl bg-ink-800 border border-ink-700 text-xs font-bold uppercase tracking-wider text-ink-300 hover:text-white transition-all cursor-pointer"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => setStep("reason")}
                className="flex-grow-[1.5] h-11 rounded-xl bg-danger-soft border border-danger-line text-xs font-bold uppercase tracking-wider text-danger hover:brightness-115 transition-all cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5 text-center">
              <h2 className="text-lg font-bold text-white tracking-tight">
                Motivo de la cancelación
              </h2>
              <p className="text-xs text-white">
                Por favor, selecciona por qué se cancela el ticket #{order.displayNumber}.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 my-2">
              {CANCEL_REASONS.map(({ reason: r, label, icon: Icon }) => {
                const isSelected = reason === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`aspect-square flex flex-col items-center justify-center gap-3 p-2 rounded-2xl border transition-all cursor-pointer text-center ${
                      isSelected
                        ? "bg-purple-500/20 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                        : "bg-ink-850 border-ink-750 text-ink-300 hover:text-white hover:border-ink-600"
                    }`}
                  >
                    <Icon size={24} className={isSelected ? "text-purple-400" : "text-ink-400"} />
                    <span className="text-[11px] font-bold text-white leading-tight">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={() => setStep("confirm")}
                className="flex-1 h-11 rounded-xl bg-ink-800 border border-ink-700 text-xs font-bold uppercase tracking-wider text-ink-300 hover:text-white transition-all cursor-pointer"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={handleConfirmCancellation}
                disabled={!reason || cancelling}
                className="flex-grow-[1.5] h-11 rounded-xl bg-danger border border-danger-line text-white font-black text-xs uppercase tracking-wider disabled:opacity-50 hover:brightness-110 transition-all cursor-pointer flex items-center justify-center"
              >
                {cancelling ? "Cancelando..." : "Confirmar Cancelación"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
