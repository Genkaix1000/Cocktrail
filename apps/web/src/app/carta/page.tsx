"use client";

import { Minus, Plus, X, Clock, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import DrinkCard from "../../components/DrinkCard";
import DrinkSkeleton from "../../components/DrinkSkeleton";
import { BrandLogo } from "@/components/BrandLogo";
import { saveActiveOrder } from "@/lib/activeOrder";
import { drinksService } from "@/services/drinks.service";
import { ordersService } from "@/services/orders.service";
import { eventsService } from "@/services/events.service";
import { useSSE } from "@/lib/useSSE";
import { STATUS_META } from "@/lib/orderStatus";
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
  items?: { name: string; qty: number }[];
}

export default function CartaPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [myOrders, setMyOrders] = useState<SavedOrder[]>([]);
  const [activeTab, setActiveTab] = useState<"pending" | "redeemed">("pending");
  const [eventStartedAt, setEventStartedAt] = useState<number>(0);

  useSSE({
    "order.updated": ({ order: updated }) => {
      setMyOrders(prev => {
        let changed = false;
        const next = prev.map(o => {
          if (o.token === updated.token) {
            const itemsMapped = updated.items.map(it => ({ name: it.name, qty: it.qty }));
            const hasItemsChanged = !o.items || JSON.stringify(o.items) !== JSON.stringify(itemsMapped);
            if (o.status !== updated.status || o.total !== updated.total || hasItemsChanged) {
              changed = true;
              return {
                ...o,
                status: updated.status,
                total: updated.total,
                items: itemsMapped
              };
            }
          }
          return o;
        });
        if (changed) {
          localStorage.setItem("cocktrail_my_orders", JSON.stringify(next));
          return next;
        }
        return prev;
      });
    },
    "event.closed": () => {
      setMyOrders(prev => {
        const next = prev.filter(o => o.status !== "entregado" && o.status !== "cancelado");
        localStorage.setItem("cocktrail_my_orders", JSON.stringify(next));
        return next;
      });
      setEventStartedAt(Date.now());
    }
  });

  useEffect(() => {
    drinksService.list().then((data) => {
      setDrinks(data);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem("cocktrail_my_orders");
      let initialOrders: SavedOrder[] = [];
      if (raw) {
        try {
          initialOrders = JSON.parse(raw) as SavedOrder[];
          setMyOrders(initialOrders);
        } catch (e) {
          console.error("Error restoring my orders:", e);
        }
      }

      // Sync status, items and filter by night startedAt using public configuration
      eventsService.getPublicConfig()
        .then((config) => {
          const start = config.eventStartedAt;
          setEventStartedAt(start);

          // Keep orders from this night, OR unredeemed/pending orders from previous nights
          const currentNightOrders = initialOrders.filter(o => {
            const isFromPreviousNight = o.createdAt < start;
            const isRedeemed = o.status === "entregado" || o.status === "cancelado";
            return !(isFromPreviousNight && isRedeemed);
          });

          // Sync pending orders from backend in the background using their public token
          const pending = currentNightOrders.filter(o => o.status !== "entregado" && o.status !== "cancelado");
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
              const updated = currentNightOrders.map(o => {
                const latest = results.find(r => r && r.token === o.token);
                if (latest) {
                  const itemsMapped = latest.items.map(it => ({ name: it.name, qty: it.qty }));
                  const hasItemsChanged = !o.items || JSON.stringify(o.items) !== JSON.stringify(itemsMapped);
                  if (latest.status !== o.status || latest.total !== o.total || hasItemsChanged) {
                    changed = true;
                    return {
                      ...o,
                      status: latest.status,
                      total: latest.total,
                      items: itemsMapped
                    };
                  }
                }
                return o;
              });

              if (changed || currentNightOrders.length !== initialOrders.length) {
                setMyOrders(updated);
                localStorage.setItem("cocktrail_my_orders", JSON.stringify(updated));
              }
            });
          } else if (currentNightOrders.length !== initialOrders.length) {
            setMyOrders(currentNightOrders);
            localStorage.setItem("cocktrail_my_orders", JSON.stringify(currentNightOrders));
          }
        })
        .catch((err) => {
          console.error("Error fetching public config in mount:", err);
        });
    }
  }, []);

  useEffect(() => {
    const pendingCount = myOrders.filter(o => o.status !== "entregado" && o.status !== "cancelado").length;
    const redeemedCount = myOrders.filter(o => o.status === "entregado" || o.status === "cancelado").length;

    if (pendingCount === 0 && redeemedCount > 0 && activeTab === "pending") {
      setActiveTab("redeemed");
    } else if (redeemedCount === 0 && pendingCount > 0 && activeTab === "redeemed") {
      setActiveTab("pending");
    }
  }, [myOrders, activeTab]);

  const sortedDrinks = useMemo(() => {
    return [...drinks]
      .filter((d) => d && d.name && typeof d.price === "number" && d.available)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [drinks]);
  const promoDrinks = useMemo(() => sortedDrinks.filter((d) => d.promo), [sortedDrinks]);
  const trendingDrinks = useMemo(() => sortedDrinks.filter((d) => d.trending && !d.promo), [sortedDrinks]);
  const regularDrinks = useMemo(() => sortedDrinks.filter((d) => !d.trending && !d.promo), [sortedDrinks]);

  const filteredOrders = useMemo(() => {
    return myOrders.filter((o) => {
      const isRedeemed = o.status === "entregado" || o.status === "cancelado";
      return activeTab === "pending" ? !isRedeemed : isRedeemed;
    });
  }, [myOrders, activeTab]);

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
          total: order.total,
          items: order.items.map(it => ({ name: it.name, qty: it.qty }))
        };
        // Avoid duplicates
        if (!list.some(o => o.token === order.token)) {
          if (eventStartedAt > 0) {
            list = list.filter(o => {
              const isFromPreviousNight = o.createdAt < eventStartedAt;
              const isRedeemed = o.status === "entregado" || o.status === "cancelado";
              return !(isFromPreviousNight && isRedeemed);
            });
          }
          list = [newOrder, ...list];
          localStorage.setItem("cocktrail_my_orders", JSON.stringify(list));
        }
        setMyOrders(list);
      }

      setCart({});
      setIsCartOpen(false);
      router.push(`/pedido/${order.token}`);
    } catch {
      setSubmitting(false);
    }
  }, [submitting, totalItems, cart, router, eventStartedAt]);

  return (
    <main className="min-h-screen pb-40 bg-ink-950 text-ink-50">
      <style>{`
        @keyframes ticketMarqueeContinuous {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee-continuous {
          animation: ticketMarqueeContinuous 12s linear infinite;
        }
      `}</style>
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
              <span className="absolute inline-flex h-full w-full rounded-full bg-green opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green" />
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-ink-300">
              Carta Online
            </span>
          </div>
        </div>
      </header>

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
                
                {/* Switch Tabs with Icons */}
                {(() => {
                  const pendingCount = myOrders.filter(o => o.status !== "entregado" && o.status !== "cancelado").length;
                  const redeemedCount = myOrders.filter(o => o.status === "entregado" || o.status === "cancelado").length;

                  return (
                    <div className="flex bg-ink-900 border border-ink-850 p-1 rounded-2xl w-fit gap-1 mb-4 select-none">
                      <button
                        onClick={() => setActiveTab("pending")}
                        disabled={pendingCount === 0}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                          activeTab === "pending"
                            ? "bg-blue text-ink-950 shadow-md scale-[1.02]"
                            : "text-ink-400 hover:text-ink-200"
                        } ${pendingCount === 0 ? "opacity-35 cursor-not-allowed pointer-events-none" : ""}`}
                      >
                        <Clock size={14} strokeWidth={2.5} />
                        Por entregar
                      </button>
                      <button
                        onClick={() => setActiveTab("redeemed")}
                        disabled={redeemedCount === 0}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                          activeTab === "redeemed"
                            ? "bg-blue text-ink-950 shadow-md scale-[1.02]"
                            : "text-ink-400 hover:text-ink-200"
                        } ${redeemedCount === 0 ? "opacity-35 cursor-not-allowed pointer-events-none" : ""}`}
                      >
                        <CheckCircle2 size={14} strokeWidth={2.5} />
                        Canjeados
                      </button>
                    </div>
                  );
                })()}

                {/* Ticket Cards Grid */}
                <div className="grid grid-cols-1 gap-3.5">
                  {filteredOrders.map((o) => {
                    const timeStr = new Date(o.createdAt).toLocaleTimeString("es-AR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false
                    });
                    const itemsText = o.items ? o.items.map(it => `${it.qty}x ${it.name}`).join(" · ") : "Detalle del pedido";
                    const isLong = itemsText.length > 20 || (o.items && o.items.length > 1);
                    const isRedeemed = o.status === "entregado" || o.status === "cancelado";

                    return (
                      <div
                        key={o.token}
                        onClick={() => router.push(`/pedido/${o.token}`)}
                        className={`group relative flex rounded-2xl overflow-hidden h-24 transition-all cursor-pointer select-none ${
                          isRedeemed
                            ? "bg-ink-950/45 border border-ink-900/60 opacity-40 hover:opacity-50 grayscale"
                            : "bg-ink-900 border border-ink-850 hover:border-ink-700/80 active:scale-[0.98]"
                        }`}
                      >
                        {/* Background hover light effect */}
                        {!isRedeemed && (
                          <div className="absolute inset-0 bg-gradient-to-r from-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                        
                        {/* Left Body */}
                        <div className="flex-1 flex flex-col justify-between p-3.5 pr-2 min-w-0 z-10">
                          {/* Top row */}
                          <div className="flex justify-between items-center">
                            <span className={`text-[10px] font-black tracking-[0.25em] uppercase ${isRedeemed ? "text-ink-500" : "text-ink-400"}`}>
                              TICKET
                            </span>
                            <span className={`font-mono text-[13px] font-black ${isRedeemed ? "text-ink-400 font-medium" : "text-blue"}`}>
                              ${o.total.toLocaleString("es-AR")}
                            </span>
                          </div>

                          {/* Middle row: Drink description carousel */}
                          <div className="relative w-full overflow-hidden whitespace-nowrap my-1">
                            <div className={`flex gap-4 ${isLong ? "animate-marquee-continuous" : ""}`}>
                              <span className={`uppercase tracking-tight whitespace-nowrap ${isRedeemed ? "text-ink-400 font-medium text-[14px]" : "text-white font-extrabold text-[15px]"}`}>
                                {itemsText}
                              </span>
                              {isLong && (
                                <span className={`uppercase tracking-tight whitespace-nowrap ${isRedeemed ? "text-ink-400 font-medium text-[14px]" : "text-white font-extrabold text-[15px]"}`} aria-hidden="true">
                                  {itemsText}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Bottom row: Clock and Time */}
                          <div className="flex items-center gap-1 text-ink-400 font-mono text-[10px] leading-none">
                            <Clock size={11} className="shrink-0 translate-y-[0.5px]" />
                            <span className="leading-none">{timeStr}</span>
                          </div>
                        </div>

                        {/* Perforated Separator Line */}
                        <div className="w-px h-full relative flex items-center justify-center">
                          <svg className="absolute inset-y-2 w-px h-[calc(100%-16px)] text-ink-800/60" viewBox="0 0 1 100" preserveAspectRatio="none">
                            <line x1="0" y1="0" x2="0" y2="100" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6, 6" />
                          </svg>
                        </div>

                        {/* Right Stub */}
                        <div className="w-[85px] shrink-0 flex flex-col items-center justify-between py-3 px-1 text-center bg-white/[0.02] z-10 border-l border-white/5">
                          <div className="flex flex-col items-center">
                            <span className="text-[8px] font-black tracking-[0.2em] text-ink-500 uppercase leading-none mb-1">
                              N°
                            </span>
                            <span className="font-serif-italic text-lg font-black text-white leading-none">
                              #{o.displayNumber}
                            </span>
                          </div>
                          
                          <div className="flex flex-col items-center gap-1.5">
                            <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              o.status === "listo" ? "bg-green-soft text-green border border-green-line animate-pulse" :
                              o.status === "preparando" ? "bg-amber-soft text-amber border border-amber-line" :
                              o.status === "pagado" ? "bg-blue/15 text-blue border border-blue-line" :
                              o.status === "entregado" ? "bg-ink-950 text-ink-500 border border-ink-850" :
                              "bg-danger-soft/20 text-danger/60 border border-danger-line/20"
                            }`}>
                              {STATUS_META[o.status]?.short || o.status}
                            </span>
                            <svg className="w-12 h-3 opacity-25 text-ink-300" viewBox="0 0 50 15">
                              <rect x="0" width="2" height="15" fill="currentColor" />
                              <rect x="3" width="1" height="15" fill="currentColor" />
                              <rect x="5" width="3" height="15" fill="currentColor" />
                              <rect x="9" width="1" height="15" fill="currentColor" />
                              <rect x="11" width="2" height="15" fill="currentColor" />
                              <rect x="14" width="1" height="15" fill="currentColor" />
                              <rect x="16" width="3" height="15" fill="currentColor" />
                              <rect x="20" width="1" height="15" fill="currentColor" />
                              <rect x="22" width="2" height="15" fill="currentColor" />
                              <rect x="25" width="4" height="15" fill="currentColor" />
                              <rect x="30" width="1" height="15" fill="currentColor" />
                              <rect x="32" width="2" height="15" fill="currentColor" />
                              <rect x="35" width="1" height="15" fill="currentColor" />
                              <rect x="37" width="3" height="15" fill="currentColor" />
                              <rect x="41" width="1" height="15" fill="currentColor" />
                              <rect x="43" width="2" height="15" fill="currentColor" />
                              <rect x="46" width="1" height="15" fill="currentColor" />
                              <rect x="48" width="2" height="15" fill="currentColor" />
                            </svg>
                          </div>
                        </div>

                        {/* Semicircular Punch Cuts (Mask Notches) */}
                        <div className="absolute top-0 right-[85px] w-4 h-4 bg-ink-950 rounded-full -translate-y-1/2 translate-x-1/2 z-20" />
                        <div className="absolute bottom-0 right-[85px] w-4 h-4 bg-ink-950 rounded-full translate-y-1/2 translate-x-1/2 z-20" />
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
