"use client";

import { Inbox, Package, X } from "lucide-react";
import type { MouseEvent } from "react";

import type { CurrentUser } from "./types";
import type { Order } from "@cocktrail/shared";
import Toast from "@/components/shared/Toast";

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

type ToastNotification = {
  id: string;
  displayNumber: number;
  text: string;
  duration: number;
};

type Props = {
  pendingOrders: Order[];
  notifications: ToastNotification[];
  currentUser: CurrentUser;
  /** Abre el modal de canje manual (`ManualRedeemModal`) para el pedido tocado. */
  onSelectOrder: (order: Order) => void;
  onCancelClick: (order: Order, e: MouseEvent) => void;
  onDismissNotification: (id: string) => void;
};

/**
 * Sidebar "Tragos pendientes" de BarraClient.tsx — lista de pedidos pagados en
 * espera de canje, con el stack de toasts de nuevos pedidos flotando arriba.
 * Extraída sin cambios de comportamiento (spec auditoria-web, tarea 10).
 */
export default function PendingOrdersList({
  pendingOrders,
  notifications,
  currentUser,
  onSelectOrder,
  onCancelClick,
  onDismissNotification,
}: Props) {
  return (
    <aside className="w-full xl:w-[360px] shrink-0 flex flex-col min-h-[320px] xl:min-h-0">
      <div className="relative flex-1 flex flex-col rounded-3xl border border-ink-800 bg-ink-900/60 backdrop-blur-sm overflow-hidden shadow-xl">
        {/* Toast stack */}
        <div className="absolute top-3 right-3 z-50 flex flex-col gap-2 w-full max-w-[300px] pointer-events-none">
          {notifications.map((n) => (
            <Toast
              key={n.id}
              variant="success"
              title="Nuevo pedido"
              badge={`#${n.displayNumber}`}
              message={n.text}
              duration={5000}
              onClose={() => onDismissNotification(n.id)}
            />
          ))}
        </div>

        <div className="px-5 py-4 border-b border-ink-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-soft border border-blue-line flex items-center justify-center">
              <Package size={15} className="text-blue" />
            </div>
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-100">
                Tragos pendientes
              </h3>
              <p className="text-[10px] text-ink-500 font-mono mt-0.5">Tocá un pedido para canjear manual</p>
            </div>
          </div>
          <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-xl bg-ink-950 border border-ink-800 font-mono text-sm font-black text-blue tabular">
            {pendingOrders.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar min-h-0">
          {pendingOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[240px] px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-ink-950 border border-ink-800 flex items-center justify-center mb-3">
                <Inbox size={20} className="text-ink-600" />
              </div>
              <p className="text-sm font-serif-italic text-ink-500">Sin tragos pendientes</p>
              <p className="text-[11px] text-ink-600 mt-1">Los nuevos pedidos aparecen acá en vivo</p>
            </div>
          ) : (
            <ul className="divide-y divide-ink-800/60">
              {pendingOrders.map((o) => {
                const hasCancelPermission = currentUser?.role === "admin";
                const statusMeta = getPendingStatus(o.status);
                return (
                  <li
                    key={o.id}
                    onClick={() => onSelectOrder(o)}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-ink-850/30 transition-colors cursor-pointer active:bg-ink-850/50"
                  >
                    <div className="w-11 h-11 rounded-xl bg-ink-950 border border-ink-800 flex items-center justify-center shrink-0">
                      <span className="font-mono text-sm font-black text-ink-200 tabular">
                        {o.displayNumber}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate leading-tight">
                        {o.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                        <span className="text-[10px] font-mono text-ink-600 tabular">
                          ${o.total.toLocaleString("es-AR")}
                        </span>
                      </div>
                    </div>

                    {hasCancelPermission && (
                      <button
                        type="button"
                        onClick={(e) => onCancelClick(o, e)}
                        className="w-8 h-8 flex items-center justify-center bg-danger-soft hover:bg-danger-soft/80 border border-danger-line text-danger rounded-xl transition-all active:scale-95 cursor-pointer shrink-0"
                        title="Cancelar pedido"
                        aria-label="Cancelar pedido"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {pendingOrders.length > 0 && (
          <div className="px-5 py-3 border-t border-ink-800/80 bg-ink-950/40 shrink-0">
            <div className="flex items-center gap-2 text-[10px] font-mono text-ink-500">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue" />
              </span>
              Actualización en tiempo real
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
