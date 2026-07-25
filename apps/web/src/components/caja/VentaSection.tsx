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
  Search,
  Zap,
  Delete,
  Gift,
  GitFork,
  RotateCw,
} from "lucide-react";
import { createElement, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import DrinkCard from "@/components/shared/DrinkCard";
import { drinkIcon } from "@/lib/icons";
import { ApiError } from "@/services/api-client";
import { mercadopagoService } from "@/services/mercadopago.service";
import { useCheckout } from "@/hooks/useCheckout";
import { useCajaShortcuts } from "@/hooks/useCajaShortcuts";
import { useProductGridNav } from "@/hooks/useProductGridNav";
import { useGridColumns } from "@/hooks/useGridColumns";
import Toast from "@/components/shared/Toast";
import type { Drink, DrinkCategory, Order } from "@cocktrail/shared";

type Props = {
  drinks: Drink[];
  categories: DrinkCategory[];
  orders?: Order[];
  onReloadCarta?: () => Promise<void>;
  printer: {
    reprintTicket: (orderId: string) => Promise<void>;
    printTicketData: (base64: string) => Promise<void>;
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

const SwipeableCartItem = memo(function SwipeableCartItem({ drink, qty, onAdd, onRemove, onRemoveAll }: SwipeableCartItemProps) {
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const isMouseDownRef = useRef(false);

  const handleStart = (clientX: number) => {
    setStartX(clientX);
    setSwiping(true);
  };

  const handleMove = (clientX: number) => {
    if (!swiping) return;
    const diff = clientX - startX;
    if (diff > 0) {
      setCurrentX(diff);
    }
  };

  const handleEnd = () => {
    if (!swiping) return;
    setSwiping(false);
    isMouseDownRef.current = false;
    if (currentX > 100) {
      setIsRemoving(true);
      setTimeout(() => {
        onRemoveAll();
      }, 150);
    } else {
      setCurrentX(0);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl bg-ink-950 shrink-0 select-none">
      {/* Background deletion reveal indicator */}
      <div 
        className="absolute inset-0 bg-danger/20 flex items-center pl-4 text-danger transition-opacity duration-150"
        style={{ opacity: currentX > 20 ? 1 : 0 }}
      >
        <Trash2 size={16} className="animate-bounce" style={{ animationDuration: '0.6s' }} />
      </div>
      {/* Foreground item card */}
      <div
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
        onMouseDown={(e) => {
          isMouseDownRef.current = true;
          handleStart(e.clientX);
        }}
        onMouseMove={(e) => {
          if (isMouseDownRef.current) handleMove(e.clientX);
        }}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        style={{
          transform: `translateX(${isRemoving ? "100%" : `${currentX}px`})`,
          transition: swiping ? "none" : "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
        }}
        className="bg-ink-900 border border-ink-800 rounded-xl p-3 flex flex-col gap-2 relative z-10 select-none touch-pan-y cursor-grab active:cursor-grabbing"
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
          <div className="flex items-center gap-1 bg-ink-950 border border-ink-800 rounded-md" onClick={(e) => e.stopPropagation()}>
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
});

const CompactDrinkCard = memo(function CompactDrinkCard({
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
  const showImage = Boolean(drink.image) && !imageBroken;
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
      {/* Botón decrementar (-) superior izquierdo si qty > 0 */}
      {qty > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-2 left-2 z-20 w-6 h-6 rounded-full bg-ink-950/80 border border-ink-700 text-ink-300 hover:text-white hover:border-danger hover:bg-danger/20 flex items-center justify-center active:scale-90 transition-all cursor-pointer shadow-sm"
          aria-label="Restar una unidad"
          title="Restar 1"
        >
          <Minus size={12} strokeWidth={3} />
        </button>
      )}

      {/* Promos / Trends (solo si no hay botón restar tapándolo o posicionado a la derecha de éste) */}
      {!active && drink.promo && (
        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 bg-amber-soft text-amber border border-amber-line rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
          <Sparkles size={10} /> Promo
        </span>
      )}
      {!active && drink.trending && !drink.promo && (
        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 bg-purple-soft text-purple border border-purple-border rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider">
          <Flame size={10} /> Trend
        </span>
      )}

      {/* Badge de cantidad agregada (Superior Derecha) */}
      {qty > 0 && (
        <span className="absolute top-2 right-2 z-20 min-w-[24px] h-[24px] px-1.5 rounded-full bg-green text-ink-950 font-black text-[12px] tabular flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-150">
          {qty}
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

      <div className="flex flex-col gap-0.5 min-h-[44px] justify-between">
        <span className="text-[13px] font-bold text-ink-50 leading-tight line-clamp-2">
          {drink.name}
        </span>
        <span className="font-mono text-blue font-black text-sm tabular">
          ${drink.price.toLocaleString("es-AR")}
        </span>
      </div>
    </div>
  );
});

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
export default function VentaSection({ drinks, categories, orders = [], onReloadCarta, printer }: Props) {
  const loadingProducts = false;
  const shoppingBagRef = useRef<HTMLDivElement>(null);

  // Estados del carrito
  const [cart, setCart] = useState<Record<number, number>>({});

  const [isCartOpen, setIsCartOpen] = useState(false);

  const [sortBy, setSortBy] = useState<"categoria" | "alfabeto" | "precio">("categoria");
  const [dynamicTrendsActive, setDynamicTrendsActive] = useState(false);
  const [isReloadingCarta, setIsReloadingCarta] = useState(false);
  const [search, setSearch] = useState("");

  const handleReloadCarta = async () => {
    if (!onReloadCarta || isReloadingCarta) return;
    setIsReloadingCarta(true);
    try {
      await onReloadCarta();
    } finally {
      setIsReloadingCarta(false);
    }
  };

  // Mapeo de ventas acumuladas por id de trago
  const salesMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const order of orders) {
      if (order.status === "cancelado") continue;
      for (const item of order.items) {
        map[item.drinkId] = (map[item.drinkId] || 0) + item.qty;
      }
    }
    return map;
  }, [orders]);

  const categorySort = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.sortOrder])),
    [categories],
  );
  const categoryName = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  // Un trago pertenece a UN solo grupo: su categoría. Jerarquía = sortOrder
  // (1 = arriba). Sin categoría al final.
  const groupOf = useCallback(
    (d: Drink) => {
      if (d.categoryId && categoryName[d.categoryId] != null) {
        return {
          key: d.categoryId,
          title: categoryName[d.categoryId],
          order: categorySort[d.categoryId] ?? 99997,
        };
      }
      return { key: "__none__", title: "Sin categoría", order: 99998 };
    },
    [categoryName, categorySort],
  );

  const sortedDrinks = useMemo(() => {
    const list = [...drinks];
    if (sortBy === "categoria") {
      return list.sort((a, b) => {
        const cmpGroup = groupOf(a).order - groupOf(b).order;
        if (cmpGroup) return cmpGroup;

        const soA = a.sortOrder && a.sortOrder > 0 ? a.sortOrder : Infinity;
        const soB = b.sortOrder && b.sortOrder > 0 ? b.sortOrder : Infinity;
        const baseOrderDiff = soA - soB || a.name.localeCompare(b.name);

        if (dynamicTrendsActive) {
          const qtyA = salesMap[a.id] || 0;
          const qtyB = salesMap[b.id] || 0;
          const diffSales = qtyB - qtyA;

          // Margen de gracia de 6 tragos: solo cambia de posición si supera por más de 6 ventas
          if (Math.abs(diffSales) > 6) {
            return diffSales;
          }
        }

        return baseOrderDiff;
      });
    }
    if (sortBy === "alfabeto") {
      return list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list.sort((a, b) => a.price - b.price);
  }, [drinks, sortBy, groupOf, dynamicTrendsActive, salesMap]);

  const filteredDrinks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedDrinks;
    return sortedDrinks.filter((d) => d.name.toLowerCase().includes(q));
  }, [sortedDrinks, search]);

  const drinkSections = useMemo(() => {
    if (sortBy !== "categoria") return null;
    const groups = new Map<string, { title: string; order: number; drinks: Drink[] }>();
    for (const d of filteredDrinks) {
      const g = groupOf(d);
      const existing = groups.get(g.key);
      if (existing) existing.drinks.push(d);
      else groups.set(g.key, { title: g.title, order: g.order, drinks: [d] });
    }
    return [...groups.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, g]) => ({ id: key, title: g.title, drinks: g.drinks }));
  }, [sortBy, filteredDrinks, groupOf]);

  const [undoToast, setUndoToast] = useState<{ drinkName: string; restore: () => void } | null>(null);

  const clearCart = useCallback(() => {
    const prevCart = { ...cart };
    setCart({});
    if (Object.keys(prevCart).length > 0) {
      setUndoToast({
        drinkName: "Pedido completo",
        restore: () => setCart(prevCart),
      });
    }
  }, [cart]);

  const addToCart = useCallback((id: number) => setCart((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 })), []);
  const removeFromCart = useCallback((id: number) => setCart((prev) => {
    const next = { ...prev };
    if (next[id] > 1) next[id] -= 1;
    else delete next[id];
    return next;
  }), []);

  const removeAllFromCart = useCallback((id: number) => {
    setCart((prev) => {
      const qty = prev[id] || 0;
      if (!qty) return prev;
      const d = drinks.find((x) => x.id === id);
      if (d) {
        setUndoToast({
          drinkName: d.name,
          restore: () => setCart((old) => ({ ...old, [id]: (old[id] || 0) + qty })),
        });
      }
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [drinks]);

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
    receivedAmount,
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
  } = useCheckout({
    cart,
    cartEntries,
    totalPrice,
    totalItems,
    clearCart,
    printTicketData: printer.printTicketData,
  });

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
        else if (method === "debito") startPosnetPayment("debito");
        else setPaymentMethod(method);
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

          {/* Buscar + Ordenar */}
          <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-1 select-none w-full shrink-0">
            <div className="relative flex-1 min-w-[160px] max-w-sm">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar trago…"
                className="w-full h-10 pl-10 pr-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all"
              />
            </div>
            <div className="flex items-center gap-2 wrap shrink-0">
              {onReloadCarta && (
                <button
                  type="button"
                  onClick={handleReloadCarta}
                  disabled={isReloadingCarta}
                  title="Recargar Carta"
                  className="h-10 w-10 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-bold)] transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  <RotateCw size={13} className={isReloadingCarta ? "animate-spin" : ""} />
                </button>
              )}

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] shrink-0">
                  Ordenar:
                </span>
                <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-0.5 rounded-xl border border-[var(--border-subtle)] overflow-x-auto no-scrollbar shrink-0">
                  <button
                    type="button"
                    onClick={() => setSortBy("categoria")}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                      sortBy === "categoria"
                        ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    Categoría
                  </button>
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

              {sortBy === "categoria" && (
                <button
                  type="button"
                  onClick={() => setDynamicTrendsActive((prev) => !prev)}
                  title="Reordenar tragos en vivo según ventas (con margen de gracia de 6 unidades)"
                  className={`h-10 px-3 rounded-full border text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                    dynamicTrendsActive
                      ? "bg-[var(--amber-soft)] text-[var(--amber-base)] border-[var(--amber-line)] shadow-sm"
                      : "bg-[var(--bg-surface)] text-[var(--text-tertiary)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <Zap size={13} className={dynamicTrendsActive ? "fill-current" : ""} />
                  <span>Tendencias Dinámicas</span>
                </button>
              )}
            </div>
          </div>

          {/* Grid scrollable */}
          <div className="flex-1 overflow-y-auto p-5 bosko-scroll">
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
                {search.trim()
                  ? "— Sin resultados para tu búsqueda —"
                  : "— No hay productos en esta categoría —"}
              </div>
            ) : drinkSections ? (
              <div className="space-y-6">
                {drinkSections.map((section) => (
                  <section key={section.id}>
                    <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-3">
                      {section.title}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:hidden">
                      {section.drinks.map((d, idx) => (
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
                    <div className="hidden md:grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {section.drinks.map((d, idx) => {
                        const flatIdx = filteredDrinks.findIndex((x) => x.id === d.id);
                        return (
                          <div key={d.id} className="drink-card-anim" style={{ animationDelay: `${idx * 40}ms` }}>
                            <CompactDrinkCard
                              drink={d}
                              qty={cart[d.id] || 0}
                              focused={flatIdx === gridHighlightedIndex}
                              onAdd={() => addToCart(d.id)}
                              onRemove={() => removeFromCart(d.id)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
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
                className="bg-[var(--danger-soft)] text-[var(--danger-base)] border border-[var(--danger-line)] hover:bg-[var(--danger-base)] hover:text-white px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                title="Vaciar carrito"
                aria-label="Vaciar carrito"
              >
                <Trash2 size={13} />
                <span>Vaciar</span>
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
          <div onClick={(e) => e.stopPropagation()} className={`bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full ${paymentMethod === "efectivo" && !latestOrder && posnetStatus !== "error" ? "max-w-lg" : "max-w-md"} rounded-[24px] p-6 shadow-card animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh] transition-[max-width] duration-200`}>

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

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full mt-2">
                      <button
                        disabled={submitting}
                        onClick={() => setPaymentMethod("efectivo")}
                        className="h-28 rounded-2xl bg-ink-950 border border-ink-800 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer disabled:opacity-50"
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-soft border border-green-line text-green flex items-center justify-center shrink-0">
                          <Banknote size={22} />
                        </div>
                        <span className="font-bold text-xs text-ink-50">Efectivo</span>
                      </button>

                      <button
                        disabled={submitting}
                        onClick={() => startPosnetPayment("debito")}
                        className="h-28 rounded-2xl bg-ink-950 border border-ink-800 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer disabled:opacity-50"
                      >
                        <div className="w-10 h-10 rounded-xl bg-blue-soft border border-blue-line text-blue flex items-center justify-center shrink-0">
                          <CreditCard size={22} />
                        </div>
                        <span className="font-bold text-xs text-ink-50">Tarjeta</span>
                      </button>

                      <button
                        disabled={submitting}
                        onClick={() => startQrPayment()}
                        className="h-28 rounded-2xl bg-ink-950 border border-ink-800 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer disabled:opacity-50"
                      >
                        <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/25 text-accent flex items-center justify-center shrink-0">
                          <QrCode size={22} />
                        </div>
                        <span className="font-bold text-xs text-ink-50">Código QR</span>
                      </button>

                      <button
                        disabled={submitting}
                        onClick={() => setPaymentMethod("cortesia")}
                        className="h-28 rounded-2xl bg-ink-950 border border-ink-800 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer disabled:opacity-50"
                      >
                        <div className="w-10 h-10 rounded-xl bg-amber-soft border border-amber-line text-amber flex items-center justify-center shrink-0">
                          <Gift size={22} />
                        </div>
                        <span className="font-bold text-xs text-ink-50">Cortesía / Regalo</span>
                      </button>

                      {/* ponytail: split payment UI existe más abajo pero el flujo real
                          (QR del remanente + prueba de pago) no está cableado — oculto
                          del selector hasta que se implemente. */}
                    </div>
                  </div>
                ) : (
                  // Confirmar Método Elegido
                  <div className="flex flex-col gap-5 overflow-y-auto pr-1">
                    {/* Total genérico solo para débito/QR — en efectivo/split/cortesia se maneja en su propio bloque */}
                    {(paymentMethod === "debito" || paymentMethod === "qr") && (
                      <div className="flex justify-between items-center p-4 bg-[var(--bg-panel)] rounded-2xl border border-[var(--border-subtle)]">
                        <div className="flex items-center gap-2">
                          <Receipt size={15} className="text-[var(--text-tertiary)]" />
                          <span className="text-sm font-semibold text-[var(--text-secondary)]">Total</span>
                        </div>
                        <span className="text-2xl font-bold tabular text-[var(--accent-text)]">
                          ${totalPrice.toLocaleString("es-AR")}
                        </span>
                      </div>
                    )}

                    {paymentMethod === "efectivo" && (
                      <div className="flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                        {/* Total + Exacto — una fila, pill larga + pill acción */}
                        <div className="flex items-stretch gap-2">
                          <div className="flex-1 min-w-0 flex items-center justify-between gap-3 px-4 h-14 rounded-full bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
                            <span className="text-[11px] font-medium text-[var(--text-tertiary)] shrink-0">
                              Total
                            </span>
                            <span className="text-[22px] font-bold tabular text-[var(--text-primary)] tracking-tight truncate">
                              <span className="text-[0.65em] text-[var(--text-tertiary)] mr-0.5 font-semibold">$</span>
                              {totalPrice.toLocaleString("es-AR")}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleChangeCash(String(totalPrice))}
                            className="shrink-0 h-14 px-4 rounded-full bg-[var(--accent-surface)] border border-[var(--accent-line)] text-[var(--accent-text)] flex items-center gap-2 cursor-pointer active:scale-[0.98] transition-all hover:brightness-110"
                            aria-label="Total a cobrar — cargar monto exacto"
                          >
                            <Zap size={15} strokeWidth={2.2} />
                            <span className="text-[12px] font-semibold">Exacto</span>
                            <kbd className="text-[10px] font-mono font-medium opacity-70 px-1.5 py-0.5 rounded-md bg-black/10 dark:bg-black/25">
                              E
                            </kbd>
                          </button>
                        </div>

                        {/* Recibido | Vuelto — display vivo arriba del pad */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col justify-center gap-0.5 px-4 py-3 rounded-2xl bg-[var(--accent-surface)] border border-[var(--accent-line)] min-h-[72px]">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent-text)]/80">
                              Recibido
                            </span>
                            <div className="flex items-baseline gap-0.5 min-w-0">
                              <span className="text-[0.7em] font-semibold text-[var(--accent-text)]/70">$</span>
                              <input
                                type="text"
                                readOnly
                                inputMode="none"
                                aria-label="Monto recibido"
                                value={displayCashValue}
                                className="w-full bg-transparent font-bold text-[var(--accent-text)] text-[26px] leading-none outline-none pointer-events-none tabular tracking-tight truncate"
                                placeholder="0"
                              />
                            </div>
                          </div>
                          <div
                            role="status"
                            className={`flex flex-col justify-center gap-0.5 px-4 py-3 rounded-2xl border min-h-[72px] transition-colors ${
                              canConfirmCash
                                ? "bg-[var(--success-soft)] border-[var(--success-line)]"
                                : receivedAmount && change < 0
                                  ? "bg-[var(--danger-soft)] border-[var(--danger-line)]"
                                  : "bg-[var(--bg-panel)] border-[var(--border-subtle)]"
                            }`}
                          >
                            <span
                              className={`text-[10px] font-medium uppercase tracking-wider ${
                                canConfirmCash
                                  ? "text-[var(--success)]"
                                  : receivedAmount && change < 0
                                    ? "text-[var(--danger)]"
                                    : "text-[var(--text-tertiary)]"
                              }`}
                            >
                              {receivedAmount && change < 0 ? "Faltan" : "Vuelto"}
                            </span>
                            <span
                              className={`text-[26px] font-bold tabular leading-none tracking-tight ${
                                canConfirmCash
                                  ? "text-[var(--success)]"
                                  : receivedAmount && change < 0
                                    ? "text-[var(--danger)]"
                                    : "text-[var(--text-tertiary)]"
                              }`}
                            >
                              <span className="text-[0.7em] font-semibold mr-0.5">$</span>
                              {receivedAmount
                                ? Math.abs(change).toLocaleString("es-AR")
                                : "0"}
                            </span>
                          </div>
                        </div>

                        {/* Numpad */}
                        <div className="grid grid-cols-3 gap-2">
                          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                            <button
                              key={digit}
                              type="button"
                              onClick={() => handleChangeCash(receivedAmount + digit)}
                              className="h-14 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-elevated)] hover:border-[var(--border-strong)] text-[var(--text-primary)] font-semibold text-2xl flex items-center justify-center active:scale-95 active:bg-[var(--accent-surface)] active:text-[var(--accent-text)] transition-all cursor-pointer select-none"
                            >
                              {digit}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleChangeCash("")}
                            className="h-14 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:bg-[var(--badge-danger-bg)] hover:border-[var(--danger-line)] hover:text-[var(--badge-danger-text)] text-[var(--text-secondary)] font-semibold text-base flex items-center justify-center active:scale-95 transition-all cursor-pointer select-none"
                            aria-label="Limpiar monto"
                          >
                            C
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChangeCash(receivedAmount + "0")}
                            className="h-14 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-elevated)] hover:border-[var(--border-strong)] text-[var(--text-primary)] font-semibold text-2xl flex items-center justify-center active:scale-95 active:bg-[var(--accent-surface)] active:text-[var(--accent-text)] transition-all cursor-pointer select-none"
                          >
                            0
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChangeCash(receivedAmount.slice(0, -1))}
                            className="h-14 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-elevated)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center active:scale-95 transition-all cursor-pointer select-none"
                            aria-label="Borrar último dígito"
                          >
                            <Delete size={20} strokeWidth={1.8} />
                          </button>
                        </div>

                        {/* CTA */}
                        <div className="pt-1 shrink-0 flex flex-col gap-2.5">
                          {saleError && (
                            <div className="bg-[var(--danger-soft)] border border-[var(--danger-line)] text-[var(--danger)] rounded-xl px-3 py-2.5 text-sm">
                              {saleError}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={confirmOrder}
                            disabled={submitting || !canConfirmCash}
                            className="w-full h-14 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold text-[15px] shadow-card disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
                          >
                            {submitting && <Loader2 size={18} className="animate-spin" />}
                            {submitting ? "Cargando..." : "Pedido Concretado"}
                            {!submitting && (
                              <kbd className="text-[10px] font-mono font-medium opacity-70 normal-case tracking-normal px-1.5 py-0.5 rounded-md bg-black/15">
                                Enter
                              </kbd>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {paymentMethod === "cortesia" && (
                      <div className="flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 bg-amber-soft border border-amber-line rounded-2xl flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-amber font-bold text-sm">
                            <Gift size={18} />
                            <span>Cortesía / Regalo ($0)</span>
                          </div>
                          <p className="text-xs text-ink-300 leading-relaxed">
                            Esta orden se emitirá con monto $0 sin sumar saldo a la caja. Se descontarán las unidades del inventario y quedará registrada en auditoría.
                          </p>
                        </div>

                        <div className="mt-2 pt-4 border-t border-ink-800 shrink-0 flex flex-col gap-2.5">
                          {saleError && (
                            <div className="bg-danger-soft border border-danger-line text-danger rounded-xl px-3 py-2.5 text-sm">
                              {saleError}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={confirmOrder}
                            disabled={submitting}
                            className="w-full h-14 rounded-full bg-amber-500 hover:bg-amber-600 text-ink-950 font-bold text-base uppercase tracking-wider shadow-lg disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
                          >
                            {submitting && <Loader2 size={18} className="animate-spin" />}
                            {submitting ? "Emitiendo..." : "Emitir Ticket de Cortesía"}
                          </button>
                        </div>
                      </div>
                    )}

                    {paymentMethod === "split" && (
                      <div className="flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
                        {/* Fila Total (sin botón de monto exacto) */}
                        <div className="flex items-center justify-between px-4 h-14 rounded-full bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
                          <div className="flex items-center gap-2">
                            <GitFork size={16} className="text-purple" />
                            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                              Pago Dividido (Efectivo + QR)
                            </span>
                          </div>
                          <span className="text-[22px] font-bold tabular text-[var(--text-primary)] tracking-tight">
                            <span className="text-[0.65em] text-[var(--text-tertiary)] mr-0.5 font-semibold">$</span>
                            {totalPrice.toLocaleString("es-AR")}
                          </span>
                        </div>

                        {/* Displays: Efectivo Recibido (Izq) | QR Remanente (Der) */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col justify-center gap-0.5 px-4 py-3 rounded-2xl bg-[var(--accent-surface)] border border-[var(--accent-line)] min-h-[72px]">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--accent-text)]/80">
                              Efectivo Recibido
                            </span>
                            <div className="flex items-baseline gap-0.5 min-w-0">
                              <span className="text-[0.7em] font-semibold text-[var(--accent-text)]/70">$</span>
                              <input
                                type="text"
                                readOnly
                                inputMode="none"
                                aria-label="Monto abonado en efectivo"
                                value={displayCashValue}
                                className="w-full bg-transparent font-bold text-[var(--accent-text)] text-[26px] leading-none outline-none pointer-events-none tabular tracking-tight truncate"
                                placeholder="0"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col justify-center gap-0.5 px-4 py-3 rounded-2xl bg-purple-soft/60 border border-purple-border/60 min-h-[72px]">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-purple">
                                QR Remanente
                              </span>
                              <QrCode size={13} className="text-purple" />
                            </div>
                            <span className="text-[26px] font-bold tabular leading-none tracking-tight text-purple">
                              <span className="text-[0.7em] font-semibold mr-0.5">$</span>
                              {Math.max(0, totalPrice - (receivedAmount ? Number(receivedAmount) : 0)).toLocaleString("es-AR")}
                            </span>
                          </div>
                        </div>

                        {/* Numpad táctil */}
                        <div className="grid grid-cols-3 gap-2">
                          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                            <button
                              key={digit}
                              type="button"
                              onClick={() => handleChangeCash((displayCashValue ? displayCashValue.replace(/\D/g, "") : "") + digit)}
                              className="h-12 rounded-xl bg-ink-950 border border-ink-800 hover:bg-ink-850 hover:border-ink-750 text-ink-50 font-bold text-lg flex items-center justify-center active:scale-95 transition-all cursor-pointer select-none"
                            >
                              {digit}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleChangeCash("")}
                            className="h-12 rounded-xl bg-ink-950 border border-ink-800 hover:bg-danger/20 hover:text-danger hover:border-danger/40 text-ink-400 font-bold text-xs flex items-center justify-center active:scale-95 transition-all cursor-pointer select-none"
                            title="Limpiar monto"
                          >
                            C
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChangeCash((displayCashValue ? displayCashValue.replace(/\D/g, "") : "") + "0")}
                            className="h-12 rounded-xl bg-ink-950 border border-ink-800 hover:bg-ink-850 hover:border-ink-750 text-ink-50 font-bold text-lg flex items-center justify-center active:scale-95 transition-all cursor-pointer select-none"
                          >
                            0
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const clean = displayCashValue ? displayCashValue.replace(/\D/g, "") : "";
                              handleChangeCash(clean.slice(0, -1));
                            }}
                            className="h-12 rounded-xl bg-ink-950 border border-ink-800 hover:bg-ink-850 hover:border-ink-750 text-ink-300 hover:text-ink-50 font-bold text-sm flex items-center justify-center active:scale-95 transition-all cursor-pointer select-none"
                            title="Borrar último dígito"
                          >
                            ⌫
                          </button>
                        </div>

                        {/* Botón Principal */}
                        <div className="mt-1 pt-3 border-t border-ink-800 shrink-0 flex flex-col gap-2.5">
                          {saleError && (
                            <div className="bg-danger-soft border border-danger-line text-danger rounded-xl px-3 py-2.5 text-sm">
                              {saleError}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={confirmOrder}
                            disabled={submitting}
                            className="w-full h-14 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-bold text-base uppercase tracking-wider shadow-lg disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
                          >
                            {submitting && <Loader2 size={18} className="animate-spin" />}
                            {submitting ? "Procesando..." : "Confirmar Pago Dividido"}
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

      {/* Undo Delete Toast (Top Center para no tapar Numpad ni cobro) */}
      {undoToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4 animate-in slide-in-from-top-5 duration-200">
          <Toast
            variant="success"
            title="ÍTEM ELIMINADO"
            message={`${undoToast.drinkName} se quitó del pedido.`}
            action={{
              label: "Deshacer",
              onClick: () => {
                undoToast.restore();
                setUndoToast(null);
              },
            }}
            onClose={() => setUndoToast(null)}
          />
        </div>
      )}
    </>
  );
}
