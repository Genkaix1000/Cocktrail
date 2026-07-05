"use client";

import { Sun, Moon } from "lucide-react";
import { useRouter } from "next/navigation";
import { OSHeadbar } from "@/components/shared/OSHeadbar";
import { useMemo, useState, useCallback, useEffect } from "react";
import { useSSE } from "@/lib/useSSE";
import { eventsService } from "@/services/events.service";
import { authService } from "@/services/auth.service";
import { useTheme } from "@/components/ThemeProvider";
import CloseNightModal from "@/components/shared/CloseNightModal";
import { computeTotals } from "@/lib/totals";
import { usePrinterStatus } from "@/hooks/usePrinterStatus";
import VentaSection from "@/components/caja/VentaSection";
import HistorialSection from "@/components/caja/HistorialSection";
import MetricasSection from "@/components/caja/MetricasSection";
import CajaSidebar from "@/components/caja/Sidebar";
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-ink-950">
      <main className="flex-1 flex flex-col md:flex-row relative overflow-hidden h-full">

      {/* Night close modal */}
      {event && closeModalOpen && (
        <CloseNightModal
          totals={totals}
          pendingDeliveries={pendingDeliveries}
          startedAt={event.startedAt}
          summary={summary}
          onConfirm={handleCloseConfirm}
          onClose={handleCloseModalClose}
        />
      )}

      {/* Standard Sidebar - Visible on Desktop */}
      <CajaSidebar
        isDrawer={false}
        theme={theme}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setMobileMenuOpen={setMobileMenuOpen}
        hasPermission={hasPermission}
        currentUser={currentUser}
        event={event}
        setCloseModalOpen={setCloseModalOpen}
        printerStatus={printerStatus}
        testPrint={testPrint}
        printerTestMessage={printerTestMessage}
        handleLogout={handleLogout}
      />

      {/* Mobile Drawer Overlay - Visible on Mobile when opened */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="h-full flex flex-col animate-in slide-in-from-left duration-200">
            <CajaSidebar
              isDrawer
              theme={theme}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              setMobileMenuOpen={setMobileMenuOpen}
              hasPermission={hasPermission}
              currentUser={currentUser}
              event={event}
              setCloseModalOpen={setCloseModalOpen}
              printerStatus={printerStatus}
              testPrint={testPrint}
              printerTestMessage={printerTestMessage}
              handleLogout={handleLogout}
            />
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
