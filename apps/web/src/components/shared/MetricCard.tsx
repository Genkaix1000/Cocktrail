import type { LucideIcon } from "lucide-react";
import type { DeltaInfo } from "@/lib/analytics";

export default function MetricCard({
  label,
  value,
  isCurrency,
  delta,
  icon: Icon,
  color,
  subtitle = "vs. última noche",
  noDeltaLabel = "EN VIVO",
}: {
  label: string;
  value: number;
  isCurrency?: boolean;
  delta: DeltaInfo | null | undefined;
  icon: LucideIcon;
  color: string;
  subtitle?: string;
  noDeltaLabel?: string;
}) {
  const deltaTone = delta?.direction === "down" ? "down" : "up";
  return (
    <div className="bg-ink-900 border border-ink-800/80 rounded-2xl p-5 flex justify-between min-w-0 shadow-lg hover:border-accent/20 transition-all duration-200 group relative overflow-hidden h-[125px]">
      <div className="flex flex-col justify-between h-full pr-12 flex-1 min-w-0">
        <div className="space-y-1">
          <span className="text-[12px] font-medium text-ink-400 block truncate">
            {label}
          </span>
          <div className="text-[26px] font-black text-ink-50 leading-none tracking-tight font-mono tabular">
            <>{isCurrency && <span className="text-ink-500 text-[0.7em] mr-0.5">$</span>}{value.toLocaleString("es-AR")}</>
          </div>
        </div>
        {delta ? (
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${deltaTone === "up" ? "text-green" : "text-danger"}`}>
            {deltaTone === "up" ? "↑" : "↓"} {delta.label} <span className="text-ink-500 font-normal">{subtitle}</span>
          </span>
        ) : (
          <span className="text-[11px] text-ink-500 font-normal">{noDeltaLabel}</span>
        )}
      </div>

      <div className="flex flex-col items-end shrink-0 z-10">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-300"
          style={{
            backgroundColor: `${color}12`,
            borderColor: `${color}25`,
            color: color
          }}
        >
          <Icon size={18} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}
