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
  ArrowRight,
  Receipt,
  Trash2,
  Flame,
  Sparkles,
  Printer,
  Home,
  LayoutGrid,
} from "lucide-react";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";

import DrinkCard from "@/components/shared/DrinkCard";
import ProductSearch from "@/components/caja/ProductSearch";
import { drinkIcon } from "@/lib/icons";
import { ApiError } from "@/services/api-client";
import { mercadopagoService } from "@/services/mercadopago.service";
import { useCheckout } from "@/hooks/useCheckout";
import { useCajaShortcuts } from "@/hooks/useCajaShortcuts";
import { useProductGridNav } from "@/hooks/useProductGridNav";
import type { Drink } from "@cocktrail/shared";

type Props = {
  drinks: Drink[];
  printer: {
    reprintTicket: (orderId: string) => Promise<void>;
    printError: string | null;
    reprinting: boolean;
  };
};

function CompactDrinkCard({
  drink,
  qty,
  focused,
  onAdd,
  onRemove,
}: {
  drink: Drink;
  qty: number;
  focused?: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const [imageBroken, setImageBroken] = useState(false);
  const isFeatured = drink.promo || drink.trending;
  const showImage = isFeatured && Boolean(drink.image) && !imageBroken;
  const active = qty > 0;

  const cardBorderClass = active
    ? "border-green/60 shadow-[0_0_0_1px_var(--success-soft)]"
    : "border-ink-800 hover:border-accent/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300";

  const focusRingClass = focused ? "ring-2 ring-blue ring-offset-2 ring-offset-ink-950" : "";

  return (
    <div
      onClick={onAdd}
      className={`group relative bg-ink-900 border rounded-xl p-3 flex flex-col gap-2.5 cursor-pointer ${cardBorderClass} ${focusRingClass}`}
    >
      {drink.promo && (
        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 bg-amber-soft text-amber border border-amber-line rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
          <Sparkles size={10} /> Promo
        </span>
      )}
      {drink.trending && !drink.promo && (
        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 bg-purple-soft text-purple border border-purple-border rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
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
        <span className="text-[13px] font-bold text-ink-50 leading-tight line-clamp-2">
          {drink.name}
        </span>
        <span className="font-mono text-blue font-black text-sm tabular">
          ${drink.price.toLocaleString("es-AR")}
        </span>
      </div>

      {qty === 0 ? (
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          className="h-9 rounded-lg bg-green-soft hover:brightness-125 border border-green-line text-green flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
        >
          <Plus size={14} strokeWidth={3} />
          Agregar
        </button>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className="h-9 rounded-lg bg-green-soft border border-green-line flex items-center justify-between px-1 gap-1"
        >
          <button
            onClick={onRemove}
            className="w-8 h-8 rounded-md hover:bg-green-soft text-green flex items-center justify-center active:scale-90 transition-all cursor-pointer"
            aria-label="Restar"
          >
            <Minus size={14} strokeWidth={3} />
          </button>
          <span className="text-green font-black tabular text-sm">{qty}</span>
          <button
            onClick={onAdd}
            className="w-8 h-8 rounded-md hover:bg-green-soft text-green flex items-center justify-center active:scale-90 transition-all cursor-pointer"
            aria-label="Sumar"
          >
            <Plus size={14} strokeWidth={3} />
          </button>
        </div>
      )}
    </div>
  );
}

function DrinkSkeleton() {
  return (
    <div className="flex items-center justify-between p-3 rounded-2xl border border-ink-850/60 bg-ink-900/50 animate-pulse">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="w-14 h-14 rounded-xl bg-ink-800/40 shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="h-4 bg-ink-800/40 rounded w-2/3" />
          <div className="h-3 bg-ink-800/30 rounded w-1/3" />
        </div>
      </div>
      <div className="w-20 h-10 bg-ink-800/40 rounded-xl" />
    </div>
  );
}

function CompactDrinkSkeleton() {
  return (
    <div className="bg-ink-900 border border-ink-800/50 rounded-xl p-3 flex flex-col gap-2.5 animate-pulse">
      <div className="aspect-square rounded-lg bg-ink-800/40 w-full" />
      <div className="flex flex-col gap-1.5 min-h-[44px]">
        <div className="h-3.5 bg-ink-800/40 rounded w-3/4" />
        <div className="h-3 bg-ink-800/30 rounded w-1/2" />
      </div>
      <div className="h-9 bg-ink-800/40 rounded-lg w-full" />
    </div>
  );
}

/**
 * Vista "Nueva Venta" de la Terminal de Caja — extraída de CajaClient.tsx sin
 * cambios de comportamiento: grid de productos, carrito (sidebar desktop +
 * modal mobile) y el modal de checkout completo (selección de método,
 * efectivo, flujo Posnet con todos sus estados visuales, pantalla de éxito
 * con ticket). El estado de checkout/pagos vive en `useCheckout`; el estado
 * de impresión (`reprintTicket`/`printError`/`reprinting`) se recibe por
 * prop desde `usePrinterStatus` en el shell, porque ese mismo hook también
 * lo usa el popup de detalle de Historial (que todavía vive en CajaClient).
 */
export default function VentaSection({ drinks, printer }: Props) {
  const loadingProducts = false;
  const shoppingBagRef = useRef<HTMLDivElement>(null);

  // Estados del carrito
  const [cart, setCart] = useState<Record<number, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);

  // GSAP stagger entrance on load complete
  useEffect(() => {
    if (!loadingProducts) {
      gsap.fromTo(
        ".drink-card-anim",
        { opacity: 0, y: 15 },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          stagger: 0.04,
          ease: "power2.out",
          clearProps: "transform"
        }
      );
    }
  }, [loadingProducts]);

  const sortedDrinks = useMemo(() => {
    return [...drinks].sort((a, b) => {
      const catA = a.promo ? 1 : a.trending ? 2 : 3;
      const catB = b.promo ? 1 : b.trending ? 2 : 3;
      if (catA !== catB) return catA - catB;
      return a.name.localeCompare(b.name);
    });
  }, [drinks]);

  const filteredDrinks = sortedDrinks;

  const clearCart = () => setCart({});

  const addToCart = (id: number) => setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  const removeFromCart = (id: number) => setCart((prev) => {
    const next = { ...prev };
    if (next[id] > 1) next[id] -= 1;
    else delete next[id];
    return next;
  });

  const cartEntries = useMemo(
    () => Object.entries(cart).map(([idStr, qty]) => {
      const d = drinks.find((x) => x.id === Number(idStr));
      return d ? { drink: d, qty } : null;
    }).filter((x): x is { drink: Drink; qty: number } => x !== null),
    [cart, drinks],
  );

  const totalPrice = useMemo(() => Object.entries(cart).reduce((sum, [idStr, qty]) => {
    const d = drinks.find((x) => x.id === Number(idStr));
    return sum + (d?.price ?? 0) * qty;
  }, 0), [cart, drinks]);

  const totalItems = useMemo(() => Object.values(cart).reduce((s, q) => s + q, 0), [cart]);

  const {
    isCheckoutOpen,
    setIsCheckoutOpen,
    paymentMethod,
    setPaymentMethod,
    submitting,
    posnetStatus,
    setPosnetStatus,
    currentIntentId,
    setCurrentIntentId,
    paymentIntentState,
    setPaymentIntentState,
    posnetErrorMessage,
    setPosnetErrorMessage,
    latestOrder,
    saleError,
    displayCashValue,
    change,
    canConfirmCash,
    handleChangeCash,
    handleOpenCheckout,
    confirmOrder,
    startPolling,
    stopPolling,
    startPosnetPayment,
  } = useCheckout({ cart, cartEntries, totalPrice, totalItems, clearCart });

  const { reprintTicket, printError, reprinting } = printer;

  // GSAP pulse on shopping bag totalItems change
  useEffect(() => {
    if (shoppingBagRef.current && totalItems > 0) {
      gsap.fromTo(
        shoppingBagRef.current,
        { scale: 0.95 },
        { scale: 1.08, duration: 0.12, yoyo: true, repeat: 1, ease: "back.out(2)" }
      );
    }
  }, [totalItems]);

  // GSAP ticket pop-in animation on successful payment
  useEffect(() => {
    if (latestOrder) {
      gsap.fromTo(
        ".success-ticket-anim",
        { opacity: 0, scale: 0.92, y: 15 },
        { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: "back.out(1.4)", delay: 0.05 }
      );
    }
  }, [latestOrder]);

  function openCheckout() {
    setIsCartOpen(false);
    handleOpenCheckout();
  }

  function closeCheckout() {
    setIsCheckoutOpen(false);
    setPosnetStatus("idle");
    setPaymentMethod(null);
    setPaymentIntentState(null);
    setPosnetErrorMessage(null);
    setCurrentIntentId(null);
    stopPolling();
  }

  function newSale() {
    setIsCheckoutOpen(false);
    setPosnetStatus("idle");
    stopPolling();
  }

  const { highlightedIndex: gridHighlightedIndex } = useProductGridNav({
    length: filteredDrinks.length,
    enabled: !isCheckoutOpen,
  });

  useCajaShortcuts(
    { isCheckoutOpen, paymentMethod, latestOrder, canConfirmCash, totalItems, highlightedGridIndex: gridHighlightedIndex },
    {
      onOpenCheckout: openCheckout,
      onSelectMethod: (method) => (method === "efectivo" ? setPaymentMethod("efectivo") : startPosnetPayment(method)),
      onExactAmount: () => handleChangeCash(String(totalPrice)),
      onConfirmCash: confirmOrder,
      onNewSale: newSale,
      onSelectHighlighted: () => {
        const drink = filteredDrinks[gridHighlightedIndex ?? -1];
        if (drink) addToCart(drink.id);
      },
    },
  );

  return (
    <>
      <div className="flex-1 flex overflow-hidden min-h-0 w-full">
        {/* Products column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Buscador de productos por teclado (solo desktop, no reemplaza el grid táctil) */}
          <div className="hidden lg:block px-5 pt-5">
            <ProductSearch drinks={drinks} onSelect={addToCart} />
          </div>

          {/* Grid scrollable */}
          <div className="flex-1 overflow-y-auto p-5">
            {loadingProducts ? (
              <>
                {/* Mobile Skeletons */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:hidden animate-pulse">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <DrinkSkeleton key={idx} />
                  ))}
                </div>
                {/* Desktop Skeletons */}
                <div className="hidden lg:grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 animate-pulse">
                  {Array.from({ length: 10 }).map((_, idx) => (
                    <CompactDrinkSkeleton key={idx} />
                  ))}
                </div>
              </>
            ) : filteredDrinks.length === 0 ? (
              <div className="h-full flex items-center justify-center text-ink-500 font-serif-italic">
                — No hay productos en esta categoría —
              </div>
            ) : (
              <>
                {/* Mobile Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:hidden">
                  {filteredDrinks.map((d) => (
                    <div key={d.id} className="drink-card-anim opacity-0">
                      <DrinkCard
                        {...d}
                        icon={d.iconName}
                        variant={d.promo ? "promo" : d.trending ? "trending" : "regular"}
                        quantity={cart[d.id] || 0}
                        onAdd={() => addToCart(d.id)}
                        onRemove={() => removeFromCart(d.id)}
                      />
                    </div>
                  ))}
                </div>
                {/* Desktop Grid */}
                <div className="hidden lg:grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                  {filteredDrinks.map((d, idx) => (
                    <div key={d.id} className="drink-card-anim opacity-0">
                      <CompactDrinkCard
                        drink={d}
                        qty={cart[d.id] || 0}
                        focused={idx === gridHighlightedIndex}
                        onAdd={() => addToCart(d.id)}
                        onRemove={() => removeFromCart(d.id)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Mobile/Tablet Sticky Bottom Bar */}
          {totalItems > 0 && (
            <div className="lg:hidden shrink-0 border-t border-ink-800 bg-ink-925/90 backdrop-blur-md px-5 py-3 flex items-center justify-between shadow-[0_-4px_24px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom duration-300">
              <div
                onClick={() => setIsCartOpen(true)}
                className="flex flex-col text-left cursor-pointer group"
              >
                <span className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-400 group-hover:text-ink-200 transition-colors">
                  {totalItems} {totalItems === 1 ? "ítem" : "ítems"}
                </span>
                <span className="font-serif-italic text-2xl font-black text-green group-hover:brightness-110 transition-all">
                  ${totalPrice.toLocaleString("es-AR")}
                </span>
              </div>

              <button
                onClick={openCheckout}
                className="ct-checkout-btn h-11 px-6 font-black rounded-xl text-xs uppercase tracking-[0.18em] flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all shadow-lg"
              >
                <Receipt size={14} />
                Cobrar
              </button>
            </div>
          )}
        </div>

        {/* Sidebar cart (lg+ only) */}
        <aside className="hidden lg:flex w-[380px] xl:w-[420px] flex-col border-l border-ink-800 bg-ink-925 shrink-0 h-full">
          <div ref={shoppingBagRef} className="px-5 py-4 border-b border-ink-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag size={16} className="text-green" />
              <span className="text-[11px] font-black uppercase tracking-[0.22em] text-ink-50">
                Pedido actual
              </span>
              <span className="font-mono text-[10px] text-ink-400 px-1.5 py-0.5 bg-ink-850 border border-ink-800 rounded tabular">
                {totalItems}
              </span>
            </div>
            {totalItems > 0 && (
              <button
                onClick={clearCart}
                className="text-ink-400 hover:text-danger p-1.5 rounded-md hover:bg-danger/10 transition-all cursor-pointer"
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
                <div className="w-14 h-14 rounded-2xl bg-ink-850 border border-ink-800 flex items-center justify-center">
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
                    <span className="text-[13px] font-bold text-ink-50 leading-tight line-clamp-2 flex-1">
                      {drink.name}
                    </span>
                    <span className="font-mono text-sm font-black text-accent tabular shrink-0">
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
                        className="w-7 h-7 flex items-center justify-center text-ink-300 hover:text-ink-50 hover:bg-white/5 rounded-l-md active:scale-90 transition-all cursor-pointer"
                        aria-label="Restar"
                      >
                        <Minus size={12} strokeWidth={3} />
                      </button>
                      <span className="text-xs font-black text-ink-50 tabular w-5 text-center">{qty}</span>
                      <button
                        onClick={() => addToCart(drink.id)}
                        className="w-7 h-7 flex items-center justify-center text-ink-300 hover:text-ink-50 hover:bg-white/5 rounded-r-md active:scale-90 transition-all cursor-pointer"
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
              <span className="font-serif-italic text-3xl font-black tabular text-green">
                ${totalPrice.toLocaleString("es-AR")}
              </span>
            </div>
            <button
              onClick={openCheckout}
              disabled={totalItems === 0}
              className="ct-checkout-btn w-full h-12 font-black rounded-xl text-xs uppercase tracking-[0.18em] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Receipt size={16} strokeWidth={2.5} />
              Cobrar
            </button>
          </div>
        </aside>
      </div>

      {/* ── Modal 1: Carrito de Caja (sólo mobile) ── */}
      {isCartOpen && (
        <div onClick={() => setIsCartOpen(false)} className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-ink-900 border border-ink-800 w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-ink-50">Pedido Actual</h2>
              <button onClick={() => setIsCartOpen(false)} className="p-3 bg-ink-850 border border-ink-750 rounded-full active:scale-90 transition-transform cursor-pointer text-ink-400 hover:text-ink-50">
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col gap-3 max-h-[50vh] overflow-y-auto pr-1">
              {Object.entries(cart).map(([idStr, qty]) => {
                const d = drinks.find((x) => x.id === Number(idStr));
                if (!d) return null;
                return (
                  <div key={d.id} className="flex justify-between items-center bg-ink-850 border border-ink-800 p-4 rounded-2xl">
                    <div className="flex flex-col min-w-0">
                      <p className="font-bold truncate text-sm text-ink-50">{d.name}</p>
                      <p className="font-black text-accent text-xs">${d.price.toLocaleString("es-AR")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => removeFromCart(d.id)} className="w-10 h-10 rounded-lg bg-ink-800 border border-ink-750 flex items-center justify-center active:scale-90 transition-transform cursor-pointer text-ink-300"><Minus size={16} strokeWidth={3} /></button>
                      <span className="font-bold w-4 text-center text-sm text-ink-50">{qty}</span>
                      <button onClick={() => addToCart(d.id)} className="w-10 h-10 rounded-lg bg-accent/15 border border-accent/25 text-accent flex items-center justify-center active:scale-90 transition-transform cursor-pointer"><Plus size={16} strokeWidth={3} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 pt-6 border-t border-ink-800">
              <div className="flex justify-between items-center mb-6">
                <span className="text-xs uppercase font-black text-ink-400">Total</span>
                <span className="text-3xl font-black text-green">${totalPrice.toLocaleString("es-AR")}</span>
              </div>
              <button onClick={openCheckout} className="ct-checkout-btn w-full h-14 font-black rounded-xl active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer">
                Continuar al Pago
                <ArrowRight size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 2: Checkout (POS con Grilla de pagos y éxito) ── */}
      {isCheckoutOpen && (
        <div
          onClick={() => {
            const isPosInProgress = (paymentMethod === "debito" || paymentMethod === "qr") && posnetStatus !== "idle";
            if (isPosInProgress) return;
            closeCheckout();
          }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md p-4"
        >
          <div onClick={(e) => e.stopPropagation()} className="bg-ink-900 border border-ink-800 w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-10 flex flex-col max-h-[90vh]">

            {latestOrder ? (
              // Vista Éxito / Ticket (con animación elástica GSAP)
              <div className="success-ticket-anim opacity-0 flex flex-col items-center justify-center py-6 gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-green-soft border border-green-line flex items-center justify-center text-green shrink-0">
                  <Check size={32} strokeWidth={3} className="animate-bounce" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-ink-50 mb-1">¡Cobro Concretado!</h2>
                  <p className="text-ink-400 text-sm">El pedido ya fue enviado a la barra.</p>
                </div>

                <div className="w-full bg-ink-950 border border-ink-800 rounded-2xl p-4 flex flex-col gap-2.5 font-mono">
                  <div className="flex justify-between border-b border-ink-800 pb-2">
                    <span className="text-ink-400 text-xs uppercase">Número de ticket</span>
                    <span className="text-xl font-black text-green">#{latestOrder.displayNumber}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-ink-400 text-xs uppercase">Hashcode / ID</span>
                    <span className="text-xs font-bold text-ink-50 select-all">{latestOrder.token}</span>
                  </div>
                </div>

                {printError && (
                  <div className="w-full bg-danger-soft border border-danger-line text-danger rounded-xl px-3 py-2.5 text-sm">
                    {printError}
                  </div>
                )}

                <div className="w-full flex flex-col gap-2 mt-2">
                  <button
                    onClick={() => reprintTicket(latestOrder.id)}
                    disabled={reprinting}
                    className="ct-checkout-btn w-full h-12 font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Printer size={16} strokeWidth={2.5} />
                    {reprinting ? "Imprimiendo…" : printError ? "Reintentar impresión" : "Reimprimir Ticket"}
                  </button>

                  <button
                    onClick={newSale}
                    className="w-full h-12 bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 font-bold rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer hover:bg-ink-800 flex items-center justify-center gap-2"
                  >
                    Nueva Venta
                    <span className="text-[9px] font-mono opacity-60 normal-case tracking-normal">Enter / Espacio</span>
                  </button>
                </div>
              </div>
            ) : posnetStatus === "error" ? (
              // Vista de Error / Dispositivo Ocupado o General
              posnetErrorMessage === "busy_device" ? (
                <div className="flex flex-col items-center justify-center py-6 gap-4 text-center animate-in fade-in zoom-in-95">
                  <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 shrink-0">
                    <Loader2 size={32} className="animate-spin text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-ink-50 mb-1">Cobro en Proceso</h2>
                    <p className="text-ink-400 text-sm px-4 leading-relaxed">
                      Si no se visualiza el cobro en el Posnet, apretá:
                    </p>
                  </div>

                  {/* Visual representation of PAX A910 Android navigation buttons with highlighted Home button */}
                  <div className="flex justify-center items-center gap-10 py-3.5 px-6 bg-ink-950/80 border border-ink-850 rounded-xl max-w-[210px] mx-auto shadow-inner my-1">
                    <div className="text-sm font-mono text-ink-300 opacity-25 select-none font-bold">
                      &lt;
                    </div>
                    <div className="text-amber-400 font-bold select-none relative flex items-center justify-center">
                      <div className="absolute -inset-1.5 rounded bg-amber-500/20 blur-sm animate-pulse" />
                      <Home size={15} className="relative z-10 text-amber-400" />
                    </div>
                    <div className="opacity-25 select-none flex items-center justify-center">
                      <LayoutGrid size={15} className="text-ink-300" />
                    </div>
                  </div>

                  <p className="text-[10px] text-ink-400 px-6 leading-relaxed max-w-xs">
                    Luego, en la pantalla del lector seleccioná la opción <span className="text-amber-500 font-bold">&quot;Cobrar&quot;</span> en el cuadro de diálogo:
                  </p>

                  {/* Emulated Posnet dialogue box */}
                  <div className="w-full bg-ink-950/90 border border-ink-800 rounded-xl p-3 max-w-[240px] mx-auto flex flex-col gap-2 shadow-md my-1">
                    <div className="relative py-1.5 px-2 text-center bg-amber-500/20 border border-amber-500/25 rounded text-[7px] text-amber-400 font-black select-none flex items-center justify-center">
                      <div className="absolute -inset-1.5 rounded bg-amber-500/20 blur-sm animate-pulse" />
                      <span className="relative z-10">Cobrar</span>
                    </div>
                  </div>

                  <div className="w-full flex flex-col gap-2.5 mt-2 shrink-0">
                    <button
                      onClick={() => {
                        setPosnetStatus("idle");
                        setPaymentMethod(null);
                        setPaymentIntentState(null);
                        setPosnetErrorMessage(null);
                        setCurrentIntentId(null);
                      }}
                      className="w-full h-12 bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 font-bold rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer hover:bg-ink-800 flex items-center justify-center gap-2"
                    >
                      <ArrowLeft size={14} />
                      Volver Atrás
                    </button>
                  </div>
                </div>
              ) : (
                // Vista de Error Posnet General
                <div className="flex flex-col items-center justify-center py-8 gap-5 text-center animate-in fade-in zoom-in-95">
                  <div className="w-16 h-16 rounded-full bg-danger-soft border border-danger-line flex items-center justify-center text-danger shrink-0">
                    <X size={32} strokeWidth={3} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-ink-50 mb-1.5">Error en el Posnet</h2>
                    <p className="text-ink-400 text-sm px-4 leading-relaxed">
                      {posnetErrorMessage || "Ocurrió un error inesperado al procesar la operación."}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setPosnetStatus("idle");
                      setPaymentMethod(null);
                      setPaymentIntentState(null);
                      setPosnetErrorMessage(null);
                      setCurrentIntentId(null);
                    }}
                    className="w-full h-12 bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 font-bold rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer hover:bg-ink-800 flex items-center justify-center gap-2 mt-2"
                  >
                    <ArrowLeft size={14} />
                    Volver Atrás
                  </button>
                </div>
              )
            ) : (
              // Vista de selección de pago y cálculo
              <>
                <div className="flex justify-between items-center mb-6 shrink-0">
                  {paymentMethod ? (
                    // Si es POS en progreso
                    ((paymentMethod === "debito" || paymentMethod === "qr") && posnetStatus !== "idle") ? (
                      paymentIntentState === "ON_TERMINAL" ? (
                        // Ocultamos "Atrás" si está ON_TERMINAL
                        <div />
                      ) : (
                        <button
                          onClick={async () => {
                            stopPolling();
                            if (currentIntentId) {
                              mercadopagoService.cancelPosIntent(currentIntentId).catch((err) => console.warn("Error canceling intent (handled):", err));
                            }
                            setPaymentMethod(null);
                            setPosnetStatus("idle");
                            setPaymentIntentState(null);
                            setCurrentIntentId(null);
                          }}
                          className="flex items-center gap-2 text-ink-400 hover:text-ink-50 transition-colors cursor-pointer bg-transparent border-none"
                        >
                          <ArrowLeft size={18} />
                          <span className="text-xs font-bold uppercase tracking-wider">Atrás</span>
                        </button>
                      )
                    ) : (
                      // Si no es POS (ej: efectivo)
                      <button
                        onClick={() => {
                          setPaymentMethod(null);
                          setPosnetStatus("idle");
                          setPaymentIntentState(null);
                        }}
                        className="flex items-center gap-2 text-ink-400 hover:text-ink-50 transition-colors cursor-pointer bg-transparent border-none"
                      >
                        <ArrowLeft size={18} />
                        <span className="text-xs font-bold uppercase tracking-wider">Atrás</span>
                      </button>
                    )
                  ) : (
                    // Sin método de pago seleccionado
                    <button onClick={() => { setIsCheckoutOpen(false); setIsCartOpen(true); }} className="flex items-center gap-2 text-ink-400 hover:text-ink-50 transition-colors cursor-pointer bg-transparent border-none">
                      <ArrowLeft size={18} />
                      <span className="text-xs font-bold uppercase tracking-wider">Modificar pedido</span>
                    </button>
                  )}

                  {/* Botón X de cierre del modal */}
                  {((paymentMethod === "debito" || paymentMethod === "qr") && posnetStatus !== "idle" && paymentIntentState === "ON_TERMINAL") ? (
                    // Si está ON_TERMINAL, no renderizamos el botón X para impedir salir
                    null
                  ) : (
                    <button
                      onClick={async () => {
                        const isPosInProgress = (paymentMethod === "debito" || paymentMethod === "qr") && posnetStatus !== "idle";
                        if (isPosInProgress && currentIntentId) {
                          mercadopagoService.cancelPosIntent(currentIntentId).catch(e => console.warn(e));
                        }
                        closeCheckout();
                      }}
                      className="p-3 bg-ink-850 border border-ink-750 hover:bg-ink-800 rounded-full active:scale-90 transition-transform ml-auto cursor-pointer text-ink-400 hover:text-ink-50"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>

                {!paymentMethod ? (
                  // Selección de Método de Pago
                  <div className="flex flex-col gap-6 overflow-y-auto pr-1">
                    <div className="flex flex-col gap-1 mb-2">
                      <span className="text-xs uppercase tracking-widest font-bold text-ink-400">Total a cobrar</span>
                      <span className="text-4xl font-black text-accent">${totalPrice.toLocaleString("es-AR")}</span>
                    </div>

                    <div className="flex flex-col gap-4">
                      <h3 className="text-xs uppercase tracking-widest font-bold text-ink-400">Caja Directa / Mostrador</h3>
                      <button
                        disabled={submitting}
                        onClick={() => setPaymentMethod("efectivo")}
                        className="relative w-full h-16 rounded-2xl bg-ink-950 border border-ink-800 flex items-center px-4 gap-3 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer text-left disabled:opacity-50"
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-soft border border-green-line text-green flex items-center justify-center shrink-0">
                          <Banknote size={22} />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-ink-50">Efectivo</p>
                          <p className="text-[10px] text-ink-400">Cobro manual y cálculo de vuelto</p>
                        </div>
                        <span className="absolute top-2 right-2 font-mono text-[9px] text-ink-500 border border-ink-800 rounded px-1">1</span>
                      </button>
                    </div>

                    <div className="flex flex-col gap-3 pt-4 border-t border-ink-850">
                      <h3 className="text-xs uppercase tracking-widest font-bold text-ink-400 flex items-center gap-1.5">
                        Cobro Posnet Mercado Pago
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          disabled={submitting}
                          onClick={() => startPosnetPayment("debito")}
                          className="relative h-24 rounded-2xl bg-ink-950 border border-ink-800 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer disabled:opacity-50"
                        >
                          <div className="w-10 h-10 rounded-xl bg-blue-soft border border-blue-line text-blue flex items-center justify-center">
                            <CreditCard size={22} />
                          </div>
                          <span className="font-bold text-xs text-ink-50 text-center">Tarjeta</span>
                          <span className="absolute top-2 right-2 font-mono text-[9px] text-ink-500 border border-ink-800 rounded px-1">2</span>
                        </button>

                        <button
                          disabled={submitting}
                          onClick={() => startPosnetPayment("qr")}
                          className="relative h-24 rounded-2xl bg-ink-950 border border-ink-800 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer disabled:opacity-50"
                        >
                          <div className="w-10 h-10 rounded-xl bg-purple-soft border border-purple-border text-purple flex items-center justify-center">
                            <QrCode size={22} />
                          </div>
                          <span className="font-bold text-xs text-ink-50 text-center">Código QR</span>
                          <span className="absolute top-2 right-2 font-mono text-[9px] text-ink-500 border border-ink-800 rounded px-1">3</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Confirmar Método Elegido
                  <div className="flex flex-col gap-6 overflow-y-auto pr-1">
                    <div className="flex justify-between items-center p-4 bg-ink-950 rounded-2xl border border-ink-800">
                      <span className="text-sm font-bold text-ink-300">Total</span>
                      <span className="text-2xl font-black text-accent">${totalPrice.toLocaleString("es-AR")}</span>
                    </div>

                    {paymentMethod === "efectivo" && (
                      <div className="flex flex-col gap-4">
                        <label className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs uppercase tracking-widest font-bold text-ink-400">Monto Recibido</span>
                            <button
                              type="button"
                              onClick={() => handleChangeCash(String(totalPrice))}
                              className="h-7 px-2.5 rounded-md bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
                            >
                              Monto exacto <span className="opacity-60 normal-case">(E)</span>
                            </button>
                          </div>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-ink-400">$</span>
                            <input
                              type="text"
                              value={displayCashValue}
                              onChange={(e) => handleChangeCash(e.target.value)}
                              className="w-full h-14 bg-ink-950 border border-ink-800 focus:border-accent rounded-xl pl-10 pr-4 text-xl font-bold text-ink-50 outline-none transition-all duration-200"
                              placeholder="0"
                              autoFocus
                            />
                          </div>
                        </label>

                        <div className={`flex justify-between items-center p-4 rounded-2xl border ${canConfirmCash ? 'bg-green-soft border-green-line' : 'bg-ink-950 border-ink-800'}`}>
                          <span className="text-sm font-bold text-ink-300">Vuelto a entregar</span>
                          <span className={`text-2xl font-black ${canConfirmCash ? 'text-green' : 'text-ink-500'}`}>
                            ${canConfirmCash ? change.toLocaleString("es-AR") : "0"}
                          </span>
                        </div>

                        <div className="mt-4 pt-6 border-t border-ink-800 shrink-0 flex flex-col gap-2.5">
                          {saleError && (
                            <div className="bg-danger-soft border border-danger-line text-danger rounded-xl px-3 py-2.5 text-sm">
                              {saleError}
                            </div>
                          )}
                          <button
                            onClick={confirmOrder}
                            disabled={submitting || !canConfirmCash}
                            className="ct-checkout-btn w-full h-14 font-black rounded-xl text-sm uppercase tracking-widest disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                          >
                            {submitting && <Loader2 size={18} className="animate-spin" />}
                            {submitting ? "Cargando..." : "Pedido Concretado"}
                            {!submitting && (
                              <span className="text-[9px] font-mono opacity-60 normal-case tracking-normal">Enter</span>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {(paymentMethod === "debito" || paymentMethod === "qr") && (
                      <div className="flex flex-col gap-4">
                        <div className={`py-10 flex flex-col items-center text-center gap-4 bg-ink-950 border border-ink-800 rounded-2xl ${paymentIntentState === "ON_TERMINAL" ? "" : "animate-pulse"}`}>
                          <Loader2 size={48} className="text-accent animate-spin" />
                          <div className="flex flex-col gap-1.5">
                            {paymentIntentState === "ON_TERMINAL" ? (
                              <>
                                <p className="text-sm font-bold text-amber-500">
                                  Cobro activo en el Posnet
                                </p>
                                <p className="text-xs text-ink-400 px-8 leading-relaxed">
                                  El cobro está en pantalla. Hacé que el cliente acerque la tarjeta.
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-bold text-ink-50">
                                  Esperando pago con {paymentMethod === "qr" ? "QR" : "Tarjeta"}...
                                </p>
                                <p className="text-xs text-ink-400 px-8">
                                  {paymentIntentState === "CREATING" ? "Generando intención de cobro..." : "Enviando orden de cobro al Posnet."}
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        {paymentIntentState === "ON_TERMINAL" ? (
                          <div className="w-full flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            {/* Diálogo principal de Cancelación de Cobro Activo */}
                            <div className="w-full p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex flex-col gap-3.5">
                              <p className="text-xs text-amber-500 text-center font-bold leading-relaxed mb-1">
                                Cancelá desde el lector físico o esperá a que finalice
                              </p>

                              <div className="flex flex-col gap-2 border-t border-ink-850/60 pt-3">
                                <p className="text-[10px] text-ink-300 font-semibold leading-relaxed">
                                  1. Presioná el botón del centro (icono de casita) en la barra inferior del Posnet:
                                </p>
                                {/* Visual representation of PAX A910 Android navigation buttons with highlighted Home button */}
                                <div className="flex justify-center items-center gap-10 py-3.5 px-6 bg-ink-900 border border-ink-800 rounded-xl max-w-[210px] mx-auto shadow-inner my-1">
                                  <div className="text-sm font-mono text-ink-300 opacity-25 select-none font-bold">
                                    &lt;
                                  </div>
                                  <div className="text-amber-400 font-bold select-none relative flex items-center justify-center">
                                    <div className="absolute -inset-1.5 rounded bg-amber-500/20 blur-sm animate-pulse" />
                                    <Home size={15} className="relative z-10 text-amber-400" />
                                  </div>
                                  <div className="opacity-25 select-none flex items-center justify-center">
                                    <LayoutGrid size={15} className="text-ink-300" />
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 border-t border-ink-850/60 pt-3">
                                <p className="text-[10px] text-ink-300 font-semibold leading-relaxed">
                                  2. En la pantalla del lector, seleccioná la opción destacada:
                                </p>
                                <div className="w-full bg-ink-950/90 border border-ink-800 rounded-xl p-3 max-w-[240px] mx-auto flex flex-col gap-2 shadow-md">
                                  <p className="text-[9px] text-ink-150 font-bold text-center leading-tight px-2">
                                    ¿Querés salir sin finalizar<br />este cobro?
                                  </p>
                                  <div className="flex flex-col gap-2 mt-1">
                                    <div className="relative py-1 px-1.5 text-center bg-amber-500/20 border border-amber-500/25 rounded text-[7px] text-amber-400 font-black select-none flex items-center justify-center">
                                      <div className="absolute -inset-1.5 rounded bg-amber-500/20 blur-sm animate-pulse" />
                                      <span className="relative z-10">Sí, cancelar cobro</span>
                                    </div>
                                    <div className="py-1 px-1.5 text-center bg-ink-900 border border-ink-800 rounded text-[7px] text-ink-400 font-bold select-none opacity-40">
                                      No, continuar cobro
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          </div>
                        ) : (
                          <div className="w-full flex flex-col gap-4 animate-in fade-in duration-300">
                            {/* Sección Instructiva: ¿El cobro no se envía? */}
                            <div className="w-full p-4 bg-ink-950 border border-ink-850 rounded-2xl flex flex-col gap-3">
                              <p className="text-xs font-black text-ink-100 text-center">
                                ¿El cobro no se envía?
                              </p>

                              <div className="flex flex-col gap-2 border-t border-ink-850/60 pt-3">
                                <p className="text-[10px] text-ink-300 font-semibold leading-relaxed">
                                  1. Presioná el botón del centro (icono de casita) en la barra inferior del Posnet:
                                </p>
                                {/* Visual representation of PAX A910 Android navigation buttons with highlighted Home button */}
                                <div className="flex justify-center items-center gap-10 py-3.5 px-6 bg-ink-900 border border-ink-800 rounded-xl max-w-[210px] mx-auto shadow-inner my-1">
                                  <div className="text-sm font-mono text-ink-300 opacity-25 select-none font-bold">
                                    &lt;
                                  </div>
                                  <div className="text-amber-400 font-bold select-none relative flex items-center justify-center">
                                    <div className="absolute -inset-1.5 rounded bg-amber-500/20 blur-sm animate-pulse" />
                                    <Home size={15} className="relative z-10 text-amber-400" />
                                  </div>
                                  <div className="opacity-25 select-none flex items-center justify-center">
                                    <LayoutGrid size={15} className="text-ink-300" />
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 border-t border-ink-850/60 pt-3">
                                <p className="text-[10px] text-ink-300 font-semibold leading-relaxed">
                                  2. En la pantalla del lector, seleccioná la opción:
                                </p>
                                {/* Emulated Posnet dialogue box showing just "Cobrar" button */}
                                <div className="w-full bg-ink-900 border border-ink-800 rounded-xl p-3 max-w-[240px] mx-auto flex flex-col gap-2 shadow-md my-1">
                                  <div className="relative py-1.5 px-2 text-center bg-amber-500/20 border border-amber-500/25 rounded text-[7px] text-amber-400 font-black select-none flex items-center justify-center">
                                    <div className="absolute -inset-1.5 rounded bg-amber-500/20 blur-sm animate-pulse" />
                                    <span className="relative z-10">Cobrar</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Botones de control del Web UI */}
                            {currentIntentId ? (
                              <button
                                onClick={async () => {
                                  stopPolling();
                                  try {
                                    await mercadopagoService.cancelPosIntent(currentIntentId);
                                    setPosnetStatus("idle");
                                    setCurrentIntentId(null);
                                    setPaymentMethod(null);
                                    setPaymentIntentState(null);
                                    setPosnetErrorMessage(null);
                                  } catch (err) {
                                    console.warn("Error canceling intent (handled):", err);
                                    const message = err instanceof Error ? err.message : undefined;
                                    const isConflict = (err instanceof ApiError && err.status === 409) || message?.includes("Conflict") || String(err).includes("409");
                                    if (isConflict) {
                                      setPaymentIntentState("ON_TERMINAL");
                                      if (paymentMethod) {
                                        startPolling(currentIntentId, paymentMethod);
                                      }
                                    } else {
                                      setPosnetStatus("error");
                                      setPosnetErrorMessage(message || "No se pudo cancelar el cobro.");
                                      setCurrentIntentId(null);
                                      setPaymentMethod(null);
                                      setPaymentIntentState(null);
                                    }
                                  }
                                }}
                                className="w-full h-12 border border-danger-line hover:bg-danger-soft/20 text-danger rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                              >
                                Cancelar Intento de Cobro
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  stopPolling();
                                  setPosnetStatus("idle");
                                  setPaymentMethod(null);
                                  setPaymentIntentState(null);
                                }}
                                className="w-full h-12 border border-ink-700 text-ink-300 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                              >
                                Volver Atrás
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
