"use client";

import { Power, Printer, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useEventState } from "@/hooks/useEventState";
import { eventsService } from "@/services/events.service";
import { authService } from "@/services/auth.service";
import CloseNightModal from "@/components/shared/CloseNightModal";
import { AppTopbar } from "@/components/shared/AppTopbar";
import { TestNightBanner } from "@/components/shared/TestNightBanner";
import { computeTotals, withLiveMpFees } from "@cocktrail/shared";
import { usePrinterStatus } from "@/hooks/usePrinterStatus";
import { usePosnetStatus } from "@/hooks/usePosnetStatus";
import VentaSection from "@/components/caja/VentaSection";
import HistorialSection from "@/components/caja/HistorialSection";
import MetricasSection from "@/components/caja/MetricasSection";
import CajaSidebar from "@/components/caja/Sidebar";
import { HelpCenterProvider } from "@/components/help/HelpCenterProvider";
import { hasNativeBleBridge } from "@/lib/printing/transports/native-ble-s1";
import type { Drink, DrinkCategory } from "@cocktrail/shared";

const PRINTER_PROMPT_SEEN_KEY = "cocktrail:printer-prompt-seen";

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
  categories: DrinkCategory[];
  currentUser: CurrentUser;
  onReloadCarta?: () => Promise<void>;
};

