"use client";

import { Loader2, Printer, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ordersService } from "@/services/orders.service";
import type { Order } from "@cocktrail/shared";

type CurrentUser = {
  role: string;
  permissions: {
    cancelarTickets: boolean;
  };
};

type Props = {
  /** Órdenes de la noche activa, ya filtradas por el shell (evita recalcular ahí y acá). */
  orders: Order[];
  currentUser: CurrentUser | null;
  /** Impresora compartida (instanciada una sola vez en el shell con usePrinterStatus). */
  printer: {
    reprintTicket: (orderId: string) => Promise<void>;
    printError: string | null;
    reprinting: boolean;
  };
  /** El shell mantiene `orders`; se le avisa acá cuando se cancela un ticket para que actualice su estado. */
  onOrderUpdated: (order: Order) => void;
};

const getItemsPreview = (items: Order["items"]) => {
  if (!items || items.length === 0) return "";
  const firstTwo = items.slice(0, 2).map((it) => `${it.name} (x${it.qty})`).join(", ");
  if (items.length > 2) {
    return `${firstTwo} +${items.length - 2} más`;
  }
  return firstTwo;
};

const formatDayMonth = (ts: number) => {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
};

const formatHourMinute = (ts: number) => {
  const d = new Date(ts);
  const hr = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hr}:${min}`;
};

/**
 * Vista "Historial de Ventas" de caja — extraída de CajaClient.tsx sin cambios
 * de comportamiento: filtro por día, buscador con scroll infinito, y el popup
 * de detalle de ticket (reimpresión + cancelación).
 *
 * `mapStatus` y `getPaginationRange` NO se migraron: un grep sobre el archivo
 * original confirmó que ninguna de las dos tenía callers (la grilla de
 * tickets nunca mostró un badge de estado, y esta vista siempre usó scroll
 * infinito, no paginación por número de página). Código muerto preexistente,
 * se eliminó en vez de migrarlo — mismo criterio que con `confirmOrderWithMethod`
 * en la tarea 7.
 */
export default function HistorialSection({ orders, currentUser, printer, onOrderUpdated }: Props) {
  const { reprintTicket, printError, reprinting } = printer;

  const [selectedDay, setSelectedDay] = useState<string>("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<Order | null>(null);

  const groupedOrders = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    const sorted = [...orders].sort((a, b) => b.createdAt - a.createdAt);

    for (const o of sorted) {
      const dayKey = formatDayMonth(o.createdAt);
      if (!groups[dayKey]) {
        groups[dayKey] = [];
      }
      groups[dayKey].push(o);
    }
    return groups;
  }, [orders]);

  const days = useMemo(() => {
    return Object.keys(groupedOrders).sort((a, b) => {
      const [dayA, monthA] = a.split("/").map(Number);
      const [dayB, monthB] = b.split("/").map(Number);
      if (monthA !== monthB) return monthB - monthA;
      return dayB - dayA;
    });
  }, [groupedOrders]);

  useEffect(() => {
    if (days.length > 0 && !selectedDay) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDay(days[0]);
    }
  }, [days, selectedDay]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleCount(20);
  }, [selectedDay]);

  const dayOrders = useMemo(() => {
    return groupedOrders[selectedDay] || [];
  }, [groupedOrders, selectedDay]);

  const filteredDayOrders = useMemo(() => {
    let list = dayOrders;
    if (ticketSearch.trim()) {
      const q = ticketSearch.toLowerCase();
      list = list.filter(
        (o) =>
          o.displayNumber.toString().includes(q) ||
          (o.createdBy || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [dayOrders, ticketSearch]);

  const displayedOrders = useMemo(() => {
    return filteredDayOrders.slice(0, visibleCount);
  }, [filteredDayOrders, visibleCount]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 20) {
      if (visibleCount < filteredDayOrders.length && !loadingMore) {
        setLoadingMore(true);
        setTimeout(() => {
          setVisibleCount((prev) => prev + 10);
          setLoadingMore(false);
        }, 300);
      }
    }
  };

  async function handleCancelTicket() {
    if (!selectedHistoryOrder) return;
    if (!window.confirm("¿Seguro que deseas cancelar este ticket?")) return;
    try {
      const updated = await ordersService.updateStatus(selectedHistoryOrder.id, "cancelado");
      onOrderUpdated(updated);
      setSelectedHistoryOrder(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al cancelar el ticket");
    }
  }

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <section className="flex flex-col gap-1 pb-1">
        <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-none">
          Historial de Ventas
        </h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1">
          Órdenes registradas en caja filtradas por fecha.
        </p>
      </section>

      {/* Filtro por Día */}
      {days.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-[var(--border-subtle)]">
          {days.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                selectedDay === day
                  ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)] border border-transparent"
                  : "bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-app)]"
              }`}
            >
              Día {day}
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl py-6 text-center text-[var(--text-tertiary)] shadow-card text-sm">
          — No hay tickets registrados en el historial —
        </div>
      )}

      {/* Listado de tickets con buscador e infinite scroll */}
      {days.length > 0 && (
        <div className="space-y-4">
          {/* Buscador */}
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={ticketSearch}
              onChange={(e) => {
                setTicketSearch(e.target.value);
                setVisibleCount(20); // Reset infinite scroll limit
              }}
              placeholder="Buscar por número de ticket o cajero..."
              className="w-full h-10 pl-10 pr-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all"
            />
          </div>

          {/* Scrollable Container */}
          <div
            onScroll={handleScroll}
            className="max-h-[500px] overflow-y-auto pr-1 no-scrollbar rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/40 p-1"
          >
            {displayedOrders.length === 0 ? (
              <div className="py-12 text-center text-[12px] text-[var(--text-tertiary)] ">
                {ticketSearch ? "— Sin resultados para tu búsqueda —" : "— No hay tickets para mostrar —"}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {displayedOrders.map((o) => {
                  const paymentLabel = o.paymentMethod === "efectivo" ? "Efectivo" : "Posnet";
                  return (
                    <div
                      key={o.id}
                      onClick={() => setSelectedHistoryOrder(o)}
                      className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/30 hover:bg-[var(--bg-panel)] transition-all rounded-xl shadow-card p-3.5 flex flex-col justify-between gap-1.5 cursor-pointer active:scale-[0.99] select-none h-[105px]"
                    >
                      <div className="flex justify-between items-center min-w-0">
                        <span className="font-mono text-sm font-bold text-[var(--text-primary)] truncate">#{String(o.displayNumber).padStart(3, "0")}</span>
                        <span
                          className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded leading-none border ${
                            o.paymentMethod === "efectivo"
                              ? "bg-green-soft text-green border-green-line"
                              : "bg-blue-soft text-blue border-blue-line"
                          }`}
                        >
                          {paymentLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] truncate leading-tight">
                        {getItemsPreview(o.items)}
                      </p>
                      <div className="flex justify-between items-center mt-1 border-t border-[var(--border-subtle)]/50 pt-1.5">
                        <span className="text-[9px] text-[var(--text-tertiary)] font-medium">Cajero: {o.createdBy || "CJ"}</span>
                        <span className="font-mono text-[13px] font-bold text-accent">${o.total.toLocaleString("es-AR")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Infinite Scroll Loader Spinner */}
            {loadingMore && (
              <div className="flex items-center justify-center py-4 gap-2">
                <Loader2 size={14} className="animate-spin text-accent" />
                <span className="text-[10px] text-[var(--text-tertiary)] font-medium uppercase tracking-wider">Cargando más...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Popup Detalle de Ticket Historial ── */}
      {selectedHistoryOrder && (
        <div onClick={() => setSelectedHistoryOrder(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full max-w-sm rounded-2xl p-6 shadow-card animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="font-mono text-lg font-bold text-[var(--text-primary)]">Ticket #{String(selectedHistoryOrder.displayNumber).padStart(3, "0")}</h3>
                <p className="font-mono text-[10px] text-[var(--text-tertiary)] select-all">Token: {selectedHistoryOrder.token}</p>
              </div>
              <button
                onClick={() => setSelectedHistoryOrder(null)}
                aria-label="Cerrar detalle del ticket"
                className="p-2.5 bg-[var(--bg-panel)] border border-[var(--border-strong)] rounded-full active:scale-90 transition-transform cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Listado de items del ticket */}
            <div className="flex flex-col gap-3 py-2 max-h-[40vh] overflow-y-auto">
              {selectedHistoryOrder.items.map((item) => (
                <div key={item.drinkId} className="flex justify-between items-center text-sm">
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-[var(--text-primary)] truncate">{item.name}</span>
                    <span className="text-xs text-[var(--text-secondary)] font-mono tabular">{item.qty} x ${item.unitPrice.toLocaleString("es-AR")}</span>
                  </div>
                  <span className="font-mono font-bold text-[var(--text-primary)]">${item.subtotal.toLocaleString("es-AR")}</span>
                </div>
              ))}
            </div>

            {/* Footer de ticket */}
            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Método de cobro</span>
                <span className="capitalize font-bold">{selectedHistoryOrder.paymentMethod === "efectivo" ? "Efectivo" : "Posnet"}</span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Cajero</span>
                <span className="font-bold">{selectedHistoryOrder.createdBy || "CJ"}</span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <span>Fecha / Hora</span>
                <span>Día {formatDayMonth(selectedHistoryOrder.createdAt)} - {formatHourMinute(selectedHistoryOrder.createdAt)} hs</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[var(--text-primary)] pt-2 border-t border-[var(--border-subtle)] pb-2">
                <span>TOTAL</span>
                <span className="text-accent">${selectedHistoryOrder.total.toLocaleString("es-AR")}</span>
              </div>

              <button
                onClick={() => reprintTicket(selectedHistoryOrder.id)}
                disabled={reprinting}
                className="ct-checkout-btn w-full mt-2 h-11 font-bold rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Printer size={14} strokeWidth={2.5} />
                {reprinting ? "Imprimiendo…" : "Reimprimir Ticket"}
              </button>
              {printError && (
                <div className="w-full mt-2 bg-danger-soft border border-danger-line text-danger rounded-xl px-3 py-2.5 text-sm">
                  {printError}
                </div>
              )}

              {selectedHistoryOrder.status !== "cancelado" && (currentUser?.role === "admin" || currentUser?.permissions?.cancelarTickets) && (
                <button
                  type="button"
                  onClick={handleCancelTicket}
                  className="w-full mt-2 h-11 bg-danger-soft hover:bg-danger-soft/80 border border-danger-line text-danger font-bold rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer animate-in fade-in duration-200"
                >
                  <X size={14} strokeWidth={2.5} />
                  Cancelar Ticket
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



