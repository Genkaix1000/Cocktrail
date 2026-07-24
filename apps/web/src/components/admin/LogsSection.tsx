"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Filter,
  RefreshCw,
  Search,
} from "lucide-react";

import { ordersService } from "@/services/orders.service";
import Toast from "@/components/shared/Toast";
import LogsTable, {
  type LogsColumnFilters,
  type LogsSortField,
  type SortDirection,
} from "./LogsTable";
import {
  type LogsColId,
  LOGS_COLS_DEFAULT,
  LOGS_COLS_REQUIRED,
  itemsLabel,
  loadLogsCols,
  orderLogsCols,
  paymentLabel,
  saveLogsCols,
} from "./logsCrud";

import type { Order, OrderStatus } from "@cocktrail/shared";

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
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
};

const formatDayMonth = (ts: number) => {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
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

type ViewFilter = "all" | OrderStatus;

const VIEWS: { id: ViewFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "pendiente", label: "Pendientes" },
  { id: "entregado", label: "Entregados" },
  { id: "cancelado", label: "Cancelados" },
];

const EMPTY_COL_FILTERS: LogsColumnFilters = {
  ticket: "",
  items: "",
  creator: "",
  method: "all",
  totalMin: "",
  totalMax: "",
  status: "all",
  delivery: "",
  token: "",
};

/**
 * Vista "Auditoría de Tickets" del panel admin. Todo el detalle del ticket
 * (token, estado, entrega, cancelación) vive en columnas de la tabla — no hay
 * popup — y cancelar es una acción de fila como el borrado en Carta/Staff.
 */
