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
  Printer,
  LayoutDashboard,
  Power,
  TrendingUp,
  Sun,
  Moon,
  LayoutGrid,
  Home,
  FileText,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { OSHeadbar, OSProfileFooter } from "@/components/OSHeadbar";
import { createElement, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { gsap } from "gsap";
import DrinkCard from "@/components/DrinkCard";
import { BrandLogo } from "@/components/BrandLogo";
import { drinkIcon } from "@/lib/icons";
import { useSSE } from "@/lib/useSSE";
import { eventsService } from "@/services/events.service";
import { ordersService } from "@/services/orders.service";
import { authService } from "@/services/auth.service";
import { mercadopagoService } from "@/services/mercadopago.service";
import { printerService } from "@/services/printer.service";
import { useTheme } from "@/components/ThemeProvider";
import CloseNightModal from "@/components/CloseNightModal";
import { computeTotals } from "@/lib/totals";
import type { Drink, Order, PaymentMethod, NightEvent, CashSale, EventSummary } from "@cocktrail/shared";

type Props = {
  drinks: Drink[];
};

type CurrentUser = {
  role: string;
  username: string;
  permissions: {
    closeNight: boolean;
    modifyCarta: boolean;
    manageUsers: boolean;
    monitoreo: boolean;
    metricas: boolean;
    historial: boolean;
    general: boolean;
    carta: boolean;
    pagos: boolean;
    staff: boolean;
    cancelarTickets: boolean;
  };
};

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

  const cardBorderClass = active
    ? "border-green/60 shadow-[0_0_0_1px_var(--success-soft)]"
    : "border-ink-800 hover:border-accent/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300";

  return (
    <div
      onClick={onAdd}
      className={`group relative bg-ink-900 border rounded-xl p-3 flex flex-col gap-2.5 cursor-pointer ${cardBorderClass}`}
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

const getItemsPreview = (items: Order["items"]) => {
  if (!items || items.length === 0) return "";
  const firstTwo = items.slice(0, 2).map(it => `${it.name} (x${it.qty})`).join(", ");
  if (items.length > 2) {
    return `${firstTwo} +${items.length - 2} más`;
  }
  return firstTwo;
};

const formatDayMonth = (ts: number) => {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
};

const formatHourMinute = (ts: number) => {
  const d = new Date(ts);
  const hr = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hr}:${min}`;
};

function getPaginationRange(currentPage: number, totalPages: number): (number | string)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const range: (number | string)[] = [];
  
  if (currentPage <= 4) {
    for (let i = 1; i <= 5; i++) {
      range.push(i);
    }
    range.push("...");
    range.push(totalPages);
  } else if (currentPage >= totalPages - 3) {
    range.push(1);
    range.push("...");
    for (let i = totalPages - 4; i <= totalPages; i++) {
      range.push(i);
    }
  } else {
    range.push(1);
    range.push("...");
    range.push(currentPage - 1);
    range.push(currentPage);
    range.push(currentPage + 1);
    range.push("...");
    range.push(totalPages);
  }
  
  return range;
}

export default function CajaClient({ drinks }: Props) {
  const router = useRouter();
  const { theme, isDark, toggleDark } = useTheme();
  const isBosko = theme === "bosko";

  // Navigation tabs state
  const [activeTab, setActiveTab] = useState<"venta" | "historial" | "metricas">("venta");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [loadingProducts, setLoadingProducts] = useState(true);
  const shoppingBagRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Simulated 800ms loading state for skeleton demonstration
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadingProducts(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

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

  // Authenticated user state
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Estados para el Carrito
  const [cart, setCart] = useState<Record<number, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  // Estados para Checkout
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [receivedAmount, setReceivedAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [posnetStatus, setPosnetStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [currentIntentId, setCurrentIntentId] = useState<string | null>(null);
  const [paymentIntentState, setPaymentIntentState] = useState<string | null>(null);
  const [posnetErrorMessage, setPosnetErrorMessage] = useState<string | null>(null);
  
  // Pedido recién concretado (para mostrar en pantalla de éxito)
  const [latestOrder, setLatestOrder] = useState<Order | null>(null);

  // Estado de venta / impresión
  const [saleError, setSaleError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [reprinting, setReprinting] = useState(false);
  const [printerStatus, setPrinterStatus] = useState<{ connected: boolean; message: string } | null>(null);
  const [printerTestMessage, setPrinterTestMessage] = useState<string | null>(null);

  const refreshPrinterStatus = useCallback(async () => {
    try {
      const status = await printerService.getStatus();
      setPrinterStatus(status);
    } catch {
      setPrinterStatus({ connected: false, message: "No se pudo consultar el estado de la impresora." });
    }
  }, []);

  useEffect(() => {
    refreshPrinterStatus();
    const interval = setInterval(refreshPrinterStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshPrinterStatus]);

  async function testPrint() {
    setPrinterTestMessage(null);
    try {
      const result = await printerService.test();
      setPrinterTestMessage(result.message);
    } catch (err) {
      setPrinterTestMessage(err instanceof Error ? err.message : "Error al imprimir la prueba.");
    } finally {
      refreshPrinterStatus();
    }
  }

  const reprintTicket = useCallback(async (orderId: string) => {
    setReprinting(true);
    setPrintError(null);
    try {
      const result = await printerService.reprint(orderId);
      if (!result.success) {
        setPrintError(result.message || "No se pudo imprimir el ticket.");
      }
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : "Error al reimprimir.");
    } finally {
      setReprinting(false);
    }
  }, []);

  // Data states
  const [orders, setOrders] = useState<Order[]>([]);
  const [cashSales, setCashSales] = useState<CashSale[]>([]);
  const [event, setEvent] = useState<NightEvent | null>(null);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<Order | null>(null);

  const activeNightOrders = useMemo(() => {
    if (!event) return orders;
    return orders.filter((o) => o.createdAt >= event.startedAt);
  }, [orders, event]);

  const activeNightCashSales = useMemo(() => {
    if (!event) return cashSales;
    return cashSales.filter((c) => c.createdAt >= event.startedAt);
  }, [cashSales, event]);

  // Close night modal states
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [summary, setSummary] = useState<EventSummary | null>(null);

  // History states: Day grouping, Infinite Scroll & Search
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const [loadingMore, setLoadingMore] = useState(false);

  const groupedOrders = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    const sorted = [...activeNightOrders].sort((a, b) => b.createdAt - a.createdAt);
    
    for (const o of sorted) {
      const dayKey = formatDayMonth(o.createdAt);
      if (!groups[dayKey]) {
        groups[dayKey] = [];
      }
      groups[dayKey].push(o);
    }
    return groups;
  }, [activeNightOrders]);

  const days = useMemo(() => {
    return Object.keys(groupedOrders).sort((a, b) => {
      const [dayA, monthA] = a.split("/").map(Number);
      const [dayB, monthB] = b.split("/").map(Number);
      if (monthA !== monthB) return monthB - monthA;
      return dayB - dayA;
    });
  }, [groupedOrders]);

  // Set default day
  useEffect(() => {
    if (days.length > 0 && !selectedDay) {
      setSelectedDay(days[0]);
    }
  }, [days, selectedDay]);

  // Reset scroll page limit on day change
  useEffect(() => {
    setVisibleCount(20);
  }, [selectedDay]);

  const dayOrders = useMemo(() => {
    return groupedOrders[selectedDay] || [];
  }, [groupedOrders, selectedDay]);

  const filteredDayOrders = useMemo(() => {
    let list = dayOrders;
    if (ticketSearch.trim()) {
      const q = ticketSearch.toLowerCase();
      list = list.filter((o) => 
        o.displayNumber.toString().includes(q) || 
        (o.createdBy || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [dayOrders, ticketSearch]);

  const displayedOrders = useMemo(() => {
    return filteredDayOrders.slice(0, visibleCount);
  }, [filteredDayOrders, visibleCount]);

  // Fetch current user details
  useEffect(() => {
    authService.getMe().then((u) => {
      if (u) setCurrentUser(u as unknown as CurrentUser);
    });
  }, []);

  // Cargar datos iniciales
  const refetch = useCallback(async () => {
    try {
      const state = await eventsService.getState();
      setEvent(state.event);
      setOrders(state.orders ?? []);
      setCashSales(state.cashSales ?? []);
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
      "cash_sale.added": ({ cashSale }) => {
        setCashSales((prev) =>
          prev.some((c) => c.id === cashSale.id) ? prev : [...prev, cashSale],
        );
      },
      "event.closed": ({ summary: s }) => {
        setSummary(s);
        setCloseModalOpen(true);
        refetch();
      },
      "event.opened": ({ event: newEvent }) => {
        setEvent(newEvent);
        refetch();
      },
    },
    { onOpen: refetch }
  );

  const sortedDrinks = useMemo(() => {
    return [...drinks].sort((a, b) => {
      const catA = a.promo ? 1 : a.trending ? 2 : 3;
      const catB = b.promo ? 1 : b.trending ? 2 : 3;
      if (catA !== catB) return catA - catB;
      return a.name.localeCompare(b.name);
    });
  }, [drinks]);

  const filteredDrinks = sortedDrinks;

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
    setPosnetStatus("idle");
    setCurrentIntentId(null);
    setLatestOrder(null);
    if (pollingRef.current) clearInterval(pollingRef.current);
  }

  async function confirmOrder() {
    if (isSubmittingRef.current || submitting || totalItems === 0 || !paymentMethod) return;
    if (paymentMethod === "efectivo" && !canConfirmCash) return;

    isSubmittingRef.current = true;
    setSubmitting(true);
    setSaleError(null);
    setPrintError(null);
    try {
      const items = Object.entries(cart).map(([idStr, qty]) => ({ drinkId: Number(idStr), qty }));
      const order = await ordersService.create({ items, paymentMethod });

      setLatestOrder(order);
      setCart({});
      if (!order.printed) {
        setPrintError("No se pudo imprimir el ticket automáticamente. Reintentá desde el botón.");
      }
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : "No se pudo registrar la venta.");
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }

  const startPolling = useCallback((intentId: string, method: PaymentMethod) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    
    pollingRef.current = setInterval(async () => {
      try {
        const st = await mercadopagoService.getPosIntentStatus(intentId);
        const currentState = st.state || st.status;
        if (currentState) {
          setPaymentIntentState(currentState);
        }

        if (currentState === "FINISHED") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          const items = Object.entries(cart).map(([idStr, qty]) => ({ drinkId: Number(idStr), qty }));
          const order = await ordersService.create({ items, paymentMethod: method });
          setLatestOrder(order);
          setCart({});
          setPosnetStatus("idle");
          setCurrentIntentId(null);
          setPaymentIntentState(null);
          setPosnetErrorMessage(null);
          if (!order.printed) {
            setPrintError("No se pudo imprimir el ticket automáticamente. Reintentá desde el botón.");
          }
        } else if (currentState === "CANCELED" || currentState === "ERROR") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setPosnetStatus("error");
          setCurrentIntentId(null);
          setPaymentIntentState(null);
          setPosnetErrorMessage(
            currentState === "CANCELED" 
              ? "El cobro fue cancelado en el Posnet." 
              : "El cobro fue rechazado o falló en el Posnet."
          );
        }
      } catch (err) {
        console.error("Error polling MP status:", err);
      }
    }, 3000);
  }, [cart]);

  async function startPosnetPayment(method: PaymentMethod) {
    if (isSubmittingRef.current || submitting || totalItems === 0) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setPaymentMethod(method);
    setPosnetStatus("connecting");
    setPaymentIntentState("CREATING");
    setPosnetErrorMessage(null);
    try {
      const drinksText = cartEntries.map((e) => `${e.drink.name} x${e.qty}`).join(", ");
      const intent = await mercadopagoService.createPosIntent(totalPrice, drinksText || "Cobro Cocktrail");
      setCurrentIntentId(intent.id);
      setPaymentIntentState("OPEN");
      
      startPolling(intent.id, method);
      
    } catch (err: any) {
      console.warn("Error creating MP intent (handled):", err);
      const isAlreadyQueued = err?.status === 409 && (
        err?.message?.includes("queued intent") || 
        err?.message?.includes("2205") ||
        err?.data?.error?.includes("queued intent") ||
        err?.data?.error?.includes("2205") ||
        err?.toString()?.includes("queued intent") ||
        err?.toString()?.includes("2205")
      );
      
      setPosnetStatus("error");
      setCurrentIntentId(null);
      setPaymentIntentState(null);
      if (isAlreadyQueued) {
        setPosnetErrorMessage("busy_device");
      } else {
        const errMsg = err?.message || "Error al iniciar cobro con Posnet. Verifique la conexión o configuración.";
        setPosnetErrorMessage(errMsg);
      }
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function confirmOrderWithMethod(method: PaymentMethod) {
    if (isSubmittingRef.current || submitting || totalItems === 0) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setPaymentMethod(method);
    try {
      const items = Object.entries(cart).map(([idStr, qty]) => ({ drinkId: Number(idStr), qty }));
      const order = await ordersService.create({ items, paymentMethod: method });
      setLatestOrder(order);
      setCart({});
      if (!order.printed) {
        setPrintError("No se pudo imprimir el ticket automáticamente. Reintentá desde el botón.");
      }
    } catch (err) {
      console.error(err);
      alert("Error al confirmar el pedido. Reintentá.");
      setPaymentMethod(null);
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    await authService.logout();
    router.push("/login");
    router.refresh();
  }

  async function handleCloseConfirm(password: string) {
    const data = await eventsService.closeEvent(password);
    setSummary(data);
  }

  function handleCloseModalClose() {
    setCloseModalOpen(false);
    if (summary) {
      setSummary(null);
      router.refresh();
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 20) {
      if (visibleCount < filteredDayOrders.length && !loadingMore) {
        setLoadingMore(true);
        setTimeout(() => {
          setVisibleCount((prev) => prev + 10);
          setLoadingMore(false);
        }, 300);
      }
    }
  };

  const totals = useMemo(
    () => computeTotals(activeNightOrders, activeNightCashSales),
    [activeNightOrders, activeNightCashSales],
  );

  const pendingDeliveries = useMemo(
    () => activeNightOrders.filter((o) => o.status === "preparando" || o.status === "listo").length,
    [activeNightOrders],
  );

  const hasPermission = (key: keyof CurrentUser["permissions"]) => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    return !!currentUser.permissions?.[key];
  };

  // Dashboard variables
  const totalDrinkUnits = useMemo(() => {
    return totals.drinksSold.reduce((s, d) => s + d.qty, 0);
  }, [totals]);

  const totalOps = useMemo(() => {
    return (
      totals.efectivoCount +
      totals.qrCount +
      totals.debitoCount
    );
  }, [totals]);

  const avgTicket = useMemo(() => {
    return totalOps > 0 ? Math.round(totals.total / totalOps) : 0;
  }, [totals, totalOps]);

  // Hourly metrics logic
  const [activeHoverSlot, setActiveHoverSlot] = useState<number | null>(null);

  const hourlyData = useMemo(() => {
    if (!event) return [];
    const startTs = event.startedAt;
    const startHourDate = new Date(startTs);
    startHourDate.setMinutes(0, 0, 0);

    const slots: {
      label: string;
      hour: number;
      digitalSales: number;
      digitalCount: number;
      cashSales: number;
      cashCount: number;
      totalSales: number;
    }[] = [];

    // Generar exactamente 10 franjas horarias a partir de la hora de inicio del evento
    for (let i = 0; i < 10; i++) {
      const currentTs = startHourDate.getTime() + i * 3600 * 1000;
      const hrDate = new Date(currentTs);
      const hr = hrDate.getHours();
      slots.push({
        label: `${String(hr).padStart(2, "0")}:00`,
        hour: hr,
        digitalSales: 0,
        digitalCount: 0,
        cashSales: 0,
        cashCount: 0,
        totalSales: 0,
      });
    }

    for (const order of activeNightOrders) {
      if (order.status === "cancelado") continue;
      const orderDate = new Date(order.createdAt);
      const hr = orderDate.getHours();
      const slot = slots.find((s) => s.hour === hr);
      if (slot) {
        slot.digitalSales += order.total;
        slot.digitalCount += 1;
        slot.totalSales += order.total;
      }
    }

    for (const sale of activeNightCashSales) {
      const saleDate = new Date(sale.createdAt);
      const hr = saleDate.getHours();
      const slot = slots.find((s) => s.hour === hr);
      if (slot) {
        slot.cashSales += sale.amount;
        slot.cashCount += 1;
        slot.totalSales += sale.amount;
      }
    }

    return slots;
  }, [event, activeNightOrders, activeNightCashSales]);

  const maxHourSales = useMemo(() => {
    if (hourlyData.length === 0) return 1000;
    const max = Math.max(...hourlyData.map((s) => s.totalSales));
    return max > 0 ? max : 1000;
  }, [hourlyData]);

  const peakHour = useMemo(() => {
    if (hourlyData.length === 0) return "—";
    const sorted = [...hourlyData].sort((a, b) => b.totalSales - a.totalSales);
    if (sorted[0] && sorted[0].totalSales > 0) {
      return `${sorted[0].label} hs`;
    }
    return "—";
  }, [hourlyData]);

  // Sidebar rendering — uses semantic ink-* tokens, no hardcoded theme colors
  const renderSidebar = (isDrawer = false) => {
    const isBosko = theme === "bosko";
    
    // Custom classes for theme consistency
    const sidebarClass = isBosko
      ? "bg-[#013e37] dark:bg-[#012b26] border-r border-[#014d44] dark:border-accent/10 text-[#fffeb3]"
      : "bg-ink-950 border-r border-ink-800 text-ink-50";

    const navBtnBase = "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-200 cursor-pointer";
    
    const navBtnActive = isBosko
      ? `${navBtnBase} bg-white/10 border border-white/20 text-[#fffeb3] shadow-sm font-bold`
      : `${navBtnBase} bg-ink-900 border border-ink-800 text-ink-50 shadow-sm font-bold`;
      
    const navBtnIdle = isBosko
      ? `${navBtnBase} bg-transparent border border-transparent text-white/70 hover:text-white hover:bg-white/5`
      : `${navBtnBase} bg-transparent border border-transparent text-ink-400 hover:text-ink-50 hover:bg-ink-900/40`;

    const navIconActive = isBosko
      ? "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[#fffeb3]/15 text-[#fffeb3] transition-all duration-200"
      : "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-accent/15 text-accent transition-all duration-200";
      
    const navIconIdle = isBosko
      ? "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/5 text-white/40 transition-all duration-200"
      : "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-ink-800/50 text-ink-500 transition-all duration-200";

    const borderClass = isBosko ? "border-white/10" : "border-ink-800";
    const sublabelClass = isBosko ? "text-white/40" : "text-ink-500";
    
    const avatarClass = isBosko
      ? "bg-white/10 border border-white/20 text-[#fffeb3]"
      : "bg-accent/10 border border-accent/25 text-accent";
      
    const footerTextClass = isBosko ? "text-white font-semibold" : "text-ink-50 font-semibold";
    const footerSubtextClass = isBosko ? "text-white/50" : "text-ink-500";
    
    const footerBtnClass = isBosko
      ? "bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-[#fffeb3]"
      : "bg-ink-850 hover:bg-ink-800 border border-ink-750 text-ink-400 hover:text-ink-50";

    return (
      <aside className={`
        w-[280px] shrink-0 flex flex-col print:hidden p-6 gap-6
        ${sidebarClass}
        ${isDrawer ? "h-full" : "h-full hidden md:flex"}
      `}>
        {/* Brand logo top */}
        <div className={`h-[60px] flex items-center justify-center border-b shrink-0 w-full ${borderClass}`}>
          <BrandLogo size="lg" />
        </div>

        {/* Navigation menu */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-6 no-scrollbar">
          <div className="flex flex-col gap-1.5">
            {/* Nueva Venta Button */}
            <button
              type="button"
              onClick={() => {
                setActiveTab("venta");
                setMobileMenuOpen(false);
              }}
              className={activeTab === "venta" ? navBtnActive : navBtnIdle}
            >
              <div className={activeTab === "venta" ? navIconActive : navIconIdle}>
                <LayoutDashboard size={16} strokeWidth={1.8} />
              </div>
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold">
                  Nueva Venta
                </span>
                <span className={`text-[10px] ${sublabelClass}`}>Terminal de Cobro</span>
              </div>
            </button>

            {/* Historial de Ventas Button */}
            {hasPermission("historial") && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab("historial");
                  setMobileMenuOpen(false);
                }}
                className={activeTab === "historial" ? navBtnActive : navBtnIdle}
              >
                <div className={activeTab === "historial" ? navIconActive : navIconIdle}>
                  <History size={16} strokeWidth={1.8} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold">
                    Historial de Ventas
                  </span>
                  <span className={`text-[10px] ${sublabelClass}`}>Ventas del Turno</span>
                </div>
              </button>
            )}

            {/* Métricas Button */}
            {hasPermission("metricas") && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab("metricas");
                  setMobileMenuOpen(false);
                }}
                className={activeTab === "metricas" ? navBtnActive : navBtnIdle}
              >
                <div className={activeTab === "metricas" ? navIconActive : navIconIdle}>
                  <TrendingUp size={16} strokeWidth={1.8} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold">
                    Métricas
                  </span>
                  <span className={`text-[10px] ${sublabelClass}`}>Estadísticas del Turno</span>
                </div>
              </button>
            )}
          </div>

          {/* Closing capability directly from Caja if user has permissions */}
          {currentUser?.permissions?.closeNight && event?.status === "activo" && (
            <div className={`border-t pt-4 ${borderClass}`}>
              <button
                type="button"
                onClick={() => {
                  setCloseModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full h-10 rounded-xl bg-danger-soft border border-danger-line text-danger flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                <Power size={13} />
                <span>Cerrar noche</span>
              </button>
            </div>
          )}
        </div>

        {/* Estado de la impresora térmica */}
        <div className={`border-t pt-4 px-1 ${borderClass}`}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] ${printerStatus?.connected ? "text-green" : "text-danger"}`}>
              <Printer size={13} />
              {printerStatus?.connected ? "Impresora conectada" : "Impresora no encontrada"}
            </span>
          </div>
          <button
            type="button"
            onClick={testPrint}
            className="w-full h-9 rounded-xl bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] active:scale-95 transition-all cursor-pointer"
          >
            Imprimir ticket de prueba
          </button>
          {printerTestMessage && (
            <p className="text-[10px] text-ink-400 mt-1.5 text-center">{printerTestMessage}</p>
          )}
        </div>

        {/* User profile footer */}
        <OSProfileFooter onLogout={handleLogout} username={currentUser?.username} role={currentUser?.role} />
      </aside>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-ink-950">
      <main className="flex-1 flex flex-col md:flex-row relative overflow-hidden h-full">
      
      {/* Night close modal */}
      {event && (
        <CloseNightModal
          open={closeModalOpen}
          totals={totals}
          pendingDeliveries={pendingDeliveries}
          startedAt={event.startedAt}
          summary={summary}
          onConfirm={handleCloseConfirm}
          onClose={handleCloseModalClose}
          cashierName={currentUser?.username}
          onCloseAndShutdown={() => {
            setCloseModalOpen(false);
            window.dispatchEvent(new CustomEvent("cocktrail-trigger-shutdown"));
          }}
        />
      )}

      {/* Standard Sidebar - Visible on Desktop */}
      {renderSidebar(false)}

      {/* Mobile Drawer Overlay - Visible on Mobile when opened */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="h-full flex flex-col animate-in slide-in-from-left duration-200">
            {renderSidebar(true)}
          </div>
          {/* Click outside target area to dismiss */}
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        
        {/* Top Header Bar */}
        <header className="h-[60px] px-6 border-b border-ink-800 bg-ink-925 flex items-center justify-between shrink-0 print:hidden">
          {/* Left section: Drawer trigger + Breadcrumbs */}
          <div className="flex items-center gap-3.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden w-9 h-9 rounded-lg bg-ink-850 border border-ink-750 text-ink-400 flex items-center justify-center hover:text-ink-50 transition-colors cursor-pointer"
              aria-label="Abrir menú"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line></svg>
            </button>
            
            {/* Breadcrumbs */}
            <nav className="hidden sm:flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">
              <span className="text-ink-400">Terminal Caja</span>
              <span className="text-ink-700">/</span>
              <span className="text-accent">
                {activeTab === "venta" ? "Nueva Venta" : activeTab === "metricas" ? "Métricas" : "Historial de Ventas"}
              </span>
            </nav>
            
            <span className="sm:hidden text-[9px] font-bold uppercase tracking-[0.2em] text-ink-300 truncate">
              {activeTab === "venta" ? "Nueva Venta" : activeTab === "metricas" ? "Métricas" : "Historial"}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Theme trigger on mobile header */}
            <button
              type="button"
              onClick={toggleDark}
              className="md:hidden w-9 h-9 rounded-lg bg-ink-850 hover:bg-ink-800 border border-ink-750 text-ink-400 hover:text-ink-50 flex items-center justify-center transition-all cursor-pointer"
              title={isDark ? "Modo Día" : "Modo Noche"}
            >
              {isDark ? <Sun size={13} /> : <Moon size={13} />}
            </button>

            {/* Systems Status Inline Widget */}
            <OSHeadbar activeScreen="Caja" />
          </div>
        </header>

        {/* Content Tabs */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          
          {/* TAB 1: NUEVA VENTA */}
          <div className={activeTab === "venta" ? "flex-1 flex overflow-hidden min-h-0 w-full" : "hidden"}>
            {/* Products column */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">

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
                      {filteredDrinks.map((d) => (
                        <div key={d.id} className="drink-card-anim opacity-0">
                          <CompactDrinkCard
                            drink={d}
                            qty={cart[d.id] || 0}
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
                    onClick={handleOpenCheckout}
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
                  onClick={handleOpenCheckout}
                  disabled={totalItems === 0}
                  className="ct-checkout-btn w-full h-12 font-black rounded-xl text-xs uppercase tracking-[0.18em] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Receipt size={16} strokeWidth={2.5} />
                  Cobrar
                </button>
              </div>
            </aside>
          </div>

          {/* TAB 2: HISTORIAL DE VENTAS */}
          <div className={activeTab === "historial" ? "flex-1 overflow-y-auto p-5 md:p-6 bg-ink-950 min-h-0 w-full" : "hidden"}>
            <div className="max-w-4xl mx-auto w-full space-y-6">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-ink-800 pb-5">
                <div>
                  <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
                      <FileText size={16} />
                    </div>
                    <span>Auditoría de Tickets</span>
                  </h1>
                  <p className="text-[13px] text-ink-400 mt-1">
                    Historial de órdenes registradas en caja filtrado por fecha.
                  </p>
                </div>
              </div>

              {/* Filtro por Día */}
              {days.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-ink-800">
                  {days.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSelectedDay(day)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                        selectedDay === day
                          ? "bg-accent/15 text-accent border border-accent/25"
                          : "bg-ink-900 border border-ink-800 text-ink-400 hover:text-ink-200"
                      }`}
                    >
                      Día {day}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-ink-900 border border-ink-800 rounded-2xl py-6 text-center text-ink-500 font-serif-italic text-sm">
                  — No hay tickets registrados en el historial —
                </div>
              )}

              {/* Listado de tickets con buscador e infinite scroll */}
              {days.length > 0 && (
                <div className="space-y-4">
                  {/* Buscador */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
                    <input
                      type="text"
                      value={ticketSearch}
                      onChange={(e) => {
                        setTicketSearch(e.target.value);
                        setVisibleCount(20); // Reset infinite scroll limit
                      }}
                      placeholder="Buscar por número de ticket o cajero..."
                      className="w-full h-10 pl-10 pr-4 bg-ink-900 border border-ink-800 rounded-xl text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none focus:border-blue transition-all"
                    />
                  </div>

                  {/* Scrollable Container */}
                  <div 
                    onScroll={handleScroll}
                    className="max-h-[500px] overflow-y-auto pr-1 no-scrollbar rounded-xl border border-ink-800/80 bg-ink-950/20 p-1"
                  >
                    {displayedOrders.length === 0 ? (
                      <div className="py-12 text-center text-[12px] text-ink-500 font-serif-italic">
                        {ticketSearch ? "— Sin resultados para tu búsqueda —" : "— No hay tickets para mostrar —"}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {displayedOrders.map((o) => {
                          const paymentLabel = o.paymentMethod === "efectivo" ? "Efectivo" : "Posnet";
                          return (
                            <div 
                              key={o.id} 
                              onClick={() => setSelectedHistoryOrder(o)}
                              className="bg-ink-900 border border-ink-800 hover:border-accent/25 hover:bg-ink-850/50 transition-all rounded-xl p-3.5 flex flex-col justify-between gap-1.5 cursor-pointer active:scale-[0.99] select-none h-[105px]"
                            >
                              <div className="flex justify-between items-center min-w-0">
                                <span className="font-mono text-sm font-black text-ink-50 truncate">#{String(o.displayNumber).padStart(3, "0")}</span>
                                <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded leading-none border ${
                                  o.paymentMethod === "efectivo" 
                                    ? "bg-green-soft text-green border-green-line" 
                                    : "bg-blue-soft text-blue border-blue-line"
                                }`}>
                                  {paymentLabel}
                                </span>
                              </div>
                              <p className="text-[11px] text-ink-300 truncate leading-tight">
                                {getItemsPreview(o.items)}
                              </p>
                              <div className="flex justify-between items-center mt-1 border-t border-ink-800/50 pt-1.5">
                                <span className="text-[9px] text-ink-500 font-medium">Cajero: {o.createdBy || "CJ"}</span>
                                <span className="font-mono text-[13px] font-black text-accent">${o.total.toLocaleString("es-AR")}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Infinite Scroll Loader Spinner */}
                    {loadingMore && (
                      <div className="flex items-center justify-center py-4 gap-2">
                        <Loader2 size={14} className="animate-spin text-accent" />
                        <span className="text-[10px] text-ink-400 font-medium uppercase tracking-wider">Cargando más...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TAB 3: METRICAS */}
          <div className={activeTab === "metricas" ? "flex-1 overflow-y-auto p-5 md:p-6 bg-ink-950 min-h-0 w-full animate-in fade-in duration-200" : "hidden"}>
            <div className="max-w-4xl mx-auto w-full space-y-6">
              <section className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-ink-400 flex items-center gap-2">
                  <TrendingUp size={12} /> Dashboard de Negocio
                </span>
                <h1 className="font-serif-italic text-[30px] leading-none text-ink-50">
                  Métricas de Venta
                </h1>
                <p className="text-[12px] text-ink-400 mt-1">
                  Revisión horaria del flujo de dinero y tickets registrados en el transcurso del evento.
                </p>
              </section>

              {/* Hourly sales bar chart */}
              <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 md:p-6 flex flex-col gap-6 relative min-w-0">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col gap-0.5">
                    <h3 className="text-[12px] font-bold text-ink-100 uppercase tracking-widest">
                      Facturación por Hora
                    </h3>
                    <p className="text-[10px] text-ink-500">Volumen combinado de tickets en pesos ($)</p>
                  </div>
                  <div className="px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono border border-accent/25 text-accent bg-ink-850">
                    EN VIVO
                  </div>
                </div>

                {/* Graph bars mapping */}
                <div className="relative h-[280px] flex items-end justify-between gap-1.5 md:gap-3 pt-8 pb-2 px-1 border-b border-ink-800/80">
                  
                  {/* Grid lines in background */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-[28px] pt-[32px]">
                    <div className="w-full border-t border-ink-800/30 border-dashed" />
                    <div className="w-full border-t border-ink-800/30 border-dashed" />
                    <div className="w-full border-t border-ink-800/30 border-dashed" />
                  </div>

                  {hourlyData.map((slot) => {
                    const heightPct = (slot.totalSales / maxHourSales) * 100;
                    const isHovered = activeHoverSlot === slot.hour;
                    
                    return (
                      <div
                        key={slot.label}
                        className="flex-1 flex flex-col items-center group relative cursor-pointer"
                        onMouseEnter={() => setActiveHoverSlot(slot.hour)}
                        onMouseLeave={() => setActiveHoverSlot(null)}
                      >
                        {/* Custom Interactive Tooltip card */}
                        {isHovered && (
                          <div className="absolute bottom-[105%] left-1/2 -translate-x-1/2 w-[210px] bg-ink-950 border border-ink-800 rounded-xl p-3 shadow-2xl z-20 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                            <span className="text-[10px] font-bold text-ink-300 border-b border-ink-800 pb-1">
                              Franja: {slot.label} a {String((slot.hour + 1) % 24).padStart(2, "0")}:00 hs
                            </span>
                            <div className="flex justify-between text-[11px] text-ink-100 mt-1">
                              <span>Digitales:</span>
                              <span className="font-mono font-bold">${slot.digitalSales.toLocaleString("es-AR")}</span>
                            </div>
                            <div className="flex justify-between text-[9px] text-ink-500">
                              <span>({slot.digitalCount} pedidos)</span>
                            </div>
                            <div className="flex justify-between text-[11px] text-ink-100 mt-1">
                              <span>Barra:</span>
                              <span className="font-mono font-bold">${slot.cashSales.toLocaleString("es-AR")}</span>
                            </div>
                            <div className="flex justify-between text-[9px] text-ink-500">
                              <span>({slot.cashCount} ventas)</span>
                            </div>
                            <div className="flex justify-between text-[11px] font-bold border-t border-ink-800 pt-1.5 mt-1.5 text-accent">
                              <span>Total:</span>
                              <span className="font-mono">${slot.totalSales.toLocaleString("es-AR")}</span>
                            </div>
                          </div>
                        )}

                        {/* Bar Graphic */}
                        <div className="w-full relative h-[185px] flex items-end">
                          <div
                            className="w-full rounded-t bg-gradient-to-t from-accent/30 to-accent/80 transition-all duration-300 group-hover:brightness-125"
                            style={{ height: `${Math.max(4, heightPct)}%` }}
                          />
                        </div>

                        {/* Bar Label */}
                        <span className="text-[9px] font-mono font-medium text-ink-400 mt-2 truncate">
                          {slot.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Statistics overview widgets below the chart */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Widget A: Avg ticket */}
                <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">
                    Ticket Promedio
                  </span>
                  <span className="font-mono text-[26px] font-bold leading-none text-accent">
                    ${avgTicket.toLocaleString("es-AR")}
                  </span>
                  <span className="text-[10px] text-ink-400">Calculado sobre transacciones cobradas</span>
                </div>

                {/* Widget B: Drinks sold */}
                <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">
                    Tragos Vendidos
                  </span>
                  <span className="font-mono text-[26px] font-bold leading-none text-ink-50">
                    {totalDrinkUnits} <span className="text-xs text-ink-400 font-sans font-medium">unidades</span>
                  </span>
                  <span className="text-[10px] text-ink-400">Volumen físico total servido en barra</span>
                </div>

                {/* Widget C: Peak Hour */}
                <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">
                    Hora Pico de Ventas
                  </span>
                  <span className="font-mono text-[26px] font-bold leading-none text-accent">
                    {peakHour}
                  </span>
                  <span className="text-[10px] text-ink-400">Franja con mayor recaudación bruta</span>
                </div>
              </div>
            </div>
          </div>

        </div>
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
              <button onClick={handleOpenCheckout} className="ct-checkout-btn w-full h-14 font-black rounded-xl active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer">
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
            setIsCheckoutOpen(false); 
            setPosnetStatus("idle"); 
            setPaymentMethod(null);
            setPaymentIntentState(null);
            setPosnetErrorMessage(null);
            setCurrentIntentId(null);
            if (pollingRef.current) clearInterval(pollingRef.current); 
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
                    onClick={() => { setIsCheckoutOpen(false); setPosnetStatus("idle"); if (pollingRef.current) clearInterval(pollingRef.current); }} 
                    className="w-full h-12 bg-ink-850 border border-ink-750 text-ink-300 hover:text-ink-50 font-bold rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer hover:bg-ink-800"
                  >
                    Nueva Venta
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
                    Luego, en la pantalla del lector seleccioná la opción <span className="text-amber-500 font-bold">"Cobrar"</span> en el cuadro de diálogo:
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
                            if (pollingRef.current) clearInterval(pollingRef.current);
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
                        setIsCheckoutOpen(false); 
                        setPosnetStatus("idle"); 
                        setPaymentMethod(null);
                        setPaymentIntentState(null);
                        setPosnetErrorMessage(null);
                        setCurrentIntentId(null);
                        if (pollingRef.current) clearInterval(pollingRef.current); 
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
                        className="w-full h-16 rounded-2xl bg-ink-950 border border-ink-800 flex items-center px-4 gap-3 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer text-left disabled:opacity-50"
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-soft border border-green-line text-green flex items-center justify-center shrink-0">
                          <Banknote size={22} />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-ink-50">Efectivo</p>
                          <p className="text-[10px] text-ink-400">Cobro manual y cálculo de vuelto</p>
                        </div>
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
                          className="h-24 rounded-2xl bg-ink-950 border border-ink-800 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer disabled:opacity-50"
                        >
                          <div className="w-10 h-10 rounded-xl bg-blue-soft border border-blue-line text-blue flex items-center justify-center">
                            <CreditCard size={22} />
                          </div>
                          <span className="font-bold text-xs text-ink-50 text-center">Tarjeta</span>
                        </button>
                        
                        <button 
                          disabled={submitting}
                          onClick={() => startPosnetPayment("qr")}
                          className="h-24 rounded-2xl bg-ink-950 border border-ink-800 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-ink-900 hover:border-ink-750 cursor-pointer disabled:opacity-50"
                        >
                          <div className="w-10 h-10 rounded-xl bg-purple-soft border border-purple-border text-purple flex items-center justify-center">
                            <QrCode size={22} />
                          </div>
                          <span className="font-bold text-xs text-ink-50 text-center">Código QR</span>
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
                          <span className="text-xs uppercase tracking-widest font-bold text-ink-400">Monto Recibido</span>
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
                        
                        <div className={`flex justify-between items-center p-4 rounded-2xl border ${receivedAmount && change >= 0 ? 'bg-green-soft border-green-line' : 'bg-ink-950 border-ink-800'}`}>
                          <span className="text-sm font-bold text-ink-300">Vuelto a entregar</span>
                          <span className={`text-2xl font-black ${receivedAmount && change >= 0 ? 'text-green' : 'text-ink-500'}`}>
                            ${receivedAmount && change >= 0 ? change.toLocaleString("es-AR") : "0"}
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
                                  if (pollingRef.current) clearInterval(pollingRef.current);
                                  try {
                                    await mercadopagoService.cancelPosIntent(currentIntentId);
                                    setPosnetStatus("idle");
                                    setCurrentIntentId(null);
                                    setPaymentMethod(null);
                                    setPaymentIntentState(null);
                                    setPosnetErrorMessage(null);
                                  } catch (err: any) {
                                    console.warn("Error canceling intent (handled):", err);
                                    const isConflict = err?.status === 409 || err?.message?.includes("Conflict") || err?.toString()?.includes("409");
                                    if (isConflict) {
                                      setPaymentIntentState("ON_TERMINAL");
                                      if (paymentMethod) {
                                        startPolling(currentIntentId, paymentMethod);
                                      }
                                    } else {
                                      setPosnetStatus("error");
                                      setPosnetErrorMessage(err?.message || "No se pudo cancelar el cobro.");
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
                                  if (pollingRef.current) clearInterval(pollingRef.current);
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

      {/* ── Popup Detalle de Ticket Historial ── */}
      {selectedHistoryOrder && (
        <div onClick={() => setSelectedHistoryOrder(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-ink-900 border border-ink-800 w-full max-w-sm rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-ink-800">
              <div>
                <h3 className="font-mono text-lg font-black text-ink-50">Ticket #{String(selectedHistoryOrder.displayNumber).padStart(3, "0")}</h3>
                <p className="font-mono text-[10px] text-ink-400 select-all">Token: {selectedHistoryOrder.token}</p>
              </div>
              <button onClick={() => setSelectedHistoryOrder(null)} className="p-2.5 bg-ink-850 border border-ink-750 rounded-full active:scale-90 transition-transform cursor-pointer text-ink-400 hover:text-ink-50">
                <X size={18} />
              </button>
            </div>

            {/* Listado de items del ticket */}
            <div className="flex flex-col gap-3 py-2 max-h-[40vh] overflow-y-auto">
              {selectedHistoryOrder.items.map((item) => (
                <div key={item.drinkId} className="flex justify-between items-center text-sm">
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-ink-50 truncate">{item.name}</span>
                    <span className="text-xs text-ink-400 font-mono tabular">{item.qty} x ${item.unitPrice.toLocaleString("es-AR")}</span>
                  </div>
                  <span className="font-mono font-bold text-ink-200">${item.subtotal.toLocaleString("es-AR")}</span>
                </div>
              ))}
            </div>

            {/* Footer de ticket */}
            <div className="mt-4 pt-4 border-t border-ink-800 flex flex-col gap-2 font-mono text-xs">
              <div className="flex justify-between text-ink-300">
                <span>Método de cobro</span>
                <span className="capitalize font-bold">{selectedHistoryOrder.paymentMethod === "efectivo" ? "Efectivo" : "Posnet"}</span>
              </div>
              <div className="flex justify-between text-ink-300">
                <span>Cajero</span>
                <span className="font-bold">{selectedHistoryOrder.createdBy || "CJ"}</span>
              </div>
              <div className="flex justify-between text-ink-300">
                <span>Fecha / Hora</span>
                <span>Día {formatDayMonth(selectedHistoryOrder.createdAt)} - {formatHourMinute(selectedHistoryOrder.createdAt)} hs</span>
              </div>
              <div className="flex justify-between text-base font-black text-ink-50 pt-2 border-t border-ink-800 pb-2">
                <span>TOTAL</span>
                <span className="text-accent">${selectedHistoryOrder.total.toLocaleString("es-AR")}</span>
              </div>

              <button
                onClick={() => reprintTicket(selectedHistoryOrder.id)}
                disabled={reprinting}
                className="ct-checkout-btn w-full mt-2 h-11 font-black rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Printer size={14} strokeWidth={2.5} />
                {reprinting ? "Imprimiendo…" : "Reimprimir Ticket"}
              </button>
              {printError && (
                <div className="w-full mt-2 bg-danger-soft border border-danger-line text-danger rounded-xl px-3 py-2.5 text-sm">
                  {printError}
                </div>
              )}

              {selectedHistoryOrder.status !== "cancelado" && (currentUser?.role === "admin" || currentUser?.permissions?.cancelarTickets) && (
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm("¿Seguro que deseas cancelar este ticket?")) {
                      try {
                        const updated = await ordersService.updateStatus(selectedHistoryOrder.id, "cancelado");
                        setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
                        setSelectedHistoryOrder(null);
                      } catch (err) {
                        alert(err instanceof Error ? err.message : "Error al cancelar el ticket");
                      }
                    }
                  }}
                  className="w-full mt-2 h-11 bg-danger-soft hover:bg-danger-soft/80 border border-danger-line text-danger font-black rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer animate-in fade-in duration-200"
                >
                  <X size={14} strokeWidth={2.5} />
                  Cancelar Ticket
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </main>
    </div>
  );
}
