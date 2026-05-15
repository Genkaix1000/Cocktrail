"use client";

import { Check, Loader2, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import ActiveOrderPill from "../../components/ActiveOrderPill";
import DrinkCard from "../../components/DrinkCard";
import DrinkSkeleton from "../../components/DrinkSkeleton";
import { SEED_DRINKS } from "@/data/drinks";
import { saveActiveOrder } from "@/lib/activeOrder";

const DRINKS = SEED_DRINKS;

// Chips de la Carta V2. Son visualmente filtros; mantenemos "Todo" activo
// (no se implementó filtrado real por categoría — no era parte del scope MVP).
const FILTER_CHIPS = [
  { id: "todo", label: "Todo" },
  { id: "trending", label: "Tendencia" },
  { id: "clasico", label: "Clásicos" },
  { id: "cerveza", label: "Cerveza" },
  { id: "sin", label: "S/alc" },
];

export default function CartaPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeChip, setActiveChip] = useState<string>("todo");

  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const sortedDrinks = useMemo(
    () => [...DRINKS].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const trendingDrinks = useMemo(
    () => sortedDrinks.filter((d) => d.trending),
    [sortedDrinks],
  );
  const regularDrinks = useMemo(
    () => sortedDrinks.filter((d) => !d.trending),
    [sortedDrinks],
  );

  const addToCart = (id: number) =>
    setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));

  const removeFromCart = (id: number) =>
    setCart((prev) => {
      const next = { ...prev };
      if (next[id] > 1) next[id] -= 1;
      else delete next[id];
      return next;
    });

  const totalPrice = useMemo(
    () =>
      Object.entries(cart).reduce((sum, [idStr, qty]) => {
        const d = DRINKS.find((x) => x.id === Number(idStr));
        return sum + (d?.price ?? 0) * qty;
      }, 0),
    [cart],
  );

  const totalItems = useMemo(
    () => Object.values(cart).reduce((s, q) => s + q, 0),
    [cart],
  );

  async function confirmOrder() {
    if (submitting || totalItems === 0) return;
    setSubmitting(true);
    setError(null);
    const started = Date.now();

    try {
      const items = Object.entries(cart).map(([idStr, qty]) => ({
        drinkId: Number(idStr),
        qty,
      }));

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, paymentMethod: "transferencia" }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo crear el pedido");
      }

      const order = (await res.json()) as {
        token: string;
        displayNumber: number;
        createdAt: number;
      };

      saveActiveOrder({
        token: order.token,
        displayNumber: order.displayNumber,
        createdAt: order.createdAt,
      });

      // Mínimo de 600ms para que el "Procesando pago…" no parpadee.
      const elapsed = Date.now() - started;
      if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));

      setCart({});
      setIsCartOpen(false);
      router.push(`/pedido/${order.token}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen pb-32 relative overflow-hidden bg-ink-950">
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-ink-900 border border-ink-700 w-full max-w-md rounded-[22px] p-6 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-serif-italic text-2xl text-ink-50">
                Tu pedido
              </h2>
              <button
                type="button"
                onClick={() => !submitting && setIsCartOpen(false)}
                disabled={submitting}
                className="p-2 bg-ink-800 rounded-full text-ink-300 hover:text-ink-50 disabled:opacity-40"
                aria-label="Cerrar carrito"
              >
                <X size={18} />
              </button>
            </div>

            {Object.keys(cart).length === 0 ? (
              <div className="text-center py-10 text-ink-400">
                <ShoppingBag size={48} className="mx-auto mb-4 opacity-20" />
                <p>No tenés tragos en tu pedido aún.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
                {Object.entries(cart).map(([idStr, qty]) => {
                  const id = Number(idStr);
                  const drink = DRINKS.find((d) => d.id === id);
                  if (!drink) return null;
                  const subtotal = drink.price * qty;
                  return (
                    <div
                      key={id}
                      className="flex justify-between items-center bg-ink-850 p-3 rounded-xl border border-ink-800"
                    >
                      <div className="flex flex-col min-w-0 mr-3">
                        <p className="font-serif-italic text-base text-ink-50 leading-tight truncate">
                          {drink.name}
                        </p>
                        <p className="text-ink-400 text-[11px] font-medium font-mono tabular mt-0.5">
                          ${drink.price.toLocaleString("es-AR")} c/u
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => removeFromCart(id)}
                            disabled={submitting}
                            className="w-7 h-7 rounded-md bg-ink-750 border border-ink-600 flex items-center justify-center text-ink-50 hover:bg-ink-700 disabled:opacity-40"
                            aria-label={`Quitar uno de ${drink.name}`}
                          >
                            <Minus size={12} strokeWidth={2.5} />
                          </button>
                          <span className="text-ink-50 font-mono w-5 text-center text-xs tabular">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => addToCart(id)}
                            disabled={submitting}
                            className="w-7 h-7 rounded-md bg-ink-750 border border-ink-600 flex items-center justify-center text-ink-50 hover:bg-blue hover:text-ink-950 hover:border-blue disabled:opacity-40"
                            aria-label={`Agregar uno de ${drink.name}`}
                          >
                            <Plus size={12} strokeWidth={2.5} />
                          </button>
                        </div>
                        <span className="text-ink-50 font-mono font-medium min-w-[64px] text-right tabular">
                          ${subtotal.toLocaleString("es-AR")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {Object.keys(cart).length > 0 && (
              <div className="mt-6 pt-6 border-t border-ink-800">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-ink-400 text-xs uppercase tracking-[0.18em] font-medium">
                    Total a pagar
                  </span>
                  <span className="font-serif-italic text-3xl text-ink-50 tabular">
                    ${totalPrice.toLocaleString("es-AR")}
                  </span>
                </div>

                {error && (
                  <div className="mb-4 text-sm text-danger bg-danger-soft border border-danger-line rounded-xl px-3 py-2.5">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={confirmOrder}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 h-14 bg-blue text-ink-950 font-semibold rounded-2xl hover:brightness-110 active:scale-95 transition-all text-base uppercase tracking-[0.14em] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Procesando pago…
                    </>
                  ) : (
                    <>
                      <Check size={18} strokeWidth={3} />
                      Confirmar pedido
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header sticky · marca + sort */}
      <header className="sticky top-0 z-40 bg-gradient-to-b from-ink-950 from-70% to-transparent px-[18px] pt-[18px] pb-3">
        <div className="flex justify-between items-center mb-3.5">
          <div className="flex items-baseline gap-2">
            <span className="font-serif-italic text-[22px] leading-none text-ink-50">
              Cocktrail
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">
              Carta
            </span>
          </div>
        </div>

        {/* Chips de categoría — visuales (Tendencia se mantiene como hero arriba) */}
        <nav className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-[18px] px-[18px]">
          {FILTER_CHIPS.map((f) => {
            const on = activeChip === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveChip(f.id)}
                className={`flex-none h-7 px-3 rounded-lg border text-[11px] font-medium transition-colors ${
                  on
                    ? "bg-blue text-ink-950 border-blue"
                    : "bg-ink-850 text-ink-200 border-ink-700 hover:border-ink-600"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </nav>
      </header>

      <ActiveOrderPill />

      <div className="px-[18px] pt-2">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <DrinkSkeleton key={`sk-${i}`} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-5 mt-2">
            {trendingDrinks.length > 0 && (
              <section>
                <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400 mb-3 flex items-center gap-2.5">
                  <span>Tendencia esta noche</span>
                  <span className="flex-1 h-px bg-ink-800" />
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  {trendingDrinks.map((d) => (
                    <DrinkCard
                      key={`t-${d.id}`}
                      name={d.name}
                      price={d.price}
                      vibe={d.vibe}
                      isTrending
                      quantity={cart[d.id] || 0}
                      onAdd={() => addToCart(d.id)}
                      onRemove={() => removeFromCart(d.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400 mb-3 flex items-center gap-2.5">
                <span>
                  Nuestra carta · {regularDrinks.length} tragos
                </span>
                <span className="flex-1 h-px bg-ink-800" />
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {regularDrinks.map((d) => (
                  <DrinkCard
                    key={d.id}
                    name={d.name}
                    price={d.price}
                    vibe={d.vibe}
                    quantity={cart[d.id] || 0}
                    onAdd={() => addToCart(d.id)}
                    onRemove={() => removeFromCart(d.id)}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Cart bar bottom · Carta V2 */}
      {!isCartOpen && !isLoading && totalItems > 0 && (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-3 inset-x-3 h-14 bg-blue text-ink-950 rounded-[14px] flex items-center justify-between px-4 shadow-2xl active:scale-[0.98] transition-transform z-50"
        >
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] opacity-70">
              Tu pedido
            </span>
            <span className="text-base font-semibold tabular">
              ${totalPrice.toLocaleString("es-AR")}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2 bg-ink-950 text-ink-50 rounded-full text-[12px] font-medium uppercase tracking-[0.08em]">
            <span className="w-[22px] h-[22px] rounded-full bg-ink-950 ring-2 ring-blue/30 text-blue flex items-center justify-center text-[11px] font-semibold">
              {totalItems}
            </span>
            Ver pedido
            <span className="text-sm">→</span>
          </div>
        </button>
      )}
    </main>
  );
}
