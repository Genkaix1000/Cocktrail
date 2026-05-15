"use client";

import { Minus, Plus } from "lucide-react";

interface DrinkCardProps {
  name: string;
  price: number;
  vibe?: string;
  /** Si es trending, se renderiza con marco más prominente (hero). */
  isTrending?: boolean;
  quantity?: number;
  onAdd?: () => void;
  onRemove?: () => void;
}

/**
 * Card de trago para la /carta — Carta V2 (handoff).
 * - Si `isTrending`, es la card grande del hero grid (ink-800 + más respiro).
 * - Si no, es la card del grid normal (ink-900 + más compacta).
 * - Nombre en serif italic, precio en sans tabular.
 */
export default function DrinkCard({
  name,
  price,
  vibe,
  isTrending,
  quantity = 0,
  onAdd,
  onRemove,
}: DrinkCardProps) {
  const handleActivate = () => {
    if (onAdd) onAdd();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleActivate();
    }
  };

  // Hero card: más alta, fondo ink-800, name serif 18px.
  // Regular card: ink-900, name serif 17px.
  const baseClass = isTrending
    ? "bg-ink-800 border-ink-700 min-h-[132px]"
    : "bg-ink-900 border-ink-800 min-h-[148px] hover:border-ink-600";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Agregar ${name} al pedido`}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      className={`relative flex flex-col gap-2 p-3 rounded-[14px] border cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/50 ${baseClass}`}
    >
      {isTrending && (
        <span className="absolute top-2.5 right-2.5 text-[9px] font-medium tracking-[0.18em] uppercase text-amber">
          ▲ Hot
        </span>
      )}

      {vibe && (
        <span className="text-[9px] font-medium tracking-[0.2em] uppercase text-ink-400">
          {vibe}
        </span>
      )}

      <div className="font-serif-italic text-[17px] leading-[1.1] text-ink-50 flex-1 pr-1">
        {name}
      </div>

      <div className="flex items-center justify-between mt-auto">
        <span className="text-[15px] font-medium text-ink-50 tabular">
          ${price.toLocaleString("es-AR")}
        </span>

        {quantity > 0 ? (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
            className="flex items-center gap-1.5"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onRemove) onRemove();
              }}
              className="w-6 h-[26px] rounded-md bg-ink-750 border border-ink-600 text-ink-50 flex items-center justify-center text-sm font-medium hover:bg-ink-700 transition-colors"
              aria-label={`Quitar uno de ${name}`}
            >
              <Minus size={12} strokeWidth={2.5} />
            </button>
            <span className="text-[13px] font-medium text-ink-50 w-4 text-center tabular">
              {quantity}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onAdd) onAdd();
              }}
              className="w-6 h-[26px] rounded-md bg-ink-750 border border-ink-600 text-ink-50 flex items-center justify-center text-sm font-medium hover:bg-blue hover:text-ink-950 hover:border-blue transition-colors"
              aria-label={`Agregar uno de ${name}`}
            >
              <Plus size={12} strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onAdd) onAdd();
            }}
            className={
              isTrending
                ? "w-[30px] h-[30px] rounded-lg bg-blue text-ink-950 flex items-center justify-center text-lg font-semibold hover:brightness-110 transition-all active:scale-95"
                : "w-[26px] h-[26px] rounded-lg bg-ink-750 border border-ink-600 text-ink-100 flex items-center justify-center text-base font-medium hover:bg-blue hover:text-ink-950 hover:border-blue transition-all active:scale-95"
            }
            aria-label={`Agregar ${name} al pedido`}
          >
            <Plus
              size={isTrending ? 16 : 14}
              strokeWidth={2.5}
            />
          </button>
        )}
      </div>
    </div>
  );
}
