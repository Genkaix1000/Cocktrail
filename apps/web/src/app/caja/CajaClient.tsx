"use client";

import {
  History,
  LayoutDashboard,
  Power,
  Printer,
  Sun,
  Moon,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { OSHeadbar, OSProfileFooter } from "@/components/OSHeadbar";
import { useMemo, useState, useCallback, useEffect } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { useSSE } from "@/lib/useSSE";
import { eventsService } from "@/services/events.service";
import { authService } from "@/services/auth.service";
import { useTheme } from "@/components/ThemeProvider";
import CloseNightModal from "@/components/CloseNightModal";
import { computeTotals } from "@/lib/totals";
import { usePrinterStatus } from "@/hooks/usePrinterStatus";
import VentaSection from "@/components/caja/VentaSection";
import HistorialSection from "@/components/caja/HistorialSection";
import MetricasSection from "@/components/caja/MetricasSection";
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

export default function CajaClient({ drinks }: Props) {
  const router = useRouter();
  const { theme, isDark, toggleDark } = useTheme();

  // Navigation tabs state
  const [activeTab, setActiveTab] = useState<"venta" | "historial" | "metricas">("venta");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Authenticated user state
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Estado de la impresora térmica: compartido entre el sidebar, VentaSection
  // (ticket de éxito) y el popup de detalle de HistorialSection (reimpresión).
  const { printerStatus, testPrint, printerTestMessage, reprintTicket, printError, reprinting } = usePrinterStatus();
  const ventaPrinter = useMemo(
    () => ({ reprintTicket, printError, reprinting }),
    [reprintTicket, printError, reprinting],
  );

  // Data states
  const [orders, setOrders] = useState<Order[]>([]);
  const [cashSales, setCashSales] = useState<CashSale[]>([]);
  const [event, setEvent] = useState<NightEvent | null>(null);

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

  const handleOrderUpdated = useCallback((updated: Order) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }, []);

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
            <HistorialSection
              orders={activeNightOrders}
              currentUser={currentUser}
              printer={ventaPrinter}
              onOrderUpdated={handleOrderUpdated}
            />
          </div>

          {/* TAB 3: METRICAS */}
          <div className={activeTab === "metricas" ? "flex-1 overflow-y-auto p-5 md:p-6 bg-ink-950 min-h-0 w-full animate-in fade-in duration-200" : "hidden"}>
            <MetricasSection
              event={event}
              activeNightOrders={activeNightOrders}
              activeNightCashSales={activeNightCashSales}
              totals={totals}
            />
          </div>

        </div>
      </div>

    </main>
    </div>
  );
}