export default function CajaClient({ drinks, categories, currentUser, onReloadCarta }: Props) {
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

  const {
    printerStatus,
    testPrint,
    printerTestMessage,
    reprintTicket,
    printTicket,
    pairPrinterDevice,
    connectPrinter,
    reconnecting,
    printerPaired,
    printError,
    reprinting,
  } = usePrinterStatus();

  const { posnetHealth, posnetLevel, posnetMessage } = usePosnetStatus();
  const ventaPrinter = useMemo(
    () => ({ reprintTicket, printTicket, printError, reprinting }),
    [reprintTicket, printTicket, printError, reprinting],
  );

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [printerPromptOpen, setPrinterPromptOpen] = useState(false);
  const [pairingPrinter, setPairingPrinter] = useState(false);
  const [autoPairSeconds, setAutoPairSeconds] = useState(3);

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

  const { event, orders, summary, serverTotals, setSummary, upsertOrder } = useEventState({
    onEventClosed: () => setCloseModalOpen(true),
  });

  // Aviso tipo onboarding si la caja abre sin impresora vinculada.
  // No pelear con el tour (?): si el tour está por salir, igual el modal de
  // impresora tiene prioridad y el error de pair tiene que verse.
  useEffect(() => {
    if (event?.status !== "activo") return;
    if (printerStatus === null) return; // todavía no sabemos
    if (printerPaired || printerStatus.connected) {
      setPrinterPromptOpen(false);
      return;
    }
    try {
      if (localStorage.getItem(PRINTER_PROMPT_SEEN_KEY)) return;
    } catch {
      /* private mode */
    }
    setPrinterPromptOpen(true);
  }, [event?.status, printerStatus, printerPaired]);

  function dismissPrinterPrompt() {
    setPrinterPromptOpen(false);
    try {
      localStorage.setItem(PRINTER_PROMPT_SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
  }

  function handlePairPrinterFromPrompt() {
    // pair() tiene que arrancar en el mismo turno del toque (Web Bluetooth).
    // setState de “Vinculando…” va DESPUÉS de disparar el promise.
    const pairing = pairPrinterDevice();
    setPairingPrinter(true);
    void pairing.finally(() => setPairingPrinter(false));
  }

  // Solo el APK puede escanear sin gesto del navegador. En la web el botón
  // sigue siendo obligatorio porque Web Bluetooth bloquea el selector automático.
  useEffect(() => {
    if (!printerPromptOpen || pairingPrinter || !hasNativeBleBridge()) return;
    setAutoPairSeconds(3);
    const countdown = window.setInterval(() => {
      setAutoPairSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1_000);
    const startPairing = window.setTimeout(() => {
      setPairingPrinter(true);
      void pairPrinterDevice().finally(() => setPairingPrinter(false));
    }, 3_000);
    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(startPairing);
    };
  }, [printerPromptOpen, pairingPrinter, pairPrinterDevice]);

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

  const totals = useMemo(
    () => withLiveMpFees(computeTotals(activeNightOrders), serverTotals),
    [activeNightOrders, serverTotals],
  );

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
    pairPrinterDevice,
    connectPrinter,
    reconnecting,
    printerPaired,
    printerTestMessage,
    posnetLevel,
    posnetMessage,
    hasLinkedDevice: posnetHealth?.hasLinkedDevice ?? null,
    handleLogout,
  } as const;

  const cajaHelpConfig = useMemo(
    () => ({
      hasHistorial: hasPermission("historial"),
      hasMetricas: hasPermission("metricas"),
      canCloseNight: Boolean(currentUser.permissions?.closeNight),
      hasLinkedDevice: posnetHealth?.hasLinkedDevice ?? null,
      onEnsureSidebarExpanded: () => setIsSidebarCollapsed(false),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hasPermission is stable per render
    [currentUser.permissions, posnetHealth?.hasLinkedDevice],
  );

  return (
    <HelpCenterProvider
      role="caja"
      onNavigateTab={(tab) => setActiveTab(tab as typeof activeTab)}
      enabled={event?.status === "activo"}
      cajaConfig={cajaHelpConfig}
    >
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-app)]">
        <main className="flex-1 flex flex-col md:flex-row relative overflow-hidden h-full md:p-3 md:gap-4">
        {((event && closeModalOpen) || summary) && (
          <CloseNightModal
            totals={totals}
            pendingDeliveries={pendingDeliveries}
            startedAt={event?.startedAt ?? summary?.startedAt ?? 0}
            summary={summary}
            isTest={event?.isTest ?? false}
            onConfirm={handleCloseConfirm}
            onClose={handleCloseModalClose}
          />
        )}

        {printerPromptOpen && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div
              role="dialog"
              aria-labelledby="printer-prompt-title"
              className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[24px] p-6 shadow-card animate-in fade-in zoom-in-95 duration-200 flex flex-col gap-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="w-14 h-14 rounded-2xl bg-amber-soft border border-amber-line text-amber flex items-center justify-center shrink-0">
                  <Printer size={26} strokeWidth={2.2} />
                </div>
                <button
                  type="button"
                  onClick={dismissPrinterPrompt}
                  className="p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] cursor-pointer"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
              <div>
                <h2 id="printer-prompt-title" className="text-xl font-black text-[var(--text-primary)] tracking-tight">
                  No hay impresora
                </h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                  Los tickets no se van a imprimir hasta que vincules una. Podés hacerlo ahora o más tarde desde el menú.
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (pairingPrinter) return;
                    handlePairPrinterFromPrompt();
                  }}
                  disabled={pairingPrinter}
                  className="w-full h-12 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                  <Printer size={16} />
                  {pairingPrinter ? "Vinculando…" : "Vincular impresora"}
                </button>
                {!pairingPrinter && hasNativeBleBridge() && (
                  <p className="text-xs text-[var(--text-secondary)] text-center">
                    Buscaremos una impresora automáticamente en {autoPairSeconds} s.
                  </p>
                )}
                {printerTestMessage && (
                  <p className="text-xs text-[var(--danger-base)] text-center leading-snug">
                    {printerTestMessage}
                  </p>
                )}
                <button
                  type="button"
                  onClick={dismissPrinterPrompt}
                  className="w-full h-11 rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] font-semibold text-sm cursor-pointer transition-colors"
                >
                  Ahora no
                </button>
              </div>
            </div>
          </div>
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
            {event?.isTest && <TestNightBanner />}
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
                    <VentaSection
                      drinks={drinks}
                      categories={categories}
                      printer={ventaPrinter}
                      orders={activeNightOrders}
                      onReloadCarta={onReloadCarta}
                      isTestNight={event.isTest === true}
                      hasLinkedDevice={posnetHealth?.hasLinkedDevice ?? null}
                    />
                  </div>

                  <div
                    data-tour="caja-historial"
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
                    data-tour="caja-metricas"
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
    </HelpCenterProvider>
  );
}
