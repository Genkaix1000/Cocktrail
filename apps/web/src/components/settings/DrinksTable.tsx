"use client";

import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GlassWater,
  Trash2,
} from "lucide-react";
import type { Drink } from "@cocktrail/shared";
import { ConfirmRail } from "@/components/shared/ConfirmRail";
import ColumnPicker from "@/components/shared/ColumnPicker";
import { gridMinWidth } from "@/lib/crudCols";
import { ICONS_LIST } from "./cartaConstants";
import {
  CARTA_COL_LABELS,
  CARTA_COLS_TOGGLEABLE,
  type CartaColId,
  cartaGridTemplate,
} from "./cartaCrud";

export type SortField = "name" | "price" | "category";
export type SortDirection = "asc" | "desc";
export type TriFilter = "all" | "yes" | "no";
export type TagFilter = "all" | "promo" | "trending" | "any";

export type ColumnFilters = {
  name: string;
  priceMin: string;
  priceMax: string;
  status: "all" | "in" | "out";
  tags: TagFilter;
  promo?: TriFilter;
  trending?: TriFilter;
  id: string;
};

type Props = {
  drinks: Drink[];
  categoryNames?: Record<string, string>;
  loadError: boolean;
  hasActiveSearch: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  selectedDrinkId?: number;
  confirmingDeleteId: number | null;
  visibleCols: CartaColId[];
  filtersOpen: boolean;
  columnFilters: ColumnFilters;
  onSort: (field: SortField) => void;
  onRetry: () => void;
  onSelectDrink: (drink: Drink) => void;
  onToggleAvailable: (drink: Drink, e: React.MouseEvent) => void;
  onAskDelete: (drink: Drink) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (drink: Drink) => void;
  onToggleCol: (col: CartaColId) => void;
  onColumnFiltersChange: (patch: Partial<ColumnFilters>) => void;
};

const pillBase =
  "inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full leading-none";

