"use client";

import { Dices, FlaskConical, KeyRound, Loader2, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { NightEvent } from "@cocktrail/shared";
import { eventsService } from "@/services/events.service";
import { getRandomKeyword } from "@/lib/randomKeyword";

type Props = {
  mode: "open" | "edit";
  onClose?: () => void;
  onSubmit: (event: NightEvent) => void;
  currentKeyword?: string;
};

export default function OpenNightModal({ mode, onClose, onSubmit, currentKeyword }: Props) {
  const [keyword, setKeyword] = useState(mode === "edit" ? currentKeyword ?? "" : "");
  // La marca de prueba se decide al abrir y no se puede cambiar después (A2),
  // por eso el checkbox solo existe en mode="open" y arranca desmarcado.
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
          ? // Sin el flag cuando es una noche normal: el backend distingue
            // "no lo mandó" de "lo mandó en false" para el guard de rol.
            await (isTest ? eventsService.openEvent(trimmed, true) : eventsService.openEvent(trimmed))
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
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
                {isEdit
                  ? "Corregir la clave de la noche activa"
                  : "Definí la palabra clave de esta noche"}
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
            <div className="flex items-center justify-between">
              <label
                htmlFor="night-keyword"
                className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-secondary)]"
              >
                Palabra clave de la noche
              </label>
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => setKeyword(getRandomKeyword(keyword))}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-text)] hover:brightness-110 transition-all cursor-pointer"
                >
                  <Dices size={12} />
                  Generar palabra
                </button>
              )}
            </div>
            <input
              id="night-keyword"
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
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Se imprime en cada ticket físico vendido en caja durante esta noche. Comunicásela al
              staff de palabra para que sepan distinguir tickets de la noche vigente.
            </p>
          )}

          {!isEdit && (
            <div
              className={`rounded-xl border px-3.5 py-3 transition-colors ${
                isTest
                  ? "bg-amber-500/10 border-amber-500/40"
                  : "bg-[var(--bg-panel)] border-[var(--border-subtle)]"
              }`}
            >
              <label
                htmlFor="night-is-test"
                className="flex items-start gap-2.5 cursor-pointer select-none"
              >
                <input
                  id="night-is-test"
                  type="checkbox"
                  checked={isTest}
                  onChange={(e) => setIsTest(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-amber-500 cursor-pointer"
                />
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
                    <FlaskConical size={13} strokeWidth={2} aria-hidden="true" />
                    Noche de prueba
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Para probar la impresora o el flujo de venta sin ensuciar el arqueo. No se
                    guarda nada: no entra al historial ni a los totales, solo se puede cobrar en
                    efectivo y se pierde si el servidor se reinicia. No se puede cambiar después
                    de abrir la noche.
                  </span>
                </span>
              </label>
            </div>
          )}

          {error && (
            <div className="text-sm text-[var(--danger-base)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !keyword.trim()}
            className="mt-2 h-12 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold rounded-xl text-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
