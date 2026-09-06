"use client";

import {
  History,
  LayoutDashboard,
  Wine,
  CreditCard,
  Users,
  FileText,
  CloudDownload,
  ChevronLeft,
  ChevronRight,
  Power,
  ShoppingBag,
  Printer,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";

import CloseNightModal from "@/components/shared/CloseNightModal";
import OpenNightModal from "@/components/admin/OpenNightModal";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { useTheme } from "@/components/ThemeProvider";
import { AppTopbar } from "@/components/shared/AppTopbar";
import { PrinterTopbarButton } from "@/components/shared/PrinterTopbarButton";
import { NightActionCard } from "@/components/shared/NightActionCard";
import { LogoutNavRail } from "@/components/shared/LogoutNavRail";
import { HelpCenterProvider } from "@/components/help/HelpCenterProvider";

import { computeTotals, withLiveMpFees } from "@cocktrail/shared";
import { useEventState } from "@/hooks/useEventState";
import { usePrinterStatus } from "@/hooks/usePrinterStatus";
import { usePosnetStatus } from "@/hooks/usePosnetStatus";
import { hasNativeBleBridge } from "@/lib/printing/transports/native-ble-s1";

import { eventsService } from "@/services/events.service";
import { authService } from "@/services/auth.service";
import { drinksService } from "@/services/drinks.service";
import { drinkCategoriesService } from "@/services/drink-categories.service";

import CartaSection from "@/components/settings/CartaSection";
import PagosSection from "@/components/settings/PagosSection";
import PdvSection from "@/components/settings/PdvSection";
import UsuariosSection from "@/components/settings/UsuariosSection";
import SistemaSection from "@/components/settings/SistemaSection";
import VentaSection from "@/components/caja/VentaSection";

import DashboardSection from "@/components/admin/DashboardSection";
import { MpFallbackBanner } from "@/components/admin/MpFallbackBanner";
import { TestNightBanner } from "@/components/shared/TestNightBanner";
import HistorialSection from "@/components/admin/HistorialSection";
import LogsSection from "@/components/admin/LogsSection";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { formatHm } from "@/lib/utils";

import type {
  Drink,
  DrinkCategory,
  EventSummary,
  EventTotals,
  NightEvent,
  Order,
  Role,
} from "@cocktrail/shared";

const PRINTER_PROMPT_SEEN_KEY = "cocktrail:printer-prompt-seen";

type Props = {
  initialEvent: NightEvent | null;
  initialOrders: Order[];
  initialTotals?: EventTotals | null;
  currentUser: { role: Role; username: string; isSuperadmin?: boolean };
};

const EMPTY_TOTALS: EventTotals = {
  webTotal: 0,
  webCount: 0,
  efectivoTotal: 0,
  efectivoCount: 0,
  qrTotal: 0,
  qrCount: 0,
  debitoTotal: 0,
  debitoCount: 0,
  drinksSold: [],
  total: 0,
};

type NavItem = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  onClick?: () => void;
};

