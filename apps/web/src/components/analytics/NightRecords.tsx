"use client";

import { Star, Wine } from "lucide-react";
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
export default function NightRecords({ records, isBosko: _isBosko }: Props) {
  if (records.length === 0) {
    return (
      <div className="bg-[var(--bg-surface)] border border-dashed border-[var(--border-strong)] rounded-2xl p-10 text-center shadow-card">
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-11 h-11 rounded-full border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-primary)]">
            <Wine size={18} strokeWidth={1.8} />
          </div>
          <span className="text-[13px] text-[var(--text-secondary)]">Aún no hay récords registrados</span>
          <span className="text-[11px] text-[var(--text-tertiary)]">Cerrá noches para generar estadísticas históricas</span>
        </div>
      </div>
    );
  }

  const record = records[0]!;

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 flex items-start gap-4 shadow-card">
      <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 border border-[var(--border-subtle)] text-[var(--accent-primary)] bg-[var(--accent-surface)]">
        <Star size={18} strokeWidth={1.8} />
      </div>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">
          {record.label}
        </span>
        <span className="font-mono text-[22px] font-bold leading-tight truncate tabular text-[var(--text-primary)]">
          {record.value}
        </span>
        <span className="text-[12px] text-[var(--text-tertiary)] truncate">
          {record.sub}
        </span>
      </div>
    </div>
  );
}
