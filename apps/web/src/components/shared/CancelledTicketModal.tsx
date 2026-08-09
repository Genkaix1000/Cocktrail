"use client";

import { TriangleAlert, X, User, Calendar, CreditCard, ShoppingBag, Clock, Key } from "lucide-react";
import type { Order } from "@cocktrail/shared";
import { displayOrderRevenue } from "@cocktrail/shared";
import { formatDateHour, paymentLabel } from "@/components/admin/logsCrud";

type Props = {
  order: Order;
  onClose: () => void;
};

export default function CancelledTicketModal({ order, onClose }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancelled-ticket-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--danger-line)] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--danger-soft)]/50">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[var(--danger-soft)] border border-[var(--danger-line)] text-[var(--danger-base)] flex items-center justify-center">
              <TriangleAlert size={18} strokeWidth={2.2} />
            </span>
            <div>
              <h2
                id="cancelled-ticket-title"
                className="text-[16px] font-bold text-[var(--text-primary)] leading-tight"
              >
                Ticket #{order.displayNumber} (Anulado)
              </h2>
              <p className="text-[11px] text-[var(--danger-base)] font-medium">
                Información de cancelación
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Box de Cancelación */}
          <div className="rounded-xl border border-[var(--danger-line)] bg-[var(--danger-soft)]/30 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-[var(--text-secondary)] flex items-center gap-1.5 font-medium">
                <User size={14} className="text-[var(--danger-base)]" />
                Cancelado por:
              </span>
              <span className="font-bold text-[var(--danger-base)]">
                {order.cancelledBy || "Sistema"}
              </span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-[var(--text-secondary)] flex items-center gap-1.5 font-medium">
                <Calendar size={14} className="text-[var(--danger-base)]" />
                Fecha de cancelación:
              </span>
              <span className="font-mono text-[var(--text-primary)] font-semibold">
                {order.cancelledAt ? formatDateHour(order.cancelledAt) : "Sin registro"}
              </span>
            </div>
          </div>

          {/* Datos del Ticket */}
          <div className="space-y-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Datos del Ticket
            </h3>

            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/50 p-3.5 space-y-2.5 text-[12.5px]">
              {/* Ítems */}
              <div className="space-y-1">
                <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                  <ShoppingBag size={12} /> Detalle de la compra:
                </span>
                <ul className="pl-4 list-disc text-[var(--text-primary)] font-medium space-y-0.5">
                  {order.items.map((item, idx) => (
                    <li key={idx}>
                      {item.qty}x {item.name} (${item.unitPrice.toLocaleString("es-AR")} c/u)
                    </li>
                  ))}
                </ul>
              </div>

              <div className="h-px bg-[var(--border-subtle)]" />

              {/* Total y Medio de Pago */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                    Total:
                  </span>
                  <span className="font-mono font-bold text-[14px] text-[var(--text-primary)]">
                    ${displayOrderRevenue(order).toLocaleString("es-AR")}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                    <CreditCard size={12} /> Pago:
                  </span>
                  <span className="font-medium text-[var(--text-primary)]">
                    {paymentLabel(order.paymentMethod)}
                  </span>
                </div>
              </div>

              <div className="h-px bg-[var(--border-subtle)]" />

              {/* Creador y Emisión */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                    <User size={12} /> Creador:
                  </span>
                  <span className="font-medium text-[var(--text-primary)]">
                    {order.createdBy || "Cliente"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                    <Clock size={12} /> Emisión:
                  </span>
                  <span className="font-mono text-[var(--text-primary)]">
                    {formatDateHour(order.createdAt)}
                  </span>
                </div>
              </div>

              {/* Token */}
              {order.token && (
                <>
                  <div className="h-px bg-[var(--border-subtle)]" />
                  <div>
                    <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                      <Key size={12} /> Token:
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-secondary)] select-all">
                      {order.token}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-panel)] text-[12.5px] font-semibold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