export default function AdminClient({
  initialEvent,
  initialOrders,
  initialTotals = null,
  currentUser,
}: Props) {
  const router = useRouter();
  const { theme } = useTheme();

  const [modalOpen, setModalOpen] = useState(false);
  const [editKeywordOpen, setEditKeywordOpen] = useState(false);
  const [openNightOpen, setOpenNightOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<string>("monitoreo");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin_sidebar_collapsed") === "true";
  });

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("admin_sidebar_collapsed", String(next));
      return next;
    });
    setConfirmLogout(false);
  }

  const [historyEvents, setHistoryEvents] = useState<EventSummary[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const [logsFilterTimestamp, setLogsFilterTimestamp] = useState<number | null>(null);

  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [isTabTransitioning, setIsTabTransitioning] = useState(false);

  const [ventaDrinks, setVentaDrinks] = useState<Drink[]>([]);
  const [ventaCategories, setVentaCategories] = useState<DrinkCategory[]>([]);
  const [ventaCartaLoaded, setVentaCartaLoaded] = useState(false);
  const [printerPromptOpen, setPrinterPromptOpen] = useState(false);
  const [pairingPrinter, setPairingPrinter] = useState(false);
  const [autoPairSeconds, setAutoPairSeconds] = useState(3);

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
  const { posnetHealth } = usePosnetStatus();
  const ventaPrinter = useMemo(
    () => ({ reprintTicket, printTicket, printError, reprinting }),
    [reprintTicket, printTicket, printError, reprinting],
  );

  const loadVentaCarta = async () => {
    const [drinks, categories] = await Promise.all([
      drinksService.list(),
      drinkCategoriesService.list(),
    ]);
    setVentaDrinks(drinks);
    setVentaCategories(categories);
    setVentaCartaLoaded(true);
  };

  useEffect(() => {
    if (activeTab !== "venta" || ventaCartaLoaded) return;
    loadVentaCarta().catch(() => {});
  }, [activeTab, ventaCartaLoaded]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFirstLoad(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const { event, orders, summary, serverTotals, setEvent, setSummary } = useEventState({
    initial: { event: initialEvent, orders: initialOrders, totals: initialTotals },
    onEventClosed: () => {
      setModalOpen(true);
      setHistoryLoaded(false);
    },
  });

  const isVentaTab = activeTab === "venta";
  const isNightOpenForVenta = event?.status === "activo";

  // Mismo onboarding de impresora que caja (noche abierta + sin vincular).
  useEffect(() => {
    if (!isNightOpenForVenta) {
      setPrinterPromptOpen(false);
      return;
    }
    if (printerStatus === null) return;
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
  }, [isNightOpenForVenta, printerStatus, printerPaired]);

  function dismissPrinterPrompt() {
    setPrinterPromptOpen(false);
    try {
      localStorage.setItem(PRINTER_PROMPT_SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
  }

  function handlePairPrinterFromPrompt() {
    const pairing = pairPrinterDevice();
    setPairingPrinter(true);
    void pairing.finally(() => setPairingPrinter(false));
  }

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
    if (!event) return [];
    return orders.filter((o) => o.createdAt >= event.startedAt);
  }, [orders, event]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "pagos") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveTab("pdv");
      } else if (tab) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveTab(tab);
      }
    }
  }, []);

  useEffect(() => {
    if (historyLoaded) return;
    eventsService
      .getHistory()
      .then((data) => {
        setHistoryEvents((data || []).filter((e) => e.totals.total > 0));
        setHistoryLoaded(true);
      })
      .catch(() => {});
  }, [historyLoaded]);

  const handleTabChange = (tab: string) => {
    const needsSkeleton =
      (tab === "monitoreo" && isFirstLoad) ||
      (tab === "historial" && !historyLoaded);

    if (needsSkeleton) {
      setIsTabTransitioning(true);
      setTimeout(() => {
        setIsTabTransitioning(false);
      }, 250);
    }

    setActiveTab(tab);
    setMobileMenuOpen(false);
    setConfirmLogout(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.pushState({}, "", url.toString());
    }
  };

  const onRedirectToLogs = (ts: number) => {
    setLogsFilterTimestamp(ts);
    handleTabChange("logs");
  };

  const totals = useMemo(
    () => withLiveMpFees(computeTotals(orders), serverTotals),
    [orders, serverTotals],
  );

  const isNightOpen = event?.status === "activo";
  const lastNight = historyEvents[0] ?? null;
  const dashboardTotals = useMemo(
    () => (isNightOpen ? totals : lastNight?.totals ?? EMPTY_TOTALS),
    [isNightOpen, totals, lastNight],
  );
  const dashboardOrders = isNightOpen ? orders : lastNight?.orders ?? [];
  const dashboardStartedAt = isNightOpen ? event?.startedAt : lastNight?.startedAt;

  const customPaymentBreakdown = useMemo(() => {
    const effectiveEfectivo = dashboardTotals.efectivoTotal;
    const effectiveQR = dashboardTotals.qrTotal;
    const effectiveDebito = dashboardTotals.debitoTotal;
    const total = dashboardTotals.total;

    const breakdown = [
      {
        method: "efectivo",
        label: "Efectivo",
        total: effectiveEfectivo,
        count: dashboardTotals.efectivoCount,
        pct: total > 0 ? Math.round((effectiveEfectivo / total) * 100) : 0,
        color: "#10b981",
      },
      {
        method: "qr",
        label: "QR",
        total: effectiveQR,
        count: dashboardTotals.qrCount,
        pct: total > 0 ? Math.round((effectiveQR / total) * 100) : 0,
        color: "#a855f7",
      },
      {
        method: "debito",
        label: "Tarjeta",
        total: effectiveDebito,
        count: dashboardTotals.debitoCount,
        pct: total > 0 ? Math.round((effectiveDebito / total) * 100) : 0,
        color: "#3b82f6",
      },
    ];

    return total > 0 ? breakdown.filter((b) => b.total > 0) : breakdown;
  }, [dashboardTotals]);

  async function handleCloseConfirm(password: string) {
    const data = await eventsService.closeEvent(password);
    setSummary(data);
  }

  function handleModalClose() {
    setModalOpen(false);
    if (summary) {
      setSummary(null);
      router.refresh();
    }
  }

  async function logout() {
    try {
      await authService.logout();
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const analytics = useAdminAnalytics(
    dashboardTotals,
    dashboardStartedAt,
    dashboardOrders,
    historyEvents,
  );

  const breadcrumbs = useMemo(() => {
    switch (activeTab) {
      case "monitoreo":
        return ["Administración", "Dashboard"];
      case "venta":
        return ["Administración", "Nueva Venta"];
      case "historial":
        return ["Administración", "Historial de Noches"];
      case "logs":
        return ["Administración", "Auditoría de Tickets"];
      case "carta":
        return ["Administración", "Carta"];
      case "pagos":
      case "pdv":
        return ["Administración", "Pagos"];
      case "usuarios":
        return ["Administración", "Gestión de Staff"];
      case "sistema":
        return ["Administración", "Sistema"];
      default:
        return ["Administración"];
    }
  }, [activeTab]);

  const isBosko = theme === "bosko";

  const nightSubtitle = event?.startedAt ? `Desde ${formatHm(event.startedAt)} hs` : undefined;

  const menuItems: NavItem[] = [
    { id: "monitoreo", label: "Dashboard", icon: LayoutDashboard },
    { id: "venta", label: "Nueva Venta", icon: ShoppingBag },
    { id: "historial", label: "Historial de Noches", icon: History },
    {
      id: "logs",
      label: "Auditoría de Tickets",
      icon: FileText,
      onClick: () => {
        setLogsFilterTimestamp(null);
        handleTabChange("logs");
      },
    },
  ];

  const configItems: NavItem[] = [
    { id: "carta", label: "Carta", icon: Wine },
    { id: "usuarios", label: "Gestión de Staff", icon: Users },
    { id: "pdv", label: "Pagos", icon: CreditCard },
  ];

  const isPagosTab = activeTab === "pdv" || activeTab === "pagos";

  const navBtnClass = (tab: string, activeOverride?: boolean) => {
    const active = activeOverride ?? (tab === "pdv" ? isPagosTab : activeTab === tab);
    return active
      ? "relative text-[var(--accent-text)] font-semibold before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-[5px] before:rounded-r-[6px] before:bg-[var(--accent-primary)]"
      : "text-[var(--text-tertiary)] font-normal hover:text-[var(--text-secondary)]";
  };

  function renderNavButton(item: NavItem, collapsed: boolean) {
    const Icon = item.icon;
    const active = item.id === "pdv" ? isPagosTab : activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        data-tour-nav={item.id}
        title={collapsed ? item.label : undefined}
        onClick={() => (item.onClick ? item.onClick() : handleTabChange(item.id))}
        className={`w-full flex items-center text-left transition-colors duration-150 cursor-pointer bg-transparent ${
          collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 pl-4 pr-3 py-1.5"
        } ${navBtnClass(item.id)}`}
      >
        <Icon
          size={17}
          strokeWidth={active ? 2.1 : 1.75}
          className={active ? "text-[var(--accent-primary)] shrink-0" : "text-[var(--text-tertiary)] shrink-0"}
        />
        {!collapsed && <span className="text-[13.5px] truncate">{item.label}</span>}
      </button>
    );
  }

  const sectionLabelClass =
    "px-4 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--text-tertiary)] mb-0.5";

  const renderSidebar = (isDrawer = false) => {
    const collapsed = sidebarCollapsed && !isDrawer;

    return (
      <aside
        data-tour="sidebar"
        className={`
          shrink-0 flex flex-col print:hidden relative overflow-hidden
          bg-[var(--bg-panel)] text-[var(--text-primary)]
          rounded-[24px] shadow-card transition-[width] duration-300 ease-in-out
          ${collapsed ? "w-[76px]" : "w-[260px]"}
          ${isDrawer ? "h-full" : "h-full hidden md:flex"}
        `}
      >
        <div
          className={`flex items-center shrink-0 w-full pt-4 pb-2 ${
            collapsed ? "justify-center px-2" : "justify-between px-4"
          }`}
        >
          {collapsed ? (
            <button
              data-tour-nav="collapse"
              type="button"
              onClick={toggleSidebarCollapsed}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--accent-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
              title="Expandir menú"
              aria-label="Expandir menú"
            >
              <ChevronRight size={18} strokeWidth={2} />
            </button>
          ) : (
            <>
              <BrandLogo size="md" />
              <button
                data-tour-nav="collapse"
                type="button"
                onClick={toggleSidebarCollapsed}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer"
                title="Colapsar menú"
                aria-label="Colapsar menú"
              >
                <ChevronLeft size={16} />
              </button>
            </>
          )}
        </div>

        <div
          className={`flex-1 overflow-y-auto flex flex-col no-scrollbar pt-2 ${
            collapsed ? "gap-2 px-1 pb-[88px]" : "gap-4 pb-[180px]"
          }`}
        >
          <div className="flex flex-col">
            {!collapsed && <p className={sectionLabelClass}>Menú</p>}
            {menuItems.map((item) => renderNavButton(item, collapsed))}
          </div>

          <div className="flex flex-col">
            {!collapsed && <p className={sectionLabelClass}>Configuración</p>}
            {configItems.map((item) => renderNavButton(item, collapsed))}
          </div>

          <div className="flex flex-col">
            {!collapsed && <p className={sectionLabelClass}>General</p>}
            {renderNavButton({ id: "sistema", label: "Sistema", icon: CloudDownload }, collapsed)}

            <LogoutNavRail
              collapsed={collapsed}
              confirm={confirmLogout}
              onAsk={() => setConfirmLogout(true)}
              onCancel={() => setConfirmLogout(false)}
              onConfirm={logout}
            />
          </div>
        </div>

        <div
          className={`absolute bottom-0 left-0 right-0 z-20 pointer-events-none ${
            collapsed ? "p-2 pb-4" : "px-3 pt-3 pb-5"
          }`}
        >
          <div className="pointer-events-auto">
            {collapsed ? (
              <button
                type="button"
                title={isNightOpen ? "Cerrar noche" : "Abrir noche"}
                onClick={() => {
                  if (isNightOpen) setModalOpen(true);
                  else setOpenNightOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full h-11 rounded-xl bg-[var(--accent-primary)] text-white flex items-center justify-center cursor-pointer hover:bg-[var(--accent-primary-hover)] transition-colors"
              >
                <Power size={16} strokeWidth={2} />
              </button>
            ) : (
              <NightActionCard
                nightOpen={isNightOpen}
                subtitle={nightSubtitle}
                onCloseNight={() => {
                  setModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                onOpenNight={() => {
                  setOpenNightOpen(true);
                  setMobileMenuOpen(false);
                }}
                onEditKeyword={
                  isNightOpen
                    ? () => {
                        setEditKeywordOpen(true);
                        setMobileMenuOpen(false);
                      }
                    : undefined
                }
              />
            )}
          </div>
        </div>
      </aside>
    );
  };

  return (
    <HelpCenterProvider role="admin" onNavigateTab={handleTabChange} adminNightConfig={{ hasActiveNight: isNightOpen }}>
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-app)]">
      <main className="flex-1 flex flex-col md:flex-row relative overflow-hidden h-full md:p-3 md:gap-4">
        {editKeywordOpen && event && (
          <OpenNightModal
            mode="edit"
            onClose={() => setEditKeywordOpen(false)}
            onSubmit={(ev) => setEvent(ev)}
            currentKeyword={event.keyword}
          />
        )}
        {((modalOpen && event) || summary) && (
          <CloseNightModal
            totals={totals}
            startedAt={event?.startedAt ?? summary?.startedAt ?? 0}
            summary={summary}
            isTest={event?.isTest ?? false}
            onConfirm={handleCloseConfirm}
            onClose={handleModalClose}
          />
        )}
        {openNightOpen && (
          <OpenNightModal
            mode="open"
            onClose={() => setOpenNightOpen(false)}
            onSubmit={(ev) => {
              setEvent(ev);
              setOpenNightOpen(false);
            }}
          />
        )}

        {printerPromptOpen && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div
              role="dialog"
              aria-labelledby="admin-printer-prompt-title"
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
                <h2
                  id="admin-printer-prompt-title"
                  className="text-xl font-black text-[var(--text-primary)] tracking-tight"
                >
                  No hay impresora
                </h2>
                <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                  Los tickets no se van a imprimir hasta que vincules una. Podés hacerlo ahora o más
                  tarde desde el botón del topbar.
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

        {renderSidebar(false)}

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[280px] h-full flex flex-col animate-in slide-in-from-left duration-200">
              {renderSidebar(true)}
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Scroll único: topbar separado visualmente + contenido; no sticky.
            En Nueva Venta el panel llena alto como en caja (sin padding interno). */}
        <div
          className={`flex-1 min-w-0 min-h-0 flex flex-col ${
            isVentaTab ? "overflow-hidden" : "overflow-y-auto bosko-scroll"
          }`}
        >
          <div
            className={`flex flex-col gap-3 md:gap-4 p-3 md:p-0 ${
              isVentaTab ? "min-h-0 flex-1" : "min-h-full"
            }`}
          >
            <header className="h-14 md:h-16 px-4 md:px-5 shrink-0 print:hidden flex items-center gap-3 bg-[var(--bg-panel)] md:rounded-[20px] shadow-card">
              <AppTopbar
                breadcrumbs={breadcrumbs}
                username={currentUser.username}
                role={currentUser.role}
                onMenuClick={() => setMobileMenuOpen(true)}
                trailing={
                  <PrinterTopbarButton
                    printerStatus={printerStatus}
                    printerPaired={printerPaired}
                    reconnecting={reconnecting}
                    printerTestMessage={printerTestMessage}
                    onTestPrint={() => void testPrint()}
                    onConnect={() => void connectPrinter()}
                    onPair={() => void pairPrinterDevice()}
                  />
                }
              />
              {isVentaTab && event?.status === "activo" && event.keyword && (
                <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-surface)] border border-[var(--accent-line)] rounded-full text-[11px] font-mono font-semibold text-[var(--accent-text)] select-all shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                  Clave: {event.keyword}
                </div>
              )}
            </header>

            <div
              className={
                isVentaTab
                  ? "flex-1 min-h-0 overflow-hidden bg-[var(--bg-panel)] md:rounded-[24px] shadow-card"
                  : "flex-1 bg-[var(--bg-panel)] md:rounded-[24px] shadow-card p-5 md:p-6"
              }
            >
              {!isVentaTab && <MpFallbackBanner />}
              {!isVentaTab && event?.isTest && <TestNightBanner />}

              {activeTab === "monitoreo" && (
                <DashboardSection
                  analytics={analytics}
                  totals={dashboardTotals}
                  historyEvents={historyEvents}
                  customPaymentBreakdown={customPaymentBreakdown}
                  isFirstLoad={isFirstLoad}
                  isTabTransitioning={isTabTransitioning}
                  activeTab={activeTab}
                  isNightOpen={isNightOpen}
                  onGoToPagos={() => setActiveTab("pdv")}
                />
              )}

              {isVentaTab &&
                (!event || event.status === "cerrado" ? (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-300">
                    <div className="w-20 h-20 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-card flex items-center justify-center text-[var(--text-tertiary)] mb-6">
                      <Power size={36} className="text-[var(--text-secondary)]" />
                    </div>
                    <h2 className="text-[28px] md:text-[32px] font-bold text-[var(--text-primary)] tracking-tight mb-2">
                      Caja Cerrada
                    </h2>
                    <p className="text-[var(--text-secondary)] text-sm max-w-sm leading-relaxed">
                      No hay ninguna noche activa en el sistema. Para empezar a cobrar, es necesario
                      iniciar una nueva jornada.
                    </p>
                  </div>
                ) : (
                  <div className="h-full flex overflow-hidden min-h-0 w-full">
                    <VentaSection
                      drinks={ventaDrinks}
                      categories={ventaCategories}
                      orders={activeNightOrders}
                      printer={ventaPrinter}
                      onReloadCarta={loadVentaCarta}
                      isTestNight={event.isTest === true}
                      hasLinkedDevice={posnetHealth?.hasLinkedDevice ?? null}
                    />
                  </div>
                ))}

              {activeTab === "historial" && (
                <HistorialSection
                  analytics={analytics}
                  historyEvents={historyEvents}
                  historyLoaded={historyLoaded}
                  isTabTransitioning={isTabTransitioning}
                  isBosko={isBosko}
                  role={currentUser.role}
                  onNightDeleted={() => setHistoryLoaded(false)}
                  onRedirectToLogs={onRedirectToLogs}
                />
              )}

              {activeTab === "logs" && (
                <LogsSection
                  initialFilterTimestamp={logsFilterTimestamp}
                  isBosko={isBosko}
                />
              )}

              {activeTab === "carta" && (
                <div key="carta" className="animate-dashboard-in">
                  <CartaSection />
                </div>
              )}

              {isPagosTab && (
                <div key="pagos" className="animate-dashboard-in">
                  <PagosSection>
                    <PdvSection />
                  </PagosSection>
                </div>
              )}

              {activeTab === "usuarios" && (
                <div key="usuarios" className="animate-dashboard-in">
                  <UsuariosSection />
                </div>
              )}

              {activeTab === "sistema" && (
                <div key="sistema" className="animate-dashboard-in">
                  <SistemaSection />
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
    </HelpCenterProvider>
  );
}
