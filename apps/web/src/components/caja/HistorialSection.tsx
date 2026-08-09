"use client";

import { Printer, Search, Trash2, TriangleAlert, Wine } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  isCancelable,
  itemsLabel,
  paymentLabel,
} from "@/components/admin/logsCrud";
import SafeDeleteModal from "@/components/shared/SafeDeleteModal";
import Toast from "@/components/shared/Toast";
import { ordersService } from "@/services/orders.service";
import { formatHm } from "@/lib/utils";
import type { Order } from "@cocktrail/shared";
import { displayOrderRevenue } from "@cocktrail/shared";

type CurrentUser = {
  role: string;
  permissions: {
    cancelarTickets: boolean;
  };
};

type Props = {
  orders: Order[];
  currentUser: CurrentUser | null;
  printer: {
    reprintTicket: (orderId: string) => Promise<void>;
    printError: string | null;
    reprinting: boolean;
  };
  onOrderUpdated: (order: Order) => void;
};

const PAGE_SIZE = 12;
const CANCEL_UNDO_MS = 5000;

const pillBase =
  "inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full leading-none";

const GRID =
  "88px 92px minmax(160px, 1fr) 108px 100px 110px 100px";

const formatDayMonth = (ts: number) => {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
};

function dayChipLabel(orders: Order[], dayKey: string): string {
  const ts = orders[0]?.createdAt;
  if (!ts) return dayKey;
  const d = new Date(ts);
  const weekdays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${weekdays[d.getDay()]} ${d.getDate()}`;
}

const actionBtn =
  "w-7 h-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)] flex items-center justify-center transition-all cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed";

/**
 * Historial de ventas de caja — tabla read-only al estilo Auditoría.
 * Cancelar: hold-to-confirm → toast con Deshacer → PATCH diferido.
 */
export default function HistorialSection({ orders, currentUser, printer, onOrderUpdated }: Props) {
  const { reprintTicket, printError, reprinting } = printer;

  const [selectedDay, setSelectedDay] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [page, setPage] = useState(1);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelUndo, setCancelUndo] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const pendingCancelRef = useRef<{
    previous: Order;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const canCancel =
    currentUser?.role === "admin" || Boolean(currentUser?.permissions?.cancelarTickets);

  const groupedOrders = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);
    for (const o of sorted) {
      const dayKey = formatDayMonth(o.createdAt);
      (groups[dayKey] ??= []).push(o);
    }
    return groups;
  }, [orders]);

  const days = useMemo(
    () =>
      Object.keys(groupedOrders).sort((a, b) => {
        const [dayA, monthA] = a.split("/").map(Number);
        const [dayB, monthB] = b.split("/").map(Number);
        if (monthA !== monthB) return monthB - monthA;
        return dayB - dayA;
      }),
    [groupedOrders],
  );

  useEffect(() => {
    if (days.length > 0 && !selectedDay) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDay(days[0]);
    }
  }, [days, selectedDay]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [selectedDay, ticketSearch]);

  useEffect(() => {
    return () => {
      const pending = pendingCancelRef.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingCancelRef.current = null;
    };
  }, []);

  const filtered = useMemo(() => {
    const list = groupedOrders[selectedDay] || [];
    const q = ticketSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (o) =>
        o.displayNumber.toString().includes(q) ||
        (o.createdBy || "").toLowerCase().includes(q) ||
        itemsLabel(o).toLowerCase().includes(q),
    );
  }, [groupedOrders, selectedDay, ticketSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageOrders = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  async function commitCancel(orderId: string, previous: Order) {
    try {
      const updated = await ordersService.updateStatus(orderId, "cancelado");
      onOrderUpdated(updated);
    } catch (err) {
      onOrderUpdated(previous);
      setActionError(err instanceof Error ? err.message : "Error al cancelar el ticket");
    }
  }

  function scheduleCancel(order: Order) {
    if (pendingCancelRef.current) {
      clearTimeout(pendingCancelRef.current.timer);
      void commitCancel(pendingCancelRef.current.previous.id, pendingCancelRef.current.previous);
      pendingCancelRef.current = null;
    }

    const previous = order;
    onOrderUpdated({ ...order, status: "cancelado" });
    setCancelTarget(null);
    setCancelUndo(true);
    setActionError(null);

    const timer = setTimeout(() => {
      pendingCancelRef.current = null;
      setCancelUndo(false);
      void commitCancel(order.id, previous);
    }, CANCEL_UNDO_MS);

    pendingCancelRef.current = { previous, timer };
  }

  function handleUndoCancel() {
    const pending = pendingCancelRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingCancelRef.current = null;
    onOrderUpdated(pending.previous);
    setCancelUndo(false);
  }

  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-6">
      <section className="flex flex-col gap-1">
        <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-none">
          Historial de Ventas
        </h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">
          Tickets de la noche, solo lectura.
        </p>
      </section>

      {days.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-10 text-center shadow-card">
          <p className="text-sm text-[var(--text-tertiary)]">No hay tickets registrados</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {days.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer shrink-0 border ${
                  selectedDay === day
                    ? "bg-[var(--text-primary)] text-[var(--bg-app)] border-transparent"
                    : "bg-transparent border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {dayChipLabel(groupedOrders[day] || [], day)}
              </button>
            ))}
          </div>

          <div className="relative max-w-md">
            <Search
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
            />
            <input
              type="text"
              value={ticketSearch}
              onChange={(e) => setTicketSearch(e.target.value)}
              placeholder="Buscar ticket, cajero o trago…"
              className="w-full h-10 pl-10 pr-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all"
            />
          </div>

          {(actionError || printError) && (
            <div
              role="alert"
              className="rounded-xl border border-[var(--danger-line)] bg-[var(--danger-soft)] px-4 py-2.5 text-sm text-[var(--danger-base)]"
            >
              {actionError || printError}
            </div>
          )}

          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <div style={{ minWidth: 780 }}>
                <div
                  className="grid border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]/60"
                  style={{ gridTemplateColumns: GRID }}
                >
                  {["Hora", "Ticket", "Detalle", "Medio", "Total", "Estado", "Acciones"].map(
                    (label) => (
                      <div
                        key={label}
                        className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
                      >
                        {label}
                      </div>
                    ),
                  )}
                </div>

                {pageOrders.length === 0 ? (
                  <div className="py-14 text-center text-sm text-[var(--text-tertiary)]">
                    {ticketSearch ? "Sin resultados" : "No hay tickets para este día"}
                  </div>
                ) : (
                  pageOrders.map((o, i) => {
                    const muted = o.status === "cancelado";
                    const detail = itemsLabel(o);

                    return (
                      <div
                        key={o.id}
                        className={`grid border-b border-[var(--border-subtle)] last:border-b-0 items-center ${
                          i % 2 === 1 ? "bg-[var(--bg-panel)]/45" : ""
                        } ${muted ? "opacity-60" : ""}`}
                        style={{ gridTemplateColumns: GRID }}
                      >
                        <div className="px-3 py-2.5 font-mono text-[12.5px] tabular text-[var(--text-secondary)]">
                          {formatHm(o.createdAt)} hs
                        </div>

                        <div className="px-3 py-2 flex items-center">
                          <span className="w-12 h-9 flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] font-mono font-bold text-[13px] text-[var(--text-primary)]">
                            #{String(o.displayNumber).padStart(3, "0")}
                          </span>
                        </div>

                        <div className="px-3 py-2.5 min-w-0 flex items-center gap-1.5">
                          <Wine
                            size={13}
                            className="text-[var(--text-tertiary)] shrink-0"
                            strokeWidth={1.8}
                          />
                          <span
                            className="text-[12px] font-medium truncate text-[var(--text-primary)]"
                            title={detail}
                          >
                            {detail}
                          </span>
                        </div>

                        <div className="px-3 py-2.5 text-[12px] text-[var(--text-secondary)] truncate">
                          {paymentLabel(o.paymentMethod)}
                        </div>

                        <div
                          className="px-3 py-2.5 font-mono tabular text-[var(--text-primary)]"
                          title={
                            o.mpNetReceived != null && o.mpFeeAmount != null
                              ? `Facturado $${o.total.toLocaleString("es-AR")} · Comisión MP $${o.mpFeeAmount.toLocaleString("es-AR")}`
                              : undefined
                          }
                        >
                          <span className="text-[13px] font-bold">
                            ${displayOrderRevenue(o).toLocaleString("es-AR")}
                          </span>
                          {o.mpNetReceived != null && o.mpNetReceived !== o.total && (
                            <span className="block text-[10px] font-medium text-[var(--text-tertiary)] leading-tight">
                              fact. ${o.total.toLocaleString("es-AR")}
                            </span>
                          )}
                        </div>

                        <div className="px-3 py-2.5">
                          {o.status === "cancelado" ? (
                            <span
                              className={`${pillBase} bg-[var(--danger-soft)] text-[var(--danger-base)] inline-flex items-center gap-1`}
                              title="Anulado — no suma al arqueo"
                            >
                              <TriangleAlert size={11} strokeWidth={2.2} aria-hidden />
                              Cancelado
                            </span>
                          ) : (
                            <span className="text-[12px] text-[var(--text-tertiary)]">—</span>
                          )}
                        </div>

                        <div className="px-3 py-2 flex items-center gap-1.5">
                          <button
                            type="button"
                            title="Reimprimir"
                            aria-label={`Reimprimir ticket ${o.displayNumber}`}
                            disabled={reprinting}
                            onClick={() => void reprintTicket(o.id)}
                            className={`${actionBtn} hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]`}
                          >
                            <Printer size={11} />
                          </button>

                          {canCancel && isCancelable(o) ? (
                            <button
                              type="button"
                              title="Cancelar ticket"
                              aria-label={`Cancelar ticket #${o.displayNumber}`}
                              onClick={() => setCancelTarget(o)}
                              className={`${actionBtn} hover:text-[var(--danger-base)] hover:border-[var(--danger-base)]/40`}
                            >
                              <Trash2 size={11} />
                            </button>
                          ) : canCancel ? (
                            <button
                              type="button"
                              disabled
                              title={
                                o.status === "cancelado"
                                  ? "El ticket ya está cancelado"
                                  : "El ticket ya fue entregado"
                              }
                              className={`${actionBtn} opacity-40`}
                            >
                              <Trash2 size={11} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)]/40">
                <p className="text-[12px] text-[var(--text-tertiary)]">
                  {filtered.length} ticket{filtered.length === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-8 px-3 rounded-lg text-[12px] font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                  >
                    Anterior
                  </button>
                  <span className="text-[12px] font-mono text-[var(--text-tertiary)] px-2">
                    {page}/{totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="h-8 px-3 rounded-lg text-[12px] font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {cancelTarget && (
        <SafeDeleteModal
          onClose={() => setCancelTarget(null)}
          onConfirm={() => scheduleCancel(cancelTarget)}
          title={`Cancelar #${String(cancelTarget.displayNumber).padStart(3, "0")}`}
          confirmLabel="Cancelar ticket"
          warning={
            <>
              El ticket{" "}
              <strong className="text-danger font-semibold">
                #{String(cancelTarget.displayNumber).padStart(3, "0")}
              </strong>{" "}
              quedará anulado. Vas a poder deshacer durante unos segundos.
            </>
          }
        />
      )}

      {cancelUndo && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast
            variant="success"
            message="Ticket cancelado"
            duration={CANCEL_UNDO_MS}
            action={{ label: "Deshacer", onClick: handleUndoCancel }}
            onClose={() => setCancelUndo(false)}
          />
        </div>
      )}
    </div>
  );
}
