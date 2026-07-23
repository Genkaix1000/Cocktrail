"use client";

import {
  History,
  Power,
  LayoutDashboard,
  Wine,
  CreditCard,
  Users,
  ChevronDown,
  ChevronRight,
  FileText,
  KeyRound,
  CloudDownload,
  Monitor,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";

import CloseNightModal from "@/components/shared/CloseNightModal";
import OpenNightModal from "@/components/admin/OpenNightModal";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { useTheme } from "@/components/ThemeProvider";
import { OSHeadbar } from "@/components/shared/OSHeadbar";
import { OSProfileFooter } from "@/components/shared/OSProfileFooter";

import { computeTotals } from "@/lib/totals";
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

export default function AdminClient({
  initialEvent,
  initialOrders,
}: Props) {
  const router = useRouter();
  const { theme } = useTheme();

  // Basic layout state
  const [modalOpen, setModalOpen] = useState(false);
  const [editKeywordOpen, setEditKeywordOpen] = useState(false);
  const [openNightOpen, setOpenNightOpen] = useState(false);

  // Tab & sidebar navigation state
  const [activeTab, setActiveTab] = useState<string>("monitoreo");
  const [openOperaciones, setOpenOperaciones] = useState(true);
  const [openConfiguracion, setOpenConfiguracion] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Profile footer state
  const [currentUser, setCurrentUser] = useState<{ role: Role; username?: string } | null>(null);

  // Historial lazy data state
  const [historyEvents, setHistoryEvents] = useState<EventSummary[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Puente Historial → Logs: LogsSection se monta de cero cada vez que
  // activeTab pasa a "logs" (render condicional acá abajo), así que alcanza
  // con este timestamp para sembrar su filtro inicial — no hace falta que
  // el shell conozca el resto del estado de Logs (mes/día/orden/paginación),
  // que ahora vive exclusivamente en LogsSection.
  const [logsFilterTimestamp, setLogsFilterTimestamp] = useState<number | null>(null);

  const onRedirectToLogs = (ts: number) => {
    setLogsFilterTimestamp(ts);
    handleTabChange("logs");
  };

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
      setHistoryLoaded(false); // Force reload next time history tab is opened
    },
  });

  // Fetch current user details
  useEffect(() => {
    authService.getMe().then((u) => {
      if (u) setCurrentUser(u);
    });
  }, []);

  // Sync active tab with URL search parameter "?tab="
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveTab(tab);
      }
    }
  }, []);

  // Fetch history on mount, y de nuevo cada vez que se cierra una noche
  // (onEventClosed pone historyLoaded en false más arriba) — antes este efecto
  // tenía deps [] (solo montaje), así que ese "force reload" nunca disparaba
  // nada y el Historial quedaba en skeleton para siempre tras cerrar la noche.
  useEffect(() => {
    if (historyLoaded) return;
    eventsService
      .getHistory()
      .then((data) => {
        setHistoryEvents((data || []).filter(e => e.totals.total > 0));
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
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.pushState({}, "", url.toString());
    }
  };

  const totals = useMemo(
    () => computeTotals(orders),
    [orders],
  );

  const pendingDeliveries = useMemo(
    () => orders.filter((o) => o.status === "pendiente").length,
    [orders],
  );

  // Sin noche abierta, el Dashboard no puede alimentarse de `totals`/`orders`
  // en vivo (quedan en $0, comparados contra la última noche daría "-100%"
  // engañoso) — en ese caso usa `historyEvents[0]` (última noche cerrada,
  // ya trae `totals`/`orders` completos) como fuente. Con noche abierta, sin
  // cambios (comportamiento de siempre). Ver docs/specs/features/dashboard-sin-noche-abierta.md.
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
    const effectiveWeb = dashboardTotals.webTotal;

    const breakdown = [
      {
        method: "efectivo",
        label: "Efectivo",
        total: effectiveEfectivo,
        count: dashboardTotals.efectivoCount,
        pct: dashboardTotals.total > 0 ? Math.round((effectiveEfectivo / dashboardTotals.total) * 100) : 0,
        color: "#10b981"
      },
      {
        method: "tarjeta",
        label: "Tarjeta",
        total: effectiveDebito + effectiveWeb,
        count: dashboardTotals.debitoCount + dashboardTotals.webCount,
        pct: dashboardTotals.total > 0 ? Math.round(((effectiveDebito + effectiveWeb) / dashboardTotals.total) * 100) : 0,
        color: "#3b82f6"
      },
      {
        method: "qr",
        label: "Transferencia / QR",
        total: effectiveQR,
        count: dashboardTotals.qrCount,
        pct: dashboardTotals.total > 0 ? Math.round((effectiveQR / dashboardTotals.total) * 100) : 0,
        color: "#a855f7"
      },
      {
        method: "otros",
        label: "Otros",
        total: Math.max(0, dashboardTotals.total - (effectiveEfectivo + effectiveQR + effectiveDebito + effectiveWeb)),
        count: 0,
        pct: dashboardTotals.total > 0 ? Math.max(0, 100 - (Math.round((effectiveEfectivo / dashboardTotals.total) * 100) + Math.round(((effectiveDebito + effectiveWeb) / dashboardTotals.total) * 100) + Math.round((effectiveQR / dashboardTotals.total) * 100))) : 0,
        color: "#f97316"
      }
    ];

    // Con total real $0, se muestran los 4 métodos en cero (torta gris +
    // leyenda en $0/0%) en vez de filtrarlos — filtrar solo tiene sentido
    // para ocultar canales genuinamente sin uso en una noche con ventas.
    return dashboardTotals.total > 0 ? breakdown.filter(b => b.total > 0 || b.pct > 0) : breakdown;
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

  // Analytics computation hook — se llama una sola vez acá; DashboardSection
  // y HistorialSection reciben el resultado ya calculado por prop en vez de
  // volver a llamar useAdminAnalytics (evitaría recalcular el mismo useMemo
  // varias veces). AdminClient ya no destructura campos individuales: es
  // puro shell, cada vista extrae lo que necesita de `analytics`.
  const analytics = useAdminAnalytics(dashboardTotals, dashboardStartedAt, dashboardOrders, historyEvents);

  // Breadcrumbs computation
  const breadcrumbs = useMemo(() => {
    switch (activeTab) {
      case "monitoreo":
        return ["Administración", "Dashboard", "Monitoreo"];
      case "historial":
        return ["Administración", "Operación", "Historial de Noches"];
      case "logs":
        return ["Administración", "Operación", "Auditoría de Tickets"];
      case "carta":
        return ["Administración", "Configuración", "Carta"];
      case "pagos":
        return ["Administración", "Configuración", "Pagos"];
      case "pdv":
        return ["Administración", "Configuración", "PDV y Posnets"];
      case "usuarios":
        return ["Administración", "Configuración", "Gestión de Staff"];
      case "sistema":
        return ["Administración", "Configuración", "Sistema"];
      default:
        return ["Administración"];
    }
  }, [activeTab]);

  // Color mappings based on theme context
  const isBosko = theme === "bosko";
  const accentColorClass = "text-accent";  // Unified: uses CSS variable text-accent
  const accentBgClass = "bg-accent/10";  // Unified: uses CSS variable
  const barColorClass = isBosko
    ? "from-[#4ade80]/20 to-[#4ade80] group-hover:shadow-[0_0_15px_rgba(74,222,128,0.4)]"
    : "from-blue/15 to-blue group-hover:shadow-[0_0_15px_rgba(109,179,242,0.4)]";

  const renderSidebar = (isDrawer = false) => {
    const isBosko = theme === "bosko";
    
    // Custom classes for theme consistency
    const sidebarClass = isBosko
      ? "bg-[#013e37] dark:bg-[#012b26] border-r border-[#014d44] dark:border-accent/10 text-[#fffeb3] p-6 gap-6"
      : "bg-ink-950 border-r border-ink-800 text-ink-50 p-6 gap-6";

    const navBtnClass = (tab: string) => {
      const active = activeTab === tab;
      if (isBosko) {
        return active
          ? "bg-white/10 border border-white/20 text-[#fffeb3] shadow-sm font-bold"
          : "bg-transparent border border-transparent text-white/70 hover:text-white hover:bg-white/5";
      }
      return active
        ? "bg-ink-900 border border-ink-800 text-ink-50 shadow-sm font-bold"
        : "bg-transparent border border-transparent text-ink-400 hover:text-ink-50 hover:bg-ink-900/40";
    };

    const navIconClass = (tab: string) => {
      const active = activeTab === tab;
      if (isBosko) {
        return active ? "bg-[#fffeb3]/15 text-[#fffeb3]" : "bg-white/5 text-white/40";
      }
      return active ? `${accentBgClass} ${accentColorClass}` : "bg-ink-800/50 text-ink-400";
    };

    const navLabelClass = (tab: string) => {
      const active = activeTab === tab;
      if (isBosko) {
        return active ? "text-[#fffeb3]" : "text-white/70";
      }
      return active ? "text-ink-50" : "text-ink-400 group-hover:text-ink-50";
    };

    const navSublabelClass = () => {
      return isBosko ? "text-white/40" : "text-ink-500";
    };

    const sectionTitleClass = isBosko ? "text-white/50 hover:text-white" : "text-ink-400 hover:text-ink-50";

    return (
      <aside className={`
        w-[280px] shrink-0 flex flex-col print:hidden relative
        ${isDrawer ? "h-full" : "h-full hidden md:flex"}
        ${sidebarClass}
      `}>
        {/* Brand logo top */}
        <div className="h-[60px] flex items-center justify-center border-b border-current/15 shrink-0 w-full">
          <BrandLogo size="lg" />
        </div>

        {/* Scroller layout */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-6 no-scrollbar pb-[240px]">
          {/* Core Items */}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => handleTabChange("monitoreo")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-200 cursor-pointer ${navBtnClass("monitoreo")}`}
            >
              <div className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${navIconClass("monitoreo")}`}>
                <LayoutDashboard size={16} strokeWidth={1.8} />
              </div>
              <div className="flex flex-col">
                <span className={`text-[14.5px] font-bold ${navLabelClass("monitoreo")}`}>
                  Monitoreo
                </span>
                <span className={`text-[10px] ${navSublabelClass()}`}>Live feed y órdenes</span>
              </div>
            </button>
          </div>

          {/* Section: Operacion */}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setOpenOperaciones(!openOperaciones)}
              className={`flex items-center justify-between px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] transition-colors w-full text-left cursor-pointer ${sectionTitleClass}`}
            >
              <span>Operación</span>
              {openOperaciones ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            
            {openOperaciones && (
              <div className="flex flex-col gap-1.5 mt-1 pl-1">
                <button
                  type="button"
                  onClick={() => handleTabChange("historial")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer ${navBtnClass("historial")}`}
                >
                  <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${navIconClass("historial")}`}>
                    <History size={13} strokeWidth={1.8} />
                  </div>
                  <span className={`text-[13.5px] ${navLabelClass("historial")}`}>Historial de Noches</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Entrada directa por sidebar: no arrastramos el filtro
                    // de una redirección previa desde Historial.
                    setLogsFilterTimestamp(null);
                    handleTabChange("logs");
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer ${navBtnClass("logs")}`}
                >
                  <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${navIconClass("logs")}`}>
                    <FileText size={13} strokeWidth={1.8} />
                  </div>
                  <span className={`text-[13.5px] ${navLabelClass("logs")}`}>Auditoría de Tickets</span>
                </button>
              </div>
            )}
          </div>

          {/* Section: Configuracion */}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setOpenConfiguracion(!openConfiguracion)}
              className={`flex items-center justify-between px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] transition-colors w-full text-left cursor-pointer ${sectionTitleClass}`}
            >
              <span>Configuración</span>
              {openConfiguracion ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
            
            {openConfiguracion && (
              <div className="flex flex-col gap-1.5 mt-1 pl-1">
                <button
                  type="button"
                  onClick={() => handleTabChange("carta")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer ${navBtnClass("carta")}`}
                >
                  <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${navIconClass("carta")}`}>
                    <Wine size={13} strokeWidth={1.8} />
                  </div>
                  <span className={`text-[13.5px] ${navLabelClass("carta")}`}>Carta</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange("usuarios")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer ${navBtnClass("usuarios")}`}
                >
                  <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${navIconClass("usuarios")}`}>
                    <Users size={13} strokeWidth={1.8} />
                  </div>
                  <span className={`text-[13.5px] ${navLabelClass("usuarios")}`}>Gestión de Staff</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange("pagos")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer ${navBtnClass("pagos")}`}
                >
                  <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${navIconClass("pagos")}`}>
                    <CreditCard size={13} strokeWidth={1.8} />
                  </div>
                  <span className={`text-[13.5px] ${navLabelClass("pagos")}`}>Pagos</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange("pdv")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer ${navBtnClass("pdv")}`}
                >
                  <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${navIconClass("pdv")}`}>
                    <Monitor size={13} strokeWidth={1.8} />
                  </div>
                  <span className={`text-[13.5px] ${navLabelClass("pdv")}`}>PDV y Posnets</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange("sistema")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer ${navBtnClass("sistema")}`}
                >
                  <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${navIconClass("sistema")}`}>
                    <CloudDownload size={13} strokeWidth={1.8} />
                  </div>
                  <span className={`text-[13.5px] ${navLabelClass("sistema")}`}>Sistema</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer Fijo en la parte inferior */}
        <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-current/15 bg-ink-950 flex flex-col gap-3.5 z-20 bg-ink-950/95 backdrop-blur-sm">

          {event?.status === "activo" && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditKeywordOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full h-10 rounded-xl bg-blue-soft border border-blue-line text-blue flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                <KeyRound size={13} />
                <span>Clave de la noche</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full h-10 rounded-xl bg-danger-soft border border-danger-line text-danger flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                <Power size={13} />
                <span>Cerrar noche</span>
              </button>
            </div>
          )}

          {(!event || event.status !== "activo") && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpenNightOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full h-10 rounded-xl bg-green-soft border border-green-line text-green flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                <Power size={13} />
                <span>Abrir noche</span>
              </button>
            </div>
          )}

          {/* Sidebar Profile Card Footer */}
          <OSProfileFooter onLogout={logout} username={currentUser?.username} role={currentUser?.role} />
        </div>
      </aside>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-ink-950">
      <main className="flex-1 flex flex-col md:flex-row relative overflow-hidden h-full">
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

      {/* Main Content Area */}
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
            
            {/* Breadcrumbs (Saves space on narrow viewports) */}
            <nav className="hidden sm:flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">
              {breadcrumbs.map((crumb, idx) => (
                <span key={crumb} className="flex items-center gap-1.5">
                  {idx > 0 && <span className="text-ink-700">/</span>}
                  <span className={idx === breadcrumbs.length - 1 ? accentColorClass : "text-ink-400"}>
                    {crumb}
                  </span>
                </span>
              ))}
            </nav>
            
            <span className="sm:hidden text-[9px] font-bold uppercase tracking-[0.2em] text-ink-300 truncate">
              {breadcrumbs[breadcrumbs.length - 1]}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <OSHeadbar activeScreen="Administración" />
          </div>
        </header>
        <MigrationsBanner />
        <MpFallbackBanner />
        {/* Dynamic Section Contents */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-ink-950 min-h-0">
          {activeTab === "monitoreo" && (
            <DashboardSection
              analytics={analytics}
              totals={dashboardTotals}
              historyEvents={historyEvents}
              customPaymentBreakdown={customPaymentBreakdown}
              isFirstLoad={isFirstLoad}
              isTabTransitioning={isTabTransitioning}
              activeTab={activeTab}
              isBosko={isBosko}
              barColorClass={barColorClass}
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

          {/* TAB 4.5: AUDITORIA DE LOGS */}
          {activeTab === "logs" && (
            <LogsSection
              initialFilterTimestamp={logsFilterTimestamp}
              isBosko={isBosko}
            />
          )}

          {/* TAB 6: SETTINGS CARTA CRUD */}
          {activeTab === "carta" && (
            <div key="carta" className="animate-dashboard-in">
              <CartaSection />
            </div>
          )}

          {/* TAB 7: SETTINGS PAGOS */}
          {activeTab === "pagos" && (
            <div key="pagos" className="animate-dashboard-in">
              <PagosSection />
            </div>
          )}

          {/* TAB 7.5: SETTINGS PDV Y POSNETS */}
          {activeTab === "pdv" && (
            <div key="pdv" className="animate-dashboard-in">
              <PdvSection />
            </div>
          )}

          {/* TAB 8: SETTINGS STAFF */}
          {activeTab === "usuarios" && (
            <div key="usuarios" className="animate-dashboard-in">
              <UsuariosSection />
            </div>
          )}

          {/* TAB 9: SETTINGS SISTEMA (restore de emergencia desde cloud) */}
          {activeTab === "sistema" && (
            <div key="sistema" className="animate-dashboard-in">
              <SistemaSection />
            </div>
          )}

        </div>
      </div>
    </main>
    </div>
  );
}
