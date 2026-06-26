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
  FileText,
  X,
  Download,
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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

import CashSaleModal from "@/components/CashSaleModal";
import CloseNightModal from "@/components/CloseNightModal";
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

import GeneralSection from "@/components/settings/GeneralSection";
import CartaSection from "@/components/settings/CartaSection";
import PagosSection from "@/components/settings/PagosSection";
import UsuariosSection from "@/components/settings/UsuariosSection";

import PaymentDonut from "@/components/analytics/PaymentDonut";
import RevenueByProduct from "@/components/analytics/RevenueByProduct";
import NightEvolutionChart from "@/components/analytics/NightEvolutionChart";
import NightRecords from "@/components/analytics/NightRecords";
import OperationalVelocity from "@/components/analytics/OperationalVelocity";
import SmartInsights from "@/components/analytics/SmartInsights";
import NightComparator from "@/components/analytics/NightComparator";

import {
  computeDelta,
  getLastNightTotals,
  computeCancellationRate,
  computeDigitalConversion,
  computeProductRevenue,
  computePaymentBreakdown,
  computeOperationalVelocity,
  computeHourlySlots,
  findPeakHours,
  computeSegmentedTicket,
  computeNightEvolution,
  computeMovingAverage,
  computeNightRecords,
  computeWeeklyDelta,
  computeMonthlyDelta,
  exportHistoryCSV,
  downloadCSV,
  generateInsights
} from "@/lib/analytics";

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

  // Filtering & Sorting State
  const [selectedLogMonth, setSelectedLogMonth] = useState<string>("");
  const [selectedLogDay, setSelectedLogDay] = useState<string>("");
  const [currentLogPage, setCurrentLogPage] = useState(1);
  const logItemsPerPage = 10;
  
  const [logSortField, setLogSortField] = useState<"time" | "ticket" | "creator" | "method" | "total">("time");
  const [logSortDirection, setLogSortDirection] = useState<"desc" | "asc">("desc");

  // History tab filtering & sorting state
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<string>("");
  const [selectedHistoryDay, setSelectedHistoryDay] = useState<any | null>(null);
  const [currentHistoryPage, setCurrentHistoryPage] = useState(1);
  const historyItemsPerPage = 10;
  const [historySortField, setHistorySortField] = useState<"date" | "sessions" | "orders" | "sales" | "total">("date");
  const [historySortDirection, setHistorySortDirection] = useState<"desc" | "asc">("desc");

  // Memoized unified days
  const unifiedHistoryDays = useMemo(() => {
    const groups: { [dateKey: string]: EventSummary[] } = {};
    for (const e of historyEvents) {
      const closedAt = e.closedAt ?? e.startedAt;
      const dateKey = new Date(closedAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(e);
    }

    return Object.entries(groups).map(([dateKey, sessions]) => {
      const latestClosedAt = Math.max(...sessions.map(s => s.closedAt ?? s.startedAt));
      const earliestStartedAt = Math.min(...sessions.map(s => s.startedAt));
      
      const webTotal = sessions.reduce((sum, s) => sum + s.totals.webTotal, 0);
      const webCount = sessions.reduce((sum, s) => sum + s.totals.webCount, 0);
      const efectivoTotal = sessions.reduce((sum, s) => sum + s.totals.efectivoTotal, 0);
      const efectivoCount = sessions.reduce((sum, s) => sum + s.totals.efectivoCount, 0);
      const qrTotal = sessions.reduce((sum, s) => sum + (s.totals.qrTotal || 0), 0);
      const qrCount = sessions.reduce((sum, s) => sum + (s.totals.qrCount || 0), 0);
      const debitoTotal = sessions.reduce((sum, s) => sum + (s.totals.debitoTotal || 0), 0);
      const debitoCount = sessions.reduce((sum, s) => sum + (s.totals.debitoCount || 0), 0);
      const total = sessions.reduce((sum, s) => sum + s.totals.total, 0);
      const orderCounter = sessions.reduce((sum, s) => sum + s.orderCounter, 0);
      const cashSalesCount = sessions.reduce((sum, s) => sum + s.cashSales.length, 0);
      
      const drinksMap: { [drinkId: number]: { drinkId: number; name: string; qty: number; subtotal: number } } = {};
      for (const s of sessions) {
        for (const d of s.totals.drinksSold) {
          if (!drinksMap[d.drinkId]) {
            drinksMap[d.drinkId] = { drinkId: d.drinkId, name: d.name, qty: 0, subtotal: 0 };
          }
          drinksMap[d.drinkId].qty += d.qty;
          drinksMap[d.drinkId].subtotal += d.subtotal || 0;
        }
      }
      const drinksSold = Object.values(drinksMap).sort((a, b) => b.qty - a.qty);
      
      const d = new Date(latestClosedAt);
      const months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
      ];
      const monthLabel = `${months[d.getMonth()]} ${d.getFullYear()}`;
      
      return {
        dateKey,
        monthLabel,
        startedAt: earliestStartedAt,
        closedAt: latestClosedAt,
        sessions,
        totals: {
          total,
          webTotal,
          webCount,
          efectivoTotal,
          efectivoCount,
          qrTotal,
          qrCount,
          debitoTotal,
          debitoCount,
          drinksSold,
        },
        orderCounter,
        cashSalesCount,
      };
    });
  }, [historyEvents]);

  const historyMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    for (const d of unifiedHistoryDays) {
      monthsSet.add(d.monthLabel);
    }
    return Array.from(monthsSet);
  }, [unifiedHistoryDays]);

  useEffect(() => {
    if (historyMonths.length > 0 && !selectedHistoryMonth) {
      setSelectedHistoryMonth(historyMonths[0]);
    }
  }, [historyMonths, selectedHistoryMonth]);

  const filteredAndSortedHistoryDays = useMemo(() => {
    let list = [...unifiedHistoryDays];
    if (selectedHistoryMonth) {
      list = list.filter(d => d.monthLabel === selectedHistoryMonth);
    }
    
    list.sort((a, b) => {
      let valA: any = a.closedAt;
      let valB: any = b.closedAt;
      
      if (historySortField === "sessions") {
        valA = a.sessions.length;
        valB = b.sessions.length;
      } else if (historySortField === "orders") {
        valA = a.orderCounter;
        valB = b.orderCounter;
      } else if (historySortField === "sales") {
        valA = a.cashSalesCount;
        valB = b.cashSalesCount;
      } else if (historySortField === "total") {
        valA = a.totals.total;
        valB = b.totals.total;
      }
      
      if (valA < valB) return historySortDirection === "desc" ? 1 : -1;
      if (valA > valB) return historySortDirection === "desc" ? -1 : 1;
      return 0;
    });
    
    return list;
  }, [unifiedHistoryDays, selectedHistoryMonth, historySortField, historySortDirection]);

  const totalHistoryPages = Math.ceil(filteredAndSortedHistoryDays.length / historyItemsPerPage);
  
  const paginatedHistoryDays = useMemo(() => {
    const startIdx = (currentHistoryPage - 1) * historyItemsPerPage;
    return filteredAndSortedHistoryDays.slice(startIdx, startIdx + historyItemsPerPage);
  }, [filteredAndSortedHistoryDays, currentHistoryPage]);

  const historyPaginationRange = useMemo(() => {
    const range = [];
    for (let i = 1; i <= totalHistoryPages; i++) {
      range.push(i);
    }
    return range;
  }, [totalHistoryPages]);

  const handleHistorySort = (field: "date" | "sessions" | "orders" | "sales" | "total") => {
    if (historySortField === field) {
      setHistorySortDirection(d => (d === "desc" ? "asc" : "desc"));
    } else {
      setHistorySortField(field);
      setHistorySortDirection("desc");
    }
    setCurrentHistoryPage(1);
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

  // Chart interactivity state
  const [activeHoverSlot, setActiveHoverSlot] = useState<number | null>(null);

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

  // Analytics computation hooks
  const {
    maxDrinkQty,
    totalDrinkUnits,
    totalOps,
    avgTicket,
    startedAtStr,
    deltaTotal,
    cancellationInfo,
    digitalConversion,
    productRevenue,
    paymentBreakdown,
    operationalVelocity,
    hourlyData,
    maxHourSales,
    peakHour,
    segmentedTicket,
    nightEvolution,
    movingAvg,
    nightRecords,
    weeklyDelta,
    monthlyDelta,
    allTotal,
    avgNight,
    smartInsights,
    webTotal,
    webCount,
    webPct,
    barraTotal,
    barraCount,
    barraPct,
  } = useMemo(() => {
    // 1. Base Variables
    const _maxDrinkQty = totals.drinksSold[0]?.qty ?? 0;
    const _totalDrinkUnits = totals.drinksSold.reduce((s, d) => s + d.qty, 0);
    
    // Correct totalOps calculation (include QR and Debit)
    const _totalOps =
      totals.efectivoCount +
      totals.qrCount +
      totals.debitoCount;
    const _avgTicket = _totalOps > 0 ? Math.round(totals.total / _totalOps) : 0;

    // Web vs Barra calculation
    const _webTotal = totals.webTotal;
    const _webCount = totals.webCount;
    const _webPct = totals.total > 0 ? Math.round((_webTotal / totals.total) * 100) : 0;

    const _barraTotal = Math.max(0, totals.total - totals.webTotal);
    const _barraCount = Math.max(0, _totalOps - totals.webCount);
    const _barraPct = totals.total > 0 ? Math.round((_barraTotal / totals.total) * 100) : 0;

    const _startedAtStr = formatHm(event.startedAt);

    // 2. New Analytics (A)
    const prevTotals = getLastNightTotals(historyEvents);
    const _deltaTotal = prevTotals ? computeDelta(totals.total, prevTotals.total) : null;
    const _cancellationInfo = computeCancellationRate(orders);
    const _digitalConversion = computeDigitalConversion(orders, cashSales);

    // 3. Dashboards (B)
    const _productRevenue = computeProductRevenue(totals.drinksSold);
    const _paymentBreakdown = computePaymentBreakdown(totals);
    const _operationalVelocity = computeOperationalVelocity(orders);
    const _hourlySlots = computeHourlySlots({ startedAt: event.startedAt }, orders, cashSales);
    const _maxHourSales = Math.max(..._hourlySlots.map((s) => s.totalSales), 1000);
    const peak = findPeakHours(_hourlySlots);
    const _peakHour = peak.peakRevenue ? `${peak.peakRevenue.label} hs` : "—";
    const _segmentedTicket = computeSegmentedTicket(orders, cashSales);

    // 4. Historial & Evolución (C)
    const _nightEvolution = computeNightEvolution(historyEvents);
    const _movingAvg = computeMovingAverage(_nightEvolution, 3);
    const _nightRecords = computeNightRecords(historyEvents);
    const _weeklyDelta = computeWeeklyDelta(historyEvents);
    const _monthlyDelta = computeMonthlyDelta(historyEvents);
    const _allTotal = historyEvents.reduce((s, e) => s + e.totals.total, 0);
    const _avgNight = historyEvents.length > 0 ? Math.round(_allTotal / historyEvents.length) : 0;

    // 5. Smart Insights
    const _smartInsights = generateInsights(
      totals,
      orders,
      cashSales,
      _hourlySlots,
      prevTotals
    );

    return {
      maxDrinkQty: _maxDrinkQty,
      totalDrinkUnits: _totalDrinkUnits,
      totalOps: _totalOps,
      avgTicket: _avgTicket,
      startedAtStr: _startedAtStr,
      deltaTotal: _deltaTotal,
      cancellationInfo: _cancellationInfo,
      digitalConversion: _digitalConversion,
      productRevenue: _productRevenue,
      paymentBreakdown: _paymentBreakdown,
      operationalVelocity: _operationalVelocity,
      hourlyData: _hourlySlots,
      maxHourSales: _maxHourSales,
      peakHour: _peakHour,
      segmentedTicket: _segmentedTicket,
      nightEvolution: _nightEvolution,
      movingAvg: _movingAvg,
      nightRecords: _nightRecords,
      weeklyDelta: _weeklyDelta,
      monthlyDelta: _monthlyDelta,
      allTotal: _allTotal,
      avgNight: _avgNight,
      smartInsights: _smartInsights,
      webTotal: _webTotal,
      webCount: _webCount,
      webPct: _webPct,
      barraTotal: _barraTotal,
      barraCount: _barraCount,
      barraPct: _barraPct,
    };
  }, [totals, event.startedAt, orders, cashSales, historyEvents]);

  // Historial aggregates
  const historyNow = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => {
    const day = historyNow.getDay();
    const offset = day === 0 ? 6 : day - 1;
    const start = new Date(historyNow);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - offset);
    return start.getTime();
  }, [historyNow]);
  
  const monthStart = useMemo(() => {
    return new Date(historyNow.getFullYear(), historyNow.getMonth(), 1, 0, 0, 0, 0).getTime();
  }, [historyNow]);

  const weekEvents = useMemo(() => historyEvents.filter((e) => (e.closedAt ?? 0) >= weekStart), [historyEvents, weekStart]);
  const monthEvents = useMemo(() => historyEvents.filter((e) => (e.closedAt ?? 0) >= monthStart), [historyEvents, monthStart]);
  const sumHistory = (arr: EventSummary[]) => arr.reduce((s, e) => s + e.totals.total, 0);
  const weekTotal = sumHistory(weekEvents);
  const monthTotal = sumHistory(monthEvents);

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
  const accentBorderClass = "border-accent/20";  // Unified
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

            <button
              type="button"
              onClick={() => handleTabChange("estadisticas")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all duration-200 cursor-pointer ${navBtnClass("estadisticas")}`}
            >
              <div className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${navIconClass("estadisticas")}`}>
                <TrendingUp size={16} strokeWidth={1.8} />
              </div>
              <div className="flex flex-col">
                <span className={`text-[14.5px] font-bold ${navLabelClass("estadisticas")}`}>
                  Métricas
                </span>
                <span className={`text-[10px] ${navSublabelClass()}`}>Gráficos de facturación</span>
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

          {event?.status === "activo" && (
            <div className={`border-t pt-4 ${footerBorderClass}`}>
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
        <OSProfileFooter onLogout={logout} username={currentUser?.username} role={currentUser?.role} />
      </aside>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-ink-950">
      <main className="flex-1 flex flex-col md:flex-row relative overflow-hidden h-full">
      <CashSaleModal open={cashOpen} onClose={() => setCashOpen(false)} />
      <CloseNightModal
        open={modalOpen}
        totals={totals}
        pendingDeliveries={pendingDeliveries}
        startedAt={event.startedAt}
        summary={summary}
        onConfirm={handleCloseConfirm}
        onClose={handleModalClose}
        cashierName={currentUser?.username}
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
          
          {/* TAB 1: MONITOREO (Original dashboard grid layout) */}
          {activeTab === "monitoreo" && (
            <div className="space-y-6">
              {/* Row 1: 4 KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <Kpi
                  label="Total noche"
                  value={totals.total}
                  isCurrency
                  sub={
                    totalOps > 0
                      ? `${totalOps} op. · ticket $${avgTicket.toLocaleString("es-AR")}`
                      : "Sin movimientos"
                  }
                  deltaTone={deltaTotal?.direction === "down" ? "neutral" : "up"}
                  deltaText={deltaTotal ? deltaTotal.label : "EN VIVO"}
                />
                <Kpi
                  label="Ventas Web"
                  value={webTotal}
                  isCurrency
                  sub={`${webCount} pedidos · ${webPct}% del total`}
                  deltaTone="neutral"
                  deltaText={`${webPct}%`}
                />
                <Kpi
                  label="Ventas Barra"
                  value={barraTotal}
                  isCurrency
                  sub={`${barraCount} op. · ${barraPct}% del total`}
                  deltaTone="neutral"
                  deltaText={`${barraPct}%`}
                />
                <Kpi
                  label="Tragos"
                  value={totalDrinkUnits}
                  sub={`${totals.drinksSold.length} vars.`}
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

              {/* Row 3: Insights & Velocity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start mt-2">
                <OperationalVelocity velocity={operationalVelocity} isBosko={isBosko} />
                <SmartInsights insights={smartInsights} isBosko={isBosko} />
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {/* Widget A: Segmented Ticket */}
                <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col gap-4 min-w-0">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">
                      Ticket Promedio
                    </span>
                    <span className={`font-mono text-[26px] font-bold leading-none ${accentColorClass}`}>
                      ${segmentedTicket.general.toLocaleString("es-AR")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 border-t border-ink-800 pt-3">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-ink-400">Página Web</span>
                      <span className="font-mono font-bold text-ink-100">${segmentedTicket.digital.toLocaleString("es-AR")}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-ink-400">Ventas Barra</span>
                      <span className="font-mono font-bold text-ink-100">${segmentedTicket.barra.toLocaleString("es-AR")}</span>
                    </div>
                  </div>
                </div>

                {/* Widget B: Payment Donut */}
                <PaymentDonut breakdown={paymentBreakdown} total={totals.total} isBosko={isBosko} />

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

              {/* Revenue by Product */}
              <RevenueByProduct products={productRevenue} isBosko={isBosko} />
            </div>
          )}

          {/* TAB 3: HISTORIAL (night history index list) */}
          {activeTab === "historial" && (
            <div className="space-y-6 max-w-5xl">
              <section className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-ink-400 flex items-center gap-2">
                  <History size={12} /> Resumen
                </span>
                <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight">
                  Noches anteriores
                </h1>
                <p className="text-[12px] text-ink-400 mt-1">
                  Cada noche cerrada se archiva acá con sus totales, pedidos y ventas en efectivo.
                </p>
              </section>

              {/* Aggregations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-ink-900 border border-ink-800 rounded-2xl p-4.5 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">Esta semana</span>
                    <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded tabular ${weeklyDelta.delta.direction === "up" ? "bg-green-soft text-green" : weeklyDelta.delta.direction === "down" ? "bg-danger-soft text-danger" : "bg-ink-800 text-ink-300"}`}>
                      {weeklyDelta.delta.label}
                    </span>
                  </div>
                  <span className={`font-mono text-[24px] font-bold leading-none ${accentColorClass}`}>
                    ${weeklyDelta.thisWeek.toLocaleString("es-AR")}
                  </span>
                  <span className="text-[10px] text-ink-400">{weeklyDelta.thisWeekCount} {weeklyDelta.thisWeekCount === 1 ? "noche" : "noches"}</span>
                </div>
                <div className="bg-ink-900 border border-ink-800 rounded-2xl p-4.5 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400">Este mes</span>
                    <span className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded tabular ${monthlyDelta.delta.direction === "up" ? "bg-green-soft text-green" : monthlyDelta.delta.direction === "down" ? "bg-danger-soft text-danger" : "bg-ink-800 text-ink-300"}`}>
                      {monthlyDelta.delta.label}
                    </span>
                  </div>
                  <span className={`font-mono text-[24px] font-bold leading-none ${accentColorClass}`}>
                    ${monthlyDelta.thisMonth.toLocaleString("es-AR")}
                  </span>
                  <span className="text-[10px] text-ink-400">{monthlyDelta.thisMonthCount} {monthlyDelta.thisMonthCount === 1 ? "noche" : "noches"}</span>
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <NightEvolutionChart points={nightEvolution} movingAvg={movingAvg} isBosko={isBosko} />
                <NightComparator nights={historyEvents} isBosko={isBosko} />
              </div>

              <NightRecords records={nightRecords} isBosko={isBosko} />

              {/* Night list detail */}
              <div className="flex flex-col gap-3.5">
                <div className="flex justify-between items-center">
                  <h2 className="text-[18px] font-bold tracking-tight text-ink-100">
                    Detalle por noche
                  </h2>
                  {historyEvents.length > 0 && (
                    <button
                      onClick={() => {
                        const csv = exportHistoryCSV(historyEvents);
                        downloadCSV(csv, "cocktrail_historial.csv");
                      }}
                      className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-300 hover:text-ink-50 px-2.5 py-1.5 rounded bg-ink-800 border border-ink-700 transition-all cursor-pointer active:scale-95"
                    >
                      <Download size={12} />
                      <span>Exportar CSV</span>
                    </button>
                  )}
                </div>

                {/* Months filtering bar */}
                {!loadingHistory && historyMonths.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-ink-800">
                    {historyMonths.map((month) => (
                      <button
                        key={month}
                        type="button"
                        onClick={() => {
                          setSelectedHistoryMonth(month);
                          setCurrentHistoryPage(1);
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                          selectedHistoryMonth === month
                            ? "bg-accent/20 text-accent border border-accent/35 shadow-sm"
                            : "bg-ink-900 border border-ink-800 text-ink-400 hover:text-ink-200"
                        }`}
                      >
                        {month}
                      </button>
                    ))}
                  </div>
                )}

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
                  <div className="flex flex-col gap-4">
                    {paginatedHistoryDays.length === 0 ? (
                      <div className="bg-ink-900 border border-ink-800 rounded-xl p-10 text-center text-ink-500 font-serif-italic text-sm">
                        — No hay noches archivadas para mostrar en este mes —
                      </div>
                    ) : (
                      <>
                        <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden shadow-xl">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-ink-950 border-b border-ink-800 text-[13px] font-bold select-none">
                                  <th
                                    onClick={() => handleHistorySort("date")}
                                    className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                                      historySortField === "date"
                                        ? isBosko
                                          ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                          : "bg-blue/10 text-blue font-bold"
                                        : "text-ink-200"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <CalendarDays size={13} className={historySortField === "date" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                      <span>Fecha</span>
                                      <span className={`transition-all duration-200 ${historySortField === "date" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                                        {historySortField === "date" && historySortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                      </span>
                                    </div>
                                  </th>
                                  <th
                                    onClick={() => handleHistorySort("sessions")}
                                    className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                                      historySortField === "sessions"
                                        ? isBosko
                                          ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                          : "bg-blue/10 text-blue font-bold"
                                        : "text-ink-200"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <History size={13} className={historySortField === "sessions" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                      <span>Sesiones</span>
                                      <span className={`transition-all duration-200 ${historySortField === "sessions" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                                        {historySortField === "sessions" && historySortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                      </span>
                                    </div>
                                  </th>
                                  <th
                                    onClick={() => handleHistorySort("orders")}
                                    className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                                      historySortField === "orders"
                                        ? isBosko
                                          ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                          : "bg-blue/10 text-blue font-bold"
                                        : "text-ink-200"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <Tag size={13} className={historySortField === "orders" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                      <span>Pedidos</span>
                                      <span className={`transition-all duration-200 ${historySortField === "orders" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                                        {historySortField === "orders" && historySortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                      </span>
                                    </div>
                                  </th>
                                  <th
                                    onClick={() => handleHistorySort("sales")}
                                    className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                                      historySortField === "sales"
                                        ? isBosko
                                          ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                          : "bg-blue/10 text-blue font-bold"
                                        : "text-ink-200"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <Wine size={13} className={historySortField === "sales" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                      <span>Ventas Barra</span>
                                      <span className={`transition-all duration-200 ${historySortField === "sales" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                                        {historySortField === "sales" && historySortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                      </span>
                                    </div>
                                  </th>
                                  <th
                                    onClick={() => handleHistorySort("total")}
                                    className={`py-4 px-5 cursor-pointer hover:bg-ink-900/60 transition-colors group/th ${
                                      historySortField === "total"
                                        ? isBosko
                                          ? "bg-[#4ade80]/10 text-[#4ade80] font-bold"
                                          : "bg-blue/10 text-blue font-bold"
                                        : "text-ink-200"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <DollarSign size={13} className={historySortField === "total" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                      <span>Total</span>
                                      <span className={`transition-all duration-200 ${historySortField === "total" ? "scale-100 opacity-100" : "opacity-0 scale-75"}`}>
                                        {historySortField === "total" && historySortDirection === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                      </span>
                                    </div>
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-ink-850">
                                {paginatedHistoryDays.map((day, idx) => {
                                  const date = formatDateLong(day.closedAt);
                                  return (
                                    <tr
                                      key={day.dateKey}
                                      onClick={() => setSelectedHistoryDay(day)}
                                      className={`hover:bg-ink-850/30 transition-colors cursor-pointer text-[13px] group ${
                                        idx % 2 === 0 ? "bg-ink-800/30" : ""
                                      }`}
                                    >
                                      {/* Fecha Column */}
                                      <td className={`py-3 px-5 font-bold transition-all ${
                                        historySortField === "date"
                                          ? isBosko
                                            ? "text-[#4ade80]"
                                            : "text-blue"
                                          : "text-ink-100"
                                      }`}>
                                        {date.weekday.slice(0, 3)} {date.day}
                                      </td>

                                      {/* Sesiones Column */}
                                      <td className="py-3 px-5">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all ${
                                          historySortField === "sessions"
                                            ? isBosko
                                              ? "bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20"
                                              : "bg-blue/10 text-blue border border-blue/20"
                                            : "bg-ink-850 text-ink-300 border border-ink-750"
                                        }`}>
                                          <History size={11} className={historySortField === "sessions" ? (isBosko ? "text-[#4ade80]" : "text-blue") : "text-ink-400"} />
                                          <span>{day.sessions.length} {day.sessions.length === 1 ? "sesión" : "sesiones"}</span>
                                        </span>
                                      </td>

                                      {/* Pedidos Column */}
                                      <td className={`py-3 px-5 font-mono transition-all ${
                                        historySortField === "orders"
                                          ? isBosko
                                            ? "text-[#4ade80] font-bold"
                                            : "text-blue font-bold"
                                          : "text-ink-300"
                                      }`}>
                                        {day.orderCounter}
                                      </td>

                                      {/* Ventas barra Column */}
                                      <td className={`py-3 px-5 font-mono transition-all ${
                                        historySortField === "sales"
                                          ? isBosko
                                            ? "text-[#4ade80] font-bold"
                                            : "text-blue font-bold"
                                          : "text-ink-300"
                                      }`}>
                                        {day.cashSalesCount}
                                      </td>

                                      {/* Total Column */}
                                      <td className={`py-3 px-5 font-mono font-black transition-all ${
                                        historySortField === "total"
                                          ? isBosko
                                            ? "text-[#4ade80]"
                                            : "text-blue"
                                          : "text-ink-100"
                                      }`}>
                                        ${day.totals.total.toLocaleString("es-AR")}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Pagination Section */}
                        {totalHistoryPages > 1 && (
                          <div className="flex items-center justify-center gap-1.5 pt-4">
                            <button
                              onClick={() => setCurrentHistoryPage((p) => Math.max(1, p - 1))}
                              disabled={currentHistoryPage === 1}
                              className="w-9 h-9 rounded-lg border border-ink-800 bg-ink-900 hover:bg-ink-850 text-ink-400 hover:text-ink-50 flex items-center justify-center transition-all disabled:opacity-30 disabled:hover:bg-ink-900 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ArrowLeft size={14} />
                            </button>

                            {historyPaginationRange.map((page) => (
                              <button
                                key={page}
                                onClick={() => setCurrentHistoryPage(page)}
                                className={`w-9 h-9 rounded-lg border font-mono text-xs transition-all cursor-pointer ${
                                  currentHistoryPage === page
                                    ? "bg-accent/15 text-accent border-accent/20 font-bold"
                                    : "bg-ink-900 border-ink-800 text-ink-400 hover:text-ink-200 hover:bg-ink-850"
                                }`}
                              >
                                {page}
                              </button>
                            ))}

                            <button
                              onClick={() => setCurrentHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                              disabled={currentHistoryPage === totalHistoryPages}
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
              </div>

              {/* History Day Detail Popup */}
              {selectedHistoryDay && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
                  <div className="bg-ink-900 border border-white/10 w-full max-w-2xl rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
                      <div>
                        <div className="flex items-center gap-2">
                          <CalendarDays size={18} className="text-accent" />
                          <h3 className="font-serif-italic text-lg text-ink-50">
                            Noche del {formatDateLong(selectedHistoryDay.closedAt).weekday} {formatDateLong(selectedHistoryDay.closedAt).day} de {formatDateLong(selectedHistoryDay.closedAt).month}
                          </h3>
                        </div>
                        <p className="text-[11px] text-ink-400 font-mono select-all mt-0.5">
                          {selectedHistoryDay.sessions.length} {selectedHistoryDay.sessions.length === 1 ? "sesión registrada" : "sesiones unificadas"}
                        </p>
                      </div>
                      <button onClick={() => setSelectedHistoryDay(null)} className="p-2.5 bg-white/5 rounded-full active:scale-90 transition-transform cursor-pointer">
                        <X size={18} />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-6 pr-1 scrollbar-thin">
                      {/* Unified Totals Card */}
                      <div className="bg-ink-950 border border-ink-800 rounded-2xl p-5 flex flex-col gap-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-400 border-b border-ink-850 pb-2">
                          Totales Consolidados del Día
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400 font-mono">Recaudado</span>
                            <span className="font-mono font-bold text-[20px] text-ink-50">
                              ${selectedHistoryDay.totals.total.toLocaleString("es-AR")}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-blue font-mono">Web Total</span>
                            <span className="font-mono text-[14px] text-ink-200">
                              ${selectedHistoryDay.totals.webTotal.toLocaleString("es-AR")} <span className="text-ink-500 text-xs">({selectedHistoryDay.totals.webCount})</span>
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-green font-mono">Efectivo</span>
                            <span className="font-mono text-[14px] text-ink-200">
                              ${selectedHistoryDay.totals.efectivoTotal.toLocaleString("es-AR")} <span className="text-ink-500 text-xs">({selectedHistoryDay.totals.efectivoCount})</span>
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-400 font-mono">Pedidos / Ventas</span>
                            <span className="font-mono text-[14px] text-ink-200">
                              {selectedHistoryDay.orderCounter} / {selectedHistoryDay.cashSalesCount}
                            </span>
                          </div>
                        </div>

                        {/* Top unified drinks */}
                        {selectedHistoryDay.totals.drinksSold.length > 0 && (
                          <div className="border-t border-ink-850 pt-3 flex flex-col gap-2">
                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">Tragos Vendidos en el Día</span>
                            <div className="flex gap-2.5 flex-wrap">
                              {selectedHistoryDay.totals.drinksSold.map((d: any) => (
                                <span key={d.drinkId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-ink-900 border border-ink-800 text-[12px] text-ink-200">
                                  <span className={`font-mono font-bold ${accentColorClass}`}>×{d.qty}</span>
                                  <span>{d.name}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Sessions List */}
                      <div className="space-y-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-400 block mb-1">
                          Detalle de Sesiones Individuales
                        </span>
                        
                        {selectedHistoryDay.sessions.map((session: any, sIdx: number) => {
                          return (
                            <div key={session.id} className="bg-ink-950/45 border border-ink-850 rounded-2xl p-4 flex flex-col gap-3">
                              <div className="flex justify-between items-center border-b border-ink-850 pb-2.5 flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <span className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-xs ${isBosko ? "bg-[#4ade80]/10 text-[#4ade80]" : "bg-blue/10 text-blue"}`}>
                                    {sIdx + 1}
                                  </span>
                                  <span className="text-xs font-mono text-ink-300">
                                    {formatHm(session.startedAt)} hs → {session.closedAt ? `${formatHm(session.closedAt)} hs` : "Abierto"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {/* Closed by badge */}
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-ink-850 text-ink-300 border border-ink-750">
                                    <User size={11} className="text-ink-400" />
                                    <span>Cerrado por: {session.closedBy || "desconocido"}</span>
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">Recaudado</span>
                                  <span className="text-ink-100 font-bold">${session.totals.total.toLocaleString("es-AR")}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">Web</span>
                                  <span className="text-ink-300">${session.totals.webTotal.toLocaleString("es-AR")} ({session.totals.webCount})</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">Efectivo</span>
                                  <span className="text-ink-300">${session.totals.efectivoTotal.toLocaleString("es-AR")} ({session.totals.efectivoCount})</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-500">Pedidos / Ventas</span>
                                  <span className="text-ink-300">{session.orderCounter} / {session.cashSales.length}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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

          {/* TAB 4.5: AUDITORIA DE LOGS */}
          {activeTab === "logs" && (
            <div className="space-y-6 max-w-6xl mx-auto w-full animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                  <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight">Auditoría de Tickets</h1>
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
    </div>
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
    <div className="bg-ink-900 border border-ink-800/60 rounded-xl p-5 flex flex-col gap-3 min-w-0 shadow-sm transition-all hover:border-accent/15 duration-200">
      <div className="flex justify-between items-center gap-2">
        <span className="text-[13px] font-semibold text-ink-100 block truncate">
          {label}
        </span>
        <span
          className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-md tabular leading-none shrink-0 ${
            deltaTone === "up"
              ? "bg-green-soft text-green"
              : "bg-ink-800 text-ink-300"
          }`}
        >
          {deltaText}
        </span>
      </div>
      <div
        className="text-[28px] font-black text-ink-50 leading-none tabular tracking-tight"
      >
        {isCurrency && (
          <span className="text-ink-450 text-[0.7em] mr-0.5 font-sans font-bold">$</span>
        )}
        {value.toLocaleString("es-AR")}
      </div>
      <span className="text-[12px] text-ink-400/85">{sub}</span>
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  const stateClass = statusToBadge(order.status);
  const itemsCount = order.items.length;
  return (
    <div className="grid grid-cols-[44px_80px_1fr_60px_80px] gap-4 items-center px-5 py-4 rounded-xl hover:bg-ink-850/50 transition-colors border border-transparent hover:border-ink-800/40">
      <span className="font-mono text-[14px] text-ink-50 font-black tabular">
        #{order.displayNumber}
      </span>
      <span
        className={`text-[9px] font-bold uppercase tracking-[0.14em] py-0.5 rounded text-center leading-normal ${stateClass}`}
      >
        {STATUS_META[order.status].short}
      </span>
      <span className="font-mono text-[12px] text-ink-400 tabular">
        {formatHm(order.createdAt)} hs
      </span>
      <span className="text-[12px] text-ink-450 text-right">
        {itemsCount} {itemsCount === 1 ? "ítem" : "ítems"}
      </span>
      <span className="font-mono text-[14px] text-ink-100 text-right font-bold tabular">
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
    <div className="bg-ink-925/50 border border-dashed border-ink-800/60 rounded-xl p-6 text-center text-[13px] text-ink-400/80">
      {text}
    </div>
  );
}
