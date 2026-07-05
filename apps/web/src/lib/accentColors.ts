/**
 * Trío de clases Tailwind (texto/fondo/borde) que varía según el skin activo
 * (Bosko vs. azul default) — repetido literal en varios componentes de
 * `components/analytics/*` antes de esta extracción (Fase 3C). No es un hook
 * de React (sin estado ni otros hooks), por eso no lleva el prefijo `use` —
 * así se puede llamar después de un `return` condicional sin violar las
 * Rules of Hooks.
 */
export function getAccentColors(isBosko: boolean) {
  return {
    accentColor: isBosko ? "text-[#4ade80]" : "text-blue",
    accentBg: isBosko ? "bg-[#4ade80]/10" : "bg-blue/10",
    accentBorder: isBosko ? "border-[#4ade80]/20" : "border-blue-line",
  };
}
