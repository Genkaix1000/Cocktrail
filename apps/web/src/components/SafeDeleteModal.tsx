"use client";

import { AlertTriangle, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  expectedText: string;
  typeLabel: string; // e.g. "el trago" o "el usuario"
};

export default function SafeDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  expectedText,
  typeLabel,
}: Props) {
  const [inputText, setInputText] = useState("");

  // Reset input when modal opens or expectedText changes
  useEffect(() => {
    if (isOpen) {
      setInputText("");
    }
  }, [isOpen, expectedText]);

  if (!isOpen) return null;

  const isMatched = inputText === expectedText;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isMatched) {
      onConfirm();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-ink-900 border border-ink-800 w-full max-w-md rounded-[22px] p-6 shadow-2xl animate-in slide-in-from-bottom-10">
        {/* Header */}
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-danger-soft border border-danger-line rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-danger" />
            </div>
            <div>
              <h2 className="font-serif-italic text-[20px] text-ink-50 leading-tight">
                {title}
              </h2>
              <p className="text-[9px] text-ink-500 uppercase tracking-[0.18em] font-medium mt-1">
                Acción Destructiva Segura
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-ink-850 hover:bg-ink-800 rounded-lg text-ink-400 hover:text-ink-200 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Warning Message */}
        <div className="mb-5 bg-danger-soft/30 border border-danger-line/20 rounded-xl p-3.5 text-xs text-ink-200 leading-relaxed">
          Estás a punto de eliminar permanentemente {typeLabel} <strong className="text-danger font-semibold">{expectedText}</strong>. Esta acción no se puede deshacer y afectará los registros in-memory.
        </div>

        {/* Confirmation Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-input" className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-400">
              Escribe <span className="text-ink-200 font-mono select-all bg-ink-950 px-1 py-0.5 rounded border border-ink-800">{expectedText}</span> para confirmar:
            </label>
            <input
              id="confirm-input"
              type="text"
              required
              autoFocus
              autoComplete="off"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={expectedText}
              className="w-full bg-ink-850 border border-ink-750 rounded-xl px-4 py-3 text-ink-50 outline-none focus:border-danger-line transition-colors text-sm font-medium"
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2.5 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 bg-ink-850 border border-ink-750 text-ink-300 font-medium rounded-xl text-xs uppercase tracking-[0.08em] hover:text-white transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isMatched}
              className="flex-1 h-11 bg-danger text-white font-semibold rounded-xl text-xs uppercase tracking-[0.08em] flex items-center justify-center gap-1.5 hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.1)]"
            >
              <Trash2 size={13} />
              Eliminar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
