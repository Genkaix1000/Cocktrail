"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Tag,
  Wine,
  User,
  CreditCard,
  DollarSign,
  ArrowLeft,
  ArrowRight,
  X,
} from "lucide-react";

import { ordersService } from "@/services/orders.service";
import { formatHm } from "@/lib/utils";

import type { Order } from "@cocktrail/shared";

type Props = {
  // Puente Historial → Logs: cuando el usuario entra acá desde el botón "Ver
  // Auditoría de Tickets" de HistorialSection, el shell (AdminClient) pasa el
  // timestamp de la noche elegida. Como esta sección se monta de cero cada
  // vez que activeTab pasa a "logs" (render condicional en el shell), alcanza
  // con sembrar el estado inicial desde este prop — no hace falta un efecto
  // ni un callback de "consumido". El shell resetea el prop a null cuando el
  // usuario entra por el sidebar en vez de por el redirect (ver AdminClient).
  initialFilterTimestamp?: number | null;
  isBosko: boolean;
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const formatMonthYear = (ts: number) => {
  const d = new Date(ts);
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${month} ${year}`;
};

const formatDayMonth = (ts: number) => {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
};

const formatDateHourDetailed = (ts: number) => {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hr = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} - ${hr}:${min} hs`;
};

function getPaginationRange(currentPage: number, totalPages: number): (number | string)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const range: (number | string)[] = [];

  if (currentPage <= 4) {
    for (let i = 1; i <= 5; i++) {
      range.push(i);
    }
    range.push("...");
    range.push(totalPages);
  } else if (currentPage >= totalPages - 3) {
    range.push(1);
    range.push("...");
    for (let i = totalPages - 4; i <= totalPages; i++) {
      range.push(i);
    }
  } else {
    range.push(1);
    range.push("...");
    range.push(currentPage - 1);
    range.push(currentPage);
    range.push(currentPage + 1);
    range.push("...");
    range.push(totalPages);
  }

  return range;
}

const logItemsPerPage = 10;

/**
 * Vista "Auditoría de Tickets" del panel admin — extraída de AdminClient.tsx
 * sin cambios de comportamiento. A diferencia de Historial (que depende de
 * datos que también usan Monitoreo/Estadísticas), acá el fetch de
 * `ordersService.getAuditLogs` es exclusivo de esta vista, así que se movió
 * completo (estado + fetch + filtros/orden/paginación + cancelación de
 * tickets).
 */
