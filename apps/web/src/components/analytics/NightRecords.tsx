"use client";

import type { NightRecord } from "@/lib/analytics";

type Props = {
  records: NightRecord[];
  isBosko: boolean;
};

/**
 * Único record que sobrevive a la simplificación de Historial de Noches:
 * Trago Estrella (accionable — informa stock/promociones). Mejor/Peor
 * Noche y Noche Más Larga se eliminaron por no cambiar ninguna decisión
 * real (ver docs/specs/features/simplificar-historial-noches.md).
 */
export default function NightRecords({ records, isBosko }: Props) {
  if (records.length === 0) {
    return (
      <div className="bg-ink-900 border border-dashed border-ink-700 rounded-2xl p-10 text-center">
        <div className="flex flex-col items-center justify-center gap-2">
          <span className="text-[28px]">📊</span>
          <span className="text-[13px] text-ink-500">Aún no hay récords registrados</span>
          <span className="text-[11px] text-ink-600">Cerrá noches para generar estadísticas históricas</span>
        </div>
      </div>
    );
  }

  const accentColor = isBosko ? "text-[#4ade80]" : "text-blue";
  const record = records[0]!;

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex items-start gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-[22px] shrink-0 bg-ink-800/60">
        🍹
      </div>
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">
          {record.label}
        </span>
        <span className={`font-mono text-[20px] font-bold leading-tight truncate ${accentColor}`}>
          {record.value}
        </span>
        <span className="text-[11px] text-ink-500 truncate">
          {record.sub}
        </span>
      </div>
    </div>
  );
}
