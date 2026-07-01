"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileText,
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
export default function LogsSection({ initialFilterTimestamp, isBosko }: Props) {
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

  return (
    <div key="logs" className="space-y-6 max-w-6xl mx-auto w-full animate-dashboard-in">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
              <FileText size={16} />
            </div>
            <span>Auditoría de Tickets</span>
          </h1>
          <p className="text-[13px] text-ink-400/80 mt-1">
            Historial completo de todos los tickets emitidos, con registro de operadores y estado de canje.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const nextVal = !viewAllNights;
              setViewAllNights(nextVal);
              fetchLogs(nextVal);
            }}
            className={`h-10 px-4 rounded-xl border text-[12px] font-bold uppercase tracking-[0.08em] flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-[0.97] ${
              viewAllNights
                ? "bg-accent-soft/20 border-accent/35 text-accent shadow-sm"
                : "bg-ink-800 border-ink-700 text-ink-100 hover:text-ink-50"
            }`}
          >
            <CalendarDays size={14} />
            {viewAllNights ? "Ver Noche Actual" : "Ver Noches Anteriores"}
          </button>

          <button
            type="button"
            onClick={() => fetchLogs(viewAllNights)}
            disabled={loadingLogs}
            className="h-10 px-4 rounded-xl bg-ink-800 border border-ink-700 text-ink-100 hover:text-ink-50 text-[12px] font-bold uppercase tracking-[0.08em] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 select-none active:scale-[0.97]"
          >
            <RefreshCw size={14} className={loadingLogs ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filtros de Fecha: Mes -> Días */}
      {!loadingLogs && logMonths.length > 0 && (
        <div className="space-y-4">
          {/* Meses */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-ink-800">
            {logMonths.map((month) => (
              <button
                key={month}
                type="button"
                onClick={() => setSelectedLogMonth(month)}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                  selectedLogMonth === month
                    ? "bg-accent/20 text-accent border border-accent/35 shadow-sm"
                    : "bg-ink-900 border border-ink-800 text-ink-400 hover:text-ink-200"
                }`}
              >
                {month}
              </button>
            ))}
          </div>

          {/* Días dentro del mes seleccionado */}
          {logDays.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
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
                    className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                      selectedLogDay === day
                        ? "bg-ink-700 text-ink-50 border border-ink-600 shadow-sm"
                        : "bg-ink-900/40 border border-ink-850 text-ink-450 hover:text-ink-250"
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
        <div className="flex justify-center items-center h-64 bg-ink-900 border border-ink-800 rounded-xl">
          <span className="text-sm text-ink-400 font-mono">Cargando logs...</span>
        </div>
      ) : auditLogs.length === 0 ? (
        <div className="bg-ink-900 border border-ink-800 rounded-xl p-10 text-center">
          <p className="text-sm text-ink-500 font-serif-italic">— No hay tickets registrados en el historial —</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {paginatedLogs.length === 0 ? (
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-10 text-center text-ink-500 font-serif-italic text-sm">
              — No hay tickets para mostrar en este día —
            </div>
          ) : (
            <>
              <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-ink-950 border-b border-ink-800 text-[13px] font-bold select-none">
                        <th
                          onClick={() => handleSort("time")}
                          className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                            logSortField === "time"
                              ? isBosko
                                ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                : "bg-blue/10 text-blue font-bold"
                              : "text-ink-200"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Clock size={13} className={logSortField === "time" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                            <span>Hora</span>
                            <span className={`transition-all duration-200 ${logSortField === "time" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                              {logSortField === "time" && logSortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                            </span>
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("ticket")}
                          className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                            logSortField === "ticket"
                              ? isBosko
                                ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                : "bg-blue/10 text-blue font-bold"
                              : "text-ink-200"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Tag size={13} className={logSortField === "ticket" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                            <span>Ticket</span>
                            <span className={`transition-all duration-200 ${logSortField === "ticket" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                              {logSortField === "ticket" && logSortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                            </span>
                          </div>
                        </th>
                        <th className="py-4 px-5 text-ink-200 font-bold">
                          <div className="flex items-center gap-1.5">
                            <Wine size={13} className="text-ink-400" />
                            <span>Detalle</span>
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("creator")}
                          className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                            logSortField === "creator"
                              ? isBosko
                                ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                : "bg-blue/10 text-blue font-bold"
                              : "text-ink-200"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <User size={13} className={logSortField === "creator" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                            <span>Creador</span>
                            <span className={`transition-all duration-200 ${logSortField === "creator" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                              {logSortField === "creator" && logSortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                            </span>
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("method")}
                          className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                            logSortField === "method"
                              ? isBosko
                                ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                : "bg-blue/10 text-blue font-bold"
                              : "text-ink-200"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <CreditCard size={13} className={logSortField === "method" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                            <span>Medio de Pago</span>
                            <span className={`transition-all duration-200 ${logSortField === "method" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                              {logSortField === "method" && logSortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                            </span>
                          </div>
                        </th>
                        <th
                          onClick={() => handleSort("total")}
                          className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                            logSortField === "total"
                              ? isBosko
                                ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                : "bg-blue/10 text-blue font-bold"
                              : "text-ink-200"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <DollarSign size={13} className={logSortField === "total" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                            <span>Total</span>
                            <span className={`transition-all duration-200 ${logSortField === "total" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                              {logSortField === "total" && logSortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                            </span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-850">
                      {paginatedLogs.map((log, idx) => {
                        const isCancelled = log.status === "cancelado";

                        return (
                          <tr
                            key={log.id}
                            onClick={() => setSelectedLogOrder(log)}
                            className={`hover:bg-ink-850/30 transition-colors cursor-pointer text-[13px] group ${
                              idx % 2 === 0 ? "bg-ink-800/30" : ""
                            } ${isCancelled ? "opacity-60 line-through decoration-ink-600" : ""}`}
                          >
                            <td className={`py-3 px-5 font-mono text-[12.5px] transition-all ${
                              logSortField === "time"
                                ? isBosko
                                  ? "text-[#4ade80] font-bold"
                                  : "text-blue font-bold"
                                : "text-ink-300"
                            }`}>
                              {formatHm(log.createdAt)} hs
                            </td>
                            <td className="py-3 px-5">
                              <span className={`w-12 h-10 flex items-center justify-center rounded-xl bg-ink-800 border font-mono font-black text-[14px] shrink-0 transition-all ${
                                logSortField === "ticket"
                                  ? isBosko
                                    ? "text-[#4ade80] border-[#4ade80]/40"
                                    : "text-blue border-blue-line"
                                  : "text-ink-100 border-ink-750"
                              }`}>
                                #{log.displayNumber}
                              </span>
                            </td>
                            <td className="py-3 px-5 max-w-[200px] sm:max-w-[300px]">
                              <span className="text-[12px] text-ink-200 truncate font-semibold block" title={log.items.map((it) => `${it.qty}x ${it.name}`).join(", ")}>
                                {log.items.map((it) => `${it.qty}x ${it.name}`).join(", ")}
                              </span>
                            </td>
                            <td className="py-3 px-5">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all ${
                                logSortField === "creator"
                                  ? isBosko
                                    ? "bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20"
                                    : "bg-blue/10 text-blue border border-blue/20"
                                  : "bg-ink-850 text-ink-300 border border-ink-750"
                              }`}>
                                <User size={11} className={logSortField === "creator" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                <span>{log.createdBy || "Cliente"}</span>
                              </span>
                            </td>
                            <td className={`py-3 px-5 transition-all ${
                              logSortField === "method"
                                ? isBosko
                                  ? "text-[#4ade80] font-bold"
                                  : "text-blue font-bold"
                                : "text-ink-400"
                            }`}>
                              <span>
                                {log.paymentMethod === "efectivo"
                                  ? "Efectivo"
                                  : log.paymentMethod === "debito"
                                  ? "Posnet"
                                  : log.paymentMethod === "qr"
                                  ? "QR"
                                  : log.paymentMethod}
                              </span>
                            </td>
                            <td className={`py-3 px-5 font-mono font-black transition-all ${
                              logSortField === "total"
                                ? isBosko
                                  ? "text-[#4ade80]"
                                  : "text-blue"
                                : "text-ink-100"
                            }`}>
                              <span>${log.total.toLocaleString("es-AR")}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination Section (Limitada a 7 celdas con gaps) */}
              {totalLogPages > 1 && (
                <div className="flex items-center justify-center gap-1.5 pt-4">
                  <button
                    onClick={() => setCurrentLogPage((p) => Math.max(1, p - 1))}
                    disabled={currentLogPage === 1}
                    aria-label="Página anterior"
                    className="w-9 h-9 rounded-lg border border-ink-800 bg-ink-900 hover:bg-ink-850 text-ink-400 hover:text-ink-50 flex items-center justify-center transition-all disabled:opacity-30 disabled:hover:bg-ink-900 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ArrowLeft size={14} />
                  </button>

                  {logPaginationRange.map((page, idx) => {
                    if (page === "...") {
                      return (
                        <span
                          key={`gap-${idx}`}
                          className="w-9 h-9 flex items-center justify-center text-ink-500 font-mono"
                        >
                          ...
                        </span>
                      );
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentLogPage(Number(page))}
                        aria-current={currentLogPage === page ? "page" : undefined}
                        className={`w-9 h-9 rounded-lg border font-mono text-xs transition-all cursor-pointer ${
                          currentLogPage === page
                            ? "bg-accent/15 text-accent border-accent/20 font-bold"
                            : "bg-ink-900 border-ink-800 text-ink-400 hover:text-ink-200 hover:bg-ink-850"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setCurrentLogPage((p) => Math.min(totalLogPages, p + 1))}
                    disabled={currentLogPage === totalLogPages}
                    aria-label="Página siguiente"
                    className="w-9 h-9 rounded-lg border border-ink-800 bg-ink-900 hover:bg-ink-850 text-ink-400 hover:text-ink-50 flex items-center justify-center transition-all disabled:opacity-30 disabled:hover:bg-ink-900 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Log Order Detail Popup */}
      {selectedLogOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-ink-900 border border-white/10 w-full max-w-sm rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <Tag size={18} className="text-accent" />
                  <h3 className="font-mono text-lg font-black text-ink-50">Ticket #{selectedLogOrder.displayNumber}</h3>
                </div>
                <p className="font-mono text-[10px] text-ink-400 select-all mt-0.5">{selectedLogOrder.token}</p>
              </div>
              <button onClick={() => setSelectedLogOrder(null)} aria-label="Cerrar detalle del ticket" className="p-2.5 bg-white/5 rounded-full active:scale-90 transition-transform cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3 py-2 max-h-[35vh] overflow-y-auto">
              {selectedLogOrder.items.map((item) => (
                <div key={item.drinkId} className="flex justify-between items-start text-sm">
                  <div className="flex gap-2 min-w-0">
                    <Wine size={14} className="text-ink-400 mt-0.5 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-ink-50 truncate">{item.name}</span>
                      <span className="text-xs text-ink-400 font-mono tabular">{item.qty} x ${item.unitPrice.toLocaleString("es-AR")}</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-ink-200">${item.subtotal.toLocaleString("es-AR")}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between text-ink-300">
                <div className="flex items-center gap-1.5">
                  <User size={13} className="text-ink-450" />
                  <span>Creado por</span>
                </div>
                <span className="font-bold">{selectedLogOrder.createdBy || "Cliente"}</span>
              </div>
              <div className="flex justify-between text-ink-300">
                <div className="flex items-center gap-1.5">
                  {selectedLogOrder.paymentMethod === "efectivo" ? (
                    <DollarSign size={13} className="text-green" />
                  ) : (
                    <CreditCard size={13} className="text-blue" />
                  )}
                  <span>Medio de pago</span>
                </div>
                <span className="font-bold">
                  {selectedLogOrder.paymentMethod === "efectivo"
                    ? "Efectivo"
                    : selectedLogOrder.paymentMethod === "debito"
                    ? "Posnet"
                    : selectedLogOrder.paymentMethod === "qr"
                    ? "QR"
                    : selectedLogOrder.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between text-ink-300">
                <div className="flex items-center gap-1.5">
                  <Clock size={13} className="text-ink-450" />
                  <span>Creación</span>
                </div>
                <span>{formatDateHourDetailed(selectedLogOrder.createdAt)}</span>
              </div>

              {selectedLogOrder.status === "entregado" && (
                <div className="p-2.5 rounded-lg bg-green-soft border border-green-line text-green mt-2 flex flex-col gap-1">
                  <span className="font-bold uppercase text-[9px] tracking-wider">Detalles de Entrega:</span>
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
                <div className="p-2.5 rounded-lg bg-danger-soft border border-danger-line text-danger mt-2 flex flex-col gap-1">
                  <span className="font-bold uppercase text-[9px] tracking-wider">Detalles de Cancelación:</span>
                  <span className="text-[10px]">Cancelado por: {selectedLogOrder.cancelledBy || "sistema"}</span>
                  {selectedLogOrder.cancelledAt && (
                    <span className="text-[10px]">Hora: {new Date(selectedLogOrder.cancelledAt).toLocaleString("es-AR")}</span>
                  )}
                </div>
              )}

              <div className="flex justify-between text-base font-black text-ink-50 pt-2 border-t border-white/5 pb-2">
                <div className="flex items-center gap-1.5">
                  <Tag size={15} className="text-blue" />
                  <span>TOTAL</span>
                </div>
                <span className="text-blue">${selectedLogOrder.total.toLocaleString("es-AR")}</span>
              </div>

              {/* Cancel Flow inline in details */}
              {selectedLogOrder.status !== "cancelado" && selectedLogOrder.status !== "entregado" && (
                !showCancelInput ? (
                  <button
                    type="button"
                    onClick={() => setShowCancelInput(true)}
                    className="w-full mt-2 h-11 bg-danger-soft hover:bg-danger-soft/80 border border-danger-line text-danger font-black rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <X size={14} strokeWidth={2.5} />
                    Cancelar Ticket
                  </button>
                ) : (
                  <div className="mt-3 p-3.5 bg-danger-soft/20 border border-danger-line rounded-xl space-y-2.5 animate-in slide-in-from-top-2 duration-200 text-left">
                    <label className="text-[10px] font-bold text-danger uppercase tracking-wider block">
                      Escribí exactamente &quot;cancelar&quot; para confirmar:
                    </label>
                    <input
                      type="text"
                      value={cancelConfirmText}
                      onChange={(e) => setCancelConfirmText(e.target.value)}
                      placeholder="Escribir aquí..."
                      className="w-full h-10 px-3 bg-ink-950 border border-danger-line/30 rounded-lg text-sm text-ink-50 focus:outline-none focus:border-danger transition-all font-mono"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCancelInput(false);
                          setCancelConfirmText("");
                        }}
                        className="flex-1 h-9 bg-ink-800 hover:bg-ink-750 text-ink-300 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        Atrás
                      </button>
                      <button
                        type="button"
                        disabled={cancelConfirmText !== "cancelar"}
                        onClick={handleCancelTicket}
                        className="flex-1 h-9 bg-danger text-white rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
