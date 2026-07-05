import type { ReactNode } from "react";

type Props = {
  icon: ReactNode;
  message: string;
  subtitle?: string;
  className?: string;
};

/**
 * Estado-vacío con ícono/emoji + mensaje, repetido literal en varios
 * componentes de `components/analytics/*` antes de esta extracción (Fase 3C).
 */
export default function EmptyState({ icon, message, subtitle, className = "" }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      {icon}
      <span className="text-[13px] text-ink-500">{message}</span>
      {subtitle && <span className="text-[11px] text-ink-600">{subtitle}</span>}
    </div>
  );
}
