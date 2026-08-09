"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

export type PdvForm = {
  name: string;
  barCode: string;
};

export type PdvPreset = {
  code: string;
  name: string;
};

type Props = {
  form: PdvForm;
  saving: boolean;
  /** Presets aún sin PDV (ej. Portátil). Si hay más de uno, el admin elige. */
  availablePresets: PdvPreset[];
  onChange: (patch: Partial<PdvForm>) => void;
  onCancel: () => void;
  onSave: () => void;
};

const labelCls = "text-[13px] font-semibold text-[var(--text-primary)] block mb-1.5";
const inputCls =
  "w-full h-10 px-3.5 bg-[var(--bg-input)] border border-[var(--border-strong)] rounded-xl text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] transition-all";

/**
 * Panel lateral inline (NO es un diálogo modal): foco inicial en el primer
 * campo, `Escape` cierra, y el foco vuelve al disparador (lo maneja el padre
 * al cerrar). Sin focus trap a propósito — atrapar el foco en un panel
 * no-modal va contra WAI-ARIA.
 */
export default function PdvFormPanel({
  form,
  saving,
  availablePresets,
  onChange,
  onCancel,
  onSave,
}: Props) {
  const [touched, setTouched] = useState(false);
  const nameOk = form.name.trim().length > 0;
  const codeOk = availablePresets.some((p) => p.code === form.barCode);

  const headingId = useId();
  const nameId = useId();
  const barCodeId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

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
      className="w-full lg:w-[480px] shrink-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col gap-5 shadow-card animate-in slide-in-from-right duration-200"
    >
      <div className="flex justify-between items-center pb-3 border-b border-[var(--border-subtle)]">
        <h2 id={headingId} className="text-[18px] font-semibold text-[var(--text-primary)] tracking-tight">
          Crear PDV
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cerrar panel"
          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-panel)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-5">
        <div>
          <label htmlFor={nameId} className={labelCls}>
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
            className={inputCls}
            placeholder="Portátil"
          />
          {touched && !nameOk && (
            <p className="text-[11px] text-[var(--danger-base)] mt-1">El nombre es obligatorio.</p>
          )}
        </div>

        <div>
          <label htmlFor={barCodeId} className={labelCls}>
            Código de barra
          </label>
          {availablePresets.length > 1 ? (
            <select
              id={barCodeId}
              value={form.barCode}
              onChange={(e) => {
                const preset = availablePresets.find((p) => p.code === e.target.value);
                onChange({
                  barCode: e.target.value,
                  ...(preset ? { name: preset.name } : {}),
                });
              }}
              className={`${inputCls} font-mono`}
            >
              {availablePresets.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={barCodeId}
              type="text"
              value={form.barCode}
              readOnly
              className={`${inputCls} bg-[var(--bg-panel)] text-[var(--text-tertiary)] font-mono cursor-not-allowed`}
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)] mt-auto">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-10 px-4 rounded-full text-[13px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] transition-all cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !nameOk || !codeOk}
          className="h-10 px-5 rounded-full bg-[var(--accent-primary)] text-[var(--text-on-accent)] text-[13px] font-semibold flex items-center gap-1.5 hover:bg-[var(--accent-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer active:scale-[0.98]"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          Crear PDV
        </button>
      </div>
    </section>
  );
}