const pillStatusOn = "bg-[var(--success-soft)] text-[var(--success-base)]";
const pillStatusOff = "bg-[var(--bg-panel)] text-[var(--text-tertiary)]";
const pillPromo = "bg-[var(--amber-soft)] text-[var(--amber-base)]";
const pillTrend = "bg-[var(--accent-surface)] text-[var(--accent-text)]";

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
      <span>{label}</span>
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
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full h-7 px-2 rounded-lg text-[11px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent-primary)] ${className}`}
    />
  );
}

export default function DrinksTable({
  drinks,
  categoryNames = {},
  loadError,
  hasActiveSearch,
  sortField,
  sortDirection,
  selectedDrinkId,
  confirmingDeleteId,
  visibleCols,
  filtersOpen,
  columnFilters,
  onSort,
  onRetry,
  onSelectDrink,
  onToggleAvailable,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onToggleCol,
  onColumnFiltersChange,
}: Props) {
  const grid = cartaGridTemplate(visibleCols);
  const minWidth = gridMinWidth(grid);

  function renderHeaderCell(col: CartaColId) {
    if (col === "name") {
      return (
        <SortHeader
          key={col}
          label={CARTA_COL_LABELS.name}
          active={sortField === "name"}
          direction={sortDirection}
          onClick={() => onSort("name")}
        />
      );
    }
    if (col === "price") {
      return (
        <SortHeader
          key={col}
          label={CARTA_COL_LABELS.price}
          active={sortField === "price"}
          direction={sortDirection}
          onClick={() => onSort("price")}
        />
      );
    }
    if (col === "category") {
      return (
        <SortHeader
          key={col}
          label={CARTA_COL_LABELS.category}
          active={sortField === "category"}
          direction={sortDirection}
          onClick={() => onSort("category")}
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
            cols={CARTA_COLS_TOGGLEABLE}
            labels={CARTA_COL_LABELS}
            visible={visibleCols}
            onToggle={onToggleCol}
          />
        </div>
      );
    }
    return (
      <div
        key={col}
        className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]"
      >
        {CARTA_COL_LABELS[col]}
      </div>
    );
  }

  function renderFilterCell(col: CartaColId) {
    if (col === "name") {
      return (
        <div key={col} className="px-2 py-1.5">
          <FilterInput
            value={columnFilters.name}
            onChange={(v) => onColumnFiltersChange({ name: v })}
            placeholder="Filtrar…"
          />
        </div>
      );
    }
    if (col === "price") {
      return (
        <div key={col} className="px-2 py-1.5 flex gap-1">
          <FilterInput
            type="number"
            value={columnFilters.priceMin}
            onChange={(v) => onColumnFiltersChange({ priceMin: v })}
            placeholder="Min"
          />
          <FilterInput
            type="number"
            value={columnFilters.priceMax}
            onChange={(v) => onColumnFiltersChange({ priceMax: v })}
            placeholder="Max"
          />
        </div>
      );
    }
    if (col === "status") {
      return (
        <div key={col} className="px-2 py-1.5">
          <select
            value={columnFilters.status}
            onChange={(e) =>
              onColumnFiltersChange({ status: e.target.value as ColumnFilters["status"] })
            }
            className="w-full h-7 px-1.5 rounded-lg text-[11px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none"
          >
            <option value="all">Todos</option>
            <option value="in">En carta</option>
            <option value="out">Ocultos</option>
          </select>
        </div>
      );
    }
    if (col === "tags") {
      return (
        <div key={col} className="px-2 py-1.5">
          <select
            value={columnFilters.tags || "all"}
            onChange={(e) =>
              onColumnFiltersChange({ tags: e.target.value as TagFilter })
            }
            className="w-full h-7 px-1.5 rounded-lg text-[11px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] outline-none"
          >
            <option value="all">Todas</option>
            <option value="promo">Solo Promo</option>
            <option value="trending">Solo Tendencia</option>
            <option value="any">Con Etiqueta</option>
          </select>
        </div>
      );
    }
    if (col === "id") {
      return (
        <div key={col} className="px-2 py-1.5">
          <FilterInput
            value={columnFilters.id}
            onChange={(v) => onColumnFiltersChange({ id: v })}
            placeholder="#"
          />
        </div>
      );
    }
    return <div key={col} className="px-2 py-1.5" />;
  }

  function renderDataCell(col: CartaColId, d: Drink, isConfirming: boolean) {
    if (col === "id") {
      return (
        <div
          key={col}
          className={`px-3 py-2.5 font-mono text-[12px] text-left tabular ${
            isConfirming ? "text-[var(--danger-base)]/70" : "text-[var(--text-tertiary)]"
          }`}
        >
          {d.id}
        </div>
      );
    }
    if (col === "icon") {
      const DrinkIcon = ICONS_LIST.find((i) => i.id === d.iconName)?.icon || GlassWater;
      return (
        <div key={col} className="flex items-center justify-start pl-3 pr-1 py-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              isConfirming
                ? "bg-[var(--danger-base)]/15 text-[var(--danger-base)]"
                : "bg-[var(--accent-surface)] text-[var(--accent-text)]"
            }`}
          >
            <DrinkIcon size={15} />
          </div>
        </div>
      );
    }
    if (col === "name") {
      const showInlineTags =
        (d.promo || d.trending) && !visibleCols.includes("tags");
      return (
        <div key={col} className="flex flex-col justify-center min-w-0 pl-1 pr-3 py-2">
          <p
            className={`text-[13px] font-semibold truncate ${
              isConfirming
                ? "text-[var(--danger-base)]"
                : !d.available
                  ? "text-[var(--text-tertiary)] line-through"
                  : "text-[var(--text-primary)]"
            }`}
          >
            {d.name}
          </p>
          {showInlineTags && (
            <span className="text-[11px] font-medium text-[var(--text-tertiary)] truncate mt-0.5 select-none">
              {d.promo && d.trending
                ? "Promo · Tendencia"
                : d.promo
                  ? "Promo"
                  : "Tendencia"}
            </span>
          )}
        </div>
      );
    }
    if (col === "category") {
      const label = d.categoryId ? categoryNames[d.categoryId] ?? d.categoryId : "—";
      return (
        <div
          key={col}
          className={`px-3 py-2.5 text-[12px] truncate ${
            isConfirming ? "text-[var(--danger-base)]/70" : "text-[var(--text-secondary)]"
          }`}
        >
          {label}
        </div>
      );
    }
    if (col === "price") {
      return (
        <div
          key={col}
          className={`px-3 py-2.5 font-mono text-[13px] text-left tabular font-semibold ${
            isConfirming
              ? "text-[var(--danger-base)]/70"
              : !d.available
                ? "text-[var(--text-tertiary)]"
                : "text-[var(--text-primary)]"
          }`}
        >
          ${d.price.toLocaleString("es-AR")}
        </div>
      );
    }
    if (col === "status") {
      return (
        <div key={col} className="px-3 py-2.5 flex items-center justify-start">
          {!isConfirming && (
            <span
              className={`${pillBase} ${d.available ? pillStatusOn : pillStatusOff}`}
            >
              {d.available ? "En carta" : "Oculto"}
            </span>
          )}
        </div>
      );
    }
    if (col === "tags") {
      return (
        <div key={col} className="px-3 py-2.5 flex items-center justify-start gap-1.5 flex-wrap">
          {!isConfirming && (
            <>
              {d.promo && <span className={`${pillBase} ${pillPromo}`}>Promo</span>}
              {d.trending && <span className={`${pillBase} ${pillTrend}`}>Tendencia</span>}
              {!d.promo && !d.trending && (
                <span className="text-[var(--text-tertiary)] text-[12px]">—</span>
              )}
            </>
          )}
        </div>
      );
    }
    if (col === "actions") {
      return (
        <div
          key={col}
          className="flex items-center justify-start gap-1.5 px-3 py-2 min-w-0"
          onClick={(e) => e.stopPropagation()}
        >
          {!isConfirming && (
            <>
              <button
                type="button"
                onClick={(e) => onToggleAvailable(d, e)}
                className="w-7 h-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-[var(--accent-text)] hover:border-[var(--accent-primary)]/40 flex items-center justify-center transition-all cursor-pointer shrink-0"
                title={d.available ? "Ocultar de la carta" : "Mostrar en la carta"}
              >
                {d.available ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <ConfirmRail
                confirm={false}
                message="¿Eliminar?"
                className="w-7 shrink-0"
                onAsk={() => onAskDelete(d)}
                onCancel={onCancelDelete}
                onConfirm={() => onConfirmDelete(d)}
              >
                <span className="w-7 h-7 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)] flex items-center justify-center hover:text-[var(--danger-base)] hover:border-[var(--danger-base)]/40 transition-all">
                  <Trash2 size={11} />
                </span>
              </ConfirmRail>
            </>
          )}
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

          {loadError ? (
            <div className="px-5 py-10 flex flex-col items-center gap-2 text-center text-[12px] text-[var(--danger-base)]">
              <span>No se pudo cargar la carta. Revisá tu conexión.</span>
              <button
                type="button"
                onClick={onRetry}
                className="text-[11px] font-bold uppercase tracking-wider underline underline-offset-2 cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : drinks.length === 0 ? (
            <div className="px-5 py-10 text-center text-[12px] text-[var(--text-tertiary)]">
              {hasActiveSearch || filtersOpen
                ? "Sin resultados para tu búsqueda"
                : "No hay tragos registrados"}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {drinks.map((d, idx) => {
                const isSelected = selectedDrinkId === d.id;
                const isConfirming = confirmingDeleteId === d.id;
                return (
                  <div
                    key={d.id}
                    onClick={() => !isConfirming && onSelectDrink(d)}
                    className={`relative grid gap-x-3 items-stretch transition-colors duration-[260ms] ${
                      isConfirming
                        ? "bg-[var(--danger-soft)] cursor-default"
                        : `cursor-pointer hover:bg-[var(--bg-panel)] ${
                            isSelected
                              ? "bg-[var(--accent-surface)]/50 border-l-2 border-l-[var(--accent-primary)]"
                              : idx % 2 === 1
                                ? "bg-[var(--bg-panel)]/45 border-l-2 border-transparent"
                                : "bg-[var(--bg-surface)] border-l-2 border-transparent"
                          }`
                    }`}
                    style={{ gridTemplateColumns: grid }}
                  >
                    {visibleCols.map((col) => renderDataCell(col, d, isConfirming))}
                    {isConfirming && (
                      <div
                        className="absolute inset-y-0 right-0 z-10 flex items-center min-w-[220px] w-[min(280px,55%)] pl-4 pr-3 bg-[var(--danger-soft)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ConfirmRail
                          confirm
                          message="¿Eliminar?"
                          className="w-full h-full"
                          onAsk={() => {}}
                          onCancel={onCancelDelete}
                          onConfirm={() => onConfirmDelete(d)}
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
    </div>
  );
}
