import {
  DropletOff,
  type LucideIcon,
  Martini,
  Wine,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  wine: Wine,
  martini: Martini,
  "droplet-off": DropletOff,
};

/** Resuelve un iconName del catálogo a un componente Lucide. Default: Wine. */
export function drinkIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Wine;
}
