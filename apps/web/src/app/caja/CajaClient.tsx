"use client";

import { Sun, Moon, Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { OSHeadbar } from "@/components/shared/OSHeadbar";
import { useMemo, useState, useEffect } from "react";
import { useEventState } from "@/hooks/useEventState";
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
import type { Drink } from "@cocktrail/shared";

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
    openNight: boolean;
  };
};

export default function CajaClient({ drinks }: Props) {
  const router = useRouter();
  const { theme, isDark, toggleDark } = useTheme();

  // Navigation tabs state
  const [activeTab, setActiveTab] = useState<"venta" | "historial" | "metricas">("venta");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Collapsible sidebar state (persists in localStorage)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("isSidebarCollapsed") === "true";
    }
    return false;
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("isSidebarCollapsed", String(next));
      return next;
    });
  };

  // Authenticated user state
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Estado de la impresora térmica: compartido entre el sidebar, VentaSection
  // (ticket de éxito) y el popup de detalle de HistorialSection (reimpresión).
  const { printerStatus, testPrint, printerTestMessage, reprintTicket, printError, reprinting } = usePrinterStatus();
  const ventaPrinter = useMemo(
    () => ({ reprintTicket, printError, reprinting }),
    [reprintTicket, printError, reprinting],
  );

  // Close night modal state
  const [closeModalOpen, setCloseModalOpen] = useState(false);

  // Open night state (Caja cerrada screen)
  const [openNightKeyword, setOpenNightKeyword] = useState("");
  const [openNightError, setOpenNightError] = useState<string | null>(null);
  const [openingNight, setOpeningNight] = useState(false);

  async function handleOpenNightSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!openNightKeyword.trim()) return;
    setOpeningNight(true);
    setOpenNightError(null);
    try {
      await eventsService.openEvent(openNightKeyword.trim());
      router.refresh();
      window.location.reload();
    } catch (err) {
      setOpenNightError(err instanceof Error ? err.message : "Error al abrir la noche");
    } finally {
      setOpeningNight(false);
    }
  }

  const { event, orders, cashSales, summary, setSummary, upsertOrder } = useEventState({
    onEventClosed: () => setCloseModalOpen(true),
  });

  const activeNightOrders = useMemo(() => {
    if (!event) return orders;
    return orders.filter((o) => o.createdAt >= event.startedAt);
  }, [orders, event]);

  const activeNightCashSales = useMemo(() => {
    if (!event) return cashSales;
    return cashSales.filter((c) => c.createdAt >= event.startedAt);
  }, [cashSales, event]);

  // Fetch current user details
  useEffect(() => {
    authService.getMe().then((u) => {
      if (u) setCurrentUser(u as unknown as CurrentUser);
    });
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
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
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

            {event?.status === "activo" && event.keyword && (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-accent/10 border border-accent/25 rounded-full text-[10px] font-mono font-black text-accent select-all ml-4">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                CLAVE: {event.keyword}
              </div>
            )}

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
          {!event || event.status === "cerrado" ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-ink-950 text-center select-none animate-in fade-in duration-300">
              <div className="w-20 h-20 rounded-3xl bg-ink-900 border border-ink-800 flex items-center justify-center text-ink-500 mb-6 shadow-lg animate-pulse">
                <Power size={36} className="text-ink-400" />
              </div>
              <h2 className="text-3xl font-black text-ink-50 tracking-tight mb-2">Caja Cerrada</h2>
              <p className="text-ink-400 text-sm max-w-sm mb-8 leading-relaxed font-serif-italic">
                No hay ninguna noche activa en el sistema. Para empezar a cobrar, es necesario iniciar una nueva jornada.
              </p>

              {/* Show Open Night Form if user has openNight permission or is admin */}
              {currentUser && (currentUser.role === "admin" || currentUser.permissions?.openNight) ? (
                <div className="w-full max-w-sm bg-ink-900 border border-ink-800 rounded-[24px] p-6 shadow-xl flex flex-col gap-4 text-left animate-in zoom-in-95 duration-200">
                  <h3 className="font-bold text-sm text-ink-100 uppercase tracking-wider">Abrir Caja / Noche</h3>
                  {openNightError && (
                    <div className="bg-danger-soft border border-danger-line text-danger rounded-xl px-3 py-2.5 text-xs">
                      {openNightError}
                    </div>
                  )}
                  <form onSubmit={handleOpenNightSubmit} className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-ink-400">Palabra Clave (Keyword)</span>
                      <input
                        type="text"
                        required
                        value={openNightKeyword}
                        onChange={(e) => setOpenNightKeyword(e.target.value.toLowerCase())}
                        placeholder="ej: gin, tonic, campari..."
                        className="w-full h-11 bg-ink-950 border border-ink-800 focus:border-accent rounded-xl px-3 text-sm text-ink-50 outline-none transition-all placeholder:text-ink-600 font-mono"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={openingNight}
                      className="ct-checkout-btn w-full h-11 font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all mt-2"
                    >
                      {openingNight ? "Iniciando..." : "Abrir Noche / Evento"}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="px-5 py-4 bg-ink-900/50 border border-ink-850 rounded-2xl max-w-sm flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse shrink-0" />
                  <p className="text-xs text-ink-400 text-left leading-relaxed">
                    Solo los cajeros autorizados o administradores pueden iniciar la noche. Solicitá asistencia para abrir la caja.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
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
                  onOrderUpdated={upsertOrder}
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
            </>
          )}
        </div>
      </div>

    </main>
    </div>
  );
}