export default function LogsSection({ initialFilterTimestamp, isBosko: _isBosko }: Props) {
  const [auditLogs, setAuditLogs] = useState<Order[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [viewAllNights, setViewAllNights] = useState(initialFilterTimestamp != null);
  const [selectedLogOrder, setSelectedLogOrder] = useState<Order | null>(null);
  const [cancelConfirmText, setCancelConfirmText] = useState("");
  const [showCancelInput, setShowCancelInput] = useState(false);

  useEffect(() => {
    setShowCancelInput(false);
    setCancelConfirmText("");
  }, [selectedLogOrder]);

  // Filtering & sorting state — si venimos de un redirect de Historial, el
  // mes/día arrancan precargados con la noche elegida.
  const [selectedLogMonth, setSelectedLogMonth] = useState<string>(
    initialFilterTimestamp != null ? formatMonthYear(initialFilterTimestamp) : "",
  );
  const [selectedLogDay, setSelectedLogDay] = useState<string>(
    initialFilterTimestamp != null ? formatDayMonth(initialFilterTimestamp) : "",
  );
  const [currentLogPage, setCurrentLogPage] = useState(1);

  const [logSortField, setLogSortField] = useState<"time" | "ticket" | "creator" | "method" | "total">("time");
  const [logSortDirection, setLogSortDirection] = useState<"desc" | "asc">("desc");

  const fetchLogs = useCallback(async (all: boolean = false) => {
    setLoadingLogs(true);
    try {
      const data = await ordersService.getAuditLogs(all);
      setAuditLogs(data);
      setLogsLoaded(true);
    } catch (err) {
      console.error("Error fetching logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (!logsLoaded) {
      fetchLogs(viewAllNights);
    }
    // Solo en el montaje: esta sección se recrea de cero cada vez que se
    // entra al tab "logs" (render condicional en el shell), así que no hace
    // falta re-disparar el fetch por cambios posteriores de viewAllNights acá
    // (el botón "Ver Noches Anteriores" ya llama fetchLogs directamente).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group logs by month first, then by day
  const groupedLogData = useMemo(() => {
    const groups: Record<string, Record<string, Order[]>> = {};
    const sorted = [...auditLogs].sort((a, b) => b.createdAt - a.createdAt);

    for (const o of sorted) {
      const monthKey = formatMonthYear(o.createdAt);
      const dayKey = formatDayMonth(o.createdAt);

      if (!groups[monthKey]) {
        groups[monthKey] = {};
      }
      if (!groups[monthKey][dayKey]) {
        groups[monthKey][dayKey] = [];
      }
      groups[monthKey][dayKey].push(o);
    }
    return groups;
  }, [auditLogs]);

  // Months available sorted chronologically
  const logMonths = useMemo(() => {
    const keys = Object.keys(groupedLogData);
    const monthTimestamps: Record<string, number> = {};
    for (const mKey of keys) {
      const dayKeys = Object.keys(groupedLogData[mKey]);
      let maxTs = 0;
      for (const dKey of dayKeys) {
        const orders = groupedLogData[mKey][dKey];
        if (orders.length > 0 && orders[0].createdAt > maxTs) {
          maxTs = orders[0].createdAt;
        }
      }
      monthTimestamps[mKey] = maxTs;
    }
    return keys.sort((a, b) => monthTimestamps[b] - monthTimestamps[a]);
  }, [groupedLogData]);

  // Set default month
  useEffect(() => {
    if (logMonths.length > 0 && !selectedLogMonth) {
      setSelectedLogMonth(logMonths[0]);
    }
  }, [logMonths, selectedLogMonth]);

  // Days in selected month
  const logDays = useMemo(() => {
    if (!selectedLogMonth || !groupedLogData[selectedLogMonth]) return [];
    return Object.keys(groupedLogData[selectedLogMonth]).sort((a, b) => {
      const [dayA, monthA] = a.split("/").map(Number);
      const [dayB, monthB] = b.split("/").map(Number);
      if (monthA !== monthB) return monthB - monthA;
      return dayB - dayA;
    });
  }, [groupedLogData, selectedLogMonth]);

  // Set default day when selected month or days list updates
  useEffect(() => {
    if (logDays.length > 0) {
      if (!selectedLogDay || !logDays.includes(selectedLogDay)) {
        setSelectedLogDay(logDays[0]);
      }
    } else {
      setSelectedLogDay("");
    }
  }, [logDays, selectedLogMonth, selectedLogDay]);

  // Reset page when day or month changes
  useEffect(() => {
    setCurrentLogPage(1);
  }, [selectedLogDay, selectedLogMonth]);

  // Raw logs for current selected month and day
  const currentDayLogs = useMemo(() => {
    if (!selectedLogMonth || !selectedLogDay || !groupedLogData[selectedLogMonth]) return [];
    return groupedLogData[selectedLogMonth][selectedLogDay] || [];
  }, [groupedLogData, selectedLogMonth, selectedLogDay]);

  // Sorted logs
  const sortedLogs = useMemo(() => {
    const sorted = [...currentDayLogs];
    sorted.sort((a, b) => {
      let valA: string | number = "";
      let valB: string | number = "";

      if (logSortField === "time") {
        valA = a.createdAt;
        valB = b.createdAt;
      } else if (logSortField === "ticket") {
        valA = a.displayNumber;
        valB = b.displayNumber;
      } else if (logSortField === "creator") {
        valA = (a.createdBy || "Cliente").toLowerCase();
        valB = (b.createdBy || "Cliente").toLowerCase();
      } else if (logSortField === "method") {
        valA = (a.paymentMethod === "efectivo" ? "Efectivo" : "Posnet").toLowerCase();
        valB = (b.paymentMethod === "efectivo" ? "Efectivo" : "Posnet").toLowerCase();
      } else if (logSortField === "total") {
        valA = a.total;
        valB = b.total;
      }

      if (valA < valB) return logSortDirection === "asc" ? -1 : 1;
      if (valA > valB) return logSortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [currentDayLogs, logSortField, logSortDirection]);

  const totalLogPages = Math.ceil(sortedLogs.length / logItemsPerPage);

  const paginatedLogs = useMemo(() => {
    const start = (currentLogPage - 1) * logItemsPerPage;
    return sortedLogs.slice(start, start + logItemsPerPage);
  }, [sortedLogs, currentLogPage]);

  const logPaginationRange = useMemo(() => {
    return getPaginationRange(currentLogPage, totalLogPages);
  }, [currentLogPage, totalLogPages]);

  const handleSort = (field: typeof logSortField) => {
    if (logSortField === field) {
      setLogSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setLogSortField(field);
      setLogSortDirection("desc");
    }
    setCurrentLogPage(1);
  };

  const handleCancelTicket = async () => {
    if (!selectedLogOrder) return;
    try {
      const updated = await ordersService.updateStatus(selectedLogOrder.id, "cancelado");
      setAuditLogs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setSelectedLogOrder(updated);
      setShowCancelInput(false);
      setCancelConfirmText("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al cancelar el ticket");
    }
  };

  const thActive = "bg-[var(--accent-surface)] text-[var(--accent-text)] font-semibold";
  const thIdle = "text-[var(--text-secondary)]";
  const cellActive = "text-[var(--accent-text)] font-semibold";
  const cellIdle = "text-[var(--text-secondary)]";

  return (
    <div key="logs" className="flex flex-col gap-8 w-full animate-dashboard-in">
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight select-none">
            Auditoría de Tickets
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1.5">
            Historial de tickets emitidos, con operadores y estado de canje
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const nextVal = !viewAllNights;
              setViewAllNights(nextVal);
              fetchLogs(nextVal);
            }}
            className={`h-10 px-4 rounded-full text-[13px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-[0.98] border ${
              viewAllNights
                ? "bg-[var(--accent-primary)] border-transparent text-[var(--text-on-accent)]"
                : "bg-[var(--bg-surface)] border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-app)]"
            }`}
          >
            <CalendarDays size={14} strokeWidth={1.8} />
            {viewAllNights ? "Noche actual" : "Noches anteriores"}
          </button>

          <button
            type="button"
            onClick={() => fetchLogs(viewAllNights)}
            disabled={loadingLogs}
            className="h-10 px-4 rounded-full bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-app)] text-[13px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 select-none active:scale-[0.98]"
          >
            <RefreshCw size={14} strokeWidth={1.8} className={loadingLogs ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {!loadingLogs && logMonths.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {logMonths.map((month) => (
              <button
                key={month}
                type="button"
                onClick={() => setSelectedLogMonth(month)}
                className={`px-4 py-2 rounded-full text-[12px] font-semibold transition-all cursor-pointer shrink-0 border ${
                  selectedLogMonth === month
                    ? "bg-[var(--accent-surface)] text-[var(--accent-text)] border-[var(--accent-line)]"
                    : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {month}
              </button>
            ))}
          </div>

          {logDays.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {logDays.map((day) => {
                const ordersForDay = groupedLogData[selectedLogMonth]?.[day] || [];
                const firstOrderTs = ordersForDay[0]?.createdAt;
                let dayLabel = day;
                if (firstOrderTs) {
                  const d = new Date(firstOrderTs);
                  const weekdays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
                  dayLabel = `${weekdays[d.getDay()]} ${d.getDate()}`;
                }
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedLogDay(day)}
                    className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer shrink-0 border ${
                      selectedLogDay === day
                        ? "bg-[var(--text-primary)] text-[var(--bg-app)] border-transparent"
                        : "bg-transparent border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {dayLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loadingLogs ? (
        <div className="flex justify-center items-center h-64 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-card">
          <span className="text-sm text-[var(--text-tertiary)] font-mono">Cargando logs…</span>
        </div>
      ) : auditLogs.length === 0 ? (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-10 text-center shadow-card">
          <p className="text-sm text-[var(--text-tertiary)]">No hay tickets registrados en el historial</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {paginatedLogs.length === 0 ? (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-10 text-center text-[var(--text-tertiary)] text-sm shadow-card">
              No hay tickets para mostrar en este día
            </div>
          ) : (
            <>
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] text-[12px] font-semibold select-none">
                        {(
                          [
                            ["time", Clock, "Hora"],
                            ["ticket", Tag, "Ticket"],
                          ] as const
                        ).map(([field, Icon, label]) => (
                          <th
                            key={field}
                            onClick={() => handleSort(field)}
                            className={`py-3.5 px-5 cursor-pointer hover:bg-[var(--bg-app)] transition-colors ${
                              logSortField === field ? thActive : thIdle
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <Icon size={13} strokeWidth={1.8} />
                              <span>{label}</span>
                              <span className={`transition-all ${logSortField === field ? "opacity-100" : "opacity-0"}`}>
                                {logSortField === field && logSortDirection === "desc" ? (
                                  <ChevronDown size={14} />
                                ) : (
                                  <ChevronUp size={14} />
                                )}
                              </span>
                            </div>
                          </th>
                        ))}
                        <th className="py-3.5 px-5 text-[var(--text-secondary)] font-semibold">
                          <div className="flex items-center gap-1.5">
                            <Wine size={13} strokeWidth={1.8} />
                            <span>Detalle</span>
                          </div>
                        </th>
                        {(
                          [
                            ["creator", User, "Creador"],
                            ["method", CreditCard, "Medio de Pago"],
                            ["total", DollarSign, "Total"],
                          ] as const
                        ).map(([field, Icon, label]) => (
                          <th
                            key={field}
                            onClick={() => handleSort(field)}
                            className={`py-3.5 px-5 cursor-pointer hover:bg-[var(--bg-app)] transition-colors ${
                              logSortField === field ? thActive : thIdle
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <Icon size={13} strokeWidth={1.8} />
                              <span>{label}</span>
                              <span className={`transition-all ${logSortField === field ? "opacity-100" : "opacity-0"}`}>
                                {logSortField === field && logSortDirection === "desc" ? (
                                  <ChevronDown size={14} />
                                ) : (
                                  <ChevronUp size={14} />
                                )}
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {paginatedLogs.map((log) => {
                        const isCancelled = log.status === "cancelado";
                        return (
                          <tr
                            key={log.id}
                            onClick={() => setSelectedLogOrder(log)}
                            className={`hover:bg-[var(--bg-panel)] transition-colors cursor-pointer text-[13px] ${
                              isCancelled ? "opacity-55 line-through decoration-[var(--text-tertiary)]" : ""
                            }`}
                          >
                            <td
                              className={`py-3 px-5 font-mono text-[12.5px] tabular ${
                                logSortField === "time" ? cellActive : cellIdle
                              }`}
                            >
                              {formatHm(log.createdAt)} hs
                            </td>
                            <td className="py-3 px-5">
                              <span
                                className={`w-12 h-9 flex items-center justify-center rounded-xl border font-mono font-bold text-[13px] shrink-0 ${
                                  logSortField === "ticket"
                                    ? "text-[var(--accent-text)] border-[var(--accent-line)] bg-[var(--accent-surface)]"
                                    : "text-[var(--text-primary)] border-[var(--border-subtle)] bg-[var(--bg-panel)]"
                                }`}
                              >
                                #{log.displayNumber}
                              </span>
                            </td>
                            <td className="py-3 px-5 max-w-[200px] sm:max-w-[300px]">
                              <span
                                className="text-[12px] text-[var(--text-primary)] truncate font-medium block"
                                title={log.items.map((it) => `${it.qty}x ${it.name}`).join(", ")}
                              >
                                {log.items.map((it) => `${it.qty}x ${it.name}`).join(", ")}
                              </span>
                            </td>
                            <td className="py-3 px-5">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                  logSortField === "creator"
                                    ? "bg-[var(--accent-surface)] text-[var(--accent-text)] border-[var(--accent-line)]"
                                    : "bg-[var(--bg-panel)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                                }`}
                              >
                                <User size={11} strokeWidth={1.8} />
                                <span>{log.createdBy || "Cliente"}</span>
                              </span>
                            </td>
                            <td
                              className={`py-3 px-5 ${
                                logSortField === "method" ? cellActive : "text-[var(--text-secondary)]"
                              }`}
                            >
                              {log.paymentMethod === "efectivo"
                                ? "Efectivo"
                                : log.paymentMethod === "debito"
                                  ? "Posnet"
                                  : log.paymentMethod === "qr"
                                    ? "QR"
                                    : log.paymentMethod}
                            </td>
                            <td
                              className={`py-3 px-5 font-mono font-bold tabular ${
                                logSortField === "total" ? cellActive : "text-[var(--text-primary)]"
                              }`}
                            >
                              ${log.total.toLocaleString("es-AR")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {totalLogPages > 1 && (
                <div className="flex items-center justify-center gap-1.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentLogPage((p) => Math.max(1, p - 1))}
                    disabled={currentLogPage === 1}
                    aria-label="Página anterior"
                    className="w-9 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-all disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ArrowLeft size={14} />
                  </button>

                  {logPaginationRange.map((page, idx) => {
                    if (page === "...") {
                      return (
                        <span
                          key={`gap-${idx}`}
                          className="w-9 h-9 flex items-center justify-center text-[var(--text-tertiary)] font-mono"
                        >
                          ...
                        </span>
                      );
                    }
                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setCurrentLogPage(Number(page))}
                        aria-current={currentLogPage === page ? "page" : undefined}
                        className={`w-9 h-9 rounded-xl border font-mono text-xs transition-all cursor-pointer ${
                          currentLogPage === page
                            ? "bg-[var(--accent-surface)] text-[var(--accent-text)] border-[var(--accent-line)] font-bold"
                            : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)]"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setCurrentLogPage((p) => Math.min(totalLogPages, p + 1))}
                    disabled={currentLogPage === totalLogPages}
                    aria-label="Página siguiente"
                    className="w-9 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition-all disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {selectedLogOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full max-w-sm rounded-[20px] p-6 shadow-card animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <div className="flex items-center gap-2">
                  <Tag size={16} className="text-[var(--accent-primary)]" strokeWidth={1.8} />
                  <h3 className="font-mono text-lg font-bold text-[var(--text-primary)]">
                    Ticket #{selectedLogOrder.displayNumber}
                  </h3>
                </div>
                <p className="font-mono text-[10px] text-[var(--text-tertiary)] select-all mt-0.5">
                  {selectedLogOrder.token}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogOrder(null)}
                aria-label="Cerrar detalle del ticket"
                className="p-2.5 bg-[var(--bg-panel)] rounded-full active:scale-90 transition-transform cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3 py-2 max-h-[35vh] overflow-y-auto">
              {selectedLogOrder.items.map((item) => (
                <div key={item.drinkId} className="flex justify-between items-start text-sm">
                  <div className="flex gap-2 min-w-0">
                    <Wine size={14} className="text-[var(--text-tertiary)] mt-0.5 shrink-0" strokeWidth={1.8} />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-[var(--text-primary)] truncate">{item.name}</span>
                      <span className="text-xs text-[var(--text-tertiary)] font-mono tabular">
                        {item.qty} x ${item.unitPrice.toLocaleString("es-AR")}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-[var(--text-secondary)] tabular">
                    ${item.subtotal.toLocaleString("es-AR")}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between text-[var(--text-secondary)]">
                <div className="flex items-center gap-1.5">
                  <User size={13} />
                  <span>Creado por</span>
                </div>
                <span className="font-bold text-[var(--text-primary)]">{selectedLogOrder.createdBy || "Cliente"}</span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <div className="flex items-center gap-1.5">
                  {selectedLogOrder.paymentMethod === "efectivo" ? (
                    <DollarSign size={13} className="text-[var(--success-base)]" />
                  ) : (
                    <CreditCard size={13} className="text-[var(--accent-primary)]" />
                  )}
                  <span>Medio de pago</span>
                </div>
                <span className="font-bold text-[var(--text-primary)]">
                  {selectedLogOrder.paymentMethod === "efectivo"
                    ? "Efectivo"
                    : selectedLogOrder.paymentMethod === "debito"
                      ? "Posnet"
                      : selectedLogOrder.paymentMethod === "qr"
                        ? "QR"
                        : selectedLogOrder.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between text-[var(--text-secondary)]">
                <div className="flex items-center gap-1.5">
                  <Clock size={13} />
                  <span>Creación</span>
                </div>
                <span>{formatDateHourDetailed(selectedLogOrder.createdAt)}</span>
              </div>

              {selectedLogOrder.status === "entregado" && (
                <div className="p-2.5 rounded-xl bg-[var(--success-soft)] text-[var(--success-base)] mt-2 flex flex-col gap-1">
                  <span className="font-bold uppercase text-[9px] tracking-wider">Detalles de Entrega</span>
                  {selectedLogOrder.deliveredByBar && (
                    <span className="text-[10px]">Barra: {selectedLogOrder.deliveredByBar}</span>
                  )}
                  {selectedLogOrder.deliveredBy && (
                    <span className="text-[10px]">Operador: {selectedLogOrder.deliveredBy}</span>
                  )}
                  {selectedLogOrder.redeemMethod && (
                    <span className="text-[10px] capitalize">
                      Método: {selectedLogOrder.redeemMethod === "manual" ? "Manual" : "Escaneo QR"}
                    </span>
                  )}
                  {selectedLogOrder.deliveredAt && (
                    <span className="text-[10px]">
                      Hora: {new Date(selectedLogOrder.deliveredAt).toLocaleString("es-AR")}
                    </span>
                  )}
                </div>
              )}

              {selectedLogOrder.status === "cancelado" && (
                <div className="p-2.5 rounded-xl bg-[var(--danger-soft)] text-[var(--danger-base)] mt-2 flex flex-col gap-1">
                  <span className="font-bold uppercase text-[9px] tracking-wider">Detalles de Cancelación</span>
                  <span className="text-[10px]">Cancelado por: {selectedLogOrder.cancelledBy || "sistema"}</span>
                  {selectedLogOrder.cancelledAt && (
                    <span className="text-[10px]">
                      Hora: {new Date(selectedLogOrder.cancelledAt).toLocaleString("es-AR")}
                    </span>
                  )}
                </div>
              )}

              <div className="flex justify-between text-base font-bold text-[var(--text-primary)] pt-2 border-t border-[var(--border-subtle)] pb-2">
                <div className="flex items-center gap-1.5">
                  <Tag size={15} className="text-[var(--accent-primary)]" />
                  <span>TOTAL</span>
                </div>
                <span className="text-[var(--accent-text)] tabular">
                  ${selectedLogOrder.total.toLocaleString("es-AR")}
                </span>
              </div>

              {selectedLogOrder.status !== "cancelado" &&
                selectedLogOrder.status !== "entregado" &&
                (!showCancelInput ? (
                  <button
                    type="button"
                    onClick={() => setShowCancelInput(true)}
                    className="w-full mt-2 h-11 bg-[var(--danger-soft)] hover:brightness-95 border border-transparent text-[var(--danger-base)] font-bold rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <X size={14} strokeWidth={2.5} />
                    Cancelar Ticket
                  </button>
                ) : (
                  <div className="mt-3 p-3.5 bg-[var(--danger-soft)]/40 border border-[var(--danger-base)]/20 rounded-xl space-y-2.5 animate-in slide-in-from-top-2 duration-200 text-left">
                    <label className="text-[10px] font-bold text-[var(--danger-base)] uppercase tracking-wider block">
                      Escribí exactamente &quot;cancelar&quot; para confirmar:
                    </label>
                    <input
                      type="text"
                      value={cancelConfirmText}
                      onChange={(e) => setCancelConfirmText(e.target.value)}
                      placeholder="Escribir aquí..."
                      className="w-full h-10 px-3 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--danger-base)] transition-all font-mono"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCancelInput(false);
                          setCancelConfirmText("");
                        }}
                        className="flex-1 h-9 bg-[var(--bg-panel)] hover:bg-[var(--bg-app)] text-[var(--text-secondary)] rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Atrás
                      </button>
                      <button
                        type="button"
                        disabled={cancelConfirmText !== "cancelar"}
                        onClick={handleCancelTicket}
                        className="flex-1 h-9 bg-[var(--danger-base)] text-white rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
