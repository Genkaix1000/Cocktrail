import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import type { DeltaInfo } from "@/lib/analytics";

export default function MetricCard({
  label,
  value,
  isCurrency,
  delta,
  icon: Icon,
  color: _color,
  subtitle = "vs. última noche",
  noDeltaLabel = "EN VIVO",
  featured = false,
}: {
  label: string;
  value: number;
  isCurrency?: boolean;
  delta: DeltaInfo | null | undefined;
  icon: LucideIcon;
  /** @deprecated Tokens Bosko; se ignora en el look nuevo. */
  color?: string;
  subtitle?: string;
  noDeltaLabel?: string;
  featured?: boolean;
}) {
  const deltaTone = delta?.direction === "down" ? "down" : "up";

  const shell = featured
    ? "bg-[var(--accent-primary)] dark:bg-[var(--accent-featured)] text-[var(--text-on-accent)] border-transparent shadow-card"
    : "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] shadow-card";

  const labelClass = featured
    ? "text-white/75"
    : "text-[var(--text-secondary)]";

  const valueClass = featured
    ? "text-[var(--text-on-accent)]"
    : "text-[var(--text-primary)]";

  const currencyClass = featured
    ? "text-white/55"
    : "text-[var(--text-tertiary)]";

  const mutedClass = featured
    ? "text-white/55"
    : "text-[var(--text-tertiary)]";

  const iconWrap = featured
    ? "border-white/25 bg-white/10 text-[var(--text-on-accent)]"
    : "border-[var(--border-subtle)] bg-transparent text-[var(--accent-primary)]";

  const deltaPill = featured
    ? deltaTone === "up"
      ? "bg-white/15 text-white"
      : "bg-black/20 text-white"
    : deltaTone === "up"
      ? "bg-[var(--success-soft)] text-[var(--success-base)]"
      : "bg-[var(--danger-soft)] text-[var(--danger-base)]";

  return (
    <div
      className={`rounded-2xl p-5 flex justify-between min-w-0 border transition-colors duration-200 relative overflow-hidden h-[125px] ${shell}`}
    >
      <div className="flex flex-col justify-between h-full pr-3 flex-1 min-w-0">
        <div className="space-y-1.5">
          <span className={`text-[12px] font-medium block truncate ${labelClass}`}>
            {label}
          </span>
          <div
            className={`text-[32px] font-bold leading-none tracking-tight font-mono tabular ${valueClass}`}
          >
            {isCurrency && (
              <span className={`text-[0.65em] mr-0.5 font-semibold ${currencyClass}`}>$</span>
            )}
            {value.toLocaleString("es-AR")}
          </div>
        </div>
        {delta ? (
          <span
            className={`inline-flex items-center gap-1 self-start max-w-full px-2 py-0.5 rounded-full text-[11px] font-semibold truncate ${deltaPill}`}
          >
            {deltaTone === "up" ? "↑" : "↓"} {delta.label}
            <span className={`font-normal truncate ${featured ? "text-white/70" : mutedClass}`}>
              {subtitle}
            </span>
          </span>
        ) : (
          <span className={`text-[11px] font-normal truncate ${mutedClass}`}>
            {noDeltaLabel}
          </span>
        )}
      </div>

      <div className="flex flex-col items-end shrink-0 z-10">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center border ${iconWrap}`}
          aria-hidden
        >
          {featured ? (
            <ArrowUpRight size={16} strokeWidth={2} />
          ) : (
            <Icon size={16} strokeWidth={1.8} />
          )}
        </div>
      </div>
    </div>
  );
}
