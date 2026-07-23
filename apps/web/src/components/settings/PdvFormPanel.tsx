"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

export type PdvForm = {
  name: string;
  barCode: string;
};

type Props = {
  form: PdvForm;
  saving: boolean;
  supportedBarCode: string;
  onChange: (patch: Partial<PdvForm>) => void;
  onCancel: () => void;
  onSave: () => void;
};

/**
 * Panel lateral inline (NO es un diálogo modal): foco inicial en el primer
 * campo, `Escape` cierra, y el foco vuelve al disparador (lo maneja el padre
 * al cerrar). Sin focus trap a propósito — atrapar el foco en un panel
 * no-modal va contra WAI-ARIA.
 */
export default function PdvFormPanel({
  form,
  saving,
  supportedBarCode,
  onChange,
  onCancel,
  onSave,
}: Props) {
  const [touched, setTouched] = useState(false);
  const nameOk = form.name.trim().length > 0;
  const multiBarWarning = form.barCode !== supportedBarCode;

  const headingId = useId();
  const nameId = useId();
  const barCodeId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Foco inicial al abrir el panel.
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Escape cierra, escuche donde escuche el teclado (sin trap).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <section
      aria-labelledby={headingId}
      className="w-full lg:w-[420px] shrink-0 bg-ink-900 border border-ink-800 rounded-xl p-5 flex flex-col gap-4 animate-in slide-in-from-right duration-200"
    >
      <div className="flex justify-between items-center pb-2 border-b border-ink-800">
        <h2 id={headingId} className="text-sm font-bold text-ink-50 uppercase tracking-wider">
          Crear PDV
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cerrar panel"
          className="p-1.5 bg-ink-850 hover:bg-ink-800 rounded-lg text-ink-400 hover:text-ink-200 transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor={nameId}
            className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-1.5"
          >
            Nombre de la barra *
          </label>
          <input
            id={nameId}
            ref={nameInputRef}
            type="text"
            value={form.name}
            onChange={(e) => {
              setTouched(true);
              onChange({ name: e.target.value });
            }}
            className="w-full h-9 px-3 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 focus:outline-none focus:border-blue transition-all"
            placeholder="Barra VIP"
          />
          {touched && !nameOk && (
            <p className="text-[11px] text-danger mt-1">El nombre es obligatorio.</p>
          )}
        </div>

        <div>
          <label
            htmlFor={barCodeId}
            className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-1.5"
          >
            Código de barra
          </label>
          <input
            id={barCodeId}
            type="text"
            value={form.barCode}
            readOnly
            className="w-full h-9 px-3 bg-ink-950 border border-ink-800 rounded-lg text-sm text-ink-400 font-mono cursor-not-allowed"
          />
        </div>

        {multiBarWarning && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-200/90 leading-relaxed">
            Esta funcionalidad solo está disponible para Barra VIP ({supportedBarCode}). Multi-barra
            no está implementado todavía.
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-800 mt-auto">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-9 px-3 rounded-lg text-[12px] font-bold uppercase tracking-[0.06em] text-ink-400 hover:text-ink-200 hover:bg-ink-850 transition-all cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !nameOk || multiBarWarning}
          className="h-9 px-4 rounded-lg bg-accent/15 border border-accent/30 text-accent text-[12px] font-bold uppercase tracking-[0.06em] flex items-center gap-1.5 hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          Crear PDV
        </button>
      </div>
    </section>
  );
}
