"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { Drink } from "@cocktrail/shared";

type Props = {
  drinks: Drink[];
  onSelect: (id: number) => void;
};

/**
 * Buscador de productos con autocompletar para la pantalla de venta de
 * caja: escribís el nombre, filtra, flechas navegan, Enter suma el
 * resaltado al carrito. Convive con el grid táctil existente — es un modo
 * adicional para operar por teclado, no lo reemplaza.
 */
export default function ProductSearch({ drinks, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return drinks
      .filter((d) => d.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [drinks, query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setHighlightedIndex(0);
  }

  function selectHighlighted() {
    const drink = results[highlightedIndex];
    if (!drink) return;
    onSelect(drink.id);
    setQuery("");
    setHighlightedIndex(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.stopPropagation();
      selectHighlighted();
    }
  }

  return (
    <div className="relative">
      <Search
        size={14}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--accent-primary)]"
      />
      <input
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar trago por nombre..."
        className="w-full h-10 pl-10 pr-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all"
      />

      {results.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 top-full mt-1.5 w-full max-h-64 overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl shadow-card py-1"
        >
          {results.map((d, idx) => (
            <li
              key={d.id}
              role="option"
              aria-selected={idx === highlightedIndex}
              onMouseEnter={() => setHighlightedIndex(idx)}
              onClick={() => onSelect(d.id)}
              className={`flex items-center justify-between px-3.5 py-2 text-sm cursor-pointer transition-colors ${
                idx === highlightedIndex
                  ? "bg-[var(--bg-panel)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span className="font-semibold">{d.name}</span>
              <span className="font-mono text-[var(--accent-text)] text-xs tabular">
                ${d.price.toLocaleString("es-AR")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
