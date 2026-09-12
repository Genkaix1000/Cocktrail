"use client";

import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { Drink } from "@cocktrail/shared";
import {
  addOneToPaper,
  nonemptyPapers,
  onePaperPerUnit,
  poolFromCart,
  removeOneFromPaper,
  splitConfigOk,
  type PrintPaper,
} from "@/lib/split-print";

type Props = {
  cart: Record<number, number>;
  drinks: Drink[];
  /** Config ya aceptada (editar); si vacío, arranca con 1 papel y todo en el pool. */
  initialPapers?: PrintPaper[];
  onAccept: (papers: PrintPaper[]) => void;
  onClose: () => void;
};

/**
 * Popup de división de papeles: pool de unidades + papeles.
 * Tap en el pool → manda 1 al papel seleccionado (mismo trago se apila).
 * Atajo: 1 papel por unidad.
 */
export default function SplitPrintModal({
  cart,
  drinks,
  initialPapers,
  onAccept,
  onClose,
}: Props) {
  const nameById = useMemo(
    () => Object.fromEntries(drinks.map((d) => [d.id, d.name])),
    [drinks],
  );

  const [papers, setPapers] = useState<PrintPaper[]>(() =>
    initialPapers && initialPapers.length > 0 ? initialPapers.map((p) => ({ ...p })) : [{}],
  );
  const [selected, setSelected] = useState(0);

  const pool = useMemo(() => poolFromCart(cart, papers), [cart, papers]);
  const poolEntries = useMemo(
    () =>
      Object.entries(pool)
        .map(([id, qty]) => ({ drinkId: Number(id), qty, name: nameById[Number(id)] ?? `#${id}` }))
        .filter((e) => e.qty > 0),
    [pool, nameById],
  );
  const canAccept = splitConfigOk(cart, papers);
  const paperCount = nonemptyPapers(papers).length;

  function assignToSelected(drinkId: number) {
    setPapers((prev) => addOneToPaper(cart, prev, selected, drinkId));
  }

  function peelFromPaper(paperIdx: number, drinkId: number) {
    setPapers((prev) => removeOneFromPaper(prev, paperIdx, drinkId));
  }

  function addPaper() {
    setPapers((prev) => {
      setSelected(prev.length);
      return [...prev, {}];
    });
  }

  function removePaper(idx: number) {
    if (papers.length <= 1) return;
    setPapers((prev) => prev.filter((_, i) => i !== idx));
    setSelected((s) => Math.max(0, s >= idx ? s - 1 : s));
  }

  function applyOnePerUnit() {
    const next = onePaperPerUnit(cart);
    setPapers(next.length > 0 ? next : [{}]);
    setSelected(0);
  }

  function handleAccept() {
    if (!canAccept) return;
    onAccept(nonemptyPapers(papers));
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="split-print-title"
        className="w-full sm:max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-ink-950 border border-ink-800 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
          <h2 id="split-print-title" className="text-base font-black text-ink-50">
            Dividir papeles
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-ink-900 border border-ink-800 flex items-center justify-center text-ink-300 cursor-pointer"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
          <button
            type="button"
            onClick={applyOnePerUnit}
            className="w-full h-11 rounded-xl bg-accent/15 border border-accent/40 text-accent text-[13px] font-bold cursor-pointer"
          >
            1 papel por unidad
          </button>

          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-ink-400">
              Sin asignar
            </span>
            {poolEntries.length === 0 ? (
              <p className="text-[12px] text-ink-500 py-2">Todo asignado a papeles.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {poolEntries.map(({ drinkId, qty, name }) => (
                  <button
                    key={drinkId}
                    type="button"
                    onClick={() => assignToSelected(drinkId)}
                    className="h-10 px-3 rounded-xl bg-ink-900 border border-ink-750 text-ink-50 text-[13px] font-bold cursor-pointer active:scale-95"
                  >
                    {name} ×{qty}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-ink-500">
              Tocá un trago para mandarlo al papel seleccionado.
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-ink-400">
              Papeles
            </span>
            {papers.map((paper, pIdx) => {
              const lines = Object.entries(paper)
                .map(([id, qty]) => ({
                  drinkId: Number(id),
                  qty,
                  name: nameById[Number(id)] ?? `#${id}`,
                }))
                .filter((l) => l.qty > 0);
              const isSel = selected === pIdx;
              return (
                <div
                  key={pIdx}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(pIdx)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(pIdx);
                    }
                  }}
                  className={`rounded-xl border p-3 space-y-2 cursor-pointer ${
                    isSel
                      ? "border-accent/50 bg-accent/10"
                      : "border-ink-800 bg-ink-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-ink-200">
                      Papel {pIdx + 1}
                      {isSel ? " · activo" : ""}
                    </span>
                    {papers.length > 1 && (
                      <button
                        type="button"
                        className="text-[11px] text-danger cursor-pointer bg-transparent border-none"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePaper(pIdx);
                        }}
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  {lines.length === 0 ? (
                    <p className="text-[12px] text-ink-500">Vacío</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {lines.map((l) => (
                        <button
                          key={l.drinkId}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(pIdx);
                            peelFromPaper(pIdx, l.drinkId);
                          }}
                          className="h-9 px-2.5 rounded-lg bg-ink-950 border border-ink-750 text-ink-100 text-[12px] font-semibold cursor-pointer"
                          title="Devolver 1 al pool"
                        >
                          {l.name} ×{l.qty}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={addPaper}
              className="w-full h-10 rounded-xl border border-dashed border-ink-700 text-[12px] font-bold text-ink-300 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} /> Papel
            </button>
          </div>

          {!canAccept && (
            <p className="text-[11px] text-amber">
              Asigná todas las unidades en al menos 2 papeles para continuar.
            </p>
          )}
        </div>

        <div className="shrink-0 flex gap-2 px-5 py-4 border-t border-ink-800 bg-ink-950">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl bg-ink-900 border border-ink-800 text-ink-200 text-[13px] font-bold cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canAccept}
            onClick={handleAccept}
            className="flex-1 h-12 rounded-xl bg-accent text-ink-950 text-[13px] font-black cursor-pointer disabled:opacity-40"
          >
            Aceptar{canAccept ? ` · ${paperCount} papeles` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
