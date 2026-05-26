"use client";

import {
  Check,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  X,
  Banknote,
  QrCode,
  CreditCard,
  ArrowLeft,
  History,
  LogOut,
  ArrowRight,
  Receipt,
  Trash2,
  Flame,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createElement, useMemo, useState, useCallback } from "react";
import DrinkCard from "@/components/DrinkCard";
import { BrandLogo } from "@/components/BrandLogo";
import { drinkIcon } from "@/lib/icons";
import { useSSE } from "@/lib/useSSE";
import type { Drink, Order, PaymentMethod } from "@/types/domain";

type Props = {
  drinks: Drink[];
};

type Category = "all" | "promo" | "trending" | "regular";

function CompactDrinkCard({
  drink,
  qty,
  onAdd,
  onRemove,
}: {
  drink: Drink;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [imageBroken, setImageBroken] = useState(false);
  const isFeatured = drink.promo || drink.trending;
  const showImage = isFeatured && Boolean(drink.image) && !imageBroken;
  const active = qty > 0;
  return (
    <div
      className={`group relative bg-ink-900 border rounded-xl p-3 flex flex-col gap-2.5 transition-all ${
        active
          ? "border-emerald-500/60 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
          : "border-ink-800 hover:border-ink-700"
      }`}
    >
      {drink.promo && (
        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
          <Sparkles size={10} /> Promo
        </span>
      )}
      {drink.trending && !drink.promo && (
        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
          <Flame size={10} /> Trend
        </span>
      )}

      <div className="aspect-square rounded-lg bg-ink-950 border border-ink-850 overflow-hidden flex items-center justify-center relative">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={drink.image}
            alt={drink.name}
            className="w-full h-full object-cover"
            onError={() => setImageBroken(true)}
          />
        ) : (
          createElement(drinkIcon(drink.iconName), {
            size: 40,
            className: "text-ink-600",
            strokeWidth: 1.5,
          })
        )}
      </div>

      <div className="flex flex-col gap-0.5 min-h-[44px]">
        <span className="text-[13px] font-bold text-white leading-tight line-clamp-2">
          {drink.name}
        </span>
        <span className="font-mono text-emerald-400 font-black text-sm tabular">
          ${drink.price.toLocaleString("es-AR")}
        </span>
      </div>

      {qty === 0 ? (
        <button
          onClick={onAdd}
          className="h-9 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider active:scale-95 transition-all"
        >
          <Plus size={14} strokeWidth={3} />
          Agregar
        </button>
      ) : (
        <div className="h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-between px-1 gap-1">
          <button
            onClick={onRemove}
            className="w-8 h-8 rounded-md hover:bg-emerald-500/20 text-emerald-300 flex items-center justify-center active:scale-90 transition-all"
            aria-label="Restar"
          >
            <Minus size={14} strokeWidth={3} />
          </button>
          <span className="text-emerald-200 font-black tabular text-sm">{qty}</span>
          <button
            onClick={onAdd}
            className="w-8 h-8 rounded-md hover:bg-emerald-500/20 text-emerald-300 flex items-center justify-center active:scale-90 transition-all"
            aria-label="Sumar"
          >
            <Plus size={14} strokeWidth={3} />
          </button>
        </div>
      )}
    </div>
  );
}

const mapStatus = (status: Order["status"]) => {
  switch (status) {
    case "pagado":
    case "preparando":
      return { label: "Pendiente", color: "bg-amber-500/10 text-amber-400 border border-amber-500/20" };
    case "listo":
      return { label: "A retirar", color: "bg-green-500/10 text-green-400 border border-green-500/20" };
    case "entregado":
      return { label: "Canjeado", color: "bg-ink-500/10 text-ink-400 border border-ink-500/20" };
    case "cancelado":
      return { label: "Cancelado", color: "bg-danger-soft text-danger border border-danger-line" };
    default:
      return { label: status, color: "bg-ink-800 text-ink-300" };
  }
};

