"use client";

import { Power } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useEventState } from "@/hooks/useEventState";
import { eventsService } from "@/services/events.service";
import { authService } from "@/services/auth.service";
import CloseNightModal from "@/components/shared/CloseNightModal";
import { AppTopbar } from "@/components/shared/AppTopbar";
import { computeTotals } from "@cocktrail/shared";
import { usePrinterStatus } from "@/hooks/usePrinterStatus";
import { usePosnetStatus } from "@/hooks/usePosnetStatus";
import VentaSection from "@/components/caja/VentaSection";
import HistorialSection from "@/components/caja/HistorialSection";
import MetricasSection from "@/components/caja/MetricasSection";
import CajaSidebar from "@/components/caja/Sidebar";
import type { Drink } from "@cocktrail/shared";

type CurrentUser = {
  role: string;
  username: string;
  permissions: {
    closeNight: boolean;
    cancelarTickets: boolean;
    historial: boolean;
    metricas: boolean;
  };
};

type Props = {
  drinks: Drink[];
  currentUser: CurrentUser;
};

export default function CajaClient({ drinks, currentUser }: Props) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"venta" | "historial" | "metricas">("venta");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const { printerStatus, testPrint, printerTestMessage, reprintTicket, printError, reprinting } =
    usePrinterStatus();

  const { posnetLevel, posnetMessage, testPosnet, posnetTestMessage, testingPosnet } =
    usePosnetStatus();
  const ventaPrinter = useMemo(
    () => ({ reprintTicket, printError, reprinting }),
    [reprintTicket, printError, reprinting],
  );

  const [closeModalOpen, setCloseModalOpen] = useState(false);

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

  const { event, orders, summary, setSummary, upsertOrder } = useEventState({
    onEventClosed: () => setCloseModalOpen(true),
  });

  const activeNightOrders = useMemo(() => {
    if (!event) return orders;
    return orders.filter((o) => o.createdAt >= event.startedAt);
  }, [orders, event]);

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

  const totals = useMemo(() => computeTotals(activeNightOrders), [activeNightOrders]);

  const pendingDeliveries = useMemo(
    () => activeNightOrders.filter((o) => o.status === "pendiente").length,
    [activeNightOrders],
  );

  const hasPermission = (key: keyof CurrentUser["permissions"]) => {
    if (currentUser.role === "admin") return true;
    return !!currentUser.permissions?.[key];
  };

  const breadcrumbs = useMemo(() => {
    switch (activeTab) {
      case "historial":
        return ["Caja", "Historial de Ventas"];
      case "metricas":
        return ["Caja", "Métricas"];
      default:
        return ["Caja", "Nueva Venta"];
    }
  }, [activeTab]);

  const sidebarProps = {
    activeTab,
    setActiveTab,
    setMobileMenuOpen,
    hasPermission,
    currentUser,
    event,
    setCloseModalOpen,
    printerStatus,
    testPrint,
    printerTestMessage,
    posnetLevel,
    posnetMessage,
    testPosnet,
    posnetTestMessage,
    testingPosnet,
    handleLogout,
  } as const;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-app)]">
      <main className="flex-1 flex flex-col md:flex-row relative overflow-hidden h-full md:p-3 md:gap-4">
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

        <CajaSidebar
          isDrawer={false}
          {...sidebarProps}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapse}
        />

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[280px] h-full flex flex-col animate-in slide-in-from-left duration-200">
              <CajaSidebar isDrawer {...sidebarProps} />
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
          <div className="flex flex-col gap-3 md:gap-4 p-3 md:p-0 min-h-0 flex-1">
            <header className="h-14 md:h-16 px-4 md:px-5 shrink-0 print:hidden flex items-center gap-3 bg-[var(--bg-panel)] md:rounded-[20px] shadow-card">
              <AppTopbar
                breadcrumbs={breadcrumbs}
                username={currentUser.username}
                role={currentUser.role}
                onMenuClick={() => setMobileMenuOpen(true)}
              />
              {event?.status === "activo" && event.keyword && (
                <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-surface)] border border-[var(--accent-line)] rounded-full text-[11px] font-mono font-semibold text-[var(--accent-text)] select-all shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                  Clave: {event.keyword}
                </div>
              )}
            </header>

            <div className="flex-1 min-h-0 overflow-hidden bg-[var(--bg-panel)] md:rounded-[24px] shadow-card">
              {!event || event.status === "cerrado" ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-300">
                  <div className="w-20 h-20 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-card flex items-center justify-center text-[var(--text-tertiary)] mb-6">
                    <Power size={36} className="text-[var(--text-secondary)]" />
                  </div>
                  <h2 className="text-[28px] md:text-[32px] font-bold text-[var(--text-primary)] tracking-tight mb-2">
                    Caja Cerrada
                  </h2>
                  <p className="text-[var(--text-secondary)] text-sm max-w-sm mb-8 leading-relaxed">
                    No hay ninguna noche activa en el sistema. Para empezar a cobrar, es necesario
                    iniciar una nueva jornada.
                  </p>

                  <div className="w-full max-w-sm bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-card flex flex-col gap-4 text-left animate-in zoom-in-95 duration-200">
                    <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                      Abrir Caja / Noche
                    </h3>
                    {openNightError && (
                      <div className="bg-[var(--danger-soft)] border border-[var(--danger-line)] text-[var(--danger-base)] rounded-xl px-3 py-2.5 text-xs">
                        {openNightError}
                      </div>
                    )}
                    <form onSubmit={handleOpenNightSubmit} className="flex flex-col gap-3">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                          Palabra Clave (Keyword)
                        </span>
                        <input
                          type="text"
                          required
                          value={openNightKeyword}
                          onChange={(e) => setOpenNightKeyword(e.target.value.toLowerCase())}
                          placeholder="ej: gin, tonic, campari..."
                          className="w-full h-11 bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] rounded-xl px-3 text-sm text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-tertiary)] font-mono"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={openingNight}
                        className="w-full h-11 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all mt-1 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)]"
                      >
                        {openingNight ? "Iniciando..." : "Abrir Noche / Evento"}
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className={
                      activeTab === "venta"
                        ? "h-full flex overflow-hidden min-h-0 w-full"
                        : "hidden"
                    }
                  >
                    <VentaSection drinks={drinks} printer={ventaPrinter} />
                  </div>

                  <div
                    className={
                      activeTab === "historial"
                        ? "h-full overflow-y-auto p-5 md:p-6 bosko-scroll min-h-0 w-full"
                        : "hidden"
                    }
                  >
                    <HistorialSection
                      orders={activeNightOrders}
                      currentUser={currentUser}
                      printer={ventaPrinter}
                      onOrderUpdated={upsertOrder}
                    />
                  </div>

                  <div
                    className={
                      activeTab === "metricas"
                        ? "h-full overflow-y-auto p-5 md:p-6 bosko-scroll min-h-0 w-full animate-in fade-in duration-200"
                        : "hidden"
                    }
                  >
                    <MetricasSection
                      event={event}
                      activeNightOrders={activeNightOrders}
                      totals={totals}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
