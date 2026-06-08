"use client";

import {
  History,
  LogOut,
  Power,
  QrCode,
  LayoutDashboard,
  TrendingUp,
  Palette,
  Wine,
  CreditCard,
  Users,
  ChevronDown,
  ChevronRight,
  Printer,
  CalendarDays,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

import CashSaleModal from "@/components/CashSaleModal";
import CloseNightModal from "@/components/CloseNightModal";
import { BrandLogo } from "@/components/BrandLogo";
import { useTheme } from "@/components/ThemeProvider";

import { byCreatedAtDesc, STATUS_META } from "@/lib/orderStatus";
import { computeTotals } from "@/lib/totals";
import { useSSE } from "@/lib/useSSE";
import { formatHm } from "@/lib/utils";

import { eventsService } from "@/services/events.service";
import { authService } from "@/services/auth.service";

import GeneralSection from "@/components/settings/GeneralSection";
import CartaSection from "@/components/settings/CartaSection";
import PagosSection from "@/components/settings/PagosSection";
import UsuariosSection from "@/components/settings/UsuariosSection";

import type {
  CashSale,
  EventSummary,
  NightEvent,
  Order,
  OrderStatus,
  Role,
} from "@cocktrail/shared";

type Props = {
  initialEvent: NightEvent;
  initialOrders: Order[];
  initialCashSales: CashSale[];
};

// Constants for Historial processing
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDateLong(ts: number): { weekday: string; day: number; month: string } {
  const d = new Date(ts);
  return {
    weekday: WEEKDAYS[d.getDay()] ?? "",
    day: d.getDate(),
    month: MONTHS_SHORT[d.getMonth()] ?? "",
  };
}

function startOfWeek(d: Date): number {
  const day = d.getDay();
  const offset = day === 0 ? 6 : day - 1;
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offset);
  return start.getTime();
}

function startOfMonth(d: Date): number {
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return start.getTime();
}

