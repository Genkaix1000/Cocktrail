"use client";

import {
  History,
  LogOut,
  Power,
  QrCode,
  LayoutDashboard,
  Palette,
  Wine,
  CreditCard,
  Users,
  ChevronDown,
  ChevronRight,
  Printer,
  CalendarDays,
  FileText,
  X,
  Sun,
  Moon,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Tag,
  User,
  DollarSign,
  Clock,
  ChevronUp,
  Shield,
  Percent,
  Undo,
  Ban,
  Globe,
  Database,
  Wifi,
  Activity,
  CheckCircle,
  Bell,
  KeyRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

import CashSaleModal from "@/components/CashSaleModal";
import CloseNightModal from "@/components/CloseNightModal";
import OpenNightModal from "@/components/OpenNightModal";
import { BrandLogo } from "@/components/BrandLogo";
import { useTheme } from "@/components/ThemeProvider";
import { OSHeadbar, OSProfileFooter } from "@/components/OSHeadbar";

import { byCreatedAtDesc, STATUS_META } from "@/lib/orderStatus";
import { computeTotals } from "@/lib/totals";
import { useSSE } from "@/lib/useSSE";
import { formatHm } from "@/lib/utils";

import { eventsService } from "@/services/events.service";
import { authService } from "@/services/auth.service";
import { ordersService } from "@/services/orders.service";
import { apiFetch } from "@/services/api-client";

import GeneralSection from "@/components/settings/GeneralSection";
import CartaSection from "@/components/settings/CartaSection";
import PagosSection from "@/components/settings/PagosSection";
import UsuariosSection from "@/components/settings/UsuariosSection";

import DashboardSection from "@/components/admin/DashboardSection";
import type { AuditLogEntry } from "@/components/admin/DashboardSection";
import EstadisticasSection from "@/components/admin/EstadisticasSection";
import HistorialSection from "@/components/admin/HistorialSection";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";

import type {
  CashSale,
  EventSummary,
  NightEvent,
  Order,
  OrderStatus,
  Role,
} from "@cocktrail/shared";

type Props = {
  initialEvent: NightEvent | null;
  initialOrders: Order[];
  initialCashSales: CashSale[];
};

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const formatMonthYear = (ts: number) => {
  const d = new Date(ts);
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${month} ${year}`;
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

const formatDateHourDetailed = (ts: number) => {
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hr = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} - ${hr}:${min} hs`;
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
  const { theme, isDark, toggleDark } = useTheme();

  // Basic layout state
  const [event, setEvent] = useState(initialEvent);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [cashSales, setCashSales] = useState<CashSale[]>(initialCashSales);
  const [modalOpen, setModalOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [editKeywordOpen, setEditKeywordOpen] = useState(false);
  const [summary, setSummary] = useState<EventSummary | null>(null);

  // Tab & sidebar navigation state
  const [activeTab, setActiveTab] = useState<string>("monitoreo");
  const [openOperaciones, setOpenOperaciones] = useState(true);
  const [openConfiguracion, setOpenConfiguracion] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Profile footer state
  const [currentUser, setCurrentUser] = useState<{ role: Role; username?: string } | null>(null);

  // Historial lazy data state
  const [historyEvents, setHistoryEvents] = useState<EventSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState<Order[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [viewAllNights, setViewAllNights] = useState(false);
  const [selectedLogOrder, setSelectedLogOrder] = useState<Order | null>(null);
  const [cancelConfirmText, setCancelConfirmText] = useState("");
  const [showCancelInput, setShowCancelInput] = useState(false);

  useEffect(() => {
    setShowCancelInput(false);
    setCancelConfirmText("");
  }, [selectedLogOrder]);

  // System Logs & Status state
  const [systemLogs, setSystemLogs] = useState<AuditLogEntry[]>([]);
  const [staffCount, setStaffCount] = useState(8);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [isTabTransitioning, setIsTabTransitioning] = useState(false);
  const [chartMetric, setChartMetric] = useState<"sales" | "glasses">("sales");

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFirstLoad(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  const fetchSystemLogs = useCallback(async () => {
    try {
      const data = await apiFetch<AuditLogEntry[]>("/api/system/logs");
      setSystemLogs(data || []);
    } catch (err) {
      console.error("Error fetching system logs:", err);
    }
  }, []);

  // Filtering & Sorting State
  const [selectedLogMonth, setSelectedLogMonth] = useState<string>("");
  const [selectedLogDay, setSelectedLogDay] = useState<string>("");
  const [currentLogPage, setCurrentLogPage] = useState(1);
  const logItemsPerPage = 10;
  
  const [logSortField, setLogSortField] = useState<"time" | "ticket" | "creator" | "method" | "total">("time");
  const [logSortDirection, setLogSortDirection] = useState<"desc" | "asc">("desc");

  // Puente Historial → Logs: la implementación real vive acá (Logs sigue
  // inline por ahora); HistorialSection no conoce Logs, solo invoca este
  // callback con el timestamp de la noche elegida.
  const onRedirectToLogs = (ts: number) => {
    const monthKey = formatMonthYear(ts);
    const dayKey = formatDayMonth(ts);

    setViewAllNights(true);
    setSelectedLogMonth(monthKey);
    setSelectedLogDay(dayKey);
    fetchLogs(true);
    setActiveTab("logs");
  };

  // Group logs by month first, then by day
  const groupedLogData = useMemo(() => {
    const groups: Record<string, Record<string, Order[]>> = {};
    const sorted = [...auditLogs].sort((a, b) => b.createdAt - a.createdAt);
    
    for (const o of sorted) {
      const monthKey = formatMonthYear(o.createdAt);
      const dayKey = formatDayMonth(o.createdAt);
      
      if (!groups[monthKey]) {
        groups[monthKey] = {};
      }
      if (!groups[monthKey][dayKey]) {
        groups[monthKey][dayKey] = [];
      }
      groups[monthKey][dayKey].push(o);
    }
    return groups;
  }, [auditLogs]);

  // Months available sorted chronologically
  const logMonths = useMemo(() => {
    const keys = Object.keys(groupedLogData);
    const monthTimestamps: Record<string, number> = {};
    for (const mKey of keys) {
      const dayKeys = Object.keys(groupedLogData[mKey]);
      let maxTs = 0;
      for (const dKey of dayKeys) {
        const orders = groupedLogData[mKey][dKey];
        if (orders.length > 0 && orders[0].createdAt > maxTs) {
          maxTs = orders[0].createdAt;
        }
      }
      monthTimestamps[mKey] = maxTs;
    }
    return keys.sort((a, b) => monthTimestamps[b] - monthTimestamps[a]);
  }, [groupedLogData]);

  // Set default month
  useEffect(() => {
    if (logMonths.length > 0 && !selectedLogMonth) {
      setSelectedLogMonth(logMonths[0]);
    }
  }, [logMonths, selectedLogMonth]);

  // Days in selected month
  const logDays = useMemo(() => {
    if (!selectedLogMonth || !groupedLogData[selectedLogMonth]) return [];
    return Object.keys(groupedLogData[selectedLogMonth]).sort((a, b) => {
      const [dayA, monthA] = a.split("/").map(Number);
      const [dayB, monthB] = b.split("/").map(Number);
      if (monthA !== monthB) return monthB - monthA;
      return dayB - dayA;
    });
  }, [groupedLogData, selectedLogMonth]);

  // Set default day when selected month or days list updates
  useEffect(() => {
    if (logDays.length > 0) {
      if (!selectedLogDay || !logDays.includes(selectedLogDay)) {
        setSelectedLogDay(logDays[0]);
      }
    } else {
      setSelectedLogDay("");
    }
  }, [logDays, selectedLogMonth, selectedLogDay]);

  // Reset page when day or month changes
  useEffect(() => {
    setCurrentLogPage(1);
  }, [selectedLogDay, selectedLogMonth]);

  // Raw logs for current selected month and day
  const currentDayLogs = useMemo(() => {
    if (!selectedLogMonth || !selectedLogDay || !groupedLogData[selectedLogMonth]) return [];
    return groupedLogData[selectedLogMonth][selectedLogDay] || [];
  }, [groupedLogData, selectedLogMonth, selectedLogDay]);

  // Sorted logs
  const sortedLogs = useMemo(() => {
    const sorted = [...currentDayLogs];
    sorted.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";
      
      if (logSortField === "time") {
        valA = a.createdAt;
        valB = b.createdAt;
      } else if (logSortField === "ticket") {
        valA = a.displayNumber;
        valB = b.displayNumber;
      } else if (logSortField === "creator") {
        valA = (a.createdBy || "Cliente").toLowerCase();
        valB = (b.createdBy || "Cliente").toLowerCase();
      } else if (logSortField === "method") {
        valA = (a.paymentMethod === "efectivo" ? "Efectivo" : "Posnet").toLowerCase();
        valB = (b.paymentMethod === "efectivo" ? "Efectivo" : "Posnet").toLowerCase();
      } else if (logSortField === "total") {
        valA = a.total;
        valB = b.total;
      }
      
      if (valA < valB) return logSortDirection === "asc" ? -1 : 1;
      if (valA > valB) return logSortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [currentDayLogs, logSortField, logSortDirection]);

  const totalLogPages = Math.ceil(sortedLogs.length / logItemsPerPage);

  const paginatedLogs = useMemo(() => {
    const start = (currentLogPage - 1) * logItemsPerPage;
    return sortedLogs.slice(start, start + logItemsPerPage);
  }, [sortedLogs, currentLogPage]);

  const logPaginationRange = useMemo(() => {
    return getPaginationRange(currentLogPage, totalLogPages);
  }, [currentLogPage, totalLogPages]);

  const handleSort = (field: typeof logSortField) => {
    if (logSortField === field) {
      setLogSortDirection(d => d === "asc" ? "desc" : "asc");
    } else {
      setLogSortField(field);
      setLogSortDirection("desc");
    }
    setCurrentLogPage(1);
  };

  // QR print page state
  const ENV_HOST = process.env.NEXT_PUBLIC_LAN_HOST;
  const [qrUrl, setQrUrl] = useState<string>("");

  const fetchLogs = useCallback(async (all: boolean = false) => {
    setLoadingLogs(true);
    try {
      const data = await ordersService.getAuditLogs(all);
      setAuditLogs(data);
      setLogsLoaded(true);
    } catch (err) {
      console.error("Error fetching logs:", err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "logs" && !logsLoaded) {
      fetchLogs(viewAllNights);
    }
  }, [activeTab, logsLoaded, fetchLogs, viewAllNights]);

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

  // Fetch history and system info on mount
  useEffect(() => {
    setLoadingHistory(true);
    eventsService
      .getHistory()
      .then((data) => {
        setHistoryEvents((data || []).filter(e => e.totals.total > 0));
        setLoadingHistory(false);
        setHistoryLoaded(true);
      })
      .catch(() => setLoadingHistory(false));

    fetchSystemLogs();
    
    // Poll system logs (fallback backup)
    const interval = setInterval(() => {
      fetchSystemLogs();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchSystemLogs]);

  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setStaffCount(data.length);
      })
      .catch(() => {});
  }, []);

  // QR code url resolver
  useEffect(() => {
    const host = ENV_HOST?.trim() || (typeof window !== "undefined" ? window.location.origin : "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQrUrl(`${host.replace(/\/$/, "")}/carta`);
  }, [ENV_HOST]);

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

  const handleQrPrint = () => {
    if (!qrUrl) return;
    window.print();
  };

  const totals = useMemo(
    () => computeTotals(orders, cashSales),
    [orders, cashSales],
  );

  const pendingDeliveries = useMemo(
    () => orders.filter((o) => o.status === "pendiente").length,
    [orders],
  );

  const sortedOrders = useMemo(
    () =>
      orders.filter((o) => o.status !== "cancelado").sort(byCreatedAtDesc),
    [orders],
  );

  const customPaymentBreakdown = useMemo(() => {
    const effectiveEfectivo = totals.efectivoTotal;
    const effectiveQR = totals.qrTotal;
    const effectiveDebito = totals.debitoTotal;
    const effectiveWeb = totals.webTotal;

    return [
      {
        method: "efectivo",
        label: "Efectivo",
        total: effectiveEfectivo,
        count: totals.efectivoCount,
        pct: totals.total > 0 ? Math.round((effectiveEfectivo / totals.total) * 100) : 45,
        color: "#10b981"
      },
      {
        method: "tarjeta",
        label: "Tarjeta",
        total: effectiveDebito + effectiveWeb,
        count: totals.debitoCount + totals.webCount,
        pct: totals.total > 0 ? Math.round(((effectiveDebito + effectiveWeb) / totals.total) * 100) : 35,
        color: "#3b82f6"
      },
      {
        method: "qr",
        label: "Transferencia / QR",
        total: effectiveQR,
        count: totals.qrCount,
        pct: totals.total > 0 ? Math.round((effectiveQR / totals.total) * 100) : 15,
        color: "#a855f7"
      },
      {
        method: "otros",
        label: "Otros",
        total: Math.max(0, totals.total - (effectiveEfectivo + effectiveQR + effectiveDebito + effectiveWeb)),
        count: 0,
        pct: totals.total > 0 ? Math.max(0, 100 - (Math.round((effectiveEfectivo / totals.total) * 100) + Math.round(((effectiveDebito + effectiveWeb) / totals.total) * 100) + Math.round((effectiveQR / totals.total) * 100))) : 5,
        color: "#f97316"
      }
    ].filter(b => b.total > 0 || b.pct > 0);
  }, [totals]);

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
        fetchSystemLogs();
      },
      "order.updated": ({ order }) => {
        setOrders((prev) => {
          const idx = prev.findIndex((o) => o.id === order.id);
          if (idx === -1) return [...prev, order];
          const next = [...prev];
          next[idx] = order;
          return next;
        });
        fetchSystemLogs();
      },
      "cash_sale.added": ({ cashSale }) => {
        setCashSales((prev) =>
          prev.some((s) => s.id === cashSale.id) ? prev : [...prev, cashSale],
        );
        fetchSystemLogs();
      },
      "event.closed": ({ summary: s }) => {
        setSummary(s);
        setModalOpen(true);
        refetch();
        fetchSystemLogs();
        setHistoryLoaded(false); // Force reload next time history tab is opened
      },
      "event.opened": ({ event: newEvent }) => {
        setEvent(newEvent);
        refetch();
      },
    },
    {
      onOpen: () => {
        refetch();
        fetchSystemLogs();
      },
    },
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

  // Analytics computation hook — se llama una sola vez acá; DashboardSection,
  // EstadisticasSection y HistorialSection reciben el resultado ya calculado
  // por prop en vez de volver a llamar useAdminAnalytics (evitaría recalcular
  // el mismo useMemo varias veces). AdminClient ya no destructura campos
  // individuales: es puro shell, cada vista extrae lo que necesita de
  // `analytics`.
  const analytics = useAdminAnalytics(totals, event?.startedAt, orders, cashSales, historyEvents);

  // Breadcrumbs computation
  const breadcrumbs = useMemo(() => {
    switch (activeTab) {
      case "monitoreo":
        return ["Administración", "Dashboard", "Monitoreo"];
      case "estadisticas":
        return ["Administración", "Dashboard", "Métricas"];
      case "historial":
        return ["Administración", "Operación", "Historial de Noches"];
      case "logs":
        return ["Administración", "Operación", "Auditoría de Tickets"];
      case "qr":
        return ["Administración", "Operación", "Imprimir QR"];
      case "general":
        return ["Administración", "Configuración", "General"];
      case "carta":
        return ["Administración", "Configuración", "Carta"];
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

    const footerBorderClass = isBosko ? "border-white/10" : "border-ink-800";
    
    const avatarClass = isBosko
      ? "bg-white/10 border border-white/20 text-[#fffeb3]"
      : `bg-ink-800 border border-ink-700 text-ink-500 ${accentColorClass}`;
      
    const footerTextClass = isBosko ? "text-white font-semibold" : "text-ink-50 font-semibold";
    const footerSubtextClass = isBosko ? "text-white/50" : "text-ink-450";
    
    const footerBtnClass = isBosko
      ? "bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-[#fffeb3]"
      : "bg-ink-850 hover:bg-ink-800 border border-ink-700 text-ink-300";

    return (
      <aside className={`
        w-[280px] shrink-0 flex flex-col print:hidden
        ${isDrawer ? "h-full" : "h-full hidden md:flex"}
        ${sidebarClass}
      `}>
        {/* Brand logo top */}
        <div className="h-[60px] flex items-center justify-center border-b border-current/15 shrink-0 w-full">
          <BrandLogo size="lg" />
        </div>

        {/* Scroller layout */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-6 no-scrollbar">
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
                  onClick={() => handleTabChange("logs")}
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
                  <span className={`text-[13.5px] ${navLabelClass("pagos")}`}>Mercado Pago</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {event?.status === "activo" && (
          <div className="px-5 mb-2 shrink-0 flex flex-col gap-2">
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

        {/* Sidebar Profile Card Footer */}
        <OSProfileFooter onLogout={logout} username={currentUser?.username} role={currentUser?.role} />
      </aside>
    );
  };

  if (!event) {
    return (
      <main className="min-h-screen bg-ink-950 text-ink-50 flex items-center justify-center p-6">
        <OpenNightModal mode="open" onSubmit={(ev) => setEvent(ev)} />
      </main>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-ink-950">
      <main className="flex-1 flex flex-col md:flex-row relative overflow-hidden h-full">
      <CashSaleModal open={cashOpen} onClose={() => setCashOpen(false)} />
      <OpenNightModal
        mode="edit"
        open={editKeywordOpen}
        onClose={() => setEditKeywordOpen(false)}
        onSubmit={(ev) => setEvent(ev)}
        currentKeyword={event.keyword}
      />
      <CloseNightModal
        open={modalOpen}
        totals={totals}
        pendingDeliveries={pendingDeliveries}
        startedAt={event.startedAt}
        summary={summary}
        onConfirm={handleCloseConfirm}
        onClose={handleModalClose}
        onCloseAndShutdown={() => {
          setModalOpen(false);
          window.dispatchEvent(new CustomEvent("cocktrail-trigger-shutdown"));
        }}
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

          <div className="flex items-center gap-4">
            <OSHeadbar activeScreen="Administración" />
          </div>
        </header>
        {/* Dynamic Section Contents */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-ink-950 min-h-0">
          {activeTab === "monitoreo" && (
            <DashboardSection
              analytics={analytics}
              event={event}
              orders={orders}
              cashSales={cashSales}
              totals={totals}
              historyEvents={historyEvents}
              systemLogs={systemLogs}
              customPaymentBreakdown={customPaymentBreakdown}
              isFirstLoad={isFirstLoad}
              isTabTransitioning={isTabTransitioning}
              activeTab={activeTab}
              chartMetric={chartMetric}
              setChartMetric={setChartMetric}
              isBosko={isBosko}
              barColorClass={barColorClass}
            />
          )}

          {/* TAB 2: METRICAS (The new stats bar chart card) */}
          {activeTab === "estadisticas" && (
            <EstadisticasSection
              analytics={analytics}
              totals={totals}
              isBosko={isBosko}
              barColorClass={barColorClass}
            />
          )}

          {activeTab === "historial" && (
            <HistorialSection
              analytics={analytics}
              historyEvents={historyEvents}
              loadingHistory={loadingHistory}
              historyLoaded={historyLoaded}
              isTabTransitioning={isTabTransitioning}
              isBosko={isBosko}
              onRedirectToLogs={onRedirectToLogs}
            />
          )}

          {/* TAB 4: QR PRINT (qr page layout directly inside admin view) */}
          {activeTab === "qr" && (
            <div key={activeTab} className="space-y-6 max-w-xl mx-auto text-center py-6 animate-dashboard-in">
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

          {/* TAB 4.5: AUDITORIA DE LOGS */}
          {activeTab === "logs" && (
            <div key={activeTab} className="space-y-6 max-w-6xl mx-auto w-full animate-dashboard-in">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
                      <FileText size={16} />
                    </div>
                    <span>Auditoría de Tickets</span>
                  </h1>
                  <p className="text-[13px] text-ink-400/80 mt-1">
                    Historial completo de todos los tickets emitidos, con registro de operadores y estado de canje.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !viewAllNights;
                      setViewAllNights(nextVal);
                      fetchLogs(nextVal);
                    }}
                    className={`h-10 px-4 rounded-xl border text-[12px] font-bold uppercase tracking-[0.08em] flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-[0.97] ${
                      viewAllNights
                        ? "bg-accent-soft/20 border-accent/35 text-accent shadow-sm"
                        : "bg-ink-800 border-ink-700 text-ink-100 hover:text-ink-50"
                    }`}
                  >
                    <CalendarDays size={14} />
                    {viewAllNights ? "Ver Noche Actual" : "Ver Noches Anteriores"}
                  </button>

                  <button
                    type="button"
                    onClick={() => fetchLogs(viewAllNights)}
                    disabled={loadingLogs}
                    className="h-10 px-4 rounded-xl bg-ink-800 border border-ink-700 text-ink-100 hover:text-ink-50 text-[12px] font-bold uppercase tracking-[0.08em] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 select-none active:scale-[0.97]"
                  >
                    <RefreshCw size={14} className={loadingLogs ? "animate-spin" : ""} />
                    Actualizar
                  </button>
                </div>
              </div>

              {/* Filtros de Fecha: Mes -> Días */}
              {!loadingLogs && logMonths.length > 0 && (
                <div className="space-y-4">
                  {/* Meses */}
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-ink-800">
                    {logMonths.map((month) => (
                      <button
                        key={month}
                        type="button"
                        onClick={() => setSelectedLogMonth(month)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                          selectedLogMonth === month
                            ? "bg-accent/20 text-accent border border-accent/35 shadow-sm"
                            : "bg-ink-900 border border-ink-800 text-ink-400 hover:text-ink-200"
                        }`}
                      >
                        {month}
                      </button>
                    ))}
                  </div>

                  {/* Días dentro del mes seleccionado */}
                  {logDays.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                      {logDays.map((day) => {
                        const ordersForDay = groupedLogData[selectedLogMonth]?.[day] || [];
                        const firstOrderTs = ordersForDay[0]?.createdAt;
                        let dayLabel = day;
                        if (firstOrderTs) {
                          const d = new Date(firstOrderTs);
                          const weekdays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
                          dayLabel = `${weekdays[d.getDay()]} ${d.getDate()}`;
                        }
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => setSelectedLogDay(day)}
                            className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                              selectedLogDay === day
                                ? "bg-ink-700 text-ink-50 border border-ink-600 shadow-sm"
                                : "bg-ink-900/40 border border-ink-850 text-ink-450 hover:text-ink-250"
                            }`}
                          >
                            {dayLabel}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {loadingLogs ? (
                <div className="flex justify-center items-center h-64 bg-ink-900 border border-ink-800 rounded-xl">
                  <span className="text-sm text-ink-400 font-mono">Cargando logs...</span>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="bg-ink-900 border border-ink-800 rounded-xl p-10 text-center">
                  <p className="text-sm text-ink-500 font-serif-italic">— No hay tickets registrados en el historial —</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {paginatedLogs.length === 0 ? (
                    <div className="bg-ink-900 border border-ink-800 rounded-xl p-10 text-center text-ink-500 font-serif-italic text-sm">
                      — No hay tickets para mostrar en este día —
                    </div>
                  ) : (
                    <>
                      <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden shadow-xl">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-ink-950 border-b border-ink-800 text-[13px] font-bold select-none">
                                <th
                                  onClick={() => handleSort("time")}
                                  className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                                    logSortField === "time"
                                      ? isBosko
                                        ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                        : "bg-blue/10 text-blue font-bold"
                                      : "text-ink-200"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <Clock size={13} className={logSortField === "time" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                    <span>Hora</span>
                                    <span className={`transition-all duration-200 ${logSortField === "time" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                                      {logSortField === "time" && logSortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                    </span>
                                  </div>
                                </th>
                                <th
                                  onClick={() => handleSort("ticket")}
                                  className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                                    logSortField === "ticket"
                                      ? isBosko
                                        ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                        : "bg-blue/10 text-blue font-bold"
                                      : "text-ink-200"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <Tag size={13} className={logSortField === "ticket" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                    <span>Ticket</span>
                                    <span className={`transition-all duration-200 ${logSortField === "ticket" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                                      {logSortField === "ticket" && logSortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                    </span>
                                  </div>
                                </th>
                                <th className="py-4 px-5 text-ink-200 font-bold">
                                  <div className="flex items-center gap-1.5">
                                    <Wine size={13} className="text-ink-400" />
                                    <span>Detalle</span>
                                  </div>
                                </th>
                                <th
                                  onClick={() => handleSort("creator")}
                                  className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                                    logSortField === "creator"
                                      ? isBosko
                                        ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                        : "bg-blue/10 text-blue font-bold"
                                      : "text-ink-200"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <User size={13} className={logSortField === "creator" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                    <span>Creador</span>
                                    <span className={`transition-all duration-200 ${logSortField === "creator" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                                      {logSortField === "creator" && logSortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                    </span>
                                  </div>
                                </th>
                                <th
                                  onClick={() => handleSort("method")}
                                  className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                                    logSortField === "method"
                                      ? isBosko
                                        ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                        : "bg-blue/10 text-blue font-bold"
                                      : "text-ink-200"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <CreditCard size={13} className={logSortField === "method" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                    <span>Medio de Pago</span>
                                    <span className={`transition-all duration-200 ${logSortField === "method" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                                      {logSortField === "method" && logSortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                    </span>
                                  </div>
                                </th>
                                <th
                                  onClick={() => handleSort("total")}
                                  className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                                    logSortField === "total"
                                      ? isBosko
                                        ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                        : "bg-blue/10 text-blue font-bold"
                                      : "text-ink-200"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <DollarSign size={13} className={logSortField === "total" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                    <span>Total</span>
                                    <span className={`transition-all duration-200 ${logSortField === "total" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                                      {logSortField === "total" && logSortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                    </span>
                                  </div>
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-850">
                              {paginatedLogs.map((log, idx) => {
                                const isCancelled = log.status === "cancelado";

                                return (
                                  <tr
                                    key={log.id}
                                    onClick={() => setSelectedLogOrder(log)}
                                    className={`hover:bg-ink-850/30 transition-colors cursor-pointer text-[13px] group ${
                                      idx % 2 === 0 ? "bg-ink-800/30" : ""
                                    } ${
                                      isCancelled ? "opacity-60 line-through decoration-ink-600" : ""
                                    }`}
                                  >
                                    <td className={`py-3 px-5 font-mono text-[12.5px] transition-all ${
                                      logSortField === "time"
                                        ? isBosko
                                          ? "text-[#4ade80] font-bold"
                                          : "text-blue font-bold"
                                        : "text-ink-300"
                                    }`}>
                                      {formatHm(log.createdAt)} hs
                                    </td>
                                    <td className="py-3 px-5">
                                      <span className={`w-12 h-10 flex items-center justify-center rounded-xl bg-ink-800 border font-mono font-black text-[14px] shrink-0 transition-all ${
                                        logSortField === "ticket"
                                          ? isBosko
                                            ? "text-[#4ade80] border-[#4ade80]/40"
                                            : "text-blue border-blue-line"
                                          : "text-ink-100 border-ink-750"
                                      }`}>
                                        #{log.displayNumber}
                                      </span>
                                    </td>
                                    <td className="py-3 px-5 max-w-[200px] sm:max-w-[300px]">
                                      <span className="text-[12px] text-ink-200 truncate font-semibold block" title={log.items.map(it => `${it.qty}x ${it.name}`).join(", ")}>
                                        {log.items.map(it => `${it.qty}x ${it.name}`).join(", ")}
                                      </span>
                                    </td>
                                    <td className="py-3 px-5">
                                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all ${
                                        logSortField === "creator"
                                          ? isBosko
                                            ? "bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20"
                                            : "bg-blue/10 text-blue border border-blue/20"
                                          : "bg-ink-850 text-ink-300 border border-ink-750"
                                      }`}>
                                        <User size={11} className={logSortField === "creator" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                        <span>{log.createdBy || "Cliente"}</span>
                                      </span>
                                    </td>
                                    <td className={`py-3 px-5 transition-all ${
                                      logSortField === "method"
                                        ? isBosko
                                          ? "text-[#4ade80] font-bold"
                                          : "text-blue font-bold"
                                        : "text-ink-400"
                                    }`}>
                                      <span>
                                        {log.paymentMethod === "efectivo"
                                          ? "Efectivo"
                                          : log.paymentMethod === "debito"
                                          ? "Posnet"
                                          : log.paymentMethod === "qr"
                                          ? "QR"
                                          : log.paymentMethod}
                                      </span>
                                    </td>
                                    <td className={`py-3 px-5 font-mono font-black transition-all ${
                                      logSortField === "total"
                                        ? isBosko
                                          ? "text-[#4ade80]"
                                          : "text-blue"
                                        : "text-ink-100"
                                    }`}>
                                      <span>${log.total.toLocaleString("es-AR")}</span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Pagination Section (Limitada a 7 celdas con gaps) */}
                      {totalLogPages > 1 && (
                        <div className="flex items-center justify-center gap-1.5 pt-4">
                          <button
                            onClick={() => setCurrentLogPage((p) => Math.max(1, p - 1))}
                            disabled={currentLogPage === 1}
                            className="w-9 h-9 rounded-lg border border-ink-800 bg-ink-900 hover:bg-ink-850 text-ink-400 hover:text-ink-50 flex items-center justify-center transition-all disabled:opacity-30 disabled:hover:bg-ink-900 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ArrowLeft size={14} />
                          </button>

                          {logPaginationRange.map((page, idx) => {
                            if (page === "...") {
                              return (
                                <span
                                  key={`gap-${idx}`}
                                  className="w-9 h-9 flex items-center justify-center text-ink-500 font-mono"
                                >
                                  ...
                                </span>
                              );
                            }
                            return (
                              <button
                                key={page}
                                onClick={() => setCurrentLogPage(Number(page))}
                                className={`w-9 h-9 rounded-lg border font-mono text-xs transition-all cursor-pointer ${
                                  currentLogPage === page
                                    ? "bg-accent/15 text-accent border-accent/20 font-bold"
                                    : "bg-ink-900 border-ink-800 text-ink-400 hover:text-ink-200 hover:bg-ink-850"
                                }`}
                              >
                                {page}
                              </button>
                            );
                          })}

                          <button
                            onClick={() => setCurrentLogPage((p) => Math.min(totalLogPages, p + 1))}
                            disabled={currentLogPage === totalLogPages}
                            className="w-9 h-9 rounded-lg border border-ink-800 bg-ink-900 hover:bg-ink-850 text-ink-400 hover:text-ink-50 flex items-center justify-center transition-all disabled:opacity-30 disabled:hover:bg-ink-900 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Log Order Detail Popup */}
              {selectedLogOrder && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
                  <div className="bg-ink-900 border border-white/10 w-full max-w-sm rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
                      <div>
                        <div className="flex items-center gap-2">
                          <Tag size={18} className="text-accent" />
                          <h3 className="font-mono text-lg font-black text-ink-50">Ticket #{selectedLogOrder.displayNumber}</h3>
                        </div>
                        <p className="font-mono text-[10px] text-ink-400 select-all mt-0.5">{selectedLogOrder.token}</p>
                      </div>
                      <button onClick={() => setSelectedLogOrder(null)} className="p-2.5 bg-white/5 rounded-full active:scale-90 transition-transform cursor-pointer">
                        <X size={18} />
                      </button>
                    </div>

                    <div className="flex flex-col gap-3 py-2 max-h-[35vh] overflow-y-auto">
                      {selectedLogOrder.items.map((item) => (
                        <div key={item.drinkId} className="flex justify-between items-start text-sm">
                          <div className="flex gap-2 min-w-0">
                            <Wine size={14} className="text-ink-400 mt-0.5 shrink-0" />
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-ink-50 truncate">{item.name}</span>
                              <span className="text-xs text-ink-400 font-mono tabular">{item.qty} x ${item.unitPrice.toLocaleString("es-AR")}</span>
                            </div>
                          </div>
                          <span className="font-mono font-bold text-ink-200">${item.subtotal.toLocaleString("es-AR")}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-2 font-mono text-xs">
                      <div className="flex justify-between text-ink-300">
                        <div className="flex items-center gap-1.5">
                          <User size={13} className="text-ink-450" />
                          <span>Creado por</span>
                        </div>
                        <span className="font-bold">{selectedLogOrder.createdBy || "Cliente"}</span>
                      </div>
                      <div className="flex justify-between text-ink-300">
                        <div className="flex items-center gap-1.5">
                          {selectedLogOrder.paymentMethod === "efectivo" ? (
                            <DollarSign size={13} className="text-green" />
                          ) : (
                            <CreditCard size={13} className="text-blue" />
                          )}
                          <span>Medio de pago</span>
                        </div>
                        <span className="font-bold">
                          {selectedLogOrder.paymentMethod === "efectivo"
                            ? "Efectivo"
                            : selectedLogOrder.paymentMethod === "debito"
                            ? "Posnet"
                            : selectedLogOrder.paymentMethod === "qr"
                            ? "QR"
                            : selectedLogOrder.paymentMethod}
                        </span>
                      </div>
                      <div className="flex justify-between text-ink-300">
                        <div className="flex items-center gap-1.5">
                          <Clock size={13} className="text-ink-450" />
                          <span>Creación</span>
                        </div>
                        <span>{formatDateHourDetailed(selectedLogOrder.createdAt)}</span>
                      </div>

                      {selectedLogOrder.status === "entregado" && (
                        <div className="p-2.5 rounded-lg bg-green-soft border border-green-line text-green mt-2 flex flex-col gap-1">
                          <span className="font-bold uppercase text-[9px] tracking-wider">Detalles de Entrega:</span>
                          {selectedLogOrder.deliveredByBar && (
                            <span className="text-[10px]">Barra: {selectedLogOrder.deliveredByBar}</span>
                          )}
                          {selectedLogOrder.deliveredBy && (
                            <span className="text-[10px]">Operador: {selectedLogOrder.deliveredBy}</span>
                          )}
                          {selectedLogOrder.redeemMethod && (
                            <span className="text-[10px] capitalize">
                              Método: {selectedLogOrder.redeemMethod === "manual" ? "Manual" : "Escaneo QR"}
                            </span>
                          )}
                          {selectedLogOrder.deliveredAt && (
                            <span className="text-[10px]">
                              Hora: {new Date(selectedLogOrder.deliveredAt).toLocaleString("es-AR")}
                            </span>
                          )}
                        </div>
                      )}

                      {selectedLogOrder.status === "cancelado" && (
                        <div className="p-2.5 rounded-lg bg-danger-soft border border-danger-line text-danger mt-2 flex flex-col gap-1">
                          <span className="font-bold uppercase text-[9px] tracking-wider">Detalles de Cancelación:</span>
                          <span className="text-[10px]">Cancelado por: {selectedLogOrder.cancelledBy || "sistema"}</span>
                          {selectedLogOrder.cancelledAt && (
                            <span className="text-[10px]">Hora: {new Date(selectedLogOrder.cancelledAt).toLocaleString("es-AR")}</span>
                          )}
                        </div>
                      )}

                      <div className="flex justify-between text-base font-black text-ink-50 pt-2 border-t border-white/5 pb-2">
                        <div className="flex items-center gap-1.5">
                          <Tag size={15} className="text-blue" />
                          <span>TOTAL</span>
                        </div>
                        <span className="text-blue">${selectedLogOrder.total.toLocaleString("es-AR")}</span>
                      </div>

                      {/* Cancel Flow inline in details */}
                      {selectedLogOrder.status !== "cancelado" && selectedLogOrder.status !== "entregado" && (
                        !showCancelInput ? (
                          <button
                            type="button"
                            onClick={() => setShowCancelInput(true)}
                            className="w-full mt-2 h-11 bg-danger-soft hover:bg-danger-soft/80 border border-danger-line text-danger font-black rounded-xl active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <X size={14} strokeWidth={2.5} />
                            Cancelar Ticket
                          </button>
                        ) : (
                          <div className="mt-3 p-3.5 bg-danger-soft/20 border border-danger-line rounded-xl space-y-2.5 animate-in slide-in-from-top-2 duration-200 text-left">
                            <label className="text-[10px] font-bold text-danger uppercase tracking-wider block">
                              Escribí exactamente "cancelar" para confirmar:
                            </label>
                            <input
                              type="text"
                              value={cancelConfirmText}
                              onChange={(e) => setCancelConfirmText(e.target.value)}
                              placeholder="Escribir aquí..."
                              className="w-full h-10 px-3 bg-ink-950 border border-danger-line/30 rounded-lg text-sm text-ink-50 focus:outline-none focus:border-danger transition-all font-mono"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowCancelInput(false);
                                  setCancelConfirmText("");
                                }}
                                className="flex-1 h-9 bg-ink-800 hover:bg-ink-750 text-ink-300 rounded-lg text-xs font-semibold cursor-pointer"
                              >
                                Atrás
                              </button>
                              <button
                                type="button"
                                disabled={cancelConfirmText !== "cancelar"}
                                onClick={async () => {
                                  try {
                                    const updated = await ordersService.updateStatus(selectedLogOrder.id, "cancelado");
                                    setAuditLogs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
                                    setSelectedLogOrder(updated);
                                    setShowCancelInput(false);
                                    setCancelConfirmText("");
                                  } catch (err) {
                                    alert(err instanceof Error ? err.message : "Error al cancelar el ticket");
                                  }
                                }}
                                className="flex-1 h-9 bg-danger text-white rounded-lg text-xs font-bold uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              >
                                Confirmar
                              </button>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: SETTINGS GENERAL */}
          {activeTab === "general" && (
            <div key="general" className="animate-dashboard-in">
              <GeneralSection />
            </div>
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

          {/* TAB 8: SETTINGS STAFF */}
          {activeTab === "usuarios" && (
            <div key="usuarios" className="animate-dashboard-in">
              <UsuariosSection />
            </div>
          )}

        </div>
      </div>
    </main>
    </div>
  );
}
