"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
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

function isSystemCategory(name: string) {
  return name.toLowerCase().startsWith("tendencia");
}

/** Soft color accents for the puesto rail — keeps our palette without rainbow cards. */
const PUESTO_TONES = [
  "bg-[var(--accent-surface)] text-[var(--accent-text)] border-[var(--accent-line)]",
  "bg-[var(--amber-soft)] text-[var(--amber-base)] border-[var(--amber-line)]",
  "bg-[var(--success-soft)] text-[var(--success-base)] border-[var(--success-line)]",
  "bg-[var(--danger-soft)] text-[var(--danger-base)] border-[var(--danger-line)]",
  "bg-[color-mix(in_oklab,var(--accent-bright)_16%,transparent)] text-[var(--accent-bright)] border-[color-mix(in_oklab,var(--accent-bright)_32%,transparent)]",
];

type DragGhost = {
  id: string;
  name: string;
  system: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
};

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
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [ghost, setGhost] = useState<DragGhost | null>(null);

  const dragFrom = useRef<string | null>(null);
  const fromIdxRef = useRef<number>(-1);
  const dropIdxRef = useRef<number | null>(null);
  const grabOffset = useRef({ x: 0, y: 0 });
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  function applyOrder(fromId: string, targetIdx: number) {
    const list = [...sorted];
    const fromIdx = list.findIndex((c) => c.id === fromId);
    if (fromIdx < 0) return;
    let toIdx = Math.max(0, Math.min(targetIdx, list.length));
    if (fromIdx < toIdx) toIdx -= 1;
    if (fromIdx === toIdx) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    const next = list.map((c, i) => ({ ...c, sortOrder: i + 1 }));
    onChange(next);
    void onReorder(next.map((c) => c.id));
  }

  function insertionWouldMove(fromIdx: number, targetIdx: number) {
    let toIdx = Math.max(0, Math.min(targetIdx, sorted.length));
    if (fromIdx < toIdx) toIdx -= 1;
    return fromIdx !== toIdx;
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

  function setDropTarget(clientY: number) {
    let target = sorted.length;
    for (let idx = 0; idx < sorted.length; idx += 1) {
      const category = sorted[idx]!;
      const row = rowRefs.current.get(category.id);
      if (!row) continue;
      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        target = idx;
        break;
      }
    }
    dropIdxRef.current = target;
    setDropIdx((prev) => (prev !== target ? target : prev));
  }

  function finishDrag() {
    dragFrom.current = null;
    fromIdxRef.current = -1;
    dropIdxRef.current = null;
    setDragId(null);
    setDropIdx(null);
    setGhost(null);
  }

  function handlePointerDown(e: PointerEvent<HTMLButtonElement>, c: DrinkCategory, idx: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);

    const row = rowRefs.current.get(c.id);
    const rect = row?.getBoundingClientRect();
    if (!rect) return;

    dragFrom.current = c.id;
    fromIdxRef.current = idx;
    dropIdxRef.current = idx;
    grabOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setDragId(c.id);
    setDropIdx(idx);
    setGhost({
      id: c.id,
      name: c.name,
      system: isSystemCategory(c.name),
      width: rect.width,
      height: rect.height,
      x: e.clientX - grabOffset.current.x,
      y: e.clientY - grabOffset.current.y,
    });
  }

  function handlePointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!dragFrom.current) return;
    setGhost((prev) =>
      prev
        ? {
            ...prev,
            x: e.clientX - grabOffset.current.x,
            y: e.clientY - grabOffset.current.y,
          }
        : prev,
    );
    setDropTarget(e.clientY);
  }

  function handlePointerUp(e: PointerEvent<HTMLButtonElement>) {
    if (!dragFrom.current) return;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const from = dragFrom.current;
    const target = dropIdxRef.current;
    finishDrag();
    if (target != null) applyOrder(from, target);
  }

  useEffect(() => {
    if (!dragId) return;
    const prev = document.body.style.cursor;
    const select = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prev;
      document.body.style.userSelect = select;
    };
  }, [dragId]);

  const showLineAt = (idx: number) =>
    dragId != null &&
    dropIdx === idx &&
    fromIdxRef.current >= 0 &&
    insertionWouldMove(fromIdxRef.current, idx);

  return (
    <div
      data-tour="carta-categories-modal"
      className="w-full lg:w-[520px] shrink-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 flex flex-col gap-5 shadow-card animate-in slide-in-from-right duration-200"
    >
      <div className="flex justify-between items-start pb-3 border-b border-[var(--border-subtle)]">
        <div>
          <h2 className="text-[18px] font-semibold text-[var(--text-primary)] tracking-tight">
            Categorías
          </h2>
          <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
            Arrastrá para reordenar. El puesto es la posición en la caja (1 = primero).
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

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)] overflow-hidden">
        <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-0 px-3 pt-3 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] text-center">
            Puesto
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] pl-3">
            Categoría
          </span>
        </div>

        <div className="px-2 pb-2 flex flex-col">
          {sorted.map((c, idx) => {
            const dragging = dragId === c.id;
            const system = isSystemCategory(c.name);
            const tone = PUESTO_TONES[idx % PUESTO_TONES.length]!;

            return (
              <div key={c.id} className="relative">
                {showLineAt(idx) && (
                  <div
                    className="absolute left-[52px] right-2 top-0 -translate-y-1/2 h-0.5 bg-[var(--accent-primary)] pointer-events-none z-20"
                    aria-hidden
                  >
                    <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
                  </div>
                )}

                <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-2 items-center py-1">
                  <div
                    className={`h-10 rounded-xl border flex items-center justify-center font-mono text-[13px] font-semibold tabular-nums select-none ${
                      dragging ? "opacity-30 border-dashed border-[var(--border-strong)] bg-[var(--bg-panel)] text-[var(--text-tertiary)]" : tone
                    }`}
                    aria-label={`Puesto ${c.sortOrder}`}
                  >
                    {dragging ? "" : c.sortOrder}
                  </div>

                  <div
                    ref={(node) => {
                      if (node) rowRefs.current.set(c.id, node);
                      else rowRefs.current.delete(c.id);
                    }}
                    className={`group flex items-center gap-2 h-11 px-3 rounded-xl border text-[13px] font-medium select-none ${
                      dragging
                        ? "border-dashed border-[var(--border-strong)] bg-[color-mix(in_oklab,var(--bg-panel)_70%,transparent)] text-transparent shadow-none"
                        : "border-transparent bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-subtle)]"
                    }`}
                  >
                    {!dragging && (
                      <>
                        <span className="flex-1 min-w-0 truncate">{c.name}</span>
                        {system && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--accent-surface)] text-[var(--accent-text)] border border-[var(--accent-line)] select-none shrink-0">
                            Sistema
                          </span>
                        )}
                        {!system && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmId(confirmId === c.id ? null : c.id);
                            }}
                            disabled={saving}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--danger-soft)] hover:text-[var(--danger-base)] transition-all cursor-pointer shrink-0"
                            aria-label={`Eliminar ${c.name}`}
                            title="Eliminar categoría"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </>
                    )}

                    <button
                      type="button"
                      onPointerDown={(e) => handlePointerDown(e, c, idx)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={finishDrag}
                      className={`ml-auto w-8 h-8 rounded-lg flex items-center justify-center shrink-0 touch-none cursor-grab active:cursor-grabbing transition-colors ${
                        dragging
                          ? "invisible"
                          : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)]"
                      }`}
                      aria-label={`Arrastrar ${c.name}`}
                    >
                      <GripVertical size={15} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {showLineAt(sorted.length) && (
            <div
              className="relative ml-[52px] mr-2 my-0.5 h-0.5 bg-[var(--accent-primary)]"
              aria-hidden
            >
              <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
            </div>
          )}

          {sorted.length === 0 && (
            <p className="text-[13px] text-[var(--text-tertiary)] py-6 text-center">
              Todavía no hay categorías. Creá la primera abajo.
            </p>
          )}
        </div>
      </div>

      {ghost && (
        <div
          aria-hidden
          className="fixed z-[200] pointer-events-none flex items-center gap-2 h-11 px-3 rounded-xl border border-[var(--accent-line)] bg-[var(--bg-surface)] text-[var(--text-primary)] text-[13px] font-medium shadow-[0_12px_28px_color-mix(in_oklab,var(--text-primary)_18%,transparent)] rotate-[1.5deg] opacity-95"
          style={{
            left: ghost.x,
            top: ghost.y,
            width: ghost.width,
            height: ghost.height,
          }}
        >
          <span className="flex-1 min-w-0 truncate">{ghost.name}</span>
          {ghost.system && (
            <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--accent-surface)] text-[var(--accent-text)] border border-[var(--accent-line)] shrink-0">
              Sistema
            </span>
          )}
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--accent-text)] shrink-0">
            <GripVertical size={15} strokeWidth={2.2} />
          </span>
        </div>
      )}

      {confirmId && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--danger-soft)] border border-[var(--danger-line)] text-[var(--danger-base)] text-[13px] font-medium animate-in fade-in slide-in-from-top-1 duration-150">
          <span className="flex-1 truncate">
            ¿Eliminar {sorted.find((c) => c.id === confirmId)?.name ?? "categoría"}?
          </span>
          <button
            type="button"
            onClick={() => setConfirmId(null)}
            className="h-7 px-2.5 rounded-full text-[11px] font-semibold hover:bg-black/10 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmId(null);
              void onDelete(confirmId);
            }}
            disabled={saving}
            className="h-7 px-3 rounded-full bg-[var(--danger-base)] text-white text-[11px] font-semibold hover:brightness-110 transition-all cursor-pointer"
          >
            Eliminar
          </button>
        </div>
      )}

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
