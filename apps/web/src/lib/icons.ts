import {
  Beer,
  Citrus,
  CupSoda,
  Droplet,
  DropletOff,
  GlassWater,
  type LucideIcon,
  Martini,
  Wine,
  Zap,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  beer: Beer,
  citrus: Citrus,
  "cup-soda": CupSoda,
  droplet: Droplet,
  "droplet-off": DropletOff,
  "glass-water": GlassWater,
  martini: Martini,
  wine: Wine,
  zap: Zap,
};

/** Resuelve un iconName del catálogo a un componente Lucide. Default: Wine. */
export function drinkIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Wine;
}
