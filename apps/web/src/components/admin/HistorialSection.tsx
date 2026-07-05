"use client";

import { useEffect, useMemo, useState } from "react";
import {
  History,
  TrendingUp,
  CalendarDays,
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  Tag,
  Wine,
  DollarSign,
  ArrowLeft,
  ArrowRight,
  X,
  User,
} from "lucide-react";

import MetricCard from "@/components/shared/MetricCard";
import NightRecords from "@/components/analytics/NightRecords";
import NightComparator from "@/components/analytics/NightComparator";

import { formatHm } from "@/lib/utils";
import { exportHistoryCSV, downloadCSV } from "@/lib/analytics";

import type { AdminAnalytics } from "@/hooks/useAdminAnalytics";
import type { EventSummary } from "@cocktrail/shared";

type Props = {
  analytics: AdminAnalytics;
  historyEvents: EventSummary[];
  loadingHistory: boolean;
  historyLoaded: boolean;
  isTabTransitioning: boolean;
  isBosko: boolean;
  // Puente Historial → Logs: AdminClient decide qué hacer con el timestamp
  // (setea filtros/activeTab de la vista Logs, que sigue inline). Esta
  // sección no conoce nada de LogsSection, solo invoca el callback.
  onRedirectToLogs: (ts: number) => void;
};

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatShortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

// "Esta Semana" (semana calendario, lun-dom) y "Este Mes" (desde el día 1)
// son ventanas distintas que pueden solaparse solo parcialmente — al
// arrancar un mes, "esta semana" puede incluir días del mes anterior que
// "este mes" no cuenta. Mostrar el rango de fechas de cada card evita que
// esa diferencia se lea como una cuenta mal hecha.
function formatDateRange(start: number, end: number): string {
  return `${formatShortDate(start)}–${formatShortDate(end)}`;
}
const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function formatDateLong(ts: number): { weekday: string; day: number; month: string } {
  const d = new Date(ts);
  return {
    weekday: WEEKDAYS[d.getDay()] ?? "",
    day: d.getDate(),
    month: MONTHS_SHORT[d.getMonth()] ?? "",
  };
}

const historyItemsPerPage = 10;

/**
 * Vista "Historial de Noches" del panel admin — extraída de AdminClient.tsx
 * sin cambios de comportamiento. `historyEvents`/`loadingHistory`/
 * `historyLoaded` siguen viviendo en el shell (AdminClient) porque
 * useAdminAnalytics y DashboardSection también dependen de esos datos —
 * solo el estado/lógica exclusivos de filtrado y paginación de esta vista
 * se movieron acá.
 */
