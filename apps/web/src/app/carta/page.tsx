"use client";

import { Minus, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import ActiveOrderPill from "../../components/ActiveOrderPill";
import DrinkCard from "../../components/DrinkCard";
import DrinkSkeleton from "../../components/DrinkSkeleton";
import { BrandLogo } from "@/components/BrandLogo";
import { saveActiveOrder } from "@/lib/activeOrder";
import { drinksService } from "@/services/drinks.service";
import { ordersService } from "@/services/orders.service";
import type { Drink, OrderStatus } from "@cocktrail/shared";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-[10px] uppercase tracking-[0.2em] font-black text-ink-400 whitespace-nowrap">
        {children}
      </h2>
      <span className="flex-1 h-px bg-white/5" />
    </div>
  );
}

interface SavedOrder {
  token: string;
  displayNumber: number;
  createdAt: number;
  status: OrderStatus;
  total: number;
}

export default function CartaPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myOrders, setMyOrders] = useState<SavedOrder[]>([]);

  useEffect(() => {
    drinksService.list().then((data) => {
      setDrinks(data);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("cocktrail_my_orders");
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as SavedOrder[];
          setMyOrders(parsed);

          // Sync pending orders from backend in the background
          const pending = parsed.filter(o => o.status !== "entregado" && o.status !== "cancelado");
          if (pending.length > 0) {
            Promise.all(
              pending.map(async (o) => {
                try {
                  const latest = await ordersService.getByToken(o.token);
                  return latest;
                } catch {
                  return null;
                }
              })
            ).then((results) => {
              let changed = false;
              const updated = parsed.map(o => {
                const latest = results.find(r => r && r.token === o.token);
                if (latest && latest.status !== o.status) {
                  changed = true;
                  return { ...o, status: latest.status };
                }
                return o;
              });
              if (changed) {
                setMyOrders(updated);
                localStorage.setItem("cocktrail_my_orders", JSON.stringify(updated));
              }
            });
          }
        } catch (e) {
          console.error("Error restoring my orders:", e);
        }
      }
    }
  }, []);

  const sortedDrinks = useMemo(() => {
    return [...drinks]
      .filter((d) => d && d.name && typeof d.price === "number" && d.available)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [drinks]);
  const promoDrinks = useMemo(() => sortedDrinks.filter((d) => d.promo), [sortedDrinks]);
  const trendingDrinks = useMemo(() => sortedDrinks.filter((d) => d.trending && !d.promo), [sortedDrinks]);
  const regularDrinks = useMemo(() => sortedDrinks.filter((d) => !d.trending && !d.promo), [sortedDrinks]);

  const addToCart = (id: number) => setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  const removeFromCart = (id: number) => setCart((prev) => {
    const next = { ...prev };
    if (next[id] > 1) next[id] -= 1;
    else delete next[id];
    return next;
  });

  const totalPrice = useMemo(() => Object.entries(cart).reduce((sum, [idStr, qty]) => {
    const d = drinks.find((x) => x.id === Number(idStr));
    return sum + (d?.price ?? 0) * qty;
  }, 0), [cart, drinks]);

  const totalItems = useMemo(() => Object.values(cart).reduce((s, q) => s + q, 0), [cart]);

  const confirmOrder = useCallback(async () => {
    if (submitting || totalItems === 0) return;
    setSubmitting(true);
    try {
      const items = Object.entries(cart).map(([idStr, qty]) => ({ drinkId: Number(idStr), qty }));
      const order = await ordersService.create({ items, paymentMethod: "transferencia" });
      saveActiveOrder({ token: order.token, displayNumber: order.displayNumber, createdAt: order.createdAt });
      
      // Save new order to list in localStorage
      if (typeof window !== "undefined") {
        const raw = localStorage.getItem("cocktrail_my_orders");
        let list: SavedOrder[] = [];
        if (raw) {
          try {
            list = JSON.parse(raw);
          } catch {}
        }
        const newOrder: SavedOrder = {
          token: order.token,
          displayNumber: order.displayNumber,
          createdAt: new Date(order.createdAt).getTime(),
          status: order.status,
          total: order.total
        };
        // Avoid duplicates
        if (!list.some(o => o.token === order.token)) {
          list = [newOrder, ...list];
          localStorage.setItem("cocktrail_my_orders", JSON.stringify(list));
        }
      }

      setCart({});
      setIsCartOpen(false);
      router.push(`/pedido/${order.token}`);
    } catch {
      setSubmitting(false);
    }
  }, [submitting, totalItems, cart, router]);

  return (
    <main className="min-h-screen pb-40 bg-ink-950 text-ink-50">
      {/* ── Modal Carrito ── */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-ink-900 border border-white/10 w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black">Tu pedido</h2>
              <button onClick={() => setIsCartOpen(false)} className="p-3 bg-white/5 rounded-full active:scale-90 transition-transform">
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
              {Object.entries(cart).map(([idStr, qty]) => {
                const d = drinks.find((x) => x.id === Number(idStr));
                if (!d) return null;
                return (
                  <div key={d.id} className="flex justify-between items-center bg-white/5 p-4 rounded-2xl">
                    <div className="flex flex-col min-w-0">
                      <p className="font-bold truncate text-sm">{d.name}</p>
                      <p className="font-black text-blue text-xs">${d.price.toLocaleString("es-AR")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => removeFromCart(d.id)} className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center active:scale-90 transition-transform"><Minus size={16} strokeWidth={3} /></button>
                      <span className="font-bold w-4 text-center text-sm">{qty}</span>
                      <button onClick={() => addToCart(d.id)} className="w-10 h-10 rounded-lg bg-blue text-ink-950 flex items-center justify-center active:scale-90 transition-transform"><Plus size={16} strokeWidth={3} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="flex justify-between items-center mb-6">
                <span className="text-xs uppercase font-black text-ink-400">Total</span>
                <span className="text-3xl font-black text-blue">${totalPrice.toLocaleString("es-AR")}</span>
              </div>
              <button onClick={confirmOrder} disabled={submitting} className="w-full h-14 bg-blue text-ink-950 font-black rounded-xl active:scale-95 transition-all text-sm uppercase tracking-widest">
                {submitting ? "Cargando..." : "Confirmar Pedido"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-ink-950/75 backdrop-blur-xl border-b border-ink-900/60 px-5 py-1.5">
        <div className="flex items-center justify-between">
          <BrandLogo size="lg" />
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-300">
              Carta Online
            </span>
          </div>
        </div>
      </header>

      <ActiveOrderPill />

      <div className="px-5 mt-4 space-y-10">
        {isLoading ? (
          <div className="space-y-10">
            <DrinkSkeleton variant="hero" />
            <DrinkSkeleton />
          </div>
        ) : (
          <>
            {myOrders.length > 0 && (
              <section className="animate-in fade-in slide-in-from-top-4 duration-300">
                <SectionTitle>Mis Pedidos de la Noche</SectionTitle>
                <div className="grid grid-cols-1 gap-3">
                  {myOrders.map((o) => {
                    const timeStr = new Date(o.createdAt).toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const isDelivered = o.status === "entregado";
                    const isCancelled = o.status === "cancelado";
                    const isPending = !isDelivered && !isCancelled;

                    return (
                      <div
                        key={o.token}
                        onClick={() => router.push(`/pedido/${o.token}`)}
                        className="group relative flex items-center justify-between p-4 rounded-2xl bg-ink-900/60 border border-ink-850 hover:border-ink-700/80 active:scale-[0.98] transition-all cursor-pointer overflow-hidden"
                      >
                        {/* Background hover light effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        
                        <div className="flex flex-col gap-1 z-10">
                          <div className="flex items-center gap-2">
                            <span className="font-serif-italic text-lg font-black text-white">
                              #{o.displayNumber}
                            </span>
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              isPending
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : isDelivered
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-red-500/10 text-red-400 border border-red-500/20"
                            }`}>
                              {o.status}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-ink-400">
                            Realizado a las {timeStr} hs
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1 z-10">
                          <span className="font-mono text-sm font-bold text-white">
                            ${o.total.toLocaleString("es-AR")}
                          </span>
                          <span className="text-[9px] uppercase tracking-wider font-black text-blue group-hover:translate-x-1 transition-transform">
                            Ver Ticket →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {promoDrinks.length > 0 && (
              <section>
                <SectionTitle>Promos Especiales</SectionTitle>
                <div className="flex flex-col gap-4">
                  {promoDrinks.map(d => <DrinkCard key={d.id} {...d} icon={d.iconName} variant="promo" quantity={cart[d.id] || 0} onAdd={() => addToCart(d.id)} onRemove={() => removeFromCart(d.id)} />)}
                </div>
              </section>
            )}

            {trendingDrinks.length > 0 && (
              <section>
                <SectionTitle>Tendencia de la noche</SectionTitle>
                <div className="flex flex-col gap-4">
                  {trendingDrinks.map(d => <DrinkCard key={d.id} {...d} icon={d.iconName} variant="trending" quantity={cart[d.id] || 0} onAdd={() => addToCart(d.id)} onRemove={() => removeFromCart(d.id)} />)}
                </div>
              </section>
            )}

            <section>
              <SectionTitle>Nuestra Carta</SectionTitle>
              <div className="flex flex-col gap-3">
                {regularDrinks.map(d => <DrinkCard key={d.id} {...d} icon={d.iconName} variant="regular" quantity={cart[d.id] || 0} onAdd={() => addToCart(d.id)} onRemove={() => removeFromCart(d.id)} />)}
              </div>
            </section>
          </>
        )}
      </div>

      {/* ── Floating Cart ── */}
      {!isCartOpen && !isLoading && totalItems > 0 && (
        <button onClick={() => setIsCartOpen(true)} className="fixed bottom-6 inset-x-6 h-16 bg-blue text-ink-950 rounded-2xl flex items-center justify-between px-6 shadow-2xl active:scale-95 transition-all z-50 border-t border-white/10">
          <div className="flex flex-col items-start">
            <span className="text-[9px] font-bold uppercase opacity-70">Tu pedido</span>
            <span className="text-lg font-black">${totalPrice.toLocaleString("es-AR")}</span>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-2 bg-ink-950 text-ink-50 rounded-full font-bold text-[11px] uppercase tracking-wider">
            <span className="w-6 h-6 rounded-full bg-blue text-ink-950 flex items-center justify-center text-xs font-black">{totalItems}</span>
            Ver Pedido
          </div>
        </button>
      )}
      <footer className="pt-12 pb-24 text-center opacity-40">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1">Cocktrail Nightclub System</p>
        <p className="text-[9px]">Powered by Cocktrail</p>
      </footer>
    </main>
  );
}
