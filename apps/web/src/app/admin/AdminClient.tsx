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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";

import CloseNightModal from "@/components/shared/CloseNightModal";
import OpenNightModal from "@/components/admin/OpenNightModal";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { useTheme } from "@/components/ThemeProvider";
import { AppTopbar } from "@/components/shared/AppTopbar";
import { NightActionCard } from "@/components/shared/NightActionCard";
import { LogoutNavRail } from "@/components/shared/LogoutNavRail";

import { computeTotals } from "@cocktrail/shared";
import { useEventState } from "@/hooks/useEventState";

import { eventsService } from "@/services/events.service";
import { authService } from "@/services/auth.service";

import CartaSection from "@/components/settings/CartaSection";
import PagosSection from "@/components/settings/PagosSection";
import PdvSection from "@/components/settings/PdvSection";
import UsuariosSection from "@/components/settings/UsuariosSection";
import SistemaSection from "@/components/settings/SistemaSection";

import DashboardSection from "@/components/admin/DashboardSection";
import { MigrationsBanner } from "@/components/admin/MigrationsBanner";
import { MpFallbackBanner } from "@/components/admin/MpFallbackBanner";
import HistorialSection from "@/components/admin/HistorialSection";
import LogsSection from "@/components/admin/LogsSection";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import {
  MOCK_DEMO_TOTALS,
  MOCK_DEMO_ORDERS,
  MOCK_DEMO_HISTORY,
} from "@/lib/mockDashboard";

import type {
  EventSummary,
  EventTotals,
  NightEvent,
  Order,
  Role,
} from "@cocktrail/shared";

type Props = {
  initialEvent: NightEvent | null;
  initialOrders: Order[];
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

  const [currentUser, setCurrentUser] = useState<{ role: Role; username?: string } | null>(null);

  const [historyEvents, setHistoryEvents] = useState<EventSummary[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const [logsFilterTimestamp, setLogsFilterTimestamp] = useState<number | null>(null);

  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [isTabTransitioning, setIsTabTransitioning] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFirstLoad(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const { event, orders, summary, setEvent, setSummary } = useEventState({
    initial: { event: initialEvent, orders: initialOrders },
    onEventClosed: () => {
      setModalOpen(true);
      setHistoryLoaded(false);
    },
  });

  useEffect(() => {
    authService.getMe().then((u) => {
      if (u) setCurrentUser(u);
    });
  }, []);

  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("demo") === "true") {
        setIsDemo(true);
      }
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

  const totals = useMemo(() => computeTotals(orders), [orders]);

  const pendingDeliveries = useMemo(
    () => orders.filter((o) => o.status === "pendiente").length,
    [orders],
  );

  const isNightOpen = event?.status === "activo";
  const effectiveHistoryEvents = useMemo(() => {
    if (isDemo && historyEvents.length === 0) return MOCK_DEMO_HISTORY;
    return historyEvents;
  }, [isDemo, historyEvents]);

  const lastNight = effectiveHistoryEvents[0] ?? null;
  const dashboardTotals = useMemo(
    () => (isDemo ? MOCK_DEMO_TOTALS : isNightOpen ? totals : lastNight?.totals ?? EMPTY_TOTALS),
    [isDemo, isNightOpen, totals, lastNight],
  );
  const dashboardOrders = isDemo ? MOCK_DEMO_ORDERS : isNightOpen ? orders : lastNight?.orders ?? [];
  const dashboardStartedAt = isNightOpen ? event?.startedAt : lastNight?.startedAt;

  const customPaymentBreakdown = useMemo(() => {
    const effectiveEfectivo = dashboardTotals.efectivoTotal;
    const effectiveQR = dashboardTotals.qrTotal;
    const effectiveDebito = dashboardTotals.debitoTotal;
    const effectiveWeb = dashboardTotals.webTotal;

    const breakdown = [
      {
        method: "efectivo",
        label: "Efectivo",
        total: effectiveEfectivo,
        count: dashboardTotals.efectivoCount,
        pct: dashboardTotals.total > 0 ? Math.round((effectiveEfectivo / dashboardTotals.total) * 100) : 0,
        color: "#10b981",
      },
      {
        method: "tarjeta",
        label: "Tarjeta",
        total: effectiveDebito + effectiveWeb,
        count: dashboardTotals.debitoCount + dashboardTotals.webCount,
        pct:
          dashboardTotals.total > 0
            ? Math.round(((effectiveDebito + effectiveWeb) / dashboardTotals.total) * 100)
            : 0,
        color: "#3b82f6",
      },
      {
        method: "qr",
        label: "Transferencia / QR",
        total: effectiveQR,
        count: dashboardTotals.qrCount,
        pct: dashboardTotals.total > 0 ? Math.round((effectiveQR / dashboardTotals.total) * 100) : 0,
        color: "#a855f7",
      },
      {
        method: "otros",
        label: "Otros",
        total: Math.max(
          0,
          dashboardTotals.total - (effectiveEfectivo + effectiveQR + effectiveDebito + effectiveWeb),
        ),
        count: 0,
        pct:
          dashboardTotals.total > 0
            ? Math.max(
                0,
                100 -
                  (Math.round((effectiveEfectivo / dashboardTotals.total) * 100) +
                    Math.round(((effectiveDebito + effectiveWeb) / dashboardTotals.total) * 100) +
                    Math.round((effectiveQR / dashboardTotals.total) * 100)),
              )
            : 0,
        color: "#f97316",
      },
    ];

    return dashboardTotals.total > 0
      ? breakdown.filter((b) => b.total > 0 || b.pct > 0)
      : breakdown;
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
    await authService.logout();
    router.push("/login");
    router.refresh();
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

  const nightSubtitle = event?.startedAt
    ? `Desde ${new Date(event.startedAt).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : undefined;

  const menuItems: NavItem[] = [
    { id: "monitoreo", label: "Dashboard", icon: LayoutDashboard },
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
            {!collapsed && <p className={sectionLabelClass}>Menu</p>}
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
        {modalOpen && event && (
          <CloseNightModal
            totals={totals}
            pendingDeliveries={pendingDeliveries}
            startedAt={event.startedAt}
            summary={summary}
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

        {renderSidebar(false)}

        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[280px] h-full flex flex-col animate-in slide-in-from-left duration-200">
              {renderSidebar(true)}
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* Scroll único: topbar separado visualmente + contenido; no sticky */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto bosko-scroll">
          <div className="flex flex-col gap-3 md:gap-4 p-3 md:p-0 min-h-full">
            <header className="h-14 md:h-16 px-4 md:px-5 shrink-0 print:hidden flex items-center bg-[var(--bg-panel)] md:rounded-[20px] shadow-card">
              <AppTopbar
                breadcrumbs={breadcrumbs}
                username={currentUser?.username}
                role={currentUser?.role}
                onMenuClick={() => setMobileMenuOpen(true)}
              />
            </header>

            <div className="flex-1 bg-[var(--bg-panel)] md:rounded-[24px] shadow-card p-5 md:p-6">
              <MigrationsBanner />
              <MpFallbackBanner />

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
                />
              )}

              {activeTab === "historial" && (
                <HistorialSection
                  analytics={analytics}
                  historyEvents={historyEvents}
                  historyLoaded={historyLoaded}
                  isTabTransitioning={isTabTransitioning}
                  isBosko={isBosko}
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
                <div key="pagos" className="animate-dashboard-in flex flex-col gap-8">
                  <PagosSection />
                  <PdvSection />
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
  );
}