export default function LogsSection({ initialFilterTimestamp, isBosko: _isBosko }: Props) {
  const [auditLogs, setAuditLogs] = useState<Order[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [viewAllNights, setViewAllNights] = useState(initialFilterTimestamp != null);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState<LogsColumnFilters>(EMPTY_COL_FILTERS);
  const [visibleCols, setVisibleCols] = useState<LogsColId[]>(LOGS_COLS_DEFAULT);

  useEffect(() => {
    setVisibleCols(loadLogsCols());
  }, []);

  // Filtering & sorting state — si venimos de un redirect de Historial, el
  // mes/día arrancan precargados con la noche elegida.
  const [selectedLogMonth, setSelectedLogMonth] = useState<string>(
    initialFilterTimestamp != null ? formatMonthYear(initialFilterTimestamp) : "",
  );
  const [selectedLogDay, setSelectedLogDay] = useState<string>(
    initialFilterTimestamp != null ? formatDayMonth(initialFilterTimestamp) : "",
  );
  const [currentLogPage, setCurrentLogPage] = useState(1);

  const [logSortField, setLogSortField] = useState<LogsSortField>("time");
  const [logSortDirection, setLogSortDirection] = useState<SortDirection>("desc");

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

  // Reset page when day, month or any filter changes
  useEffect(() => {
    setCurrentLogPage(1);
  }, [selectedLogDay, selectedLogMonth, search, viewFilter, columnFilters]);

  // Raw logs for current selected month and day
  const currentDayLogs = useMemo(() => {
    if (!selectedLogMonth || !selectedLogDay || !groupedLogData[selectedLogMonth]) return [];
    return groupedLogData[selectedLogMonth][selectedLogDay] || [];
  }, [groupedLogData, selectedLogMonth, selectedLogDay]);

  const setFiltersOpenSafe = useCallback((open: boolean | ((prev: boolean) => boolean)) => {
    setFiltersOpen((prev) => {
      const next = typeof open === "function" ? open(prev) : open;
      if (!next) setColumnFilters(EMPTY_COL_FILTERS);
      return next;
    });
  }, []);

  const filteredLogs = useMemo(() => {
    let list = currentDayLogs;

    if (viewFilter !== "all") list = list.filter((o) => o.status === viewFilter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((o) =>
        [
          `#${o.displayNumber}`,
          String(o.displayNumber),
          o.token,
          itemsLabel(o),
          o.createdBy || "Cliente",
          o.deliveredBy ?? "",
          o.deliveredByBar ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    if (filtersOpen) {
      const cf = columnFilters;
      if (cf.ticket.trim()) {
        const q = cf.ticket.replace("#", "").trim();
        list = list.filter((o) => String(o.displayNumber).includes(q));
      }
      if (cf.items.trim()) {
        const q = cf.items.toLowerCase();
        list = list.filter((o) => itemsLabel(o).toLowerCase().includes(q));
      }
      if (cf.creator.trim()) {
        const q = cf.creator.toLowerCase();
        list = list.filter((o) => (o.createdBy || "Cliente").toLowerCase().includes(q));
      }
      if (cf.method !== "all") list = list.filter((o) => o.paymentMethod === cf.method);
      if (cf.status !== "all") list = list.filter((o) => o.status === cf.status);
      const min = Number(cf.totalMin);
      if (cf.totalMin.trim() && !Number.isNaN(min)) list = list.filter((o) => o.total >= min);
      const max = Number(cf.totalMax);
      if (cf.totalMax.trim() && !Number.isNaN(max)) list = list.filter((o) => o.total <= max);
      if (cf.delivery.trim()) {
        const q = cf.delivery.toLowerCase();
        list = list.filter((o) =>
          `${o.deliveredByBar ?? ""} ${o.deliveredBy ?? ""}`.toLowerCase().includes(q),
        );
      }
      if (cf.token.trim()) {
        const q = cf.token.toLowerCase();
        list = list.filter((o) => o.token.toLowerCase().includes(q));
      }
    }

    return list;
  }, [currentDayLogs, viewFilter, search, filtersOpen, columnFilters]);

  const sortedLogs = useMemo(() => {
    const value = (o: Order): string | number => {
      if (logSortField === "time") return o.createdAt;
      if (logSortField === "ticket") return o.displayNumber;
      if (logSortField === "creator") return (o.createdBy || "Cliente").toLowerCase();
      if (logSortField === "method") return paymentLabel(o.paymentMethod).toLowerCase();
      return o.total;
    };
    return [...filteredLogs].sort((a, b) => {
      const valA = value(a);
      const valB = value(b);
      if (valA < valB) return logSortDirection === "asc" ? -1 : 1;
      if (valA > valB) return logSortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredLogs, logSortField, logSortDirection]);

  const totalLogPages = Math.ceil(sortedLogs.length / logItemsPerPage);

  const paginatedLogs = useMemo(() => {
    const start = (currentLogPage - 1) * logItemsPerPage;
    return sortedLogs.slice(start, start + logItemsPerPage);
  }, [sortedLogs, currentLogPage]);

  const logPaginationRange = useMemo(() => {
    return getPaginationRange(currentLogPage, totalLogPages);
  }, [currentLogPage, totalLogPages]);

  const handleSort = (field: LogsSortField) => {
    if (logSortField === field) {
      setLogSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setLogSortField(field);
      setLogSortDirection("desc");
    }
    setCurrentLogPage(1);
  };

  const toggleCol = useCallback((col: LogsColId) => {
    if (LOGS_COLS_REQUIRED.includes(col)) return;
    setVisibleCols((prev) => {
      const next = orderLogsCols(
        prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
      );
      saveLogsCols(next);
      return next;
    });
  }, []);

  const handleCancelTicket = useCallback(async (order: Order) => {
    setConfirmingCancelId(null);
    try {
      const updated = await ordersService.updateStatus(order.id, "cancelado");
      setAuditLogs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (err) {
      console.error("Error cancelling ticket:", err);
      setError(err instanceof Error ? err.message : "Error al cancelar el ticket");
    }
  }, []);

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
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              {VIEWS.map((v) => {
                const active = viewFilter === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setViewFilter(v.id)}
                    className={`h-10 px-4 rounded-full text-[13px] font-semibold transition-all cursor-pointer ${
                      active
                        ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)] border border-transparent"
                        : "bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-app)]"
                    }`}
                  >
                    {v.label}
                  </button>
                );
              })}
              <button
                type="button"
                title="Filtros de columna"
                aria-label="Filtros de columna"
                aria-pressed={filtersOpen}
                onClick={() => setFiltersOpenSafe((o) => !o)}
                className={`w-10 h-10 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${
                  filtersOpen
                    ? "bg-[var(--accent-surface)] border-transparent text-[var(--accent-text)]"
                    : "bg-[var(--bg-surface)] border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)]"
                }`}
              >
                <Filter size={15} />
              </button>
            </div>

            <div className="flex-1 min-w-[180px] flex items-center h-10 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] overflow-hidden focus-within:border-[var(--accent-primary)]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por ticket, trago, creador o token…"
                className="flex-1 h-full pl-4 pr-2 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
              />
              <span className="w-10 h-10 flex items-center justify-center text-[var(--accent-primary)] shrink-0">
                <Search size={15} />
              </span>
            </div>
          </div>

          <LogsTable
            orders={paginatedLogs}
            hasActiveSearch={Boolean(search.trim()) || viewFilter !== "all"}
            sortField={logSortField}
            sortDirection={logSortDirection}
            visibleCols={visibleCols}
            filtersOpen={filtersOpen}
            columnFilters={columnFilters}
            confirmingCancelId={confirmingCancelId}
            onSort={handleSort}
            onToggleCol={toggleCol}
            onColumnFiltersChange={(patch) => setColumnFilters((prev) => ({ ...prev, ...patch }))}
            onAskCancel={(o) => setConfirmingCancelId(o.id)}
            onDismissCancel={() => setConfirmingCancelId(null)}
            onConfirmCancel={handleCancelTicket}
          />

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
        </div>
      )}

      {error && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast variant="error" message={error} onClose={() => setError(null)} />
        </div>
      )}
    </div>
  );
}
