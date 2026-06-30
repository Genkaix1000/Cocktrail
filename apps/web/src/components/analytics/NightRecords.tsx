"use client";

import type { NightRecord } from "@/lib/analytics";

type Props = {
  records: NightRecord[];
  isBosko: boolean;
};

const RECORD_EMOJI: Record<NightRecord["type"], string> = {
  best: "🏆",
  worst: "📉",
  longest: "⏱️",
  shortest: "⚡",
  star_drink: "🍹",
};

export default function NightRecords({ records, isBosko }: Props) {
  if (records.length === 0) {
    return (
      <div className="bg-ink-900 border border-dashed border-ink-700 rounded-2xl p-10 text-center">
        <span className="text-[28px] block mb-3">📊</span>
        <p className="text-[13px] text-ink-400">
          Aún no hay récords registrados
        </p>
        <p className="text-[11px] text-ink-500 mt-1">
          Cerrá noches para generar estadísticas históricas
        </p>
      </div>
    );
  }

  const accentColor = isBosko ? "text-[#4ade80]" : "text-blue";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
      {records.map((r) => {
        const isBest = r.type === "best";
        const emoji = RECORD_EMOJI[r.type] ?? "📊";

        return (
          <div
            key={r.type}
            className={`
              bg-ink-900 border rounded-2xl p-5 flex items-start gap-4 transition-all
              ${
                isBest
                  ? "border-amber-500/30 shadow-[0_0_20px_rgba(251,191,36,0.06)]"
                  : "border-ink-800"
              }
            `}
          >
            {/* Emoji icon */}
            <div
              className={`
                w-11 h-11 rounded-xl flex items-center justify-center text-[22px] shrink-0
                ${isBest ? "bg-amber-500/10" : "bg-ink-800/60"}
              `}
            >
              {emoji}
            </div>

            {/* Content */}
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">
                {r.label}
              </span>
              <span
                className={`font-mono text-[20px] font-bold leading-tight truncate ${
                  isBest ? "text-amber-400" : accentColor
                }`}
              >
                {r.value}
              </span>
              <span className="text-[11px] text-ink-500 truncate">
                {r.sub}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
