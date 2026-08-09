"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Ban, TriangleAlert, Wine } from "lucide-react";
import { displayOrderRevenue, type Order, type PaymentMethod } from "@cocktrail/shared";

import { ConfirmRail } from "@/components/shared/ConfirmRail";
import ColumnPicker from "@/components/shared/ColumnPicker";
import CancelledTicketModal from "@/components/shared/CancelledTicketModal";
import { gridMinWidth } from "@/lib/crudCols";
import { formatHm } from "@/lib/utils";
import {
  LOGS_COL_LABELS,
  LOGS_COLS_TOGGLEABLE,
  type LogsColId,
  formatDateHour,
  isCancelable,
  itemsLabel,
  logsGridTemplate,
  paymentLabel,
} from "./logsCrud";

export type LogsSortField = "time" | "ticket" | "creator" | "method" | "total";
export type SortDirection = "asc" | "desc";

export type LogsColumnFilters = {
  ticket: string;
  items: string;
  creator: string;
  method: "all" | PaymentMethod;
  totalMin: string;
  totalMax: string;
  token: string;
};

type Props = {
  orders: Order[];
  hasActiveSearch: boolean;
  sortField: LogsSortField;
  sortDirection: SortDirection;
  visibleCols: LogsColId[];
  filtersOpen: boolean;
  columnFilters: LogsColumnFilters;
  confirmingCancelId: string | null;
  onSort: (field: LogsSortField) => void;
  onToggleCol: (col: LogsColId) => void;
  onColumnFiltersChange: (patch: Partial<LogsColumnFilters>) => void;
  onAskCancel: (order: Order) => void;
  onDismissCancel: () => void;
  onConfirmCancel: (order: Order) => void;
};

const pillBase = "inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full leading-none";