export default function HistorialSection({
  analytics,
  historyEvents,
  loadingHistory,
  historyLoaded,
  isTabTransitioning,
  isBosko,
  onRedirectToLogs,
}: Props) {
  const { weeklyDelta, monthlyDelta, allTotal, avgNight, nightRecords } = analytics;

  // `Date.now()` es impuro: se fija una sola vez al montar para calcular los
  // rangos de fecha de "Esta Semana"/"Este Mes" sin variar en renders
  // sucesivos (mismo patrón que ConfirmView en CloseNightModal.tsx).
  const [now] = useState(() => Date.now());
  const weekRange = formatDateRange(weeklyDelta.thisWeekStart, now);
  const monthRange = formatDateRange(monthlyDelta.thisMonthStart, now);

  // History tab filtering & sorting state
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<string>("");
  const [selectedHistoryDay, setSelectedHistoryDay] = useState<any | null>(null);
  const [currentHistoryPage, setCurrentHistoryPage] = useState(1);
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
      const monthLabel = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;

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

  return (
    <div className="space-y-6 w-full">
      {!historyLoaded || isTabTransitioning ? (
        <div className="space-y-6 animate-dashboard-in">
          {/* Title Skeleton */}
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-ink-800 pb-5">
            <div className="space-y-2">
              <div className="h-8 bg-ink-900 border border-ink-850 rounded-lg w-52 animate-pulse" />
              <div className="h-4 bg-ink-900 border border-ink-850 rounded-lg w-72 animate-pulse" />
            </div>
          </div>

          {/* Cards Skeleton (4 Cards) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-ink-900 border border-ink-800/80 rounded-2xl p-5 animate-pulse h-[125px] flex flex-col justify-between">
                <div className="h-3.5 bg-ink-850 rounded w-1/2" />
                <div className="h-8 bg-ink-850 rounded w-3/4" />
              </div>
            ))}
          </div>

          {/* Records Skeleton (2 cards) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-ink-900 border border-ink-800 rounded-2xl p-5 animate-pulse h-[100px]" />
            ))}
          </div>

          {/* Comparator Skeleton */}
          <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 animate-pulse h-[250px] mt-4" />

          {/* Table List Skeleton */}
          <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 animate-pulse h-[300px] mt-4" />
        </div>
      ) : (
        <div key="historial" className="space-y-6">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-ink-800 pb-5">
            <div>
              <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
                  <History size={16} />
                </div>
                <span>Historial de Noches</span>
              </h1>
              <p className="text-[13px] text-ink-400 mt-1">
                Cada noche cerrada se archiva acá con sus totales, pedidos y ventas en efectivo
              </p>
            </div>
          </div>

          {/* Grids / Aggregations (Boxed style with sparklines and respective icons) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Esta Semana"
              value={weeklyDelta.thisWeek}
              isCurrency
              delta={weeklyDelta.delta}
              icon={CalendarDays}
              color="#10b981"
              sparklineData={historyEvents.slice(0, 5).reverse().map(e => e.totals.total)}
              subtitle={weekRange}
            />
            <MetricCard
              label="Este Mes"
              value={monthlyDelta.thisMonth}
              isCurrency
              delta={monthlyDelta.delta}
              icon={TrendingUp}
              color="#3b82f6"
              sparklineData={historyEvents.slice(0, 5).reverse().map(e => e.totals.total)}
              subtitle={monthRange}
            />
            <MetricCard
              label="Total Archivado"
              value={allTotal}
              isCurrency
              delta={{ label: `${historyEvents.length} noches`, direction: "up", value: 0, pct: 0 }}
              icon={History}
              color="#a855f7"
              sparklineData={historyEvents.slice().reverse().map(e => e.totals.total)}
              subtitle="acumulado"
            />
            <MetricCard
              label="Promedio Noche"
              value={avgNight}
              isCurrency
              delta={{ label: "Promedio", direction: "up", value: 0, pct: 0 }}
              icon={DollarSign}
              color="#f97316"
              sparklineData={historyEvents.slice().reverse().map(e => e.totals.total)}
              subtitle="últimos 30 días"
            />
          </div>

          {/* Records (Mejor noche, Peor noche, Noche más larga) */}
          <NightRecords records={nightRecords} isBosko={isBosko} />

          {/* Comparador de noches (Placed below the records) */}
          <div className="w-full">
            <NightComparator nights={unifiedHistoryDays as any[]} isBosko={isBosko} />
          </div>

          {/* Night list detail */}
          <div className="flex flex-col gap-3.5 pt-4">
            <div className="flex justify-between items-center">
              <h2 className="text-[18px] font-bold tracking-tight text-ink-100 flex items-center gap-2.5 select-none">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
                  <FileText size={13} />
                </div>
                <span>Detalle por Noche</span>
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
                          aria-label="Página anterior"
                          className="w-9 h-9 rounded-lg border border-ink-800 bg-ink-900 hover:bg-ink-850 text-ink-400 hover:text-ink-50 flex items-center justify-center transition-all disabled:opacity-30 disabled:hover:bg-ink-900 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ArrowLeft size={14} />
                        </button>

                        {historyPaginationRange.map((page) => (
                          <button
                            key={page}
                            onClick={() => setCurrentHistoryPage(page)}
                            aria-current={currentHistoryPage === page ? "page" : undefined}
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
                          aria-label="Página siguiente"
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
        </div>
      )}

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
              <button onClick={() => setSelectedHistoryDay(null)} aria-label="Cerrar detalle de la noche" className="p-2.5 bg-white/5 rounded-full active:scale-90 transition-transform cursor-pointer">
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
                          <span className="font-mono font-bold text-accent">×{d.qty}</span>
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

            {/* Footer Actions */}
            <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedHistoryDay(null)}
                className="h-10 px-4 rounded-xl bg-ink-800 border border-ink-750 text-ink-300 hover:text-ink-100 text-xs font-bold uppercase tracking-[0.08em] transition-all cursor-pointer active:scale-95"
              >
                Cerrar
              </button>

              <button
                type="button"
                onClick={() => {
                  onRedirectToLogs(selectedHistoryDay.closedAt || selectedHistoryDay.startedAt);
                  setSelectedHistoryDay(null);
                }}
                className={`h-10 px-4.5 rounded-xl text-ink-950 text-xs font-black uppercase tracking-[0.08em] flex items-center gap-2 transition-all cursor-pointer select-none active:scale-[0.95] ${
                  isBosko ? "bg-[#4ade80]" : "bg-blue"
                }`}
              >
                <FileText size={14} />
                <span>Ver Auditoría de Tickets</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
