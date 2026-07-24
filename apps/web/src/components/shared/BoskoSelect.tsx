"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type BoskoSelectOption = {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  options: BoskoSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label": string;
  className?: string;
  disabled?: boolean;
};

/**
 * Select Bosko (panel surface + opciones). Reemplaza `<select>` nativo donde
 * la estética importa (PDV / Posnets).
 */
export default function BoskoSelect({
  value,
  options,
  onChange,
  placeholder = "Elegí…",
  "aria-label": ariaLabel,
  className = "",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value && !o.disabled);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full h-10 px-3 rounded-xl border text-left text-sm flex items-center justify-between gap-2 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
          open
            ? "bg-[var(--bg-surface)] border-[var(--accent-primary)] text-[var(--text-primary)]"
            : "bg-[var(--bg-input)] border-[var(--border-strong)] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
        }`}
      >
        <span className={`truncate ${selected ? "" : "text-[var(--text-tertiary)]"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={1.8}
          className={`shrink-0 text-[var(--text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-30 top-full left-0 right-0 mt-1.5 max-h-64 overflow-y-auto bosko-scroll rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-card py-1"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2.5 text-[12px] text-[var(--text-tertiary)]">Sin opciones</li>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li key={opt.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return;
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 text-left flex items-start gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected
                        ? "bg-[var(--accent-surface)] text-[var(--accent-text)]"
                        : "text-[var(--text-primary)] hover:bg-[var(--bg-panel)]"
                    }`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium truncate">{opt.label}</span>
                      {opt.hint && (
                        <span className="block text-[11px] text-[var(--text-tertiary)] truncate mt-0.5 font-mono">
                          {opt.hint}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <Check size={14} strokeWidth={2.2} className="shrink-0 mt-0.5 text-[var(--accent-primary)]" />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
