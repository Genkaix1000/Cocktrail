"use client";

import { Dices, FlaskConical, HelpCircle, KeyRound, Loader2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type { NightEvent } from "@cocktrail/shared";
import { eventsService } from "@/services/events.service";
import { getRandomKeyword } from "@/lib/randomKeyword";

type Props = {
  mode: "open" | "edit";
  onClose?: () => void;
  onSubmit: (event: NightEvent) => void;
  currentKeyword?: string;
};

function FieldHint({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
        aria-label={label}
        aria-expanded={open}
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 z-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 shadow-card text-[11px] text-[var(--text-secondary)] leading-snug">
          {children}
        </div>
      )}
    </div>
  );
}

export default function OpenNightModal({ mode, onClose, onSubmit, currentKeyword }: Props) {
  const [keyword, setKeyword] = useState(mode === "edit" ? currentKeyword ?? "" : "");
  const [isTest, setIsTest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = keyword.trim();
      if (!trimmed) {
        throw new Error("Ingresá una palabra clave para la noche.");
      }
      const event =
        mode === "open"
          ? await (isTest ? eventsService.openEvent(trimmed, true) : eventsService.openEvent(trimmed))
          : await eventsService.setKeyword(trimmed);
      setKeyword("");
      onSubmit(event);
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  }

  const isEdit = mode === "edit";

  useEffect(() => {
    if (!onClose) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose!();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting]);

  return (
    // Por encima del tour (z-9999) para que el modal no quede tapado por el spotlight.
    <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full max-w-md rounded-2xl p-6 shadow-card animate-in slide-in-from-bottom-10">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--accent-surface)] border border-[var(--accent-line)] rounded-xl flex items-center justify-center">
              <KeyRound size={20} className="text-[var(--accent-text)]" />
            </div>
            <div>
              <h2 className="text-[20px] font-bold text-[var(--text-primary)] leading-none">
                {isEdit ? "Editar palabra clave" : "Abrir Noche"}
              </h2>
              <p className="text-[12px] text-[var(--text-secondary)] mt-1.5">
                {isEdit ? "Corregir la clave de la noche activa" : "Elegí la clave de esta noche"}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="p-2 bg-[var(--bg-panel)] rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="night-keyword"
                  className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-secondary)]"
                >
                  Palabra clave
                </label>
                {!isEdit && (
                  <FieldHint label="¿Para qué sirve la palabra clave?">
                    Se imprime en cada ticket. El staff la usa para distinguir tickets de esta noche.
                  </FieldHint>
                )}
              </div>
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => setKeyword(getRandomKeyword(keyword))}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-text)] hover:brightness-110 transition-all cursor-pointer"
                >
                  <Dices size={12} />
                  Generar
                </button>
              )}
            </div>
            <input
              id="night-keyword"
              data-tour="night-keyword-input"
              type="text"
              required
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)] transition-colors"
              placeholder="ej. TEQUILA"
            />
          </div>

          {!isEdit && (
            <div
              data-tour="night-test-row"
              className="flex items-center gap-2"
            >
              <button
                type="button"
                role="switch"
                aria-checked={isTest}
                aria-label="Noche de prueba"
                data-tour="night-test-toggle"
                onClick={() => setIsTest((v) => !v)}
                className={`flex-1 h-11 px-3.5 rounded-xl border flex items-center gap-2.5 text-left transition-all cursor-pointer active:scale-[0.99] ${
                  isTest
                    ? "bg-[var(--accent-surface)] border-[var(--accent-line)] text-[var(--accent-text)]"
                    : "bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                }`}
              >
                <span
                  className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
                    isTest ? "bg-[var(--accent-primary)]" : "bg-[var(--border-strong)]"
                  }`}
                  aria-hidden
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                      isTest ? "translate-x-4" : ""
                    }`}
                  />
                </span>
                <FlaskConical size={14} strokeWidth={2} className="shrink-0" aria-hidden />
                <span className="text-[13px] font-semibold">Noche de prueba</span>
              </button>
              <FieldHint label="¿Qué es noche de prueba?">
                Para probar sin ensuciar el arqueo. No entra al historial; solo efectivo.
              </FieldHint>
            </div>
          )}

          {error && (
            <div className="text-sm text-[var(--danger-base)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            data-tour="night-submit-btn"
            disabled={submitting || !keyword.trim()}
            className="mt-1 h-12 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold rounded-xl text-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {isEdit ? "Guardando…" : "Abriendo…"}
              </>
            ) : (
              <>
                <KeyRound size={16} strokeWidth={2.5} />
                {isEdit ? "Guardar clave" : "Abrir noche"}
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
