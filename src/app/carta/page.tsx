"use client";

import {
  ArrowUpDown,
  Check,
  Flame,
  Loader2,
  Martini,
  Minus,
  Plus,
  ShoppingBag,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import DrinkCard from "../../components/DrinkCard";
import DrinkSkeleton from "../../components/DrinkSkeleton";
import { SEED_DRINKS } from "@/data/drinks";
import { drinkIcon } from "@/lib/icons";

const DRINKS = SEED_DRINKS;

export default function CartaPage() {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<"alpha" | "price">("alpha");
  const [isLoading, setIsLoading] = useState(true);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const sortedDrinks = useMemo(() => {
    return [...DRINKS].sort((a, b) => {
      if (sortBy === "alpha") return a.name.localeCompare(b.name);
      return a.price - b.price;
    });
  }, [sortBy]);

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

      const order = (await res.json()) as { token: string };

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
    <main className="min-h-screen pb-24 relative overflow-hidden bg-[#020617]">
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#0f172a] border border-[#1e293b] w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Tu pedido
              </h2>
              <button
                type="button"
                onClick={() => !submitting && setIsCartOpen(false)}
                disabled={submitting}
                className="p-2 bg-[#1e293b] rounded-full text-slate-400 hover:text-white disabled:opacity-40"
                aria-label="Cerrar carrito"
              >
                <X size={20} />
              </button>
            </div>

            {Object.keys(cart).length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <ShoppingBag size={48} className="mx-auto mb-4 opacity-20" />
                <p>No tenés tragos en tu pedido aún.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 max-h-[50vh] overflow-y-auto pr-2">
                {Object.entries(cart).map(([idStr, qty]) => {
                  const id = Number(idStr);
                  const drink = DRINKS.find((d) => d.id === id);
                  if (!drink) return null;
                  const Icon = drinkIcon(drink.iconName);
                  const subtotal = drink.price * qty;
                  return (
                    <div
                      key={id}
                      className="flex justify-between items-center text-sm bg-[#020617]/50 p-3 rounded-xl border border-[#1e293b]/50"
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={16} className="text-[#38bdf8]/50" />
                        <div className="flex flex-col">
                          <p className="text-white font-bold leading-tight">
                            {drink.name}
                          </p>
                          <p className="text-slate-400 text-[11px] font-medium">
                            ${drink.price.toLocaleString("es-AR")} c/u
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-[#0f172a] rounded-full border border-[#1e293b]">
                          <button
                            type="button"
                            onClick={() => removeFromCart(id)}
                            disabled={submitting}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#1e293b]/80 text-[#38bdf8] transition-colors disabled:opacity-40"
                            aria-label={`Quitar uno de ${drink.name}`}
                          >
                            <Minus size={14} strokeWidth={3} />
                          </button>
                          <span className="text-white font-mono w-4 text-center text-xs">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => addToCart(id)}
                            disabled={submitting}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#1e293b]/80 text-[#38bdf8] transition-colors disabled:opacity-40"
                            aria-label={`Agregar uno de ${drink.name}`}
                          >
                            <Plus size={14} strokeWidth={3} />
                          </button>
                        </div>
                        <span className="text-[#38bdf8] font-black min-w-[60px] text-right">
                          ${subtotal.toLocaleString("es-AR")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {Object.keys(cart).length > 0 && (
              <div className="mt-6 pt-6 border-t border-[#1e293b]">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-slate-400">Total a pagar</span>
                  <span className="text-3xl font-black text-white">
                    ${totalPrice.toLocaleString("es-AR")}
                  </span>
                </div>

                {error && (
                  <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  onClick={confirmOrder}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 h-14 bg-[#38bdf8] text-[#020617] font-black rounded-2xl hover:bg-[#7dd3fc] active:scale-95 transition-all text-lg disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Procesando pago…
                    </>
                  ) : (
                    <>
                      <Check size={20} strokeWidth={3} />
                      Confirmar pedido
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-[#020617]/80 backdrop-blur-xl border-b border-white/5 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#38bdf8] to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-[#38bdf8]/20">
            <Martini size={20} className="text-[#020617] fill-[#020617]" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white leading-none">
              Cocktrail
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">
              Menú digital
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setSortBy((prev) => (prev === "alpha" ? "price" : "alpha"))
            }
            className="w-10 h-10 rounded-xl bg-[#0f172a] border border-[#1e293b] flex items-center justify-center text-slate-400 hover:text-[#38bdf8] hover:border-[#38bdf8]/30 transition-all active:scale-95"
            aria-label="Cambiar orden"
          >
            <ArrowUpDown size={18} />
          </button>
        </div>
      </header>

      <div className="p-5">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <DrinkSkeleton key={`sk-${i}`} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-8 mt-2">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Flame size={18} className="text-[#38bdf8]" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#38bdf8]">
                  Tragos en tendencia
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {trendingDrinks.map((d) => (
                  <DrinkCard
                    key={`t-${d.id}`}
                    name={d.name}
                    description={d.description}
                    price={d.price}
                    icon={drinkIcon(d.iconName)}
                    vibe={d.vibe}
                    flavors={d.flavors}
                    isTrending
                    quantity={cart[d.id] || 0}
                    onAdd={() => addToCart(d.id)}
                    onRemove={() => removeFromCart(d.id)}
                  />
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-4">
                Nuestra carta —{" "}
                {sortBy === "alpha" ? "A a la Z" : "Precio menor a mayor"}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {regularDrinks.map((d) => (
                  <DrinkCard
                    key={d.id}
                    name={d.name}
                    description={d.description}
                    price={d.price}
                    icon={drinkIcon(d.iconName)}
                    vibe={d.vibe}
                    flavors={d.flavors}
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

      {!isCartOpen && !isLoading && totalItems > 0 && (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-6 inset-x-5 h-14 bg-[#38bdf8] rounded-2xl flex items-center justify-between px-6 shadow-2xl shadow-[#38bdf8]/20 active:scale-95 transition-transform z-50"
        >
          <div className="flex items-center gap-2">
            <div className="bg-[#020617] text-[#38bdf8] w-6 h-6 rounded-full flex items-center justify-center text-xs font-black">
              {totalItems}
            </div>
            <span className="text-[#020617] font-black uppercase text-xs tracking-wider">
              Ver mi pedido
            </span>
          </div>
          <span className="text-[#020617] font-black text-lg">
            ${totalPrice.toLocaleString("es-AR")}
          </span>
        </button>
      )}
    </main>
  );
}
