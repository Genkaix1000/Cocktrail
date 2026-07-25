"use client";

import { useRef, useState } from "react";
import { Check, GripHorizontal, Plus, Trash2, X } from "lucide-react";
import type { DrinkCategory } from "@cocktrail/shared";

type Props = {
  categories: DrinkCategory[];
  saving?: boolean;
  onChange: (next: DrinkCategory[]) => void;
  onCreate: (name: string) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
};

/** Variantes de acento para no dejar todo monocromo. */
const PILL_TONES = [
  "bg-[var(--accent-surface)] text-[var(--accent-text)] border-[var(--accent-line)]",
  "bg-[var(--amber-soft)] text-[var(--amber-base)] border-[var(--amber-line)]",
  "bg-[var(--success-soft)] text-[var(--success-base)] border-[var(--success-line)]",
  "bg-[var(--danger-soft)] text-[var(--danger-base)] border-[var(--danger-line)]",
  "bg-[color-mix(in_oklab,var(--accent-bright)_16%,transparent)] text-[var(--accent-bright)] border-[color-mix(in_oklab,var(--accent-bright)_32%,transparent)]",
];

function toneFor(index: number) {
  return PILL_TONES[index % PILL_TONES.length];
}

export default function CategoriesEditorModal({
  categories,
  saving,
  onChange,
  onCreate,
  onReorder,
  onDelete,
  onClose,
}: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragFrom = useRef<string | null>(null);

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  function applyOrder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const list = [...sorted];
    const fromIdx = list.findIndex((c) => c.id === fromId);
    const toIdx = list.findIndex((c) => c.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    const next = list.map((c, i) => ({ ...c, sortOrder: i + 1 }));
    onChange(next);
    void onReorder(next.map((c) => c.id));
  }

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(newName.trim());
      setNewName("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="w-full lg:w-[480px] shrink-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col gap-5 shadow-card animate-in slide-in-from-right duration-200">
      <div className="flex justify-between items-center pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-[18px] font-semibold text-[var(--text-primary)] tracking-tight">
            Categorías
          </h2>
          <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
            Arrastrá de izquierda a derecha. 1 = arriba en la caja.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-panel)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          aria-label="Cerrar"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 min-h-[48px] content-start">
        {sorted.map((c, idx) => (
          <div
            key={c.id}
            draggable
            onDragStart={() => {
              dragFrom.current = c.id;
              setDraggingId(c.id);
            }}
            onDragEnd={() => {
              dragFrom.current = null;
              setDraggingId(null);
              setOverId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (overId !== c.id) setOverId(c.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragFrom.current;
              if (from) applyOrder(from, c.id);
              setOverId(null);
              setDraggingId(null);
              dragFrom.current = null;
            }}
            className={`group inline-flex items-center gap-1.5 h-9 pl-2.5 pr-1 rounded-full border text-[12px] font-semibold select-none cursor-grab active:cursor-grabbing transition-all ${toneFor(idx)} ${
              draggingId === c.id ? "opacity-40 scale-95" : ""
            } ${overId === c.id && draggingId !== c.id ? "ring-2 ring-[var(--accent-primary)] ring-offset-2 ring-offset-[var(--bg-surface)]" : ""}`}
          >
            <GripHorizontal size={13} className="opacity-50 shrink-0" aria-hidden />
            <span className="font-mono text-[10px] opacity-70 tabular w-4 text-center">{c.sortOrder}</span>
            <span className="max-w-[140px] truncate">{c.name}</span>
            {c.name.toLowerCase().startsWith("tendencia") ? (
              <span className="text-[10px] opacity-60 px-1.5 py-0.5 rounded bg-black/10 select-none">
                Sistema
              </span>
            ) : confirmId === c.id ? (
              <span className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmId(null);
                  }}
                  className="w-7 h-7 rounded-full flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-black/10 transition-all cursor-pointer"
                  aria-label="Cancelar"
                  title="Cancelar"
                >
                  <X size={13} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmId(null);
                    void onDelete(c.id);
                  }}
                  disabled={saving}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--danger-base)] text-white transition-all cursor-pointer"
                  aria-label={`Confirmar eliminar ${c.name}`}
                  title="Confirmar"
                >
                  <Check size={13} />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmId(c.id);
                }}
                disabled={saving}
                className="w-7 h-7 rounded-full flex items-center justify-center opacity-60 hover:opacity-100 hover:bg-black/10 transition-all cursor-pointer"
                aria-label={`Eliminar ${c.name}`}
                title="Eliminar categoría"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="text-[13px] text-[var(--text-tertiary)] py-2">
            Todavía no hay categorías. Creá la primera abajo.
          </p>
        )}
      </div>

      <div className="flex gap-2 pt-1 border-t border-[var(--border-subtle)]">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nueva categoría…"
          className="flex-1 h-10 px-3.5 rounded-xl text-[13px] bg-[var(--bg-input)] border border-[var(--border-strong)] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating || !newName.trim()}
          className="h-10 px-4 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
        >
          <Plus size={14} strokeWidth={2.5} />
          Agregar
        </button>
      </div>
    </div>
  );
}
