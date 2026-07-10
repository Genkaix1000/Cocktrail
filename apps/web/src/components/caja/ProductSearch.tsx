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
 *
 * Enter solo corta la propagación cuando hay un resultado para sumar; con
 * la búsqueda vacía/sin match, el Enter sigue de largo hacia
 * useCajaShortcuts (así un segundo Enter después de sumar un producto
 * puede abrir el checkout).
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
      // Solo corta la propagación cuando realmente selecciona un
      // resultado — así un segundo Enter con la búsqueda vacía burbujea
      // hacia useCajaShortcuts y puede abrir el checkout.
      e.stopPropagation();
      selectHighlighted();
    }
  }

  return (
    <div className="relative">
      <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
      <input
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar trago por nombre..."
        className="w-full h-10 pl-10 pr-4 bg-ink-900 border border-ink-800 rounded-xl text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none focus:border-blue transition-all"
      />

      {results.length > 0 && (
        <ul role="listbox" className="absolute z-30 top-full mt-1.5 w-full max-h-64 overflow-y-auto bg-ink-900 border border-ink-800 rounded-xl shadow-2xl py-1">
          {results.map((d, idx) => (
            <li
              key={d.id}
              role="option"
              aria-selected={idx === highlightedIndex}
              onMouseEnter={() => setHighlightedIndex(idx)}
              onClick={() => onSelect(d.id)}
              className={`flex items-center justify-between px-3.5 py-2 text-sm cursor-pointer transition-colors ${
                idx === highlightedIndex ? "bg-ink-800 text-ink-50" : "text-ink-300"
              }`}
            >
              <span className="font-bold">{d.name}</span>
              <span className="font-mono text-blue text-xs tabular">
                ${d.price.toLocaleString("es-AR")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