const formatTime = (ts: number) => {
  return new Date(ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
};

const getItemsPreview = (items: Order["items"]) => {
  if (!items || items.length === 0) return "";
  const firstTwo = items.slice(0, 2).map(it => `${it.name} (x${it.qty})`).join(", ");
  if (items.length > 2) {
    return `${firstTwo} +${items.length - 2} más`;
  }
  return firstTwo;
};

export default function CajaClient({ drinks }: Props) {
  const router = useRouter();
  
  // Estados para el Carrito
  const [cart, setCart] = useState<Record<number, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  // Estados para Checkout
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [receivedAmount, setReceivedAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  
  // Pedido recién concretado (para mostrar en pantalla de éxito)
  const [latestOrder, setLatestOrder] = useState<{ displayNumber: number; token: string } | null>(null);

  // Estados para Historial
  const [orders, setOrders] = useState<Order[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<Order | null>(null);

  // Filtro de categoría (desktop)
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");

  // Cargar órdenes iniciales: useSSE dispara refetchOrders en onOpen al mount.
  const refetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const state = await res.json();
      setOrders(state.orders ?? []);
    } catch {}
  }, []);

  // Hook SSE para actualizar en tiempo real
  useSSE(
    {
      "order.created": ({ order }) => {
        setOrders((prev) =>
          prev.some((o) => o.id === order.id) ? prev : [...prev, order],
        );
      },
      "order.updated": ({ order }) => {
        setOrders((prev) => {
          const idx = prev.findIndex((o) => o.id === order.id);
          if (idx === -1) return [...prev, order];
          const next = [...prev];
          next[idx] = order;
          return next;
        });
      },
    },
    { onOpen: refetchOrders }
  );

  const sortedDrinks = useMemo(() => [...drinks].sort((a, b) => a.name.localeCompare(b.name)), [drinks]);
  const promoDrinks = useMemo(() => sortedDrinks.filter((d) => d.promo), [sortedDrinks]);
  const trendingDrinks = useMemo(() => sortedDrinks.filter((d) => d.trending && !d.promo), [sortedDrinks]);
  const regularDrinks = useMemo(() => sortedDrinks.filter((d) => !d.trending && !d.promo), [sortedDrinks]);

  const filteredDrinks = useMemo(() => {
    switch (selectedCategory) {
      case "promo": return promoDrinks;
      case "trending": return trendingDrinks;
      case "regular": return regularDrinks;
      default: return sortedDrinks;
    }
  }, [selectedCategory, sortedDrinks, promoDrinks, trendingDrinks, regularDrinks]);

  const cartEntries = useMemo(
    () => Object.entries(cart).map(([idStr, qty]) => {
      const d = drinks.find((x) => x.id === Number(idStr));
      return d ? { drink: d, qty } : null;
    }).filter((x): x is { drink: Drink; qty: number } => x !== null),
    [cart, drinks],
  );

  const clearCart = () => setCart({});

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

  // Formateador de efectivo
  const handleChangeCash = (val: string) => {
    const clean = val.replace(/\D/g, ""); // dejar solo dígitos
    setReceivedAmount(clean);
  };

  const displayCashValue = receivedAmount ? Number(receivedAmount).toLocaleString("es-AR") : "";
  const receivedNum = Number(receivedAmount);
  const change = receivedNum - totalPrice;
  const canConfirmCash = receivedAmount !== "" && change >= 0;

  function handleOpenCheckout() {
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
    setPaymentMethod(null);
    setReceivedAmount("");
    setLatestOrder(null);
  }

  async function confirmOrder() {
    if (submitting || totalItems === 0 || !paymentMethod) return;
    if (paymentMethod === "efectivo" && !canConfirmCash) return;
    
    setSubmitting(true);
    try {
      const items = Object.entries(cart).map(([idStr, qty]) => ({ drinkId: Number(idStr), qty }));
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, paymentMethod }),
      });
      if (!res.ok) throw new Error("Error al procesar pago");
      const order = await res.json();
      
      setLatestOrder({ displayNumber: order.displayNumber, token: order.token });
      setCart({});
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const categoryTabs: { id: Category; label: string; count: number }[] = [
    { id: "all", label: "Todo", count: sortedDrinks.length },
    { id: "promo", label: "Promos", count: promoDrinks.length },
    { id: "trending", label: "Tendencia", count: trendingDrinks.length },
    { id: "regular", label: "Resto", count: regularDrinks.length },
  ];

  return (
    <main className="h-screen flex flex-col bg-ink-950 text-ink-50 overflow-hidden">

      {/* ── Modal 1: Carrito de Caja (sólo mobile - en desktop el carrito vive en el sidebar) ── */}
      {isCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-ink-900 border border-white/10 w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black">Pedido Actual</h2>
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
              <button onClick={handleOpenCheckout} className="w-full h-14 bg-blue text-ink-950 font-black rounded-xl active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2">
                Continuar al Pago
                <ArrowRight size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 2: Checkout (POS con Grilla de pagos y éxito) ── */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-ink-900 border border-white/10 w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-10 flex flex-col max-h-[90vh]">
            
            {latestOrder ? (
              // Vista Éxito / Ticket
              <div className="flex flex-col items-center justify-center py-8 gap-5 text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <Check size={40} strokeWidth={3} className="animate-bounce" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white mb-1">¡Cobro Concretado!</h2>
                  <p className="text-ink-400 text-sm">El pedido ya fue enviado a la barra.</p>
                </div>
                
                <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3 font-mono">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-ink-400 text-xs uppercase">Número de ticket</span>
                    <span className="text-xl font-black text-emerald-400">#{latestOrder.displayNumber}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-ink-400 text-xs uppercase">Hashcode / ID</span>
                    <span className="text-sm font-bold text-white select-all">{latestOrder.token}</span>
                  </div>
                </div>

                <p className="text-xs text-ink-400">Escribe el número <span className="font-black text-white">#{latestOrder.displayNumber}</span> en el papel del cliente.</p>

                <button 
                  onClick={() => setIsCheckoutOpen(false)} 
                  className="w-full mt-4 h-12 bg-white/10 text-white font-bold rounded-xl active:scale-95 transition-all text-sm uppercase tracking-wider"
                >
                  Nueva Venta
                </button>
              </div>
            ) : (
              // Vista de selección de pago y cálculo
              <>
                <div className="flex justify-between items-center mb-6 shrink-0">
                  {paymentMethod ? (
                    <button onClick={() => setPaymentMethod(null)} className="flex items-center gap-2 text-ink-300 hover:text-white transition-colors">
                      <ArrowLeft size={18} />
                      <span className="text-xs font-bold uppercase tracking-wider">Atrás</span>
                    </button>
                  ) : (
                    <button onClick={() => { setIsCheckoutOpen(false); setIsCartOpen(true); }} className="flex items-center gap-2 text-ink-300 hover:text-white transition-colors">
                      <ArrowLeft size={18} />
                      <span className="text-xs font-bold uppercase tracking-wider">Modificar pedido</span>
                    </button>
                  )}
                  <button onClick={() => setIsCheckoutOpen(false)} className="p-3 bg-white/5 rounded-full active:scale-90 transition-transform ml-auto">
                    <X size={20} />
                  </button>
                </div>

                {!paymentMethod ? (
                  // Selección en Grilla
                  <div className="flex flex-col gap-6 overflow-y-auto pr-1">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs uppercase tracking-widest font-bold text-ink-400">Total a cobrar</span>
                      <span className="text-4xl font-black text-blue">${totalPrice.toLocaleString("es-AR")}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <button 
                        onClick={() => setPaymentMethod("efectivo")}
                        className="h-28 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-white/10"
                      >
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center"><Banknote size={22} /></div>
                        <span className="font-bold text-sm">Efectivo</span>
                      </button>
                      <button 
                        onClick={() => setPaymentMethod("qr")}
                        className="h-28 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-white/10"
                      >
                        <div className="w-10 h-10 rounded-xl bg-blue-soft text-blue flex items-center justify-center"><QrCode size={22} /></div>
                        <span className="font-bold text-sm">MP QR (POS)</span>
                      </button>
                      <button 
                        onClick={() => setPaymentMethod("debito")}
                        className="h-28 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-white/10"
                      >
                        <div className="w-10 h-10 rounded-xl bg-amber-soft text-amber border border-amber-border flex items-center justify-center"><CreditCard size={22} /></div>
                        <span className="font-bold text-sm">Débito</span>
                      </button>
                      <button 
                        onClick={() => setPaymentMethod("transferencia")}
                        className="h-28 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-white/10"
                      >
                        <div className="w-10 h-10 rounded-xl bg-purple-soft text-purple border border-purple-border flex items-center justify-center"><Receipt size={22} /></div>
                        <span className="font-bold text-sm">Transferencia</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  // Confirmar Método Elegido
                  <div className="flex flex-col gap-6 overflow-y-auto pr-1">
                    <div className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/10">
                      <span className="text-sm font-bold text-ink-300">Total</span>
                      <span className="text-2xl font-black text-blue">${totalPrice.toLocaleString("es-AR")}</span>
                    </div>

                    {paymentMethod === "efectivo" && (
                      <div className="flex flex-col gap-4">
                        <label className="flex flex-col gap-2">
                          <span className="text-xs uppercase tracking-widest font-bold text-ink-400">Monto Recibido</span>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-ink-400">$</span>
                            <input 
                              type="text"
                              value={displayCashValue}
                              onChange={(e) => handleChangeCash(e.target.value)}
                              className="w-full h-14 bg-ink-950 border border-ink-800 rounded-xl pl-10 pr-4 text-xl font-bold text-white outline-none focus:border-blue transition-colors"
                              placeholder="0"
                              autoFocus
                            />
                          </div>
                        </label>
                        
                        <div className={`flex justify-between items-center p-4 rounded-2xl border ${receivedAmount && change >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}>
                          <span className="text-sm font-bold text-ink-300">Vuelto a entregar</span>
                          <span className={`text-2xl font-black ${receivedAmount && change >= 0 ? 'text-emerald-400' : 'text-ink-500'}`}>
                            ${receivedAmount && change >= 0 ? change.toLocaleString("es-AR") : "0"}
                          </span>
                        </div>
                      </div>
                    )}

                    {paymentMethod === "qr" && (
                      <div className="py-8 flex flex-col items-center text-center gap-3 bg-white/5 border border-white/5 rounded-2xl">
                        <QrCode size={48} className="text-blue" />
                        <p className="text-xs text-ink-300 px-6">Solicitá al cliente que escanee el código QR en el mostrador para abonar el pedido.</p>
                      </div>
                    )}

                    {paymentMethod === "debito" && (
                      <div className="py-8 flex flex-col items-center text-center gap-3 bg-white/5 border border-white/5 rounded-2xl">
                        <CreditCard size={48} className="text-amber" />
                        <p className="text-xs text-ink-300 px-6">Procesá el pago en la terminal posnet con la tarjeta de débito del cliente.</p>
                      </div>
                    )}

                    {paymentMethod === "transferencia" && (
                      <div className="py-8 flex flex-col items-center text-center gap-3 bg-white/5 border border-white/5 rounded-2xl">
                        <Receipt size={48} className="text-purple" />
                        <p className="text-xs text-ink-300 px-6">Verificá que la transferencia se haya acreditado en la cuenta bancaria del negocio.</p>
                      </div>
                    )}

                    <div className="mt-4 pt-6 border-t border-white/10 shrink-0">
                      <button 
                        onClick={confirmOrder} 
                        disabled={submitting || (paymentMethod === "efectivo" && !canConfirmCash)} 
                        className="w-full h-14 bg-blue text-ink-950 font-black rounded-xl active:scale-95 transition-all text-sm uppercase tracking-widest disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                      >
                        {submitting && <Loader2 size={18} className="animate-spin" />}
                        {submitting ? "Cargando..." : "Pedido Concretado"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Slide-over Historial de Ventas ── */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-ink-900 border-l border-white/10 w-full max-w-md h-full flex flex-col p-6 shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <div className="flex items-center gap-2.5">
                <History className="text-purple-400" size={22} />
                <h2 className="text-xl font-black text-white">Historial de Ventas</h2>
              </div>
              <button onClick={() => setIsHistoryOpen(false)} className="p-3 bg-white/5 rounded-full active:scale-90 transition-transform">
                <X size={20} />
              </button>
            </div>

            {/* Listado de celdas */}
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5">
              {orders.length === 0 ? (
                <div className="h-full flex items-center justify-center text-ink-500 font-serif-italic text-sm py-10">
                  — No hay pedidos registrados hoy —
                </div>
              ) : (
                orders.slice().reverse().map((o) => {
                  const channel = o.paymentMethod === "transferencia" ? "Web" : "Caja";
                  const statusInfo = mapStatus(o.status);
                  return (
                    <div 
                      key={o.id} 
                      onClick={() => setSelectedHistoryOrder(o)}
                      className="bg-white/5 border border-white/10 hover:border-purple-500/30 hover:bg-white/10 transition-all rounded-2xl p-4 flex flex-col gap-2 cursor-pointer active:scale-[0.99]"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base font-black text-white">#{o.displayNumber}</span>
                          <span className="font-mono text-[10px] text-ink-400 select-all">({o.token})</span>
                        </div>
                        <span className="font-mono text-sm font-black text-blue">${o.total.toLocaleString("es-AR")}</span>
                      </div>

                      <p className="text-xs text-ink-300 leading-tight">
                        {getItemsPreview(o.items)}
                      </p>

                      <div className="flex justify-between items-center mt-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            channel === "Web" 
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20" 
                              : "bg-purple-500/10 text-purple-400 border-purple-500/20"
                          }`}>
                            {channel}
                          </span>
                          <span className="text-[10px] font-mono text-ink-400">
                            {formatTime(o.createdAt)} hs
                          </span>
                        </div>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Popup Detalle de Ticket Historial ── */}
      {selectedHistoryOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-ink-900 border border-white/10 w-full max-w-sm rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
              <div>
                <h3 className="font-mono text-lg font-black text-white">Ticket #{selectedHistoryOrder.displayNumber}</h3>
                <p className="font-mono text-[10px] text-ink-400 select-all">{selectedHistoryOrder.token}</p>
              </div>
              <button onClick={() => setSelectedHistoryOrder(null)} className="p-2.5 bg-white/5 rounded-full active:scale-90 transition-transform">
                <X size={18} />
              </button>
            </div>

            {/* Listado de items del ticket */}
            <div className="flex flex-col gap-3 py-2 max-h-[40vh] overflow-y-auto">
              {selectedHistoryOrder.items.map((item) => (
                <div key={item.drinkId} className="flex justify-between items-center text-sm">
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-white truncate">{item.name}</span>
                    <span className="text-xs text-ink-400 font-mono tabular">{item.qty} x ${item.unitPrice.toLocaleString("es-AR")}</span>
                  </div>
                  <span className="font-mono font-bold text-ink-200">${item.subtotal.toLocaleString("es-AR")}</span>
                </div>
              ))}
            </div>

            {/* Footer de ticket */}
            <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between text-ink-300">
                <span>Método de cobro</span>
                <span className="capitalize font-bold">{selectedHistoryOrder.paymentMethod === "transferencia" ? "MP Link (Web)" : selectedHistoryOrder.paymentMethod}</span>
              </div>
              <div className="flex justify-between text-ink-300">
                <span>Fecha / Hora</span>
                <span>{new Date(selectedHistoryOrder.createdAt).toLocaleString("es-AR")}</span>
              </div>
              <div className="flex justify-between text-base font-black text-white pt-2 border-t border-white/5">
                <span>TOTAL</span>
                <span className="text-blue">${selectedHistoryOrder.total.toLocaleString("es-AR")}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-ink-950/75 backdrop-blur-xl border-b border-ink-900/60 px-5 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-ink-300 hover:text-white flex items-center justify-center active:scale-95 transition-all"
              aria-label="Volver al dashboard"
              title="Volver a Admin"
            >
              <ArrowLeft size={18} />
            </button>
            <BrandLogo size="lg" />
          </div>

          <div className="flex items-center gap-2">
            {/* Label Terminal Caja */}
            <div className="flex items-center gap-1.5 px-1 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-purple-400" />
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.22em] text-purple-400">
                Terminal Caja
              </span>
            </div>

            {/* Botón Historial */}
            <button 
              onClick={() => setIsHistoryOpen(true)} 
              className="p-2 bg-white/5 hover:bg-white/10 text-ink-300 hover:text-white rounded-xl border border-white/5 active:scale-95 transition-all"
              title="Historial de ventas"
            >
              <History size={18} />
            </button>

            {/* Botón LogOut */}
            <button 
              onClick={handleLogout} 
              className="p-2 bg-white/5 hover:bg-danger/10 text-ink-300 hover:text-danger rounded-xl border border-white/5 active:scale-95 transition-all"
              title="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Body: productos (izq) + carrito sidebar (der, sólo desktop) ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── Columna productos ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Tabs de categoría */}
          <div className="px-5 py-3 border-b border-ink-900/60 bg-ink-950/40 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {categoryTabs.map((tab) => {
                const active = tab.id === selectedCategory;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedCategory(tab.id)}
                    className={`shrink-0 px-3 h-8 rounded-lg flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-all ${
                      active
                        ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300"
                        : "bg-white/5 border border-white/5 text-ink-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {tab.label}
                    <span className={`font-mono text-[9px] px-1 py-0.5 rounded ${active ? "bg-emerald-500/20 text-emerald-200" : "bg-ink-800 text-ink-400"}`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid scrollable */}
          <div className="flex-1 overflow-y-auto p-5">
            {filteredDrinks.length === 0 ? (
              <div className="h-full flex items-center justify-center text-ink-500 font-serif-italic">
                — No hay productos en esta categoría —
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:hidden">
                {/* Mobile/tablet fallback: cards full-width usando DrinkCard (mantiene UX previa hasta lg) */}
                {filteredDrinks.map((d) => (
                  <DrinkCard
                    key={d.id}
                    {...d}
                    icon={d.iconName}
                    variant={d.promo ? "promo" : d.trending ? "trending" : "regular"}
                    quantity={cart[d.id] || 0}
                    onAdd={() => addToCart(d.id)}
                    onRemove={() => removeFromCart(d.id)}
                  />
                ))}
              </div>
            )}
            {/* Desktop (lg+): grid denso con cards compactas */}
            <div className="hidden lg:grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {filteredDrinks.map((d) => (
                <CompactDrinkCard
                  key={d.id}
                  drink={d}
                  qty={cart[d.id] || 0}
                  onAdd={() => addToCart(d.id)}
                  onRemove={() => removeFromCart(d.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Sidebar carrito (sólo desktop lg+) ── */}
        <aside className="hidden lg:flex w-[380px] xl:w-[420px] flex-col border-l border-ink-800 bg-ink-925 shrink-0">
          <div className="px-5 py-4 border-b border-ink-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag size={16} className="text-emerald-400" />
              <span className="text-[11px] font-black uppercase tracking-[0.22em] text-white">
                Pedido actual
              </span>
              <span className="font-mono text-[10px] text-ink-400 px-1.5 py-0.5 bg-ink-800 rounded tabular">
                {totalItems}
              </span>
            </div>
            {totalItems > 0 && (
              <button
                onClick={clearCart}
                className="text-ink-400 hover:text-danger p-1.5 rounded-md hover:bg-danger/10 transition-all"
                title="Vaciar carrito"
                aria-label="Vaciar carrito"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 min-h-0">
            {cartEntries.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-6 py-12">
                <div className="w-14 h-14 rounded-2xl bg-ink-800 flex items-center justify-center">
                  <ShoppingBag size={24} className="text-ink-500" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold text-ink-300">Sin items</span>
                  <span className="text-xs text-ink-500 font-serif-italic">
                    Agregá productos desde el grid
                  </span>
                </div>
              </div>
            ) : (
              cartEntries.map(({ drink, qty }) => (
                <div
                  key={drink.id}
                  className="bg-ink-900 border border-ink-800 rounded-xl p-3 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-bold text-white leading-tight line-clamp-2 flex-1">
                      {drink.name}
                    </span>
                    <span className="font-mono text-sm font-black text-emerald-400 tabular shrink-0">
                      ${(drink.price * qty).toLocaleString("es-AR")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-ink-400 font-mono">
                      ${drink.price.toLocaleString("es-AR")} c/u
                    </span>
                    <div className="flex items-center gap-1 bg-ink-950 border border-ink-800 rounded-md">
                      <button
                        onClick={() => removeFromCart(drink.id)}
                        className="w-7 h-7 flex items-center justify-center text-ink-300 hover:text-white hover:bg-white/5 rounded-l-md active:scale-90 transition-all"
                        aria-label="Restar"
                      >
                        <Minus size={12} strokeWidth={3} />
                      </button>
                      <span className="text-xs font-black text-white tabular w-5 text-center">{qty}</span>
                      <button
                        onClick={() => addToCart(drink.id)}
                        className="w-7 h-7 flex items-center justify-center text-ink-300 hover:text-white hover:bg-white/5 rounded-r-md active:scale-90 transition-all"
                        aria-label="Sumar"
                      >
                        <Plus size={12} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-5 py-4 border-t border-ink-800 bg-ink-925 flex flex-col gap-3 shrink-0">
            <div className="flex justify-between items-baseline">
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-400">
                Total
              </span>
              <span className="font-serif-italic text-3xl font-black tabular text-emerald-400">
                ${totalPrice.toLocaleString("es-AR")}
              </span>
            </div>
            <button
              onClick={handleOpenCheckout}
              disabled={totalItems === 0}
              className="w-full h-12 bg-emerald-500 hover:bg-emerald-400 disabled:bg-ink-800 disabled:text-ink-500 disabled:cursor-not-allowed text-ink-950 font-black rounded-xl active:scale-[0.98] transition-all text-xs uppercase tracking-[0.18em] flex items-center justify-center gap-2"
            >
              <Receipt size={16} strokeWidth={2.5} />
              Cobrar
            </button>
          </div>
        </aside>
      </div>

      {/* ── Floating Cart Button (sólo mobile/tablet) ── */}
      {!isCartOpen && !isCheckoutOpen && totalItems > 0 && (
        <button onClick={() => setIsCartOpen(true)} className="lg:hidden fixed bottom-6 inset-x-6 h-16 bg-blue text-ink-950 rounded-2xl flex items-center justify-between px-6 shadow-2xl active:scale-95 transition-all z-40 border-t border-white/10">
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
    </main>
  );
}
