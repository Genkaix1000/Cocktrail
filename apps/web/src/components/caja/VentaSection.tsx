"use client";

import {
  AlertTriangle,
  Check,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  X,
  Banknote,
  CreditCard,
  QrCode,
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

import DrinkCard from "@/components/shared/DrinkCard";
import { drinkIcon } from "@/lib/icons";
import { ApiError } from "@/services/api-client";
import { mercadopagoService } from "@/services/mercadopago.service";
import { useCheckout } from "@/hooks/useCheckout";
import { useCajaShortcuts } from "@/hooks/useCajaShortcuts";
import { useProductGridNav } from "@/hooks/useProductGridNav";
import { useGridColumns } from "@/hooks/useGridColumns";
import type { Drink } from "@cocktrail/shared";

type Props = {
  drinks: Drink[];
  printer: {
    reprintTicket: (orderId: string) => Promise<void>;
    printError: string | null;
    reprinting: boolean;
  };
};

type SwipeableCartItemProps = {
  drink: Drink;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
  onRemoveAll: () => void;
};

function SwipeableCartItem({ drink, qty, onAdd, onRemove, onRemoveAll }: SwipeableCartItemProps) {
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping) return;
    const diff = e.touches[0].clientX - startX;
    if (diff > 0) { // only swipe to the right
      setCurrentX(diff);
    }
  };

  const handleTouchEnd = () => {
    setSwiping(false);
    if (currentX > 120) {
      setIsRemoving(true);
      setTimeout(() => {
        onRemoveAll();
      }, 150);
    } else {
      setCurrentX(0);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl bg-ink-950 shrink-0">
      {/* Background deletion reveal indicator */}
      <div 
        className="absolute inset-0 bg-danger/20 flex items-center pl-4 text-danger transition-opacity duration-150"
        style={{ opacity: currentX > 20 ? 1 : 0 }}
      >
        <Trash2 size={16} className="animate-bounce" style={{ animationDuration: '0.6s' }} />
      </div>
      {/* Foreground item card */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${isRemoving ? "100%" : `${currentX}px`})`,
          transition: swiping ? "none" : "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
        }}
        className="bg-ink-900 border border-ink-800 rounded-xl p-3 flex flex-col gap-2 relative z-10 select-none touch-pan-y"
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
              onClick={onRemove}
              className="w-7 h-7 flex items-center justify-center text-ink-300 hover:text-ink-50 hover:bg-white/5 rounded-l-md active:scale-90 transition-all cursor-pointer"
              aria-label="Restar"
            >
              <Minus size={12} strokeWidth={3} />
            </button>
            <span className="text-xs font-black text-ink-50 tabular w-5 text-center">{qty}</span>
            <button
              onClick={onAdd}
              className="w-7 h-7 flex items-center justify-center text-ink-300 hover:text-ink-50 hover:bg-white/5 rounded-r-md active:scale-90 transition-all cursor-pointer"
              aria-label="Sumar"
            >
              <Plus size={12} strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [isClicked, setIsClicked] = useState(false);
  const isFeatured = drink.promo || drink.trending;
  const showImage = isFeatured && Boolean(drink.image) && !imageBroken;
  const active = qty > 0;

  const handleAdd = () => {
    setIsClicked(true);
    setTimeout(() => setIsClicked(false), 150);
    onAdd();
  };

  const cardBorderClass = isClicked
    ? "border-accent bg-accent/15 shadow-[0_0_20px_rgba(109,179,242,0.45)] scale-[1.03]"
    : active
      ? "border-green/60 shadow-[0_0_0_1px_var(--success-soft)] hover:border-green/80 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
      : "border-ink-800 hover:border-accent/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300";

  const focusRingClass = focused ? "ring-2 ring-blue ring-offset-2 ring-offset-ink-950" : "";

  return (
    <div
      onClick={handleAdd}
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

      <div className="flex flex-col gap-0.5 h-[52px] justify-between">
        <span className="text-[13px] font-bold text-ink-50 leading-tight line-clamp-2">
          {drink.name}
        </span>
        <span className="font-mono text-blue font-black text-sm tabular">
          ${drink.price.toLocaleString("es-AR")}
        </span>
      </div>

      {qty === 0 ? (
        <button
          onClick={(e) => { e.stopPropagation(); handleAdd(); }}
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
  const [undoItem, setUndoItem] = useState<{ drinkId: number; qty: number; name: string } | null>(null);

  useEffect(() => {
    if (undoItem) {
      const timer = setTimeout(() => {
        setUndoItem(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [undoItem]);

  const removeAllFromCart = (id: number) => {
    setCart((prev) => {
      const next = { ...prev };
      const qty = next[id];
      if (qty) {
        const d = drinks.find((x) => x.id === id);
        if (d) {
          setUndoItem({ drinkId: id, qty, name: d.name });
        }
        delete next[id];
      }
      return next;
    });
  };

  const handleUndoDelete = () => {
    if (undoItem) {
      setCart((prev) => ({
        ...prev,
        [undoItem.drinkId]: (prev[undoItem.drinkId] || 0) + undoItem.qty
      }));
      setUndoItem(null);
    }
  };

  const [isCartOpen, setIsCartOpen] = useState(false);

  const [sortBy, setSortBy] = useState<"alfabeto" | "tendencia" | "precio">("alfabeto");

  const sortedDrinks = useMemo(() => {
    const list = [...drinks];
    if (sortBy === "alfabeto") {
      return list.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sortBy === "tendencia") {
      return list.sort((a, b) => {
        const catA = a.promo ? 1 : a.trending ? 2 : 3;
        const catB = b.promo ? 1 : b.trending ? 2 : 3;
        if (catA !== catB) return catA - catB;
        return a.name.localeCompare(b.name);
      });
    }
    if (sortBy === "precio") {
      return list.sort((a, b) => a.price - b.price);
    }
    return list;
  }, [drinks, sortBy]);

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
    posnetRetryAttempt,
    qrImage,
    setQrImage,
    latestOrder,
    saleError,
    pendingSales,
    retryPendingSale,
    discardPendingSale,
    resetPaymentAttempt,
    displayCashValue,
    change,
    canConfirmCash,
    handleChangeCash,
    handleOpenCheckout,
    confirmOrder,
    startPolling,
    stopPolling,
    startPosnetPayment,
    startQrPayment,
    stopPosnetRetry,
  } = useCheckout({ cart, cartEntries, totalPrice, totalItems, clearCart });

  const { reprintTicket, printError, reprinting } = printer;

  // Banner de ventas cobradas sin registrar (A11): estados locales de la UI —
  // qué entrada está pidiendo confirmación de descarte y cuál está reintentando.
  const [confirmingDiscardId, setConfirmingDiscardId] = useState<string | null>(null);
  const [retryingSaleId, setRetryingSaleId] = useState<string | null>(null);

  async function handleRetryPendingSale(id: string) {
    setRetryingSaleId(id);
    try {
      await retryPendingSale(id);
    } finally {
      setRetryingSaleId(null);
    }
  }

  // CSS pulse on shopping bag totalItems change
  useEffect(() => {
    if (shoppingBagRef.current && totalItems > 0) {
      shoppingBagRef.current.classList.add("bag-pulse");
      const t = setTimeout(() => {
        shoppingBagRef.current?.classList.remove("bag-pulse");
      }, 300);
      return () => clearTimeout(t);
    }
  }, [totalItems]);

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
    setQrImage(null);
    resetPaymentAttempt();
    stopPolling();
  }

  function newSale() {
    setIsCheckoutOpen(false);
    setPosnetStatus("idle");
    stopPolling();
  }

  // Retrocede un paso en el checkout, replicando lo que hace el botón
  // "Atrás"/"Volver Atrás" visible en cada pantalla del modal (no cierra
  // todo salvo que ya esté en la selección de método).
  function handleEscape() {
    if (!isCheckoutOpen || latestOrder) return;

    if (posnetStatus === "error") {
      setPosnetStatus("idle");
      setPaymentMethod(null);
      setPaymentIntentState(null);
      setPosnetErrorMessage(null);
      setCurrentIntentId(null);
      return;
    }

    const isPosInProgress = paymentMethod === "debito" && posnetStatus !== "idle";
    const isQrInProgress = paymentMethod === "qr" && posnetStatus !== "idle";
    if (isPosInProgress || isQrInProgress) {
      if (isPosInProgress && paymentIntentState === "ON_TERMINAL") return; // no se puede salir con el cobro activo en el lector
      stopPolling();
      resetPaymentAttempt();
      if (currentIntentId) {
        if (isQrInProgress) {
          mercadopagoService.cancelQrOrder(currentIntentId).catch((err) => console.warn("Error canceling QR order (handled):", err));
        } else {
          mercadopagoService.cancelPosIntent(currentIntentId).catch((err) => console.warn("Error canceling intent (handled):", err));
        }
      }
      setPaymentMethod(null);
      setPosnetStatus("idle");
      setPaymentIntentState(null);
      setCurrentIntentId(null);
      setQrImage(null);
      return;
    }

    if (paymentMethod) {
      // Efectivo: volver a la selección de método.
      setPaymentMethod(null);
      setPosnetStatus("idle");
      setPaymentIntentState(null);
      return;
    }

    // Sin método elegido todavía: cerrar el checkout por completo.
    closeCheckout();
  }

  const gridColumns = useGridColumns();
  const { highlightedIndex: gridHighlightedIndex } = useProductGridNav({
    length: filteredDrinks.length,
    enabled: !isCheckoutOpen,
    columns: gridColumns,
  });

  useCajaShortcuts(
    { isCheckoutOpen, paymentMethod, latestOrder, canConfirmCash, totalItems, highlightedGridIndex: gridHighlightedIndex },
    {
      onOpenCheckout: openCheckout,
      onSelectMethod: (method) => {
        if (method === "efectivo") setPaymentMethod("efectivo");
        else if (method === "qr") startQrPayment();
        else startPosnetPayment(method);
      },
      onExactAmount: () => handleChangeCash(String(totalPrice)),
      onConfirmCash: confirmOrder,
      onNewSale: newSale,
      onSelectHighlighted: () => {
        const drink = filteredDrinks[gridHighlightedIndex ?? -1];
        if (drink) addToCart(drink.id);
      },
      onEscape: handleEscape,
    },
  );

  return (
    <>
      {/* Banner A11: cobros ya hechos en MP cuya venta no llegó a registrarse.
          Persistente hasta que la cajera reintente con éxito o descarte. */}
      {pendingSales.length > 0 && (
        <div
          role="alert"
          className="shrink-0 mx-5 mt-4 bg-danger-soft border border-danger-line rounded-2xl p-4 flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-danger shrink-0" />
            <p className="text-sm font-black text-danger">
              {pendingSales.length === 1
                ? "Hay 1 venta cobrada sin registrar"
                : `Hay ${pendingSales.length} ventas cobradas sin registrar`}
            </p>
          </div>
          <p className="text-xs text-ink-300 leading-relaxed">
            El cobro ya se hizo en Mercado Pago — <span className="font-bold">no vuelvas a cobrar</span>.
            Reintentá el registro, o descartá la constancia solo si ya la resolviste a mano.
          </p>
          <div className="flex flex-col gap-2">
            {pendingSales.map((sale) => (
              <div
                key={sale.id}
                className="flex flex-wrap items-center justify-between gap-3 bg-ink-950/60 border border-ink-800 rounded-xl px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
                  <span className="font-black text-ink-50 tabular">
                    ${sale.amount.toLocaleString("es-AR")}
                  </span>
                  <span className="text-ink-400">
                    {new Date(sale.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} hs
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-ink-300 px-1.5 py-0.5 bg-ink-850 border border-ink-800 rounded">
                    {sale.paymentMethod === "qr" ? "QR" : "Débito"}
                  </span>
                  {sale.blocked ? (
                    // El server dio un veredicto terminal sobre el registro:
                    // rechazo o cobro sin verificar. Reintentar no aplica.
                    <span className="text-danger text-[10px] font-bold">
                      {sale.blocked.code === "PAYMENT_REJECTED"
                        ? "El cobro fue rechazado por Mercado Pago — no es una venta por registrar."
                        : "El cobro no se pudo verificar — revisá el panel de Mercado Pago antes de descartar."}{" "}
                      {sale.blocked.reason}
                    </span>
                  ) : (
                    sale.lastError && (
                      <span className="text-danger/80 text-[10px]">Último error: {sale.lastError}</span>
                    )
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {confirmingDiscardId === sale.id ? (
                    <>
                      <span className="text-[10px] font-bold text-danger">
                        ¿Descartar la constancia? El cobro en MP no se devuelve.
                      </span>
                      <button
                        onClick={() => {
                          discardPendingSale(sale.id);
                          setConfirmingDiscardId(null);
                        }}
                        className="h-8 px-3 rounded-lg bg-danger-soft border border-danger-line text-danger text-[10px] font-black uppercase tracking-wider hover:brightness-125 active:scale-95 transition-all cursor-pointer"
                      >
                        Sí, descartar
                      </button>
                      <button
                        onClick={() => setConfirmingDiscardId(null)}
                        className="h-8 px-3 rounded-lg bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Reintentar solo aplica a fallos de red/registro — nunca
                          a un rechazo o cobro sin verificar (blocked). */}
                      {!sale.blocked && (
                        <button
                          onClick={() => handleRetryPendingSale(sale.id)}
                          disabled={retryingSaleId !== null}
                          className="ct-checkout-btn h-8 px-4 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {retryingSaleId === sale.id && <Loader2 size={12} className="animate-spin" />}
                          {retryingSaleId === sale.id ? "Reintentando…" : "Reintentar"}
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmingDiscardId(sale.id)}
                        disabled={retryingSaleId !== null}
                        className="h-8 px-3 rounded-lg bg-ink-850 border border-ink-750 text-ink-300 hover:text-danger text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                      >
                        Descartar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden min-h-0 w-full">
        {/* Products column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Ordenar y Filtrar (Mobile y Desktop) */}
          <div className="flex items-center gap-3 px-5 pt-5 pb-1 select-none w-full shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] shrink-0">Ordenar:</span>
            <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-0.5 rounded-xl border border-[var(--border-subtle)] overflow-x-auto no-scrollbar shrink-0">
              <button
                type="button"
                onClick={() => setSortBy("alfabeto")}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                  sortBy === "alfabeto"
                    ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Alfabeto
              </button>
              <button
                type="button"
                onClick={() => setSortBy("tendencia")}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                  sortBy === "tendencia"
                    ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Tendencia
              </button>
              <button
                type="button"
                onClick={() => setSortBy("precio")}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                  sortBy === "precio"
                    ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Precio
              </button>
            </div>
          </div>

          {/* Grid scrollable */}
          <div className="flex-1 overflow-y-auto p-5">
            {loadingProducts ? (
              <>
                {/* Mobile Skeletons */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:hidden animate-pulse">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <DrinkSkeleton key={idx} />
                  ))}
                </div>
                {/* Desktop Skeletons */}
                <div className="hidden md:grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 animate-pulse">
                  {Array.from({ length: 10 }).map((_, idx) => (
                    <CompactDrinkSkeleton key={idx} />
                  ))}
                </div>
              </>
            ) : filteredDrinks.length === 0 ? (
              <div className="h-full flex items-center justify-center text-ink-500">
                — No hay productos en esta categoría —
              </div>
            ) : (
              <>
                {/* Mobile Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:hidden">
                  {filteredDrinks.map((d, idx) => (
                    <div key={d.id} className="drink-card-anim" style={{ animationDelay: `${idx * 40}ms` }}>
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
                <div className="hidden md:grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filteredDrinks.map((d, idx) => (
                    <div key={d.id} className="drink-card-anim" style={{ animationDelay: `${idx * 40}ms` }}>
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

          {/* Mobile sticky bottom bar */}
          {totalItems > 0 && (
            <div className="md:hidden shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 flex items-center justify-between gap-3 shadow-card">
              <button
                type="button"
                onClick={() => setIsCartOpen(true)}
                className="flex flex-col text-left cursor-pointer min-w-0 bg-transparent border-none p-0"
              >
                <span className="text-[11px] font-medium text-[var(--text-tertiary)]">
                  {totalItems} {totalItems === 1 ? "ítem" : "ítems"}
                </span>
                <span className="text-[22px] font-bold tabular text-[var(--text-primary)] leading-none mt-0.5">
                  <span className="text-[0.65em] text-[var(--text-tertiary)] mr-0.5">$</span>
                  {totalPrice.toLocaleString("es-AR")}
                </span>
              </button>

              <button
                type="button"
                onClick={openCheckout}
                className="h-11 px-5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold text-[13px] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all shrink-0"
              >
                <Receipt size={15} strokeWidth={2} />
                Cobrar
              </button>
            </div>
          )}
        </div>

        {/* Sidebar cart (md+ only) */}
        <aside className="hidden md:flex w-[320px] xl:w-[350px] flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] shrink-0 h-full relative overflow-hidden rounded-r-[24px]">
          <div
            ref={shoppingBagRef}
            className="px-4 py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShoppingBag size={15} className="text-[var(--accent-primary)] shrink-0" strokeWidth={1.8} />
              <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                Pedido actual
              </span>
              <span className="font-mono text-[11px] font-semibold text-[var(--accent-text)] px-1.5 py-0.5 bg-[var(--accent-surface)] rounded-md tabular">
                {totalItems}
              </span>
            </div>
            {totalItems > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-[var(--text-tertiary)] hover:text-[var(--danger-base)] p-1.5 rounded-lg hover:bg-[var(--danger-soft)] transition-all cursor-pointer"
                title="Vaciar carrito"
                aria-label="Vaciar carrito"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 pt-3 pb-4 flex flex-col gap-2 min-h-0 bosko-scroll">
            {cartEntries.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-6 py-12">
                <div className="w-14 h-14 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-center">
                  <ShoppingBag size={22} className="text-[var(--text-tertiary)]" strokeWidth={1.8} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-[var(--text-secondary)]">Sin ítems</span>
                  <span className="text-[12px] text-[var(--text-tertiary)]">
                    Agregá productos desde el grid
                  </span>
                </div>
              </div>
            ) : (
              cartEntries.map(({ drink, qty }) => (
                <SwipeableCartItem
                  key={drink.id}
                  drink={drink}
                  qty={qty}
                  onAdd={() => addToCart(drink.id)}
                  onRemove={() => removeFromCart(drink.id)}
                  onRemoveAll={() => removeAllFromCart(drink.id)}
                />
              ))
            )}
          </div>

          <div className="shrink-0 px-4 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col gap-3">
            <div className="flex justify-between items-end gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[11px] font-medium text-[var(--text-tertiary)]">Total</span>
                <span className="text-[11px] text-[var(--text-secondary)] tabular">
                  {totalItems} {totalItems === 1 ? "ítem" : "ítems"}
                </span>
              </div>
              <span className="text-[28px] font-bold tabular text-[var(--text-primary)] leading-none tracking-tight">
                <span className="text-[0.6em] text-[var(--text-tertiary)] mr-0.5 font-semibold">$</span>
                {totalPrice.toLocaleString("es-AR")}
              </span>
            </div>
            <button
              type="button"
              onClick={openCheckout}
              disabled={totalItems === 0}
              className="w-full h-12 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold text-[14px] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              <Receipt size={16} strokeWidth={2} />
              Cobrar
              <kbd className="ml-0.5 text-[10px] font-mono font-medium opacity-70 normal-case tracking-normal px-1.5 py-0.5 rounded-md bg-black/15">
                C
              </kbd>
            </button>
          </div>
        </aside>
      </div>

      {/* ── Modal 1: Carrito de Caja (sólo mobile) ── */}
      {isCartOpen && (
        <div onClick={() => setIsCartOpen(false)} className="md:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full max-w-md rounded-2xl p-6 shadow-card animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-[20px] font-bold text-[var(--text-primary)]">Pedido actual</h2>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="p-2.5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-full active:scale-90 transition-transform cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-2.5 max-h-[50vh] overflow-y-auto bosko-scroll pr-0.5">
              {Object.entries(cart).map(([idStr, qty]) => {
                const d = drinks.find((x) => x.id === Number(idStr));
                if (!d) return null;
                return (
                  <div key={d.id} className="flex justify-between items-center bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3.5 rounded-xl">
                    <div className="flex flex-col min-w-0">
                      <p className="font-semibold truncate text-sm text-[var(--text-primary)]">{d.name}</p>
                      <p className="font-semibold text-[var(--accent-text)] text-xs tabular mt-0.5">
                        ${d.price.toLocaleString("es-AR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => removeFromCart(d.id)} className="w-10 h-10 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center active:scale-90 transition-transform cursor-pointer text-[var(--text-secondary)]"><Minus size={16} strokeWidth={2.5} /></button>
                      <span className="font-semibold w-4 text-center text-sm text-[var(--text-primary)] tabular">{qty}</span>
                      <button type="button" onClick={() => addToCart(d.id)} className="w-10 h-10 rounded-lg bg-[var(--accent-surface)] border border-[var(--accent-line)] text-[var(--accent-text)] flex items-center justify-center active:scale-90 transition-transform cursor-pointer"><Plus size={16} strokeWidth={2.5} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 pt-5 border-t border-[var(--border-subtle)]">
              <div className="flex justify-between items-end mb-4">
                <span className="text-[12px] font-medium text-[var(--text-tertiary)]">Total</span>
                <span className="text-[28px] font-bold tabular text-[var(--text-primary)] leading-none">
                  <span className="text-[0.6em] text-[var(--text-tertiary)] mr-0.5">$</span>
                  {totalPrice.toLocaleString("es-AR")}
                </span>
              </div>
              <button
                type="button"
                onClick={openCheckout}
                className="w-full h-12 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold text-[14px] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
              >
                Continuar al pago
                <ArrowRight size={16} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 2: Checkout (POS con Grilla de pagos y éxito) ── */}
      {isCheckoutOpen && (
        <div
          onClick={() => {
            const isPosInProgress = paymentMethod === "debito" && posnetStatus !== "idle";
            const isQrInProgress = paymentMethod === "qr" && posnetStatus !== "idle";
            if (isPosInProgress || isQrInProgress) return;
            closeCheckout();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
        >
          <div onClick={(e) => e.stopPropagation()} className={`bg-ink-900 border border-ink-800 w-full ${paymentMethod === "efectivo" && !latestOrder && posnetStatus !== "error" ? "max-w-2xl" : "max-w-md"} rounded-[32px] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh] transition-all duration-300`}>

            {latestOrder ? (
              // Vista Éxito / Ticket (con animación elástica GSAP)
              <div className="success-ticket-anim flex flex-col items-center justify-center py-6 gap-4 text-center">
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
              // Vista de Error / Dispositivo Ocupado / Cancelado a propósito / General
              posnetErrorMessage === "cancelled_by_device" ? (
                // Cancelación intencional (cajera o cliente cancelaron desde el propio
                // Posnet) — no es una falla del sistema, así que no lleva el ícono/tono
                // de error rojo.
                <div className="flex flex-col items-center justify-center py-8 gap-5 text-center animate-in fade-in zoom-in-95">
                  <div className="w-16 h-16 rounded-full bg-ink-850 border border-ink-750 flex items-center justify-center text-ink-300 shrink-0">
                    <CreditCard size={30} strokeWidth={2} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-ink-50 mb-1.5">Cobro cancelado</h2>
                    <p className="text-ink-400 text-sm px-4 leading-relaxed">
                      Se canceló el cobro.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setPosnetStatus("idle");
                      setPaymentMethod(null);
                      setPaymentIntentState(null);
                      setPosnetErrorMessage(null);
                      setCurrentIntentId(null);
                      setQrImage(null);
                    }}
                    className="w-full h-12 bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 font-bold rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer hover:bg-ink-800 flex items-center justify-center gap-2 mt-2"
                  >
                    <ArrowLeft size={14} />
                    Volver Atrás
                  </button>
                </div>
              ) : posnetErrorMessage === "intent_expired" ? (
                // El cobro venció sin confirmarse (deadline del server o corte
                // local): distinto de un rechazo y de una cancelación — se
                // puede reintentar si el cliente sigue ahí.
                <div className="flex flex-col items-center justify-center py-8 gap-5 text-center animate-in fade-in zoom-in-95">
                  <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 shrink-0">
                    <CreditCard size={30} strokeWidth={2} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-ink-50 mb-1.5">El cobro expiró</h2>
                    <p className="text-ink-400 text-sm px-4 leading-relaxed">
                      El cobro expiró sin confirmarse. Si el cliente no llegó a pagar, reintentá;
                      si pagó, verificá en el panel de Mercado Pago antes de volver a cobrar.
                    </p>
                  </div>

                  <div className="w-full flex flex-col gap-2.5 mt-2 shrink-0">
                    <button
                      onClick={() => startPosnetPayment("debito")}
                      className="ct-checkout-btn w-full h-12 font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Reintentar cobro
                    </button>
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
              ) : posnetErrorMessage === "busy_device" ? (
                <div className="flex flex-col items-center justify-center py-6 gap-4 text-center animate-in fade-in zoom-in-95">
                  <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 shrink-0">
                    <Loader2 size={32} className="animate-spin text-amber-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-ink-50 mb-1">Cobro en Proceso</h2>
                    <p className="text-ink-400 text-sm px-4 leading-relaxed">
                      Si no se visualiza el cobro en el Posnet, apretá:
                    </p>
                    {posnetRetryAttempt > 0 && (
                      <p className="text-amber-500 text-[10px] font-bold uppercase tracking-wider mt-1.5">
                        Reintentando automáticamente… (intento {posnetRetryAttempt} de 2)
                      </p>
                    )}
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
                        stopPosnetRetry();
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
              ) : posnetErrorMessage === "busy_device_exhausted" ? (
                // Se agotaron los reintentos automáticos ante device busy (2205): a diferencia
                // de "busy_device" (ambar, todavía reintentando solo) esto ya es un error real
                // que necesita que la cajera decida — tono rojo, sin ambigüedad.
                <div className="flex flex-col items-center justify-center py-8 gap-5 text-center animate-in fade-in zoom-in-95">
                  <div className="w-16 h-16 rounded-full bg-danger-soft border border-danger-line flex items-center justify-center text-danger shrink-0">
                    <X size={32} strokeWidth={3} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-ink-50 mb-1.5">El Posnet sigue ocupado</h2>
                    <p className="text-ink-400 text-sm px-4 leading-relaxed">
                      Quedó una cobranza anterior sin cerrar en el dispositivo y no se pudo liberar sola.
                      Revisá la pantalla del Posnet (cancelala ahí si hace falta) y reintentá.
                    </p>
                  </div>

                  <div className="w-full flex flex-col gap-2.5 mt-2 shrink-0">
                    <button
                      onClick={() => startPosnetPayment("debito")}
                      className="ct-checkout-btn w-full h-12 font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Reintentar
                    </button>
                    <button
                      onClick={() => {
                        stopPosnetRetry();
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
                // Vista de Error Posnet / QR General
                <div className="flex flex-col items-center justify-center py-8 gap-5 text-center animate-in fade-in zoom-in-95">
                  <div className="w-16 h-16 rounded-full bg-danger-soft border border-danger-line flex items-center justify-center text-danger shrink-0">
                    <X size={32} strokeWidth={3} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-ink-50 mb-1.5">
                      {paymentMethod === "qr" ? "Error en el cobro QR" : "Error en el Posnet"}
                    </h2>
                    <p className="text-ink-400 text-sm px-4 leading-relaxed">
                      {posnetErrorMessage || "Ocurrió un error inesperado al procesar la operación."}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      stopPosnetRetry();
                      setPosnetStatus("idle");
                      setPaymentMethod(null);
                      setPaymentIntentState(null);
                      setPosnetErrorMessage(null);
                      setCurrentIntentId(null);
                      setQrImage(null);
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
                    // Si es POS/QR en progreso
                    ((paymentMethod === "debito" || paymentMethod === "qr") && posnetStatus !== "idle") ? (
                      paymentIntentState === "ON_TERMINAL" ? (
                        // Ocultamos "Atrás" si está ON_TERMINAL
                        <div />
                      ) : (
                        <button
                          onClick={async () => {
                            stopPolling();
                            resetPaymentAttempt();
                            if (currentIntentId) {
                              if (paymentMethod === "qr") {
                                mercadopagoService.cancelQrOrder(currentIntentId).catch((err) => console.warn("Error canceling QR order (handled):", err));
                              } else {
                                mercadopagoService.cancelPosIntent(currentIntentId).catch((err) => console.warn("Error canceling intent (handled):", err));
                              }
                            }
                            setPaymentMethod(null);
                            setPosnetStatus("idle");
                            setPaymentIntentState(null);
                            setCurrentIntentId(null);
                            setQrImage(null);
                          }}
                          className="flex items-center gap-2 text-ink-400 hover:text-ink-50 transition-colors cursor-pointer bg-transparent border-none"
                        >
                          <ArrowLeft size={18} />
                          <span className="text-xs font-bold uppercase tracking-wider">Atrás</span>
                        </button>
                      )
                    ) : (
                      // Si no es POS/QR (ej: efectivo)
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
                  {(paymentMethod === "debito" && posnetStatus !== "idle" && paymentIntentState === "ON_TERMINAL") ? (
                    // Si está ON_TERMINAL, no renderizamos el botón X para impedir salir
                    null
                  ) : (
                    <button
                      onClick={async () => {
                        const isPosInProgress = paymentMethod === "debito" && posnetStatus !== "idle";
                        const isQrInProgress = paymentMethod === "qr" && posnetStatus !== "idle";
                        if ((isPosInProgress || isQrInProgress) && currentIntentId) {
                          if (isQrInProgress) {
                            mercadopagoService.cancelQrOrder(currentIntentId).catch((e) => console.warn(e));
                          } else {
                            mercadopagoService.cancelPosIntent(currentIntentId).catch((e) => console.warn(e));
                          }
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
                  <div className="flex flex-col gap-6 overflow-y-auto pr-1 items-center text-center py-2 w-full">
                    <div className="w-full bg-ink-950/40 border border-ink-800 rounded-3xl p-5 flex flex-col items-center justify-center gap-1.5 relative overflow-hidden shadow-inner shrink-0">
                      {/* Glow effect */}
                      <div className="absolute -top-10 -left-10 w-24 h-24 bg-accent/5 rounded-full blur-2xl pointer-events-none" />
                      <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-accent/5 rounded-full blur-2xl pointer-events-none" />
                      
                      <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-1 shrink-0">
                        <Receipt size={18} strokeWidth={2.5} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-ink-400">Total a cobrar</span>
                      <div className="flex items-center gap-1.5 justify-center">
                        <span className="text-3xl font-black text-accent tracking-tight">${totalPrice.toLocaleString("es-AR")}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 w-full mt-2">
                      <button
                        disabled={submitting}
                        onClick={() => setPaymentMethod("efectivo")}
                        className="h-32 rounded-2xl bg-ink-950 border border-ink-800 flex flex-col items-center justify-center gap-3 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer disabled:opacity-50"
                      >
                        <div className="w-12 h-12 rounded-xl bg-green-soft border border-green-line text-green flex items-center justify-center shrink-0">
                          <Banknote size={26} />
                        </div>
                        <span className="font-bold text-sm text-ink-50">Efectivo</span>
                      </button>

                      <button
                        disabled={submitting}
                        onClick={() => startPosnetPayment("debito")}
                        className="h-32 rounded-2xl bg-ink-950 border border-ink-800 flex flex-col items-center justify-center gap-3 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer disabled:opacity-50"
                      >
                        <div className="w-12 h-12 rounded-xl bg-blue-soft border border-blue-line text-blue flex items-center justify-center shrink-0">
                          <CreditCard size={26} />
                        </div>
                        <span className="font-bold text-sm text-ink-50">Tarjeta</span>
                      </button>

                      <button
                        disabled={submitting}
                        onClick={() => startQrPayment()}
                        className="h-32 rounded-2xl bg-ink-950 border border-ink-800 flex flex-col items-center justify-center gap-3 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer disabled:opacity-50"
                      >
                        <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/25 text-accent flex items-center justify-center shrink-0">
                          <QrCode size={26} />
                        </div>
                        <span className="font-bold text-sm text-ink-50">Código QR</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  // Confirmar Método Elegido
                  <div className="flex flex-col gap-6 overflow-y-auto pr-1">
                    <div className="flex justify-between items-center p-4 bg-ink-950 rounded-2xl border border-ink-800">
                      <div className="flex items-center gap-2">
                        <Receipt size={15} className="text-ink-400" />
                        <span className="text-sm font-bold text-ink-300">Total</span>
                      </div>
                      <span className="text-2xl font-black text-accent">${totalPrice.toLocaleString("es-AR")}</span>
                    </div>

                    {paymentMethod === "efectivo" && (
                      <div className="flex flex-col gap-5">
                        {/* Split 2-column layout: Left (Input) | Right (Change) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          
                          {/* Col 1: Monto Recibido */}
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between h-7">
                              <span className="text-[10px] font-black uppercase tracking-wider text-ink-400">Monto Recibido</span>
                              <button
                                type="button"
                                onClick={() => handleChangeCash(String(totalPrice))}
                                className="h-7 px-2.5 rounded-md bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 text-[10px] font-bold uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
                              >
                                Monto exacto <span className="opacity-60 normal-case">(E)</span>
                              </button>
                            </div>
                            <div className="flex flex-col items-center justify-center py-5 bg-ink-950 border border-ink-800 rounded-2xl relative h-[90px]">
                              <div className="relative w-full max-w-[200px] flex items-center justify-center">
                                <span className="text-2xl font-black text-ink-400 mr-2 select-none">$</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={displayCashValue}
                                  onChange={(e) => handleChangeCash(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      if (canConfirmCash && !submitting) {
                                        confirmOrder();
                                      }
                                    }
                                  }}
                                  style={{ fontSize: displayCashValue.length > 5 ? `${Math.max(18, 38 - (displayCashValue.length - 5) * 3)}px` : "38px" }}
                                  className="w-full bg-transparent text-center font-black text-ink-50 outline-none pb-1 placeholder:text-ink-700"
                                  placeholder="0"
                                  autoFocus
                                />
                              </div>
                            </div>
                          </div>

                          {/* Col 2: Vuelto a entregar */}
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center h-7">
                              <span className="text-[10px] font-black uppercase tracking-wider text-ink-400">Vuelto a entregar</span>
                            </div>
                            <div className={`flex flex-col items-center justify-center rounded-2xl border h-[90px] transition-all ${canConfirmCash ? 'bg-green-soft border-green-line' : 'bg-ink-950 border-ink-800'}`}>
                              <span className="text-[10px] uppercase font-black tracking-wider text-ink-400 mb-0.5">Vuelto</span>
                              <span className={`text-3xl font-black ${canConfirmCash ? 'text-green' : 'text-ink-500'}`}>
                                ${canConfirmCash ? change.toLocaleString("es-AR") : "0"}
                              </span>
                            </div>
                          </div>

                        </div>

                        {/* Confirm Button & Errors */}
                        <div className="mt-1 pt-4 border-t border-ink-800 shrink-0 flex flex-col gap-2.5">
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

                    {paymentMethod === "debito" && (
                      <div className="flex flex-col gap-4">
                        <div className={`py-10 flex flex-col items-center text-center gap-4 bg-ink-950 border border-ink-800 rounded-2xl ${paymentIntentState === "ON_TERMINAL" ? "" : "animate-pulse"}`}>
                          <Loader2 size={48} className="text-accent animate-spin" />
                          <div className="flex flex-col gap-1.5">
                            {paymentIntentState === "ON_TERMINAL" ? (
                              <>
                                <p className="text-sm font-bold text-amber-500">
                                  El cliente está pagando…
                                </p>
                                <p className="text-xs text-ink-400 px-8 leading-relaxed">
                                  El cobro está en pantalla del Posnet. Esperá a que el cliente acerque la tarjeta.
                                </p>
                              </>
                            ) : paymentIntentState === "UNKNOWN" ? (
                              // El backend no pudo confirmar el resultado todavía:
                              // advertencia, nunca "cobrado" — sigue consultando
                              // acotado por el deadline.
                              <>
                                <p className="text-sm font-bold text-amber-500">
                                  No pudimos confirmar el cobro — verificando…
                                </p>
                                <p className="text-xs text-ink-400 px-8 leading-relaxed">
                                  Seguimos consultando a Mercado Pago. No entregues el producto ni vuelvas a cobrar hasta que se confirme.
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-bold text-ink-50">
                                  Esperando pago con Tarjeta...
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
                                    // Cancelación deliberada: el próximo cobro es un intento nuevo.
                                    resetPaymentAttempt();
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

                    {paymentMethod === "qr" && (
                      <div className="flex flex-col gap-4">
                        <div className="py-8 flex flex-col items-center text-center gap-4 bg-ink-950 border border-ink-800 rounded-2xl animate-pulse">
                          <Loader2 size={48} className={`animate-spin ${paymentIntentState === "unknown" ? "text-amber-500" : "text-accent"}`} />
                          <div className="flex flex-col gap-1.5">
                            {paymentIntentState === "unknown" ? (
                              // MP devolvió un estado no reconocido: advertencia, nunca
                              // "pendiente" — el polling sigue acotado por el expiresAt.
                              <>
                                <p className="text-sm font-bold text-amber-500">
                                  Estado del cobro desconocido — verificando…
                                </p>
                                <p className="text-xs text-ink-400 px-8 leading-relaxed">
                                  Mercado Pago devolvió un estado no reconocido. Seguimos consultando — no vuelvas a cobrar.
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-bold text-ink-50">
                                  Esperando pago QR...
                                </p>
                                <p className="text-xs text-ink-400 px-8 leading-relaxed">
                                  El cliente debe escanear el QR fijo de la barra con la app de Mercado Pago.
                                </p>
                              </>
                            )}
                          </div>
                          {qrImage && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={qrImage}
                              alt="QR estático de la barra"
                              className="w-40 h-40 rounded-xl border border-ink-800 bg-white object-contain p-2"
                            />
                          )}
                        </div>

                        {currentIntentId ? (
                          <button
                            onClick={async () => {
                              stopPolling();
                              resetPaymentAttempt();
                              try {
                                await mercadopagoService.cancelQrOrder(currentIntentId);
                                setPosnetStatus("idle");
                                setCurrentIntentId(null);
                                setPaymentMethod(null);
                                setPaymentIntentState(null);
                                setPosnetErrorMessage(null);
                                setQrImage(null);
                              } catch (err) {
                                console.warn("Error canceling QR order (handled):", err);
                                const message = err instanceof Error ? err.message : undefined;
                                setPosnetStatus("error");
                                setPosnetErrorMessage(message || "No se pudo cancelar el cobro QR.");
                                setCurrentIntentId(null);
                                setPaymentMethod(null);
                                setPaymentIntentState(null);
                                setQrImage(null);
                              }
                            }}
                            className="w-full h-12 border border-danger-line hover:bg-danger-soft/20 text-danger rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all"
                          >
                            Cancelar cobro QR
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              stopPolling();
                              setPosnetStatus("idle");
                              setPaymentMethod(null);
                              setPaymentIntentState(null);
                              setQrImage(null);
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Undo Delete Toast */}
      {undoItem && (
        <div className="fixed top-6 right-6 z-[100] animate-in slide-in-from-top-5 fade-in duration-300">
          <div className="flex items-center gap-3 px-4 py-3 bg-ink-900 border border-ink-800 rounded-2xl shadow-2xl text-xs font-bold text-ink-50">
            <span className="text-ink-400">Eliminado:</span>
            <span>{undoItem.name} x{undoItem.qty}</span>
            <button
              onClick={handleUndoDelete}
              className="ml-2 px-2.5 py-1 bg-accent/15 hover:bg-accent/25 text-accent border border-accent/20 hover:border-accent/40 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              Deshacer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