function SortHeader({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2.5 cursor-pointer flex items-center gap-1 justify-start text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
        active
          ? "text-[var(--accent-text)] bg-[var(--accent-surface)]/60"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className={active ? "opacity-100" : "opacity-40"}>
        {active && direction === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </span>
    </button>
  );
}

function FilterInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-7 px-2 rounded-lg text-[11px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent-primary)]"
    />
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-7 px-1.5 rounded-lg text-[11px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const SORTABLE: Partial<Record<LogsColId, LogsSortField>> = {
  time: "time",
  ticket: "ticket",
  creator: "creator",
  method: "method",
  total: "total",
};

export default function LogsTable({
  orders,
  hasActiveSearch,
  sortField,
  sortDirection,
  visibleCols,
  filtersOpen,
  columnFilters,
  confirmingCancelId,
  onSort,
  onToggleCol,
  onColumnFiltersChange,
  onAskCancel,
  onDismissCancel,
  onConfirmCancel,
}: Props) {
  const [selectedCancelledOrder, setSelectedCancelledOrder] = useState<Order | null>(null);

  const grid = logsGridTemplate(visibleCols);
  const minWidth = gridMinWidth(grid);

  function renderHeaderCell(col: LogsColId) {
    const sortable = SORTABLE[col];
    if (sortable) {
      return (
        <SortHeader
          key={col}
          label={LOGS_COL_LABELS[col]}
          active={sortField === sortable}
          direction={sortDirection}
          onClick={() => onSort(sortable)}
        />
      );
    }
    if (col === "actions") {
      return (
        <div key={col} className="flex items-center justify-start gap-1.5 px-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
            Acciones
          </span>
          <ColumnPicker
            cols={LOGS_COLS_TOGGLEABLE}
            labels={LOGS_COL_LABELS}
            visible={visibleCols}
            onToggle={onToggleCol}
          />
        </div>
      );
    }
    return (
      <div
        key={col}
        className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] truncate"
      >
        {LOGS_COL_LABELS[col]}
      </div>
    );
  }

  function renderFilterCell(col: LogsColId) {
    const cell = (node: React.ReactNode) => (
      <div key={col} className="px-2 py-1.5">
        {node}
      </div>
    );

    if (col === "ticket") {
      return cell(
        <FilterInput
          value={columnFilters.ticket}
          onChange={(v) => onColumnFiltersChange({ ticket: v })}
          placeholder="#"
        />,
      );
    }
    if (col === "items") {
      return cell(
        <FilterInput
          value={columnFilters.items}
          onChange={(v) => onColumnFiltersChange({ items: v })}
          placeholder="Filtrar…"
        />,
      );
    }
    if (col === "creator") {
      return cell(
        <FilterInput
          value={columnFilters.creator}
          onChange={(v) => onColumnFiltersChange({ creator: v })}
          placeholder="Filtrar…"
        />,
      );
    }
    if (col === "method") {
      return cell(
        <FilterSelect
          value={columnFilters.method}
          onChange={(v) => onColumnFiltersChange({ method: v as LogsColumnFilters["method"] })}
          options={[
            { value: "all", label: "Todos" },
            { value: "efectivo", label: "Efectivo" },
            { value: "debito", label: "Posnet" },
            { value: "qr", label: "QR" },
          ]}
        />,
      );
    }
    if (col === "total") {
      return (
        <div key={col} className="px-2 py-1.5 flex gap-1">
          <FilterInput
            type="number"
            value={columnFilters.totalMin}
            onChange={(v) => onColumnFiltersChange({ totalMin: v })}
            placeholder="Min"
          />
          <FilterInput
            type="number"
            value={columnFilters.totalMax}
            onChange={(v) => onColumnFiltersChange({ totalMax: v })}
            placeholder="Max"
          />
        </div>
      );
    }
    if (col === "token") {
      return cell(
        <FilterInput
          value={columnFilters.token}
          onChange={(v) => onColumnFiltersChange({ token: v })}
          placeholder="Filtrar…"
        />,
      );
    }
    return <div key={col} className="px-2 py-1.5" />;
  }

  function renderDataCell(col: LogsColId, o: Order, isConfirming: boolean) {
    const muted = o.status === "cancelado";
    const dim = isConfirming ? "text-[var(--danger-base)]/70" : "";

    if (col === "time") {
      return (
        <div
          key={col}
          className={`px-3 py-2.5 font-mono text-[12.5px] tabular ${
            dim || "text-[var(--text-secondary)]"
          }`}
          title={formatDateHour(o.createdAt)}
        >
          {formatHm(o.createdAt)} hs
        </div>
      );
    }
    if (col === "ticket") {
      const isCancelled = o.status === "cancelado";
      return (
        <div key={col} className="px-3 py-2 flex items-center gap-1.5">
          <span
            className={`w-12 h-9 flex items-center justify-center rounded-xl border font-mono font-bold text-[13px] shrink-0 ${
              isConfirming
                ? "text-[var(--danger-base)] border-[var(--danger-base)]/40 bg-transparent"
                : "text-[var(--text-primary)] border-[var(--border-subtle)] bg-[var(--bg-panel)]"
            }`}
          >
            #{o.displayNumber}
          </span>
          {isCancelled && (
            <button
              type="button"
              onClick={() => setSelectedCancelledOrder(o)}
              title="Ticket cancelado — Ver detalles"
              aria-label={`Ver detalles de cancelación del ticket #${o.displayNumber}`}
              className="w-7 h-7 rounded-lg bg-[var(--danger-soft)] border border-[var(--danger-line)] text-[var(--danger-base)] flex items-center justify-center hover:scale-105 transition-transform cursor-pointer shrink-0"
            >
              <TriangleAlert size={14} strokeWidth={2.2} />
            </button>
          )}
        </div>
      );
    }
    if (col === "items") {
      const label = itemsLabel(o);
      return (
        <div key={col} className="px-3 py-2.5 min-w-0 flex items-center gap-1.5">
          <Wine size={13} className="text-[var(--text-tertiary)] shrink-0" strokeWidth={1.8} />
          <span
            className={`text-[12px] font-medium truncate ${dim || "text-[var(--text-primary)]"}`}
            title={label}
          >
            {label}
          </span>
        </div>
      );
    }
    if (col === "creator") {
      return (
        <div key={col} className="px-3 py-2.5 min-w-0 flex items-center">
          <span
            className={`${pillBase} bg-[var(--bg-panel)] text-[var(--text-secondary)] truncate max-w-full`}
          >
            {o.createdBy || "Cliente"}
          </span>
        </div>
      );
    }
    if (col === "method") {
      return (
        <div
          key={col}
          className={`px-3 py-2.5 text-[12px] truncate ${dim || "text-[var(--text-secondary)]"}`}
        >
          {paymentLabel(o.paymentMethod)}
        </div>
      );
    }
    if (col === "total") {
      const net = o.mpNetReceived;
      const showNet = net != null && net !== o.total;
      return (
        <div
          key={col}
          className={`px-3 py-2.5 font-mono tabular ${
            dim || (muted ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")
          }`}
          title={
            showNet && o.mpFeeAmount != null
              ? `Facturado $${o.total.toLocaleString("es-AR")} · Comisión MP $${o.mpFeeAmount.toLocaleString("es-AR")}`
              : undefined
          }
        >
          <span className="text-[13px] font-bold">
            ${displayOrderRevenue(o).toLocaleString("es-AR")}
          </span>
          {showNet && (
            <span className="block text-[10px] font-medium text-[var(--text-tertiary)] leading-tight">
              fact. ${o.total.toLocaleString("es-AR")}
            </span>
          )}
        </div>
      );
    }
    if (col === "token") {
      return (
        <div key={col} className="px-3 py-2.5 min-w-0 flex items-center">
          <span
            className="font-mono text-[11px] text-[var(--text-tertiary)] truncate select-all"
            title={o.token}
          >
            {o.token}
          </span>
        </div>
      );
    }
    if (col === "actions") {
      return (
        <div key={col} className="flex items-center justify-start gap-1.5 px-3 py-2 min-w-0">
          {!isConfirming &&
            (isCancelable(o) ? (
              <ConfirmRail
                confirm={false}
                message="¿Cancelar?"
                className="w-7 shrink-0"
                askLabel={`Cancelar ticket #${o.displayNumber}`}
                onAsk={() => onAskCancel(o)}
                onCancel={onDismissCancel}
                onConfirm={() => onConfirmCancel(o)}
              >
                <span className="w-7 h-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)] flex items-center justify-center hover:text-[var(--danger-base)] hover:border-[var(--danger-base)]/40 transition-all">
                  <Ban size={11} />
                </span>
              </ConfirmRail>
            ) : (
              <button
                type="button"
                disabled
                title="El ticket ya está cancelado"
                className="w-7 h-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-tertiary)] opacity-40 cursor-not-allowed flex items-center justify-center"
              >
                <Ban size={11} />
              </button>
            ))}
        </div>
      );
    }
    return null;
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-card">
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div
            className="grid gap-x-3 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)]"
            style={{ gridTemplateColumns: grid }}
          >
            {visibleCols.map(renderHeaderCell)}
          </div>

          {filtersOpen && (
            <div
              className="grid gap-x-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]"
              style={{ gridTemplateColumns: grid }}
            >
              {visibleCols.map(renderFilterCell)}
            </div>
          )}

          {orders.length === 0 ? (
            <div className="px-5 py-10 text-center text-[12px] text-[var(--text-tertiary)]">
              {hasActiveSearch || filtersOpen
                ? "Sin resultados para tu búsqueda"
                : "No hay tickets para mostrar en este día"}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {orders.map((o, idx) => {
                const isConfirming = confirmingCancelId === o.id;
                return (
                  <div
                    key={o.id}
                    className={`relative grid gap-x-3 items-stretch transition-colors duration-[260ms] ${
                      isConfirming
                        ? "bg-[var(--danger-soft)]"
                        : `hover:bg-[var(--bg-panel)] ${
                            idx % 2 === 1 ? "bg-[var(--bg-panel)]/45" : "bg-[var(--bg-surface)]"
                          } ${o.status === "cancelado" ? "opacity-60" : ""}`
                    }`}
                    style={{ gridTemplateColumns: grid }}
                  >
                    {visibleCols.map((col) => renderDataCell(col, o, isConfirming))}
                    {isConfirming && (
                      <div className="absolute inset-y-0 right-0 z-10 flex items-center min-w-[240px] w-[min(300px,55%)] pl-4 pr-3 bg-[var(--danger-soft)]">
                        <ConfirmRail
                          confirm
                          message={`¿Cancelar #${o.displayNumber}?`}
                          className="w-full h-full"
                          askLabel={`Cancelar ticket #${o.displayNumber}`}
                          onAsk={() => {}}
                          onCancel={onDismissCancel}
                          onConfirm={() => onConfirmCancel(o)}
                        >
                          <span />
                        </ConfirmRail>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedCancelledOrder && (
        <CancelledTicketModal
          order={selectedCancelledOrder}
          onClose={() => setSelectedCancelledOrder(null)}
        />
      )}
    </div>
  );
}

