"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Trash2,
} from "lucide-react";
import type { Drink, DrinkCategory } from "@cocktrail/shared";
import { ConfirmRail } from "@/components/shared/ConfirmRail";
import ColumnPicker from "@/components/shared/ColumnPicker";
import { gridMinWidth } from "@/lib/crudCols";
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
  tags: TagFilter;
  promo?: TriFilter;
  trending?: TriFilter;
  id: string;
};

type Props = {
  drinks: Drink[];
  categories?: DrinkCategory[];
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
  onReorderDrinks?: (categoryId: string | null, ids: number[]) => Promise<void>;
};

const pillBase =
  "inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full leading-none";

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

type DragGhost = {
  id: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
};

export default function DrinksTable({
  drinks,
  categories = [],
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
  onReorderDrinks,
}: Props) {
  const grid = cartaGridTemplate(visibleCols);
  const minWidth = gridMinWidth(grid);

  const [dragDrinkId, setDragDrinkId] = useState<number | null>(null);
  const [dragCatId, setDragCatId] = useState<string | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [ghost, setGhost] = useState<DragGhost | null>(null);

  const dragFromRef = useRef<number | null>(null);
  const dragCatRef = useRef<string | null>(null);
  const fromIdxRef = useRef<number>(-1);
  const dropIdxRef = useRef<number | null>(null);
  const grabOffset = useRef({ x: 0, y: 0 });
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const groupRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (dragDrinkId == null) return;
    const prev = document.body.style.cursor;
    const select = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prev;
      document.body.style.userSelect = select;
    };
  }, [dragDrinkId]);

  function handlePointerDown(
    e: ReactPointerEvent<HTMLButtonElement>,
    d: Drink,
    catId: string,
    groupIdx: number,
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);

    const row = rowRefs.current.get(d.id);
    const rect = row?.getBoundingClientRect();
    if (!rect) return;

    dragFromRef.current = d.id;
    dragCatRef.current = catId;
    fromIdxRef.current = groupIdx;
    dropIdxRef.current = groupIdx;
    grabOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setDragDrinkId(d.id);
    setDragCatId(catId);
    setDropIdx(groupIdx);
    setGhost({
      id: d.id,
      name: d.name,
      width: rect.width,
      height: rect.height,
      x: e.clientX - grabOffset.current.x,
      y: e.clientY - grabOffset.current.y,
    });
  }

  function handlePointerMove(
    e: ReactPointerEvent<HTMLButtonElement>,
    catDrinks: Drink[],
    catId: string,
  ) {
    if (!dragFromRef.current || dragCatRef.current !== catId) return;

    setGhost((prev) =>
      prev
        ? {
            ...prev,
            x: e.clientX - grabOffset.current.x,
            y: e.clientY - grabOffset.current.y,
          }
        : prev,
    );

    // Boundary check: No pisa otros grupos
    const groupEl = groupRefs.current.get(catId);
    if (groupEl) {
      const gRect = groupEl.getBoundingClientRect();
      if (e.clientY < gRect.top - 24 || e.clientY > gRect.bottom + 24) {
        dropIdxRef.current = null;
        setDropIdx(null);
        return;
      }
    }

    let target = catDrinks.length;
    for (let idx = 0; idx < catDrinks.length; idx++) {
      const drink = catDrinks[idx]!;
      const row = rowRefs.current.get(drink.id);
      if (!row) continue;
      const rect = row.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        target = idx;
        break;
      }
    }
    dropIdxRef.current = target;
    setDropIdx(target);
  }

  function handlePointerUp(
    e: ReactPointerEvent<HTMLButtonElement>,
    catDrinks: Drink[],
    catId: string,
  ) {
    if (!dragFromRef.current) return;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const cat = dragCatRef.current;
    const fromIdx = fromIdxRef.current;
    const target = dropIdxRef.current;

    dragFromRef.current = null;
    dragCatRef.current = null;
    fromIdxRef.current = -1;
    dropIdxRef.current = null;
    setDragDrinkId(null);
    setDragCatId(null);
    setDropIdx(null);
    setGhost(null);

    if (cat === catId && target != null && fromIdx >= 0) {
      let toIdx = Math.max(0, Math.min(target, catDrinks.length));
      if (fromIdx < toIdx) toIdx -= 1;
      if (fromIdx === toIdx) return;

      const list = [...catDrinks];
      const [moved] = list.splice(fromIdx, 1);
      if (!moved) return;
      list.splice(toIdx, 0, moved);

      const realCatId = cat === "__none__" ? null : cat;
      void onReorderDrinks?.(realCatId, list.map((d) => d.id));
    }
  }

  const showLineAt = (catKey: string, idx: number, catDrinksLen: number) => {
    if (dragCatId !== catKey || dropIdx == null || fromIdxRef.current < 0) return false;
    if (dropIdx !== idx) return false;
    let toIdx = Math.max(0, Math.min(idx, catDrinksLen));
    if (fromIdxRef.current < toIdx) toIdx -= 1;
    return fromIdxRef.current !== toIdx;
  };

  // Grupos por categoría
  const groups = useMemo(() => {
    if (sortField !== "category") {
      return [
        {
          id: "__flat__",
          name: "Todos los productos",
          drinks,
        },
      ];
    }

    const result: { id: string | null; name: string; isSystem?: boolean; drinks: Drink[] }[] = [];
    const catList =
      categories && categories.length > 0
        ? [...categories].sort((a, b) => a.sortOrder - b.sortOrder)
        : [];

    const assignedIds = new Set<number>();
    for (const c of catList) {
      const groupDrinks = drinks.filter((d) => d.categoryId === c.id);
      if (groupDrinks.length > 0 || (!hasActiveSearch && !filtersOpen)) {
        groupDrinks.forEach((d) => assignedIds.add(d.id));
        result.push({
          id: c.id,
          name: c.name,
          isSystem: c.isSystem,
          drinks: groupDrinks,
        });
      }
    }

    const unassigned = drinks.filter((d) => !assignedIds.has(d.id));
    if (unassigned.length > 0) {
      result.push({
        id: null,
        name: "Sin categoría",
        drinks: unassigned,
      });
    }

    return result;
  }, [categories, drinks, sortField, hasActiveSearch, filtersOpen]);

  function renderHeaderCell(col: CartaColId) {
    if (col === "order") {
      return (
        <div
          key={col}
          className="px-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]"
          title="Prioridad dentro de la categoría"
        >
          #
        </div>
      );
    }
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
    if (col === "order") {
      return <div key={col} className="px-2 py-1.5" />;
    }
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

  function renderDataCell(
    col: CartaColId,
    d: Drink,
    isConfirming: boolean,
    groupIdx: number,
    catDrinks: Drink[],
    catKey: string,
    catName: string,
  ) {
    if (col === "order") {
      const canDrag =
        sortField === "category" &&
        !hasActiveSearch &&
        !filtersOpen &&
        Boolean(onReorderDrinks);
      return (
        <div
          key={col}
          className="px-1 py-2 flex items-center justify-center gap-1 min-w-0"
          onClick={(e) => e.stopPropagation()}
        >
          {!isConfirming && (
            <button
              type="button"
              onPointerDown={(e) => canDrag && handlePointerDown(e, d, catKey, groupIdx)}
              onPointerMove={(e) => canDrag && handlePointerMove(e, catDrinks, catKey)}
              onPointerUp={(e) => canDrag && handlePointerUp(e, catDrinks, catKey)}
              disabled={!canDrag}
              className={`p-1 rounded-md text-[var(--text-tertiary)] transition-colors select-none ${
                canDrag
                  ? "cursor-grab active:cursor-grabbing hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)]"
                  : "cursor-default opacity-30"
              }`}
              title={
                canDrag
                  ? `Arrastrá para cambiar prioridad dentro de ${catName}`
                  : "Prioridad del producto"
              }
              aria-label={`Prioridad ${groupIdx + 1} en ${catName}`}
            >
              <GripVertical size={13} />
            </button>
          )}
          <span className="font-mono text-[11px] font-semibold text-[var(--text-tertiary)] tabular-nums">
            {groupIdx + 1}
          </span>
        </div>
      );
    }
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
            <div className="flex flex-col">
              {groups.map((group) => {
                const normalizedCatId = group.id ?? "__none__";
                const isGroupEmpty = group.drinks.length === 0;

                return (
                  <div
                    key={normalizedCatId}
                    ref={(el) => {
                      if (el) groupRefs.current.set(normalizedCatId, el);
                      else groupRefs.current.delete(normalizedCatId);
                    }}
                    className="flex flex-col border-b border-[var(--border-subtle)] last:border-b-0"
                  >
                    {sortField === "category" && (
                      <div className="flex items-center justify-between px-3.5 py-2 bg-[var(--bg-panel)]/80 border-b border-[var(--border-subtle)]/70 select-none">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                            {group.name}
                          </span>
                          <span className="px-2 py-0.2 rounded-full text-[10px] font-medium bg-[var(--bg-surface)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
                            {group.drinks.length} {group.drinks.length === 1 ? "producto" : "productos"}
                          </span>
                        </div>
                      </div>
                    )}

                    {isGroupEmpty ? (
                      <div className="px-5 py-4 text-[12px] text-[var(--text-tertiary)] italic">
                        Sin productos en esta categoría
                      </div>
                    ) : (
                      <div className="divide-y divide-[var(--border-subtle)]">
                        {group.drinks.map((d, groupIdx) => {
                          const isSelected = selectedDrinkId === d.id;
                          const isConfirming = confirmingDeleteId === d.id;
                          const isDragging = dragDrinkId === d.id;
                          const showLine = showLineAt(normalizedCatId, groupIdx, group.drinks.length);

                          return (
                            <div
                              key={d.id}
                              ref={(el) => {
                                if (el) rowRefs.current.set(d.id, el);
                                else rowRefs.current.delete(d.id);
                              }}
                              className="relative"
                            >
                              {showLine && (
                                <div
                                  className="absolute left-1 right-1 top-0 -translate-y-1/2 h-0.5 bg-[var(--accent-primary)] pointer-events-none z-20"
                                  aria-hidden
                                >
                                  <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
                                </div>
                              )}

                              <div
                                onClick={() => !isConfirming && onSelectDrink(d)}
                                className={`relative grid gap-x-3 items-stretch transition-colors duration-[260ms] ${
                                  isDragging
                                    ? "opacity-30 border-dashed border border-[var(--accent-primary)] bg-[var(--accent-surface)]/20"
                                    : isConfirming
                                      ? "bg-[var(--danger-soft)] cursor-default"
                                      : `cursor-pointer hover:bg-[var(--bg-panel)] ${
                                          isSelected
                                            ? "bg-[var(--accent-surface)]/50 border-l-2 border-l-[var(--accent-primary)]"
                                            : groupIdx % 2 === 1
                                              ? "bg-[var(--bg-panel)]/45 border-l-2 border-transparent"
                                              : "bg-[var(--bg-surface)] border-l-2 border-transparent"
                                        }`
                                }`}
                                style={{ gridTemplateColumns: grid }}
                              >
                                {visibleCols.map((col) =>
                                  renderDataCell(
                                    col,
                                    d,
                                    isConfirming,
                                    groupIdx,
                                    group.drinks,
                                    normalizedCatId,
                                    group.name,
                                  ),
                                )}
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
                            </div>
                          );
                        })}

                        {showLineAt(normalizedCatId, group.drinks.length, group.drinks.length) && (
                          <div
                            className="relative h-0.5 bg-[var(--accent-primary)] pointer-events-none z-20 mx-1"
                            aria-hidden
                          >
                            <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {ghost && (
        <div
          className="fixed pointer-events-none z-50 rounded-xl bg-[var(--bg-surface)] border border-[var(--accent-primary)] shadow-2xl px-3 py-2 flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]"
          style={{
            width: ghost.width,
            left: ghost.x,
            top: ghost.y,
            transform: "scale(1.02)",
          }}
        >
          <GripVertical size={13} className="text-[var(--accent-primary)] shrink-0" />
          <span className="truncate">{ghost.name}</span>
        </div>
      )}
    </div>
  );
}
