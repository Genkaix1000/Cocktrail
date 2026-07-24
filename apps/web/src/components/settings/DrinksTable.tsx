"use client";

import { ChevronDown, ChevronUp, DollarSign, Eye, EyeOff, GlassWater, Trash2, Wine } from "lucide-react";
import type { Drink } from "@cocktrail/shared";
import { ConfirmRail } from "@/components/shared/ConfirmRail";
import { ICONS_LIST } from "./cartaConstants";

type SortField = "name" | "price";
type SortDirection = "asc" | "desc";

type Props = {
  drinks: Drink[];
  loadError: boolean;
  search: string;
  sortField: SortField;
  sortDirection: SortDirection;
  isBosko: boolean;
  selectedDrinkId?: number;
  confirmingDeleteId: number | null;
  onSort: (field: SortField) => void;
  onRetry: () => void;
  onSelectDrink: (drink: Drink) => void;
  onToggleAvailable: (drink: Drink, e: React.MouseEvent) => void;
  onAskDelete: (drink: Drink) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (drink: Drink) => void;
};

export default function DrinksTable({
  drinks,
  loadError,
  search,
  sortField,
  sortDirection,
  isBosko,
  selectedDrinkId,
  confirmingDeleteId,
  onSort,
  onRetry,
  onSelectDrink,
  onToggleAvailable,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: Props) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_120px_140px] gap-0 border-b border-ink-800 bg-ink-950 text-[13px] font-bold select-none">
        <div
          onClick={() => onSort("name")}
          className={`px-5 py-3 cursor-pointer hover:bg-ink-900/60 transition-colors flex items-center gap-1.5 group/th ${
            sortField === "name"
              ? isBosko
                ? "bg-[#4ade80]/10 text-[#4ade80]"
                : "bg-blue/10 text-blue"
              : "text-ink-200"
          }`}
        >
          <Wine size={13} className={sortField === "name" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
          <span>Nombre</span>
          <span className={`transition-all duration-200 ${sortField === "name" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
            {sortField === "name" && sortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </span>
        </div>
        <div
          onClick={() => onSort("price")}
          className={`px-5 py-3 cursor-pointer hover:bg-ink-900/60 transition-colors flex items-center justify-end gap-1.5 group/th ${
            sortField === "price"
              ? isBosko
                ? "bg-[#4ade80]/10 text-[#4ade80]"
                : "bg-blue/10 text-blue"
              : "text-ink-200"
          }`}
        >
          <DollarSign size={13} className={sortField === "price" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
          <span>Precio</span>
          <span className={`transition-all duration-200 ${sortField === "price" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
            {sortField === "price" && sortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </span>
        </div>
        <div className="text-ink-500 text-center px-5 py-3 flex items-center justify-center">
          Acciones
        </div>
      </div>

      {loadError ? (
        <div className="px-5 py-10 flex flex-col items-center gap-2 text-center text-[12px] text-danger">
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
        <div className="px-5 py-10 text-center text-[12px] text-ink-500">
          {search ? "Sin resultados para tu búsqueda" : "No hay tragos registrados"}
        </div>
      ) : (
        <div className="divide-y divide-ink-850">
          {drinks.map((d, idx) => {
            const DrinkIcon = ICONS_LIST.find((i) => i.id === d.iconName)?.icon || GlassWater;
            const isSelected = selectedDrinkId === d.id;
            const isConfirming = confirmingDeleteId === d.id;
            return (
              <div
                key={d.id}
                onClick={() => !isConfirming && onSelectDrink(d)}
                className={`grid grid-cols-[1fr_120px_140px] gap-0 items-stretch transition-colors duration-[260ms] ${
                  isConfirming
                    ? "bg-[var(--danger-soft)] cursor-default"
                    : `cursor-pointer hover:bg-ink-850/30 ${idx % 2 === 0 ? "bg-ink-800/30" : ""} ${
                        isSelected
                          ? isBosko
                            ? "bg-[#4ade80]/5 border-l-2 border-l-[#4ade80]"
                            : "bg-blue/5 border-l-2 border-l-blue"
                          : "border-l-2 border-transparent"
                      }`
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 px-5 py-3 h-full">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                    isConfirming
                      ? "bg-[var(--danger-base)]/15 text-[var(--danger-base)]"
                      : sortField === "name"
                        ? isBosko
                          ? "bg-[#4ade80]/15 text-[#4ade80]"
                          : "bg-blue/15 text-blue"
                        : "bg-ink-800 text-ink-450"
                  }`}>
                    <DrinkIcon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[13px] truncate transition-all ${
                      isConfirming
                        ? "text-[var(--danger-base)] font-semibold"
                        : !d.available
                          ? "text-ink-500 line-through"
                          : sortField === "name"
                            ? isBosko
                              ? "text-[#4ade80] font-bold"
                              : "text-blue font-bold"
                            : "text-ink-50 font-semibold"
                    }`}>{d.name}</p>
                    {!isConfirming && (
                      <span
                        className={`mt-1 inline-flex text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded leading-none ${
                          d.available
                            ? "bg-green-soft text-green"
                            : "bg-ink-800 text-ink-500"
                        }`}
                      >
                        {d.available ? "En carta" : "Oculto"}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`font-mono text-[13px] text-right tabular px-5 py-3 h-full flex items-center justify-end transition-all ${
                  isConfirming
                    ? "text-[var(--danger-base)]/70"
                    : !d.available
                      ? "text-ink-500"
                      : sortField === "price"
                        ? isBosko
                          ? "text-[#4ade80] font-bold"
                          : "text-blue font-bold"
                        : "text-ink-100 font-semibold"
                }`}>
                  ${d.price.toLocaleString("es-AR")}
                </span>
                <div className="flex items-center justify-end gap-1.5 px-3 py-3 h-full min-w-0" onClick={(e) => e.stopPropagation()}>
                  {!isConfirming && (
                    <button
                      type="button"
                      onClick={(e) => onToggleAvailable(d, e)}
                      className={`w-7 h-7 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                        d.available
                          ? "bg-ink-800 border-ink-700 text-ink-300 hover:text-blue hover:border-blue-line"
                          : "bg-ink-800/40 border-ink-800 text-ink-550 hover:text-ink-300 hover:border-ink-700"
                      }`}
                      title={d.available ? "Ocultar de la carta" : "Mostrar en la carta"}
                    >
                      {d.available ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>
                  )}
                  <ConfirmRail
                    confirm={isConfirming}
                    message="¿Eliminar?"
                    className={isConfirming ? "flex-1 min-w-0" : "w-7 shrink-0"}
                    onAsk={() => onAskDelete(d)}
                    onCancel={onCancelDelete}
                    onConfirm={() => onConfirmDelete(d)}
                  >
                    <span className="w-7 h-7 rounded-md bg-ink-800 border border-ink-700 text-ink-300 flex items-center justify-center hover:text-danger hover:border-danger-line transition-all">
                      <Trash2 size={11} />
                    </span>
                  </ConfirmRail>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
