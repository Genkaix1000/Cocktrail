"use client";

import { Clock, ArrowRight, CreditCard } from "lucide-react";
import type { OperationalVelocity as OperationalVelocityType } from "@/lib/analytics";
import { formatDuration } from "@/lib/analytics";
import { getAccentColors } from "@/lib/accentColors";

type Props = {
  velocity: OperationalVelocityType;
  isBosko: boolean;
};

const STAGES = [
  { key: "pagado", label: "Pagado", icon: CreditCard },
  { key: "canjeado", label: "Canjeado en Barra", icon: Clock },
] as const;

export default function OperationalVelocity({ velocity, isBosko }: Props) {
  const { accentColor, accentBg, accentBorder } = getAccentColors(isBosko);

  const timings = [
    velocity.avgTotalTime,
  ];

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div
          className={`w-8 h-8 rounded-xl ${accentBg} border ${accentBorder} flex items-center justify-center`}
        >
          <Clock size={15} className={accentColor} />
        </div>
        <div>
          <h3 className="text-ink-50 text-[13px] font-semibold">
            Velocidad Operativa
          </h3>
          <p className="text-ink-500 text-[10px] uppercase tracking-[0.18em] font-bold mt-0.5">
            Tiempos promedio del pipeline
          </p>
        </div>
      </div>

      {/* Pipeline visualization */}
      <div className="flex items-center justify-between gap-1">
        {STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const isLast = idx === STAGES.length - 1;

          return (
            <div key={stage.key} className="flex items-center flex-1 min-w-0">
              {/* Stage node */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                    idx === 0
                      ? `${accentBg} ${accentBorder}`
                      : "bg-ink-800/60 border-ink-700"
                  }`}
                >
                  <Icon
                    size={16}
                    className={idx === 0 ? accentColor : "text-ink-400"}
                  />
                </div>
                <span className="text-ink-200 text-[10px] font-semibold whitespace-nowrap">
                  {stage.label}
                </span>
              </div>

              {/* Arrow + timing */}
              {!isLast && (
                <div className="flex-1 flex flex-col items-center gap-1 mx-1 min-w-0">
                  <div className="flex items-center w-full gap-0.5">
                    <div className="flex-1 h-px bg-ink-700" />
                    <ArrowRight size={12} className="text-ink-600 flex-shrink-0" />
                  </div>
                  <span
                    className={`font-mono text-[11px] font-bold whitespace-nowrap ${
                      timings[idx] !== null ? accentColor : "text-ink-500"
                    }`}
                  >
                    {formatDuration(timings[idx] ?? null)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Total time */}
      <div className="mt-5 pt-4 border-t border-ink-800/60">
        <div className="flex items-center justify-between">
          <span className="text-ink-400 text-[11px] font-medium">
            Tiempo total promedio
          </span>
          <span className={`font-mono text-[15px] font-bold ${accentColor}`}>
            {formatDuration(velocity.avgTotalTime)}
          </span>
        </div>
      </div>
    </div>
  );
}
