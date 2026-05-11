"use client";

import {
  Candy,
  Citrus,
  GlassWater,
  Leaf,
  type LucideIcon,
  Minus,
  Plus,
  Star,
  Wind,
  Zap,
} from "lucide-react";

const FLAVOR_ICONS: Record<string, LucideIcon> = {
  Dulce: Candy,
  Amargo: GlassWater,
  Cítrico: Citrus,
  Refrescante: Wind,
  Popular: Star,
  Energía: Zap,
  Herbal: Leaf,
};

interface DrinkCardProps {
  name: string;
  description?: string;
  price: number;
  isTrending?: boolean;
  icon?: LucideIcon;
  flavors?: string[];
  vibe?: string;
  quantity?: number;
  onAdd?: () => void;
  onRemove?: () => void;
}

export default function DrinkCard({
  name,
  description,
  price,
  isTrending,
  icon: Icon,
  flavors = [],
  vibe,
  quantity = 0,
  onAdd,
  onRemove,
}: DrinkCardProps) {
  const handleCardActivate = () => {
    if (onAdd) onAdd();
  };

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCardActivate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Agregar ${name} al pedido`}
      onClick={handleCardActivate}
      onKeyDown={handleCardKeyDown}
      className={`group relative flex flex-col p-4 rounded-2xl bg-[#0f172a] border cursor-pointer active:scale-[0.98] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]/60 ${
        isTrending
          ? "border-[#38bdf8] shadow-[0_0_15px_rgba(56,189,248,0.15)] ring-1 ring-[#38bdf8]/30"
          : "border-[#1e293b] hover:border-[#38bdf8]/30"
      }`}
    >
      {vibe && (
        <div className="text-[9px] font-black tracking-[0.3em] text-slate-500 mb-3 uppercase">
          {vibe}
        </div>
      )}

      <div className="flex justify-between items-start mb-2">
        <div className="flex flex-col gap-1 pr-4">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={18} className="text-[#38bdf8]" />}
            <h3 className="text-white font-semibold text-lg tracking-tight">
              {name}
            </h3>
            {isTrending && <span className="text-sm">🔥</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 pr-4 flex-1">
        <p className="text-slate-400 text-sm line-clamp-2 leading-snug mb-2">
          {description}
        </p>

        {flavors.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-4">
            {flavors.map((f) => {
              const FlavorIcon = FLAVOR_ICONS[f];
              return (
                <div
                  key={f}
                  className="flex items-center gap-1 text-slate-300"
                >
                  {FlavorIcon && (
                    <FlavorIcon size={12} className="text-[#38bdf8]" />
                  )}
                  <span className="text-[10px] font-light tracking-wide">
                    {f}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-auto flex items-end justify-between pt-2 border-t border-[#1e293b]/50">
        <span className="text-[#38bdf8] font-bold text-lg">
          ${price.toLocaleString("es-AR")}
        </span>

        <div className="flex items-center gap-2">
          {quantity > 0 ? (
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
              className="flex items-center bg-[#020617] rounded-full border border-[#1e293b] p-0.5"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onRemove) onRemove();
                }}
                className="w-8 h-8 rounded-full bg-[#0f172a] flex items-center justify-center text-[#38bdf8] hover:bg-[#1e293b]/80 transition-colors"
                aria-label={`Quitar uno de ${name}`}
              >
                <Minus size={14} strokeWidth={3} />
              </button>
              <span className="text-white font-mono w-6 text-center text-xs font-bold">
                {quantity}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onAdd) onAdd();
                }}
                className="w-8 h-8 rounded-full bg-[#38bdf8] flex items-center justify-center text-[#020617] hover:bg-[#7dd3fc] transition-colors"
                aria-label={`Agregar uno de ${name}`}
              >
                <Plus size={14} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onAdd) onAdd();
              }}
              className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#38bdf8] flex items-center justify-center text-[#020617] shadow-[0_0_15px_rgba(56,189,248,0.3)] hover:bg-[#7dd3fc] active:shadow-none transition-all"
              aria-label={`Agregar ${name} al pedido`}
            >
              <Plus size={20} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
