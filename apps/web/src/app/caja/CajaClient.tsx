"use client";

import {
  History,
  LogOut,
  Printer,
  LayoutDashboard,
  Power,
  TrendingUp,
  Sun,
  Moon,
  FileText,
  Search,
  Loader2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { OSHeadbar, OSProfileFooter } from "@/components/OSHeadbar";
import { useMemo, useState, useCallback, useEffect } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { useSSE } from "@/lib/useSSE";
import { eventsService } from "@/services/events.service";
import { ordersService } from "@/services/orders.service";
import { authService } from "@/services/auth.service";
import { useTheme } from "@/components/ThemeProvider";
import CloseNightModal from "@/components/CloseNightModal";
import { computeTotals } from "@/lib/totals";
import { usePrinterStatus } from "@/hooks/usePrinterStatus";
import VentaSection from "@/components/caja/VentaSection";
import type { Drink, Order, NightEvent, CashSale, EventSummary } from "@cocktrail/shared";

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

const mapStatus = (status: Order["status"]) => {
  switch (status) {
    case "pendiente":
      return { label: "Pendiente", color: "bg-amber-500/10 text-amber-400 border border-amber-500/20" };
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

  // Authenticated user state
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Estado de la impresora térmica: compartido entre el sidebar, VentaSection
  // (ticket de éxito) y el popup de detalle de Historial (reimpresión).
  const { printerStatus, testPrint, printerTestMessage, reprintTicket, printError, reprinting } = usePrinterStatus();
  const ventaPrinter = useMemo(
    () => ({ reprintTicket, printError, reprinting }),
    [reprintTicket, printError, reprinting],
  );

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedDay(days[0]);
    }
  }, [days, selectedDay]);

  // Reset scroll page limit on day change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    () => activeNightOrders.filter((o) => o.status === "pendiente").length,
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
            <VentaSection drinks={drinks} printer={ventaPrinter} />
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
