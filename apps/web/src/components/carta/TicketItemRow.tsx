import { GlassWater, Beer, Zap, Droplet, DropletOff, Wine, Martini, Citrus, CupSoda, BottleWine } from "lucide-react";
import type { ComponentType } from "react";
import type { Drink, OrderItem } from "@cocktrail/shared";

const ICON_MAP: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  "glass-water": GlassWater,
  beer: Beer,
  zap: Zap,
  droplet: Droplet,
  "droplet-off": DropletOff,
  wine: Wine,
  martini: Martini,
  citrus: Citrus,
  "cup-soda": CupSoda,
  "bottle-wine": BottleWine,
};

type Props = {
  item: OrderItem;
  drink?: Drink;
  accentColor: string;
  /** "Recibo de Pago" muestra el precio; "Ticket de Control" no. */
  showPrice?: boolean;
};

/**
 * Fila de un ítem del pedido en Ticket.tsx — compartida entre "Ticket de
 * Control" y "Recibo de Pago" (Fase 3C, finding de Fase 3B: ambas secciones
 * duplicaban esta búsqueda de ícono + markup). El `key` de la lista lo sigue
 * poniendo el `.map()` del padre, no este componente.
 */
export default function TicketItemRow({ item, drink, accentColor, showPrice = false }: Props) {
  const iconName = drink?.iconName || "glass-water";
  const IconComponent = ICON_MAP[iconName] || GlassWater;

  if (showPrice) {
    return (
      <li className="flex justify-between items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="shrink-0 w-6 h-6 flex items-center justify-center text-neutral-700 bg-neutral-100 rounded-md">
            <IconComponent size={14} />
          </div>
          <span className="font-sans text-sm font-black text-black tabular-nums shrink-0">
            x{item.qty}
          </span>
          <span className="text-[13px] font-bold uppercase tracking-tight truncate leading-tight text-black flex-1">
            {item.name}
          </span>
        </div>
        <span className="font-mono text-sm font-black shrink-0" style={{ color: accentColor }}>
          ${item.subtotal.toLocaleString("es-AR")}
        </span>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 py-0.5">
      <div className="shrink-0 w-6 h-6 flex items-center justify-center text-neutral-700 bg-neutral-100 rounded-md">
        <IconComponent size={14} />
      </div>
      <div
        className="shrink-0 px-1.5 h-7 flex items-center justify-center rounded-md font-mono font-black text-xs"
        style={{
          color: accentColor,
          backgroundColor: `${accentColor}18`,
          border: `1px solid ${accentColor}30`,
        }}
      >
        x{item.qty}
      </div>
      <span
        className="text-[15px] font-black uppercase tracking-tight truncate leading-tight flex-1"
        style={{ color: accentColor }}
      >
        {item.name}
      </span>
    </li>
  );
}
