"use client";

import { Sparkles } from "lucide-react";
import type { SmartInsight } from "@/lib/analytics";

type Props = {
  insights: SmartInsight[];
  isBosko: boolean;
};

const TONE_STYLES: Record<
  SmartInsight["tone"],
  { bg: string; border: string; text: string }
> = {
  positive: {
    bg: "bg-green-soft",
    border: "border-green-line",
    text: "text-green",
  },
  negative: {
    bg: "bg-danger-soft",
    border: "border-danger-line",
    text: "text-danger",
  },
  neutral: {
    bg: "bg-ink-800/50",
    border: "border-ink-700",
    text: "text-ink-200",
  },
};

export default function SmartInsights({ insights, isBosko }: Props) {
  const accentColor = isBosko ? "text-[#4ade80]" : "text-blue";
  const accentBg = isBosko ? "bg-[#4ade80]/10" : "bg-blue/10";
  const accentBorder = isBosko ? "border-[#4ade80]/20" : "border-blue-line";

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div
          className={`w-8 h-8 rounded-xl ${accentBg} border ${accentBorder} flex items-center justify-center`}
        >
          <Sparkles size={15} className={accentColor} />
        </div>
        <div>
          <h3 className="text-ink-50 text-[13px] font-semibold">
            Resumen de la Noche
          </h3>
          <p className="text-ink-500 text-[10px] uppercase tracking-[0.18em] font-bold mt-0.5">
            Insights generados automáticamente
          </p>
        </div>
      </div>

      {/* Insights list */}
      {insights.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p className="text-ink-500 text-[12px] text-center">
            Todavía no hay suficientes datos para generar insights.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {insights.map((insight, idx) => {
            const style = TONE_STYLES[insight.tone];
            return (
              <div
                key={idx}
                className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border ${style.bg} ${style.border} animate-in fade-in slide-in-from-bottom-2`}
                style={{ animationDelay: `${idx * 80}ms`, animationFillMode: "both" }}
              >
                <span className="text-[16px] leading-none flex-shrink-0 mt-0.5">
                  {insight.icon}
                </span>
                <p className={`text-[12px] leading-relaxed ${style.text}`}>
                  {insight.text}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
