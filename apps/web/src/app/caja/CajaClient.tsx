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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createElement, useMemo, useState, useCallback, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import DrinkCard from "@/components/DrinkCard";
import { BrandLogo } from "@/components/BrandLogo";
import { drinkIcon } from "@/lib/icons";
import { useSSE } from "@/lib/useSSE";
import { eventsService } from "@/services/events.service";
import { ordersService } from "@/services/orders.service";
import { authService } from "@/services/auth.service";
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
  return (
    <div
      onClick={onAdd}
      className={`group relative bg-ink-900 border rounded-xl p-3 flex flex-col gap-2.5 transition-all cursor-pointer ${
        active
          ? "border-green/60 shadow-[0_0_0_1px_var(--success-soft)]"
          : "border-ink-800 hover:border-ink-700"
      }`}
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
        <span className="text-[13px] font-bold text-white leading-tight line-clamp-2">
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
  const { theme } = useTheme();
  
  // Navigation tabs state
  const [activeTab, setActiveTab] = useState<"venta" | "historial" | "metricas">("venta");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  
  // Pedido recién concretado (para mostrar en pantalla de éxito)
  const [latestOrder, setLatestOrder] = useState<Order | null>(null);

  // Estado para la comanda de ticket a imprimir
  const [activePrintOrder, setActivePrintOrder] = useState<Order | null>(null);

  const triggerPrint = useCallback((order: Order) => {
    setActivePrintOrder(order);
    setTimeout(() => {
      window.print();
    }, 150);
  }, []);

  // Data states
  const [orders, setOrders] = useState<Order[]>([]);
  const [cashSales, setCashSales] = useState<CashSale[]>([]);
  const [event, setEvent] = useState<NightEvent | null>(null);
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<Order | null>(null);

  // Close night modal states
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [summary, setSummary] = useState<EventSummary | null>(null);

  // History filtering states
  const [historyFilter, setHistoryFilter] = useState<"pendientes" | "entregados" | "cancelados">("pendientes");
  const [originFilter, setOriginFilter] = useState<"todos" | "caja" | "web">("todos");

  const filteredHistoryOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. Status Filter
      if (historyFilter === "pendientes") {
        if (o.status === "entregado" || o.status === "cancelado") return false;
      } else if (historyFilter === "entregados") {
        if (o.status !== "entregado") return false;
      } else if (historyFilter === "cancelados") {
        if (o.status !== "cancelado") return false;
      }

      // 2. Origin Filter
      const isWeb = o.paymentMethod === "transferencia";
      if (originFilter === "caja" && isWeb) return false;
      if (originFilter === "web" && !isWeb) return false;

      return true;
    });
  }, [orders, historyFilter, originFilter]);



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
      const order = await ordersService.create({ items, paymentMethod });
      
      setLatestOrder(order);
      setCart({});
    } catch (err) {
      console.error(err);
    } finally {
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



  const totals = useMemo(
    () => computeTotals(orders, cashSales),
    [orders, cashSales],
  );

  const pendingDeliveries = useMemo(
    () => orders.filter((o) => o.status === "preparando" || o.status === "listo").length,
    [orders],
  );

  const isBosko = theme === "bosko";
  const accentColorClass = isBosko ? "text-[#4ade80]" : "text-blue";
  const accentBgClass = isBosko ? "bg-[#4ade80]/10" : "bg-blue/10";
  const accentBorderClass = isBosko ? "border-[#4ade80]/20" : "border-blue-line";
  const barColorClass = isBosko ? "from-[#4ade80]/30 to-[#4ade80]/90" : "from-blue-soft to-blue";

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
      totals.transferenciaCount +
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

    for (const order of orders) {
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

    for (const sale of cashSales) {
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
  }, [event, orders, cashSales]);

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

  // Sidebar Layout matching Admin aesthetics
  const renderSidebar = (isDrawer = false) => (
    <aside className={`
      w-[280px] shrink-0 border-r border-ink-800 bg-ink-925 flex flex-col print:hidden
      ${isDrawer ? "h-full" : "h-screen sticky top-0 hidden md:flex"}
    `}>
      {/* Brand logo top */}
      <div className="h-[60px] px-6 flex items-center justify-between border-b border-ink-800">
        <div className="flex items-center gap-3.5 min-w-0">
          <BrandLogo size="lg" />
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-purple-400">
            Caja
          </span>
        </div>
      </div>

      {/* Navigation menu */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 no-scrollbar">
        <div className="flex flex-col gap-1">
          {/* Nueva Venta Button */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("venta");
              setMobileMenuOpen(false);
            }}
            className={`
              w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-200 cursor-pointer
              ${activeTab === "venta"
                ? "bg-blue-soft border border-blue-line text-blue shadow-[0_0_15px_rgba(var(--primary-base),0.02)]"
                : "bg-transparent border border-transparent text-ink-300 hover:text-ink-100 hover:bg-ink-850/50"
              }
            `}
          >
            <div className={`
              w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
              ${activeTab === "venta" ? accentBgClass + " " + accentColorClass : "bg-ink-800/50 text-ink-500"}
            `}>
              <LayoutDashboard size={16} strokeWidth={1.8} />
            </div>
            <div className="flex flex-col">
              <span className={`text-[13px] font-semibold ${activeTab === "venta" ? accentColorClass : ""}`}>
                Nueva Venta
              </span>
              <span className="text-[10px] text-ink-500">Terminal de Cobro</span>
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
              className={`
                w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-200 cursor-pointer
                ${activeTab === "historial"
                  ? "bg-blue-soft border border-blue-line text-blue shadow-[0_0_15px_rgba(var(--primary-base),0.02)]"
                  : "bg-transparent border border-transparent text-ink-300 hover:text-ink-100 hover:bg-ink-850/50"
                }
              `}
            >
              <div className={`
                w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
                ${activeTab === "historial" ? accentBgClass + " " + accentColorClass : "bg-ink-800/50 text-ink-500"}
              `}>
                <History size={16} strokeWidth={1.8} />
              </div>
              <div className="flex flex-col">
                <span className={`text-[13px] font-semibold ${activeTab === "historial" ? accentColorClass : ""}`}>
                  Historial de Ventas
                </span>
                <span className="text-[10px] text-ink-500">Ventas del Turno</span>
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
              className={`
                w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-200 cursor-pointer
                ${activeTab === "metricas"
                  ? "bg-blue-soft border border-blue-line text-blue shadow-[0_0_15px_rgba(var(--primary-base),0.02)]"
                  : "bg-transparent border border-transparent text-ink-300 hover:text-ink-100 hover:bg-ink-850/50"
                }
              `}
            >
              <div className={`
                w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
                ${activeTab === "metricas" ? accentBgClass + " " + accentColorClass : "bg-ink-800/50 text-ink-500"}
              `}>
                <TrendingUp size={16} strokeWidth={1.8} />
              </div>
              <div className="flex flex-col">
                <span className={`text-[13px] font-semibold ${activeTab === "metricas" ? accentColorClass : ""}`}>
                  Métricas
                </span>
                <span className="text-[10px] text-ink-500">Estadísticas del Turno</span>
              </div>
            </button>
          )}
        </div>

        {/* Closing capability directly from Caja if user has permissions */}
        {currentUser?.permissions?.closeNight && event?.status === "activo" && (
          <div className="border-t border-ink-800 pt-4">
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

      {/* User profile footer */}
      <div className="mt-auto p-4 border-t border-ink-800 flex items-center gap-3 shrink-0">
        <div className={`w-9 h-9 rounded-full bg-ink-800 border border-ink-700 flex items-center justify-center font-bold uppercase text-[12px] select-none ${accentColorClass}`}>
          {currentUser?.username?.slice(0, 2) || "CJ"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-ink-50 truncate leading-tight">
            {currentUser?.username || "Cajera"}
          </p>
          <p className="text-[10px] text-ink-450 capitalize truncate mt-0.5">
            Caja Autorizada
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-9 h-9 rounded-lg bg-ink-850 hover:bg-ink-800 border border-ink-700 hover:text-danger hover:border-danger-line text-ink-300 flex items-center justify-center transition-all shrink-0 cursor-pointer"
          title="Cerrar sesión"
        >
          <LogOut size={13} />
        </button>
      </div>
    </aside>
  );

  return (
    <main className="min-h-screen bg-ink-950 text-ink-50 flex flex-col md:flex-row relative overflow-hidden h-screen">
      
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
        />
      )}

      {/* Standard Sidebar - Visible on Desktop */}
      {renderSidebar(false)}

      {/* Mobile Drawer Overlay - Visible on Mobile when opened */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[280px] h-full flex flex-col animate-in slide-in-from-left duration-200">
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
              className="md:hidden w-9 h-9 rounded-lg bg-ink-850 border border-ink-700 text-ink-300 flex items-center justify-center hover:text-ink-50 transition-colors cursor-pointer"
              aria-label="Abrir menú"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line></svg>
            </button>
            
            {/* Breadcrumbs */}
            <nav className="hidden sm:flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">
              <span className="text-ink-400">Terminal Caja</span>
              <span className="text-ink-700">/</span>
              <span className={accentColorClass}>
                {activeTab === "venta" ? "Nueva Venta" : activeTab === "metricas" ? "Métricas" : "Historial de Ventas"}
              </span>
            </nav>
            
            <span className="sm:hidden text-[9px] font-bold uppercase tracking-[0.2em] text-ink-300 truncate">
              {activeTab === "venta" ? "Nueva Venta" : activeTab === "metricas" ? "Métricas" : "Historial"}
            </span>
          </div>

          <div className="flex items-center gap-2">
          </div>
        </header>

        {/* Content Tabs */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          
          {/* TAB 1: NUEVA VENTA */}
          {activeTab === "venta" && (
            <div className="flex-1 flex overflow-hidden min-h-0 w-full">
              {/* Products column */}
              <div className="flex-1 flex flex-col overflow-hidden min-w-0">

                {/* Grid scrollable */}
                <div className="flex-1 overflow-y-auto p-5">
                  {filteredDrinks.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-ink-500 font-serif-italic">
                      — No hay productos en esta categoría —
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:hidden">
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

              {/* Sidebar cart (lg+ only) */}
              <aside className="hidden lg:flex w-[380px] xl:w-[420px] flex-col border-l border-ink-800 bg-ink-925 shrink-0 h-full">
                <div className="px-5 py-4 border-b border-ink-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingBag size={16} className="text-green" />
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
                          <span className="font-mono text-sm font-black text-blue tabular shrink-0">
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
                              className="w-7 h-7 flex items-center justify-center text-ink-300 hover:text-white hover:bg-white/5 rounded-l-md active:scale-90 transition-all cursor-pointer"
                              aria-label="Restar"
                            >
                              <Minus size={12} strokeWidth={3} />
                            </button>
                            <span className="text-xs font-black text-white tabular w-5 text-center">{qty}</span>
                            <button
                              onClick={() => addToCart(drink.id)}
                              className="w-7 h-7 flex items-center justify-center text-ink-300 hover:text-white hover:bg-white/5 rounded-r-md active:scale-90 transition-all cursor-pointer"
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
                    className="w-full h-12 bg-green hover:brightness-110 disabled:bg-ink-800 disabled:text-ink-500 disabled:cursor-not-allowed text-ink-950 font-black rounded-xl active:scale-[0.98] transition-all text-xs uppercase tracking-[0.18em] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Receipt size={16} strokeWidth={2.5} />
                    Cobrar
                  </button>
                </div>
              </aside>
            </div>
          )}

          {/* TAB 2: HISTORIAL DE VENTAS */}
          {activeTab === "historial" && (
            <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-ink-950 min-h-0 w-full">
              <div className="max-w-4xl mx-auto w-full space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-bold text-ink-50">Historial de Ventas</h1>
                    <p className="text-[12px] text-ink-400 mt-1">
                      Listado de todas las órdenes procesadas en el turno actual.
                    </p>
                  </div>
                </div>

                {/* Filtros de Historial */}
                <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-ink-900/60 p-4 border border-ink-800 rounded-2xl">
                  {/* Status Filter */}
                  <div className="flex p-1 bg-ink-950 border border-ink-800/80 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setHistoryFilter("pendientes")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        historyFilter === "pendientes"
                          ? isBosko ? "bg-[#4ade80] text-ink-955 font-bold" : "bg-blue text-ink-955 font-bold"
                          : "text-ink-400 hover:text-ink-200"
                      }`}
                    >
                      Pendientes
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter("entregados")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        historyFilter === "entregados"
                          ? isBosko ? "bg-[#4ade80] text-ink-955 font-bold" : "bg-blue text-ink-955 font-bold"
                          : "text-ink-400 hover:text-ink-200"
                      }`}
                    >
                      Pedidos ya Hechos
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryFilter("cancelados")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        historyFilter === "cancelados"
                          ? isBosko ? "bg-[#4ade80] text-ink-955 font-bold" : "bg-blue text-ink-955 font-bold"
                          : "text-ink-400 hover:text-ink-200"
                      }`}
                    >
                      Cancelados
                    </button>
                  </div>

                  {/* Origin Filter */}
                  <div className="flex p-1 bg-ink-950 border border-ink-800/80 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setOriginFilter("todos")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        originFilter === "todos"
                          ? "bg-ink-800 text-white font-bold"
                          : "text-ink-400 hover:text-ink-200"
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setOriginFilter("caja")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        originFilter === "caja"
                          ? "bg-ink-800 text-white font-bold"
                          : "text-ink-400 hover:text-ink-200"
                      }`}
                    >
                      Caja
                    </button>
                    <button
                      type="button"
                      onClick={() => setOriginFilter("web")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        originFilter === "web"
                          ? "bg-ink-800 text-white font-bold"
                          : "text-ink-400 hover:text-ink-200"
                      }`}
                    >
                      Web
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  {filteredHistoryOrders.length === 0 ? (
                    <div className="bg-ink-900 border border-ink-800 rounded-2xl py-12 text-center text-ink-500 font-serif-italic text-sm">
                      — No hay pedidos registrados que coincidan con el filtro —
                    </div>
                  ) : (
                    filteredHistoryOrders.slice().reverse().map((o) => {
                      const channel = o.paymentMethod === "transferencia" ? "Web" : "Caja";
                      const statusInfo = mapStatus(o.status);
                      return (
                        <div 
                          key={o.id} 
                          onClick={() => setSelectedHistoryOrder(o)}
                          className="bg-ink-900 border border-ink-800 hover:border-purple-500/30 hover:bg-ink-850/50 transition-all rounded-2xl p-4 flex flex-col gap-2 cursor-pointer active:scale-[0.99]"
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

          {/* TAB 3: METRICAS */}
          {activeTab === "metricas" && (
            <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-ink-950 min-h-0 w-full animate-in fade-in duration-200">
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
                    <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono border ${accentBorderClass} ${accentColorClass} bg-ink-800`}>
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
                            <div className="absolute bottom-[105%] left-1/2 -translate-x-1/2 w-[210px] bg-ink-950 border border-white/10 rounded-xl p-3 shadow-2xl z-20 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                              <span className="text-[10px] font-bold text-ink-300 border-b border-white/5 pb-1">
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
                              <div className={`flex justify-between text-[11px] font-bold border-t border-white/5 pt-1.5 mt-1.5 ${accentColorClass}`}>
                                <span>Total:</span>
                                <span className="font-mono">${slot.totalSales.toLocaleString("es-AR")}</span>
                              </div>
                            </div>
                          )}

                          {/* Bar Graphic */}
                          <div className="w-full relative h-[185px] flex items-end">
                            <div
                              className={`w-full rounded-t bg-gradient-to-t transition-all duration-300 group-hover:brightness-110 ${barColorClass}`}
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
                    <span className={`font-mono text-[26px] font-bold leading-none ${accentColorClass}`}>
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
                    <span className={`font-mono text-[26px] font-bold leading-none ${accentColorClass}`}>
                      {peakHour}
                    </span>
                    <span className="text-[10px] text-ink-400">Franja con mayor recaudación bruta</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Modal 1: Carrito de Caja (sólo mobile) ── */}
      {isCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-ink-900 border border-white/10 w-full max-w-md rounded-[32px] p-6 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black">Pedido Actual</h2>
              <button onClick={() => setIsCartOpen(false)} className="p-3 bg-white/5 rounded-full active:scale-90 transition-transform cursor-pointer">
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
                      <button onClick={() => removeFromCart(d.id)} className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center active:scale-90 transition-transform cursor-pointer"><Minus size={16} strokeWidth={3} /></button>
                      <span className="font-bold w-4 text-center text-sm">{qty}</span>
                      <button onClick={() => addToCart(d.id)} className="w-10 h-10 rounded-lg bg-blue text-ink-950 flex items-center justify-center active:scale-90 transition-transform cursor-pointer"><Plus size={16} strokeWidth={3} /></button>
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
              <button onClick={handleOpenCheckout} className="w-full h-14 bg-blue text-ink-950 font-black rounded-xl active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer">
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
              <div className="flex flex-col items-center justify-center py-6 gap-4 text-center">
                <div className="w-16 h-16 rounded-full bg-green-soft flex items-center justify-center text-green shrink-0">
                  <Check size={32} strokeWidth={3} className="animate-bounce" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white mb-1">¡Cobro Concretado!</h2>
                  <p className="text-ink-400 text-sm">El pedido ya fue enviado a la barra.</p>
                </div>
                
                <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-2.5 font-mono">
                  <div className="flex justify-between border-b border-white/5 pb-2">
                    <span className="text-ink-400 text-xs uppercase">Número de ticket</span>
                    <span className="text-xl font-black text-green">#{latestOrder.displayNumber}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-ink-400 text-xs uppercase">Hashcode / ID</span>
                    <span className="text-xs font-bold text-white select-all">{latestOrder.token}</span>
                  </div>
                </div>

                <div className="w-full flex flex-col gap-2 mt-2">
                  <button 
                    onClick={() => triggerPrint(latestOrder)} 
                    className="w-full h-12 bg-green text-ink-950 font-black rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer hover:brightness-110"
                  >
                    <Printer size={16} strokeWidth={2.5} />
                    Imprimir Ticket
                  </button>

                  <button 
                    onClick={() => setIsCheckoutOpen(false)} 
                    className="w-full h-12 bg-white/10 text-white font-bold rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider cursor-pointer hover:bg-white/15"
                  >
                    Nueva Venta
                  </button>
                </div>
              </div>
            ) : (
              // Vista de selección de pago y cálculo
              <>
                <div className="flex justify-between items-center mb-6 shrink-0">
                  {paymentMethod ? (
                    <button onClick={() => setPaymentMethod(null)} className="flex items-center gap-2 text-ink-300 hover:text-white transition-colors cursor-pointer bg-transparent border-none">
                      <ArrowLeft size={18} />
                      <span className="text-xs font-bold uppercase tracking-wider">Atrás</span>
                    </button>
                  ) : (
                    <button onClick={() => { setIsCheckoutOpen(false); setIsCartOpen(true); }} className="flex items-center gap-2 text-ink-300 hover:text-white transition-colors cursor-pointer bg-transparent border-none">
                      <ArrowLeft size={18} />
                      <span className="text-xs font-bold uppercase tracking-wider">Modificar pedido</span>
                    </button>
                  )}
                  <button onClick={() => setIsCheckoutOpen(false)} className="p-3 bg-white/5 rounded-full active:scale-90 transition-transform ml-auto cursor-pointer">
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
                        className="h-28 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-white/10 cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-xl bg-green-soft text-green flex items-center justify-center"><Banknote size={22} /></div>
                        <span className="font-bold text-sm">Efectivo</span>
                      </button>
                      <button 
                        onClick={() => setPaymentMethod("qr")}
                        className="h-28 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-white/10 cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-xl bg-blue-soft text-blue flex items-center justify-center"><QrCode size={22} /></div>
                        <span className="font-bold text-sm">MP QR (POS)</span>
                      </button>
                      <button 
                        onClick={() => setPaymentMethod("debito")}
                        className="h-28 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-white/10 cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-xl bg-amber-soft text-amber border border-amber-border flex items-center justify-center"><CreditCard size={22} /></div>
                        <span className="font-bold text-sm">Débito</span>
                      </button>
                      <button 
                        onClick={() => setPaymentMethod("transferencia")}
                        className="h-28 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 active:scale-95 transition-all hover:bg-white/10 cursor-pointer"
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
                        
                        <div className={`flex justify-between items-center p-4 rounded-2xl border ${receivedAmount && change >= 0 ? 'bg-green-soft border-green-line' : 'bg-white/5 border-white/10'}`}>
                          <span className="text-sm font-bold text-ink-300">Vuelto a entregar</span>
                          <span className={`text-2xl font-black ${receivedAmount && change >= 0 ? 'text-green' : 'text-ink-500'}`}>
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
                        className="w-full h-14 bg-blue text-ink-950 font-black rounded-xl active:scale-95 transition-all text-sm uppercase tracking-widest disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 cursor-pointer"
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

      {/* ── Popup Detalle de Ticket Historial ── */}
      {selectedHistoryOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-ink-900 border border-white/10 w-full max-w-sm rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
              <div>
                <h3 className="font-mono text-lg font-black text-white">Ticket #{selectedHistoryOrder.displayNumber}</h3>
                <p className="font-mono text-[10px] text-ink-400 select-all">{selectedHistoryOrder.token}</p>
              </div>
              <button onClick={() => setSelectedHistoryOrder(null)} className="p-2.5 bg-white/5 rounded-full active:scale-90 transition-transform cursor-pointer">
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
              <div className="flex justify-between text-base font-black text-white pt-2 border-t border-white/5 pb-2">
                <span>TOTAL</span>
                <span className="text-blue">${selectedHistoryOrder.total.toLocaleString("es-AR")}</span>
              </div>

              <button 
                onClick={() => triggerPrint(selectedHistoryOrder)} 
                className="w-full mt-2 h-11 bg-green text-ink-950 font-black rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer hover:brightness-110"
              >
                <Printer size={14} strokeWidth={2.5} />
                Reimprimir Ticket
              </button>

              {selectedHistoryOrder.status !== "cancelado" && selectedHistoryOrder.status !== "entregado" && (currentUser?.role === "admin" || currentUser?.permissions?.cancelarTickets) && (
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

      {/* --- PRINTER ONLY TICKET --- */}
      {activePrintOrder && (
        <div id="print-receipt" className="hidden">
          <div className="text-center font-mono text-black">
            <h2 className="text-xs font-bold uppercase tracking-wider border-b border-dashed border-black pb-1.5 mb-1.5">COCKTRAIL</h2>
            <div className="text-3xl font-black leading-none my-1 select-none">#{activePrintOrder.displayNumber}</div>
            <div className="text-[9px] uppercase tracking-wide text-zinc-600 mb-2">
              {new Date(activePrintOrder.createdAt).toLocaleDateString("es-AR")} - {new Date(activePrintOrder.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} hs
            </div>
            
            {/* QR Code */}
            {activePrintOrder.ticketCode && (
              <div className="flex flex-col items-center gap-1 mb-2.5">
                <div className="border border-black p-1 bg-white inline-block">
                  <QRCodeSVG
                    value={activePrintOrder.ticketCode}
                    size={130}
                    level="H"
                    includeMargin={false}
                    fgColor="#000000"
                    bgColor="#ffffff"
                  />
                </div>
                <span className="text-[9px] font-mono font-bold mt-0.5 uppercase tracking-wide">
                  {activePrintOrder.ticketCode}
                </span>
              </div>
            )}
            
            {/* Ticket Cutout Divider */}
            <div className="relative my-3 -mx-[14px] h-[20px] flex items-center justify-between pointer-events-none select-none">
              <div className="w-5 h-5 rounded-full bg-white border-2 border-black absolute left-[-11px] top-1/2 -translate-y-1/2 z-10" />
              <div className="w-5 h-5 rounded-full bg-white border-2 border-black absolute right-[-11px] top-1/2 -translate-y-1/2 z-10" />
              <div className="w-full border-t-2 border-dashed border-black" />
            </div>

            <div className="pt-1 mb-1.5 text-left text-[10px]">
              <div className="flex justify-between font-bold border-b border-dashed border-black pb-1 mb-1">
                <span>CANT / DESC</span>
                <span>SUB</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {activePrintOrder.items.map((it, idx) => (
                  <li key={idx} className="flex justify-between items-baseline py-0.5">
                    <span className="text-[12px] font-black text-black uppercase tracking-tight">
                      {it.qty}x {it.name}
                    </span>
                    <span className="text-[9px] font-mono text-zinc-600 font-bold">${it.subtotal.toLocaleString("es-AR")}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="border-t border-dashed border-black pt-1.5 flex justify-between font-black text-xs">
              <span>TOTAL PAGADO</span>
              <span>${activePrintOrder.total.toLocaleString("es-AR")}</span>
            </div>
            
            <div className="mt-1 text-[9px] text-zinc-600 text-left">
              Método: {activePrintOrder.paymentMethod.toUpperCase()}
            </div>
            
            <div className="border-t border-dashed border-black mt-2 pt-2 text-[9px] uppercase font-black tracking-wider text-center">
              Presentar en Barra para retirar
            </div>
          </div>
        </div>
      )}

      {/* Print styles block */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide all interactive components in the viewport */
          body > * {
            visibility: hidden !important;
            height: 0 !important;
            overflow: hidden !important;
          }
          #print-receipt, #print-receipt * {
            visibility: visible !important;
          }
          #print-receipt {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 58mm !important;
            margin: 0 !important;
            padding: 12px 14px !important;
            background: white !important;
            color: black !important;
            box-sizing: border-box !important;
            border: 2px solid black !important;
            border-radius: 8px !important;
            overflow: hidden !important;
          }
        }
      `}} />
    </main>
  );
}