function durationHs(s: EventSummary): string {
  if (!s.closedAt) return "—";
  const ms = s.closedAt - s.startedAt;
  const h = Math.floor(ms / (60 * 60 * 1000));
  const m = Math.round((ms % (60 * 60 * 1000)) / 60000);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export default function AdminClient({
  initialEvent,
  initialOrders,
  initialCashSales,
}: Props) {
  const router = useRouter();
  const { theme } = useTheme();

  // Basic layout state
  const [event, setEvent] = useState(initialEvent);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [cashSales, setCashSales] = useState<CashSale[]>(initialCashSales);
  const [modalOpen, setModalOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [summary, setSummary] = useState<EventSummary | null>(null);

  // Tab & sidebar navigation state
  const [activeTab, setActiveTab] = useState<string>("monitoreo");
  const [openOperaciones, setOpenOperaciones] = useState(true);
  const [openConfiguracion, setOpenConfiguracion] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Profile footer state
  const [currentUser, setCurrentUser] = useState<{ role: Role } | null>(null);

  // Historial lazy data state
  const [historyEvents, setHistoryEvents] = useState<EventSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // QR print page state
  const ENV_HOST = process.env.NEXT_PUBLIC_LAN_HOST;
  const [qrUrl, setQrUrl] = useState<string>("");

  // Chart interactivity state
  const [activeHoverSlot, setActiveHoverSlot] = useState<number | null>(null);

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

  // Fetch history when history tab is opened
  useEffect(() => {
    if (activeTab === "historial" && !historyLoaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoadingHistory(true);
      eventsService
        .getHistory()
        .then((data) => {
          setHistoryEvents(data);
          setLoadingHistory(false);
          setHistoryLoaded(true);
        })
        .catch(() => setLoadingHistory(false));
    }
  }, [activeTab, historyLoaded]);

  // QR code url resolver
  useEffect(() => {
    const host = ENV_HOST?.trim() || (typeof window !== "undefined" ? window.location.origin : "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQrUrl(`${host.replace(/\/$/, "")}/carta`);
  }, [ENV_HOST]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.pushState({}, "", url.toString());
    }
  };

  const handleQrPrint = () => {
    if (!qrUrl) return;
    window.print();
  };

  const totals = useMemo(
    () => computeTotals(orders, cashSales),
    [orders, cashSales],
  );

  const pendingDeliveries = useMemo(
    () =>
      orders.filter((o) => o.status === "preparando" || o.status === "listo")
        .length,
    [orders],
  );

  const sortedOrders = useMemo(
    () =>
      orders.filter((o) => o.status !== "cancelado").sort(byCreatedAtDesc),
    [orders],
  );

  const refetch = useCallback(async () => {
    try {
      const state = await eventsService.getState();
      setEvent(state.event);
      setOrders(state.orders ?? []);
      setCashSales(state.cashSales ?? []);
    } catch {}
  }, []);

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
          prev.some((s) => s.id === cashSale.id) ? prev : [...prev, cashSale],
        );
      },
      "event.closed": ({ summary: s }) => {
        setSummary(s);
        setModalOpen(true);
        refetch();
        setHistoryLoaded(false); // Force reload next time history tab is opened
      },
    },
    { onOpen: refetch },
  );

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

  // Dashboard variables
  const maxDrinkQty = totals.drinksSold[0]?.qty ?? 0;
  const totalDrinkUnits = totals.drinksSold.reduce((s, d) => s + d.qty, 0);
  const totalOps = totals.transferenciaCount + totals.efectivoCount;
  const avgTicket = totalOps > 0 ? Math.round(totals.total / totalOps) : 0;
  const transferPct = totals.total > 0 ? Math.round((totals.transferenciaTotal / totals.total) * 100) : 0;
  const cashPct = totals.total > 0 ? Math.max(0, 100 - transferPct) : 0;
  const startedAtStr = formatHm(event.startedAt);

  // Hourly metrics logic
  const hourlyData = useMemo(() => {
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

  // Historial aggregates
  const historyNow = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeek(historyNow), [historyNow]);
  const monthStart = useMemo(() => startOfMonth(historyNow), [historyNow]);
  const weekEvents = useMemo(() => historyEvents.filter((e) => (e.closedAt ?? 0) >= weekStart), [historyEvents, weekStart]);
  const monthEvents = useMemo(() => historyEvents.filter((e) => (e.closedAt ?? 0) >= monthStart), [historyEvents, monthStart]);
  const sumHistory = (arr: EventSummary[]) => arr.reduce((s, e) => s + e.totals.total, 0);
  const weekTotal = sumHistory(weekEvents);
  const monthTotal = sumHistory(monthEvents);
  const allTotal = sumHistory(historyEvents);
  const avgNight = historyEvents.length > 0 ? Math.round(allTotal / historyEvents.length) : 0;

  // Breadcrumbs computation
  const breadcrumbs = useMemo(() => {
    switch (activeTab) {
      case "monitoreo":
        return ["Administración", "Dashboard", "Monitoreo"];
      case "estadisticas":
        return ["Administración", "Dashboard", "Métricas"];
      case "historial":
        return ["Administración", "Operación", "Historial de Noches"];
      case "qr":
        return ["Administración", "Operación", "Imprimir QR"];
      case "general":
        return ["Administración", "Configuración", "General"];
      case "carta":
        return ["Administración", "Configuración", "Carta (CRUD)"];
      case "pagos":
        return ["Administración", "Configuración", "Mercado Pago"];
      case "usuarios":
        return ["Administración", "Configuración", "Gestión de Staff"];
      default:
        return ["Administración"];
    }
  }, [activeTab]);

  // Color mappings based on theme context
  const isBosko = theme === "bosko";
  const accentColorClass = isBosko ? "text-[#4ade80]" : "text-blue";
  const accentBgClass = isBosko ? "bg-[#4ade80]/10" : "bg-blue/10";
  const accentBorderClass = isBosko ? "border-[#4ade80]/20" : "border-blue-line";
  const barColorClass = isBosko
    ? "from-[#4ade80]/20 to-[#4ade80] group-hover:shadow-[0_0_15px_rgba(74,222,128,0.4)]"
    : "from-blue/15 to-blue group-hover:shadow-[0_0_15px_rgba(109,179,242,0.4)]";

  const renderSidebar = (isDrawer = false) => (
    <aside className={`
      w-[280px] shrink-0 border-r border-ink-800 bg-ink-925 flex flex-col print:hidden
      ${isDrawer ? "h-full" : "h-screen sticky top-0 hidden md:flex"}
    `}>
      {/* Brand logo top */}
      <div className="h-[60px] px-6 flex items-center justify-between border-b border-ink-800">
        <div className="flex items-center gap-3.5 min-w-0">
          <BrandLogo size="lg" />
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-ink-100">
            Admin
          </span>
        </div>
      </div>

      {/* Scroller layout */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4.5 no-scrollbar">
        {/* Core Items */}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => handleTabChange("monitoreo")}
            className={`
              w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-200 cursor-pointer
              ${activeTab === "monitoreo"
                ? "bg-blue-soft border border-blue-line text-white shadow-[0_0_15px_rgba(var(--primary-base),0.02)]"
                : "bg-transparent border border-transparent text-ink-200 hover:text-white hover:bg-ink-850/50"
              }
            `}
          >
            <div className={`
              w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
              ${activeTab === "monitoreo" ? accentBgClass + " " + accentColorClass : "bg-ink-800/50 text-ink-400"}
            `}>
              <LayoutDashboard size={16} strokeWidth={1.8} />
            </div>
            <div className="flex flex-col">
              <span className={`text-[14.5px] font-bold ${activeTab === "monitoreo" ? "text-white" : "text-ink-100"}`}>
                Monitoreo
              </span>
              <span className="text-[10px] text-ink-500">Live feed y órdenes</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange("estadisticas")}
            className={`
              w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-200 cursor-pointer
              ${activeTab === "estadisticas"
                ? "bg-blue-soft border border-blue-line text-white shadow-[0_0_15px_rgba(var(--primary-base),0.02)]"
                : "bg-transparent border border-transparent text-ink-200 hover:text-white hover:bg-ink-850/50"
              }
            `}
          >
            <div className={`
              w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
              ${activeTab === "estadisticas" ? accentBgClass + " " + accentColorClass : "bg-ink-800/50 text-ink-400"}
            `}>
              <TrendingUp size={16} strokeWidth={1.8} />
            </div>
            <div className="flex flex-col">
              <span className={`text-[14.5px] font-bold ${activeTab === "estadisticas" ? "text-white" : "text-ink-100"}`}>
                Métricas
              </span>
              <span className="text-[10px] text-ink-500">Gráficos de facturación</span>
            </div>
          </button>
        </div>

        {/* Section: Operacion */}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setOpenOperaciones(!openOperaciones)}
            className="flex items-center justify-between px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-ink-400 hover:text-white transition-colors w-full text-left cursor-pointer"
          >
            <span>Operación</span>
            {openOperaciones ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          
          {openOperaciones && (
            <div className="flex flex-col gap-1.5 mt-1 pl-1">
              <button
                type="button"
                onClick={() => handleTabChange("historial")}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer
                  ${activeTab === "historial"
                    ? "bg-blue-soft border border-blue-line text-white shadow-[0_0_15px_rgba(var(--primary-base),0.02)] font-bold"
                    : "bg-transparent border border-transparent text-ink-200 hover:text-white hover:bg-ink-850/50"
                  }
                `}
              >
                <div className={`
                  w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
                  ${activeTab === "historial" ? accentBgClass + " " + accentColorClass : "bg-ink-800/50 text-ink-400"}
                `}>
                  <History size={13} strokeWidth={1.8} />
                </div>
                <span className="text-[13.5px]">Historial de Noches</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("qr")}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer
                  ${activeTab === "qr"
                    ? "bg-blue-soft border border-blue-line text-white shadow-[0_0_15px_rgba(var(--primary-base),0.02)] font-bold"
                    : "bg-transparent border border-transparent text-ink-200 hover:text-white hover:bg-ink-850/50"
                  }
                `}
              >
                <div className={`
                  w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
                  ${activeTab === "qr" ? accentBgClass + " " + accentColorClass : "bg-ink-800/50 text-ink-400"}
                `}>
                  <QrCode size={13} strokeWidth={1.8} />
                </div>
                <span className="text-[13.5px]">Imprimir QR</span>
              </button>
            </div>
          )}
        </div>

        {/* Section: Configuracion */}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setOpenConfiguracion(!openConfiguracion)}
            className="flex items-center justify-between px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-ink-400 hover:text-white transition-colors w-full text-left cursor-pointer"
          >
            <span>Configuración</span>
            {openConfiguracion ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          
          {openConfiguracion && (
            <div className="flex flex-col gap-1.5 mt-1 pl-1">
              {/* 1. Carta */}
              <button
                type="button"
                onClick={() => handleTabChange("carta")}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer
                  ${activeTab === "carta"
                    ? "bg-blue-soft border border-blue-line text-white shadow-[0_0_15px_rgba(var(--primary-base),0.02)] font-bold"
                    : "bg-transparent border border-transparent text-ink-200 hover:text-white hover:bg-ink-850/50"
                  }
                `}
              >
                <div className={`
                  w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
                  ${activeTab === "carta" ? accentBgClass + " " + accentColorClass : "bg-ink-800/50 text-ink-400"}
                `}>
                  <Wine size={13} strokeWidth={1.8} />
                </div>
                <span className="text-[13.5px]">Carta (CRUD)</span>
              </button>

              {/* 2. Gestión de Staff */}
              <button
                type="button"
                onClick={() => handleTabChange("usuarios")}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer
                  ${activeTab === "usuarios"
                    ? "bg-blue-soft border border-blue-line text-white shadow-[0_0_15px_rgba(var(--primary-base),0.02)] font-bold"
                    : "bg-transparent border border-transparent text-ink-200 hover:text-white hover:bg-ink-850/50"
                  }
                `}
              >
                <div className={`
                  w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
                  ${activeTab === "usuarios" ? accentBgClass + " " + accentColorClass : "bg-ink-800/50 text-ink-400"}
                `}>
                  <Users size={13} strokeWidth={1.8} />
                </div>
                <span className="text-[13.5px]">Gestión de Staff</span>
              </button>

              {/* 3. General */}
              <button
                type="button"
                onClick={() => handleTabChange("general")}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer
                  ${activeTab === "general"
                    ? "bg-blue-soft border border-blue-line text-white shadow-[0_0_15px_rgba(var(--primary-base),0.02)] font-bold"
                    : "bg-transparent border border-transparent text-ink-200 hover:text-white hover:bg-ink-850/50"
                  }
                `}
              >
                <div className={`
                  w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
                  ${activeTab === "general" ? accentBgClass + " " + accentColorClass : "bg-ink-800/50 text-ink-400"}
                `}>
                  <Palette size={13} strokeWidth={1.8} />
                </div>
                <span className="text-[13.5px]">General</span>
              </button>

              {/* 4. Mercado Pago */}
              <button
                type="button"
                onClick={() => handleTabChange("pagos")}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 cursor-pointer
                  ${activeTab === "pagos"
                    ? "bg-blue-soft border border-blue-line text-white shadow-[0_0_15px_rgba(var(--primary-base),0.02)] font-bold"
                    : "bg-transparent border border-transparent text-ink-200 hover:text-white hover:bg-ink-850/50"
                  }
                `}
              >
                <div className={`
                  w-7.5 h-7.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200
                  ${activeTab === "pagos" ? accentBgClass + " " + accentColorClass : "bg-ink-800/50 text-ink-400"}
                `}>
                  <CreditCard size={13} strokeWidth={1.8} />
                </div>
                <span className="text-[13.5px]">Mercado Pago</span>
              </button>
            </div>
          )}
        </div>

        {event?.status === "activo" && (
          <div className="border-t border-ink-800 pt-4">
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
      </div>

      {/* Sidebar Profile Card Footer */}
      <div className="mt-auto p-4 border-t border-ink-800 flex items-center gap-3 shrink-0">
        <div className={`w-9 h-9 rounded-full bg-ink-800 border border-ink-700 flex items-center justify-center font-bold uppercase text-[12px] select-none ${accentColorClass}`}>
          {currentUser?.role?.slice(0, 2) || "AD"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-ink-50 truncate leading-tight">
            {currentUser?.role === "admin" ? "Administrador" : currentUser?.role || "Staff"}
          </p>
          <p className="text-[10px] text-ink-450 capitalize truncate mt-0.5">
            Personal autorizado
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="w-9 h-9 rounded-lg bg-ink-850 hover:bg-ink-800 border border-ink-700 hover:text-danger hover:border-danger-line text-ink-300 flex items-center justify-center transition-all shrink-0 cursor-pointer"
          title="Cerrar sesión"
        >
          <LogOut size={13} />
        </button>
      </div>
    </aside>
  );

  return (
    <main className="min-h-screen bg-ink-950 text-ink-50 flex flex-col md:flex-row relative">
      <CashSaleModal open={cashOpen} onClose={() => setCashOpen(false)} />
      <CloseNightModal
        open={modalOpen}
        totals={totals}
        pendingDeliveries={pendingDeliveries}
        startedAt={event.startedAt}
        summary={summary}
        onConfirm={handleCloseConfirm}
        onClose={handleModalClose}
      />

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
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
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

          {/* Right section: Theme switcher and live actions */}
          <div className="flex items-center gap-2">
          </div>
        </header>

        {/* Dynamic Section Contents */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-ink-950 min-h-0">
          
          {/* TAB 1: MONITOREO (Original dashboard grid layout) */}
          {activeTab === "monitoreo" && (
            <div className="space-y-6">
              {/* Row 1: 4 KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <Kpi
                  label="Total noche"
                  value={totals.total}
                  isCurrency
                  sub={
                    totalOps > 0
                      ? `${totalOps} operaciones · ticket $${avgTicket.toLocaleString("es-AR")}`
                      : "Sin movimientos"
                  }
                  deltaTone="up"
                  deltaText="EN VIVO"
                />
                <Kpi
                  label="Transferencia"
                  value={totals.transferenciaTotal}
                  isCurrency
                  sub={`${totals.transferenciaCount} ${totals.transferenciaCount === 1 ? "pedido" : "pedidos"} · Mercado Pago`}
                  deltaTone="neutral"
                  deltaText={`${transferPct}%`}
                />
                <Kpi
                  label="Efectivo"
                  value={totals.efectivoTotal}
                  isCurrency
                  sub={`${totals.efectivoCount} ${totals.efectivoCount === 1 ? "venta en barra" : "ventas en barra"}`}
                  deltaTone="neutral"
                  deltaText={`${cashPct}%`}
                />
                <Kpi
                  label="Tragos servidos"
                  value={totalDrinkUnits}
                  sub={`${totals.drinksSold.length} ${totals.drinksSold.length === 1 ? "variedad" : "variedades"} distintas`}
                  deltaTone="up"
                  deltaText={totalDrinkUnits > 0 ? `+${totalDrinkUnits}` : "0"}
                />
              </div>

              {/* Row 2: Grid for Top Drinks + Digital Orders list */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                
                {/* Column A: Top drinks */}
                <section className="bg-ink-900 border border-ink-800 rounded-xl p-4 flex flex-col gap-3 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <span className="flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-100">
                      Tragos más vendidos
                      <span className="text-[10px] font-mono text-ink-400 px-1.5 py-0.5 bg-ink-800 rounded tabular">
                        {totals.drinksSold.length}
                      </span>
                    </span>
                    <span className="text-[10px] font-medium text-ink-400 uppercase tracking-[0.06em]">
                      {totalDrinkUnits} unidades
                    </span>
                  </div>
                  {totals.drinksSold.length === 0 ? (
                    <EmptyCard text="Aún no se vendieron tragos esta noche" />
                  ) : (
                    <div className="flex flex-col gap-2 overflow-y-auto max-h-[360px] no-scrollbar">
                      {totals.drinksSold.slice(0, 8).map((d, i) => {
                        const widthPct = maxDrinkQty ? Math.max(8, (d.qty / maxDrinkQty) * 100) : 0;
                        const pct = totalDrinkUnits > 0 ? Math.round((d.qty / totalDrinkUnits) * 100) : 0;
                        return (
                          <div
                            key={d.drinkId}
                            className="grid grid-cols-[22px_1fr_60px_60px_80px] items-center gap-3 py-2 border-t border-ink-850 first:border-t-0"
                          >
                            <span className="font-mono text-[11px] text-ink-500 tabular">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <div className="flex flex-col gap-1.5 min-w-0">
                              <span className="text-[14px] font-medium text-ink-50 leading-tight truncate">
                                {d.name}
                              </span>
                              <div className="h-1 rounded bg-ink-800 overflow-hidden">
                                <div
                                  className={`h-full ${isBosko ? "bg-[#4ade80]" : "bg-blue"}`}
                                  style={{ width: `${widthPct}%` }}
                                />
                              </div>
                            </div>
                            <span className="font-mono text-[12px] text-ink-300 text-left tabular">
                              × {d.qty}
                            </span>
                            <span className="font-mono text-[12px] text-ink-300 text-center tabular">
                              {pct}%
                            </span>
                            <span className="font-mono text-[13px] text-ink-100 text-right tabular">
                              ${d.subtotal.toLocaleString("es-AR")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Column B: Digital Orders list */}
                <section className="bg-ink-900 border border-ink-800 rounded-xl p-4 flex flex-col gap-3 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <span className="flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-100">
                      Pedidos digitales
                      <span className="text-[10px] font-mono text-ink-400 px-1.5 py-0.5 bg-ink-800 rounded tabular">
                        {sortedOrders.length}
                      </span>
                    </span>
                    <span className="text-[10px] font-medium text-ink-400 uppercase tracking-[0.06em]">
                      Más reciente arriba
                    </span>
                  </div>
                  {sortedOrders.length === 0 ? (
                    <EmptyCard text="Sin pedidos digitales" />
                  ) : (
                    <div className="flex flex-col gap-0.5 overflow-y-auto max-h-[360px] no-scrollbar">
                      {sortedOrders.map((o) => (
                        <OrderRow key={o.id} order={o} />
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Bottom footer status */}
              <div className="flex justify-between items-center text-[10px] text-ink-500 pt-2">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green shadow-[0_0_0_3px_var(--green-soft)] animate-pulse" />
                    Monitoreo Activo
                  </span>
                  <span>Iniciado a las {startedAtStr} hs</span>
                </div>
                <span>Última actualización · ahora</span>
              </div>
            </div>
          )}

          {/* TAB 2: METRICAS (The new stats bar chart card) */}
          {activeTab === "estadisticas" && (
            <div className="space-y-6 max-w-5xl">
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
          )}

          {/* TAB 3: HISTORIAL (night history index list) */}
          {activeTab === "historial" && (
            <div className="space-y-6 max-w-5xl">
              <section className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-ink-400 flex items-center gap-2">
                  <History size={12} /> Resumen
                </span>
                <h1 className="font-serif-italic text-[30px] leading-none text-ink-50">
                  Noches anteriores
                </h1>
                <p className="text-[12px] text-ink-400 mt-1">
                  Cada noche cerrada se archiva acá con sus totales, pedidos y ventas en efectivo.
                </p>
              </section>

              {/* Aggregations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-ink-900 border border-ink-800 rounded-2xl p-4.5 flex flex-col gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">Esta semana</span>
                  <span className={`font-mono text-[24px] font-bold leading-none ${accentColorClass}`}>
                    ${weekTotal.toLocaleString("es-AR")}
                  </span>
                  <span className="text-[10px] text-ink-400">{weekEvents.length} {weekEvents.length === 1 ? "noche" : "noches"}</span>
                </div>
                <div className="bg-ink-900 border border-ink-800 rounded-2xl p-4.5 flex flex-col gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">Este mes</span>
                  <span className={`font-mono text-[24px] font-bold leading-none ${accentColorClass}`}>
                    ${monthTotal.toLocaleString("es-AR")}
                  </span>
                  <span className="text-[10px] text-ink-400">{monthEvents.length} {monthEvents.length === 1 ? "noche" : "noches"}</span>
                </div>
                <div className="bg-ink-900 border border-ink-800 rounded-2xl p-4.5 flex flex-col gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">Total archivado</span>
                  <span className="font-mono text-[24px] font-bold leading-none text-ink-50">
                    ${allTotal.toLocaleString("es-AR")}
                  </span>
                  <span className="text-[10px] text-ink-400">{historyEvents.length} {historyEvents.length === 1 ? "noche" : "noches"}</span>
                </div>
                <div className="bg-ink-900 border border-ink-800 rounded-2xl p-4.5 flex flex-col gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">Promedio noche</span>
                  <span className="font-mono text-[24px] font-bold leading-none text-ink-50">
                    ${avgNight.toLocaleString("es-AR")}
                  </span>
                  <span className="text-[10px] text-ink-400">{historyEvents.length > 0 ? "Historial total" : "Sin datos"}</span>
                </div>
              </div>

              {/* Night list detail */}
              <div className="flex flex-col gap-3.5">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-400">
                  Detalle por noche
                </h2>

                {loadingHistory ? (
                  <div className="flex justify-center items-center py-20">
                    <div className={`w-8 h-8 rounded-full border-2 border-t-transparent animate-spin ${isBosko ? "border-[#4ade80]" : "border-blue"}`} />
                  </div>
                ) : historyEvents.length === 0 ? (
                  <div className="bg-ink-900 border border-dashed border-ink-700 rounded-2xl p-10 text-center">
                    <CalendarDays size={28} className="mx-auto text-ink-500 mb-3" />
                    <p className="font-serif-italic text-[18px] text-ink-200">
                      Sin noches cerradas todavía.
                    </p>
                    <p className="text-[12px] text-ink-400 mt-2">
                      Cuando cierres tu primera noche desde el panel, va a aparecer archivada acá.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {historyEvents.map((e) => {
                      const closedAt = e.closedAt ?? e.startedAt;
                      const date = formatDateLong(closedAt);
                      const daysAgo = Math.max(0, Math.floor((historyNow.getTime() - closedAt) / DAY_MS));
                      const agoLabel = daysAgo === 0 ? "Hoy" : daysAgo === 1 ? "Ayer" : `Hace ${daysAgo} días`;
                      const topDrinks = e.totals.drinksSold.slice(0, 3);
                      
                      return (
                        <li key={e.id} className="bg-ink-900 border border-ink-800 rounded-2xl p-5 grid grid-cols-1 lg:grid-cols-[200px_1fr_200px] gap-5 lg:items-center">
                          {/* Date details */}
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">
                              {agoLabel}
                            </span>
                            <span className="font-serif-italic text-[20px] leading-none text-ink-50">
                              {date.weekday} {date.day} {date.month}
                            </span>
                            <span className="text-[11px] text-ink-450 font-mono tabular">
                              {formatHm(e.startedAt)} → {formatHm(closedAt)} hs · {durationHs(e)}
                            </span>
                          </div>

                          {/* Recaudacion breakdown */}
                          <div className="flex flex-col gap-3 min-w-0">
                            <div className="flex items-baseline gap-5 flex-wrap">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">Total</span>
                                <span className="font-mono font-bold text-[22px] leading-none text-ink-50">
                                  ${e.totals.total.toLocaleString("es-AR")}
                                </span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.2em] text-blue">
                                  Transferencia
                                </span>
                                <span className="font-mono text-[13px] text-ink-200">
                                  ${e.totals.transferenciaTotal.toLocaleString("es-AR")}
                                  <span className="text-ink-500 ml-1">({e.totals.transferenciaCount})</span>
                                </span>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.2em] text-green">
                                  Efectivo
                                </span>
                                <span className="font-mono text-[13px] text-ink-200">
                                  ${e.totals.efectivoTotal.toLocaleString("es-AR")}
                                  <span className="text-ink-500 ml-1">({e.totals.efectivoCount})</span>
                                </span>
                              </div>
                            </div>

                            {/* Top drinks */}
                            {topDrinks.length > 0 && (
                              <div className="flex flex-col gap-1 border-t border-ink-850 pt-2 mt-1">
                                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">Top tragos</span>
                                <div className="flex gap-3 flex-wrap">
                                  {topDrinks.map((d) => (
                                    <span key={d.drinkId} className="text-[12px] text-ink-200">
                                      <span className={`font-mono font-bold mr-1 ${accentColorClass}`}>×{d.qty}</span>
                                      {d.name}
                                    </span>
                                  ))}
                                  {e.totals.drinksSold.length > 3 && (
                                    <span className="text-[11px] text-ink-500">
                                      + {e.totals.drinksSold.length - 3} más
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Stats columns */}
                          <div className="flex lg:flex-col gap-4 lg:gap-2.5 lg:items-end border-t lg:border-t-0 border-ink-850 pt-3 lg:pt-0">
                            <div className="flex flex-col gap-0.5 lg:items-end">
                              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">Pedidos</span>
                              <span className="font-mono text-[15px] text-ink-200">{e.orderCounter}</span>
                            </div>
                            <div className="flex flex-col gap-0.5 lg:items-end">
                              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">Ventas barra</span>
                              <span className="font-mono text-[15px] text-ink-200">{e.cashSales.length}</span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: QR PRINT (qr page layout directly inside admin view) */}
          {activeTab === "qr" && (
            <div className="space-y-6 max-w-xl mx-auto text-center py-6">
              <div className="flex flex-col gap-1 items-center">
                <h1 className="font-serif-italic text-[30px] text-ink-50">QR para la Carta</h1>
                <p className="text-[12px] text-ink-400">
                  Imprimí este código QR para que los clientes escaneen y hagan pedidos desde la mesa.
                </p>
              </div>

              {/* QR Block container */}
              <div className="bg-white rounded-[24px] p-8 max-w-sm mx-auto shadow-2xl border border-white/5 flex flex-col items-center">
                {qrUrl ? (
                  <QRCodeSVG value={qrUrl} size={280} level="M" marginSize={2} />
                ) : (
                  <div className="w-[280px] h-[280px] flex items-center justify-center text-ink-400">
                    Cargando URL…
                  </div>
                )}
                
                {/* Print watermark decoration */}
                <div className="mt-4 text-center text-black/40 text-[10px] font-bold uppercase tracking-wider hidden print:block">
                  Escaneá y pedí tu trago
                </div>
              </div>

              {/* Instructions */}
              <ul className="text-left text-[12px] text-ink-300 space-y-2.5 max-w-sm mx-auto pt-2 print:hidden">
                <li className="flex gap-2">
                  <span className={`font-mono font-bold ${accentColorClass}`}>1.</span>
                  <span>Imprimí esta pantalla o guardala como PDF. Pegá el QR en las mesas, barras y accesos.</span>
                </li>
                <li className="flex gap-2">
                  <span className={`font-mono font-bold ${accentColorClass}`}>2.</span>
                  <span>Verificá que el router WiFi y el servidor estén en la misma red local (LAN).</span>
                </li>
              </ul>

              {/* Trigger Button */}
              <button
                type="button"
                onClick={handleQrPrint}
                className={`h-11 px-6 rounded-xl text-ink-950 text-[11px] font-bold uppercase tracking-[0.14em] hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 mx-auto print:hidden ${isBosko ? "bg-[#4ade80]" : "bg-blue"}`}
              >
                <Printer size={15} />
                Imprimir QR
              </button>
            </div>
          )}

          {/* TAB 5: SETTINGS GENERAL */}
          {activeTab === "general" && <GeneralSection />}

          {/* TAB 6: SETTINGS CARTA CRUD */}
          {activeTab === "carta" && <CartaSection />}

          {/* TAB 7: SETTINGS PAGOS */}
          {activeTab === "pagos" && <PagosSection />}

          {/* TAB 8: SETTINGS STAFF */}
          {activeTab === "usuarios" && <UsuariosSection />}

        </div>
      </div>
    </main>
  );
}

// ───────────────────────────── Internal Helpers ─────────────────────────────

function Kpi({
  label,
  value,
  sub,
  isCurrency,
  deltaTone,
  deltaText,
}: {
  label: string;
  value: number;
  sub: string;
  isCurrency?: boolean;
  deltaTone: "up" | "neutral";
  deltaText: string;
}) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 flex flex-col gap-2 min-w-0">
      <div className="flex justify-between items-center">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-400">
          {label}
        </span>
        <span
          className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded tabular ${
            deltaTone === "up"
              ? "bg-green-soft text-green"
              : "bg-ink-800 text-ink-300"
          }`}
        >
          {deltaText}
        </span>
      </div>
      <div
        className="text-[26px] font-bold text-ink-50 leading-none tabular"
        style={{ letterSpacing: "-0.02em" }}
      >
        {isCurrency && (
          <span className="text-ink-400 text-[0.7em] mr-0.5 font-sans font-bold">$</span>
        )}
        {value.toLocaleString("es-AR")}
      </div>
      <span className="text-[10px] text-ink-400">{sub}</span>
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  const stateClass = statusToBadge(order.status);
  const itemsCount = order.items.length;
  return (
    <div className="grid grid-cols-[44px_80px_1fr_60px_80px] gap-3 items-center px-2.5 py-2 rounded-lg hover:bg-ink-850 transition-colors">
      <span className="font-mono text-[13px] text-ink-50 font-bold tabular">
        #{order.displayNumber}
      </span>
      <span
        className={`text-[8.5px] font-bold uppercase tracking-[0.14em] py-0.5 rounded text-center leading-normal ${stateClass}`}
      >
        {STATUS_META[order.status].short}
      </span>
      <span className="font-mono text-[11px] text-ink-400 tabular">
        {formatHm(order.createdAt)} hs
      </span>
      <span className="text-[11px] text-ink-450 text-right">
        {itemsCount} {itemsCount === 1 ? "ítem" : "ítems"}
      </span>
      <span className="font-mono text-[13px] text-ink-100 text-right tabular">
        ${order.total.toLocaleString("es-AR")}
      </span>
    </div>
  );
}

function statusToBadge(status: OrderStatus): string {
  switch (status) {
    case "pagado":
      return "bg-blue-soft text-blue";
    case "preparando":
      return "bg-amber-soft text-amber";
    case "listo":
      return "bg-green-soft text-green";
    case "entregado":
      return "bg-green-soft text-green";
    case "cancelado":
      return "bg-danger-soft text-danger";
    default:
      return "bg-ink-800 text-ink-300";
  }
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="bg-ink-925/50 border border-dashed border-ink-800 rounded-lg p-6 text-center text-xs text-ink-400">
      {text}
    </div>
  );
}
