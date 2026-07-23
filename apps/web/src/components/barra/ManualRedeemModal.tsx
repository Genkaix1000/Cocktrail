"use client";

import { Hand } from "lucide-react";

import type { Order } from "@cocktrail/shared";

function getPendingStatus(status: Order["status"]) {
  switch (status) {
    case "entregado":
      return { label: "Entregado", className: "bg-green-soft text-green border-green-line" };
    case "cancelado":
      return { label: "Cancelado", className: "bg-danger-soft text-danger border-danger-line" };
    default:
      return { label: "Pendiente", className: "bg-amber-soft text-amber border-amber-line" };
  }
}

type Props = {
  order: Order;
  /** Estación que hace el canje, para el copy de confirmación. */
  barCode: string;
  redeeming: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * Modal de confirmación de canje manual de un pedido pendiente (tocado desde
 * `PendingOrdersList`). El estado (`manualRedeemOrder`/`manualRedeeming`) sigue
 * viviendo en el shell porque `PendingOrdersList` necesita abrir este modal
 * seteándolo — acá solo se recibe el pedido ya resuelto y un `onConfirm` que
 * dispara `handleManualRedeemConfirm` (queda en el shell, coordina
 * `useOfflineScanQueue.handleScan` + cierre del modal). Extraído sin cambios
 * de comportamiento (spec auditoria-web, tarea 10).
 */
export default function ManualRedeemModal({ order, barCode, redeeming, onClose, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-ink-900 border border-ink-800 w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-soft border border-blue-line flex items-center justify-center text-blue">
            <Hand size={22} />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            ¿Canjear pedido manualmente?
          </h2>
          <p className="text-xs text-ink-400">
            Se registrará como entrega manual desde {barCode}.
          </p>
        </div>

        <div className="bg-ink-950/60 border border-ink-800 rounded-2xl p-4 flex flex-col gap-2">
          <div className="flex justify-between items-center border-b border-ink-800 pb-2">
            <span className="font-mono text-sm font-black text-white">
              Pedido #{order.displayNumber}
            </span>
            <span className="text-[10px] font-mono text-ink-500 uppercase">
              {getPendingStatus(order.status).label}
            </span>
          </div>
          <ul className="space-y-1.5">
            {order.items.map((it, idx) => (
              <li key={idx} className="text-xs text-ink-300">
                {it.qty}× <strong className="text-white font-semibold">{it.name}</strong>
              </li>
            ))}
          </ul>
          <div className="flex justify-between pt-2 border-t border-ink-800 text-xs font-mono">
            <span className="text-ink-500">Total</span>
            <span className="text-ink-200 font-bold tabular">
              ${order.total.toLocaleString("es-AR")}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={redeeming}
            className="flex-1 h-11 rounded-xl bg-ink-800 border border-ink-700 text-xs font-bold uppercase tracking-wider text-ink-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={redeeming}
            className="flex-grow-[1.5] h-11 rounded-xl bg-green-soft border border-green-line text-xs font-bold uppercase tracking-wider text-green hover:brightness-115 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {redeeming ? "Canjeando..." : "Confirmar canje"}
          </button>
        </div>
      </div>
    </div>
  );
}
