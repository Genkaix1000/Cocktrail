/** Papel de impresión: drinkId → qty en ese papel. */
export type PrintPaper = Record<number, number>;

export function assignedByDrink(papers: PrintPaper[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const paper of papers) {
    for (const [idStr, qty] of Object.entries(paper)) {
      const q = Math.floor(Number(qty) || 0);
      if (q <= 0) continue;
      const id = Number(idStr);
      out[id] = (out[id] || 0) + q;
    }
  }
  return out;
}

/** Unidades del carrito todavía sin papel. */
export function poolFromCart(cart: Record<number, number>, papers: PrintPaper[]): Record<number, number> {
  const assigned = assignedByDrink(papers);
  const pool: Record<number, number> = {};
  for (const [idStr, qty] of Object.entries(cart)) {
    const id = Number(idStr);
    const left = qty - (assigned[id] || 0);
    if (left > 0) pool[id] = left;
  }
  return pool;
}

/** Un papel por unidad del carrito (atajo típico de barra). */
export function onePaperPerUnit(cart: Record<number, number>): PrintPaper[] {
  const papers: PrintPaper[] = [];
  for (const [idStr, qty] of Object.entries(cart)) {
    const id = Number(idStr);
    for (let i = 0; i < qty; i++) papers.push({ [id]: 1 });
  }
  return papers;
}

export function nonemptyPapers(papers: PrintPaper[]): PrintPaper[] {
  return papers.filter((p) => Object.values(p).some((q) => q > 0));
}

/** ≥2 papeles con ítems y suma exacta al carrito. */
export function splitConfigOk(cart: Record<number, number>, papers: PrintPaper[]): boolean {
  const groups = nonemptyPapers(papers);
  if (groups.length < 2) return false;
  const assigned = assignedByDrink(groups);
  for (const [idStr, qty] of Object.entries(cart)) {
    if ((assigned[Number(idStr)] || 0) !== qty) return false;
  }
  return Object.keys(assigned).every((id) => (cart[Number(id)] || 0) > 0);
}

/** Saca 1 unidad de un drink del papel → vuelve al pool. */
export function removeOneFromPaper(papers: PrintPaper[], paperIdx: number, drinkId: number): PrintPaper[] {
  return papers.map((p, i) => {
    if (i !== paperIdx) return p;
    const next = { ...p };
    const q = (next[drinkId] || 0) - 1;
    if (q <= 0) delete next[drinkId];
    else next[drinkId] = q;
    return next;
  });
}

/** Mueve 1 unidad del pool al papel (apila si ya está). No-op si no hay pool. */
export function addOneToPaper(
  cart: Record<number, number>,
  papers: PrintPaper[],
  paperIdx: number,
  drinkId: number,
): PrintPaper[] {
  const pool = poolFromCart(cart, papers);
  if ((pool[drinkId] || 0) <= 0) return papers;
  if (paperIdx < 0 || paperIdx >= papers.length) return papers;
  return papers.map((p, i) =>
    i === paperIdx ? { ...p, [drinkId]: (p[drinkId] || 0) + 1 } : p,
  );
}
