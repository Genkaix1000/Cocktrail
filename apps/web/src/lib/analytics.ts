/**
 * analytics.ts — Funciones de cálculo para el sistema de gestión económica.
 *
 * Todas las funciones son puras: reciben datos y devuelven resultados computados.
 * No dependen de estado de React ni del DOM.
 */

import type {
  Order,
  CashSale,
  EventSummary,
  EventTotals,
  DrinkSold,
} from "@cocktrail/shared";

// ─────────────────────── Types ───────────────────────

export type DeltaInfo = {
  value: number;
  pct: number; // porcentaje de cambio (puede ser negativo)
  direction: "up" | "down" | "neutral";
  label: string; // e.g. "+12%" or "-5%" or "—"
};

export type HourlySlot = {
  label: string;
  hour: number;
  digitalSales: number;
  digitalCount: number;
  cashSales: number;
  cashCount: number;
  totalSales: number;
  totalCount: number;
};

export type ProductRevenue = {
  drinkId: number;
  name: string;
  qty: number;
  subtotal: number;
  pctRevenue: number;
  pctQty: number;
};

export type PaymentBreakdown = {
  method: string;
  label: string;
  total: number;
  count: number;
  pct: number;
  color: string;
};

export type NightRecord = {
  type: "star_drink";
  label: string;
  value: string;
  sub: string;
  event?: EventSummary;
};

/**
 * Un "día" de historial unifica todas las sesiones (`EventSummary`) cerradas
 * el mismo día calendario en un solo registro con totales sumados — lo
 * construye `HistorialSection.tsx` (agrupando por `dateKey`) y lo consume
 * `NightComparator.tsx` para el selector de detalle/comparación. Vive acá
 * (no en el componente) porque ambos lo necesitan tipado sin recurrir a un
 * cast `as any[]`.
 */
export type UnifiedNightDay = {
  dateKey: string;
  monthLabel: string;
  startedAt: number;
  closedAt: number;
  sessions: EventSummary[];
  totals: {
    total: number;
    webTotal: number;
    webCount: number;
    efectivoTotal: number;
    efectivoCount: number;
    qrTotal: number;
    qrCount: number;
    debitoTotal: number;
    debitoCount: number;
    drinksSold: DrinkSold[];
  };
  orderCounter: number;
  cashSalesCount: number;
};

// ─────────────────────── A1: Delta Comparativo ───────────────────────

export function computeDelta(current: number, previous: number): DeltaInfo {
  if (previous === 0 && current === 0) {
    return { value: 0, pct: 0, direction: "neutral", label: "—" };
  }
  if (previous === 0) {
    return { value: current, pct: 100, direction: "up", label: "+100%" };
  }
  const diff = current - previous;
  const pct = Math.round((diff / previous) * 100);
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "neutral";
  const sign = pct > 0 ? "+" : "";
  return { value: diff, pct, direction, label: `${sign}${pct}%` };
}

export function getLastNightTotals(
  historyEvents: EventSummary[],
): EventTotals | null {
  if (historyEvents.length === 0) return null;
  // History is sorted by closedAt desc — first item is the most recent
  return historyEvents[0]!.totals;
}

// ─────────────────────── B1: Revenue por Producto ───────────────────────

export function computeProductRevenue(
  drinksSold: DrinkSold[],
): ProductRevenue[] {
  const totalRev = drinksSold.reduce((s, d) => s + d.subtotal, 0);
  const totalQty = drinksSold.reduce((s, d) => s + d.qty, 0);

  return drinksSold
    .map((d) => ({
      drinkId: d.drinkId,
      name: d.name,
      qty: d.qty,
      subtotal: d.subtotal,
      pctRevenue: totalRev > 0 ? Math.round((d.subtotal / totalRev) * 100) : 0,
      pctQty: totalQty > 0 ? Math.round((d.qty / totalQty) * 100) : 0,
    }))
    .sort((a, b) => b.subtotal - a.subtotal);
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMins = minutes % 60;
  return `${hours}h ${remainMins}m`;
}

// ─────────────────────── B4: Hourly Heatmap Data ───────────────────────

export function computeHourlySlots(
  event: { startedAt: number },
  orders: Order[],
  cashSales: CashSale[],
): HourlySlot[] {
  const activeOrders = orders.filter((o) => o.status !== "cancelado");
  const allTimestamps = [
    ...activeOrders.map((o) => new Date(o.createdAt).getTime()),
    ...cashSales.map((s) => new Date(s.createdAt).getTime()),
  ];

  let minTime = event.startedAt;
  let maxTime = Date.now();

  if (allTimestamps.length > 0) {
    minTime = Math.min(...allTimestamps);
    maxTime = Math.max(...allTimestamps);
  } else if (!event.startedAt) {
    // Sin evento activo ni operaciones: no hay rango real que graficar.
    // Sin este clamp, minTime queda en epoch (0) y el diff con "ahora"
    // genera cientos de miles de franjas horarias (ver RangeError en
    // useAdminAnalytics al hacer Math.max sobre ese array).
    minTime = maxTime;
  }

  const startHourDate = new Date(minTime);
  startHourDate.setMinutes(0, 0, 0);

  const endHourDate = new Date(maxTime);
  endHourDate.setMinutes(0, 0, 0);

  // Compute number of hours difference
  const msDiff = endHourDate.getTime() - startHourDate.getTime();
  const hoursDiff = Math.max(1, Math.round(msDiff / (3600 * 1000))) + 1; // inclusive

  const slots: HourlySlot[] = [];
  for (let i = 0; i < hoursDiff; i++) {
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
      totalCount: 0,
    });
  }

  for (const order of activeOrders) {
    const hr = new Date(order.createdAt).getHours();
    const slot = slots.find((s) => s.hour === hr);
    if (slot) {
      slot.digitalSales += order.total;
      slot.digitalCount += 1;
      slot.totalSales += order.total;
      slot.totalCount += 1;
    }
  }

  for (const sale of cashSales) {
    const hr = new Date(sale.createdAt).getHours();
    const slot = slots.find((s) => s.hour === hr);
    if (slot) {
      slot.cashSales += sale.amount;
      slot.cashCount += 1;
      slot.totalSales += sale.amount;
      slot.totalCount += 1;
    }
  }

  return slots;
}

export function findPeakHours(slots: HourlySlot[]): {
  peakRevenue: HourlySlot | null;
  peakOps: HourlySlot | null;
} {
  if (slots.length === 0) return { peakRevenue: null, peakOps: null };
  const byRevenue = [...slots].sort((a, b) => b.totalSales - a.totalSales);
  const byOps = [...slots].sort((a, b) => b.totalCount - a.totalCount);
  return {
    peakRevenue:
      byRevenue[0] && byRevenue[0].totalSales > 0 ? byRevenue[0] : null,
    peakOps: byOps[0] && byOps[0].totalCount > 0 ? byOps[0] : null,
  };
}

// ─────────────────────── C3: Records ───────────────────────

const RECORDS_WINDOW_DAYS = 30;

/**
 * Subconjunto de noches dentro de los últimos `windowDays`, con fallback al
 * historial completo si no hay ninguna en la ventana — usado por los
 * récords y por "Promedio Noche" para no promediar/rankear contra eventos
 * de hace meses (ver docs/specs/simplificar-dashboard-admin.md).
 */
export function filterRecentNights(
  historyEvents: EventSummary[],
  windowDays = RECORDS_WINDOW_DAYS,
): EventSummary[] {
  const windowStart = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const recent = historyEvents.filter(
    (e) => (e.closedAt ?? e.startedAt) >= windowStart,
  );
  return recent.length > 0 ? recent : historyEvents;
}

/**
 * Trago Estrella sobre una ventana reciente en vez de todo el historial
 * acumulado — si no hay noches en la ventana (ej. barra recién arrancando o
 * mes flojo), cae al historial completo para no mostrar "sin datos"
 * habiendo datos más viejos. (Mejor/Peor Noche y Noche Más Larga se
 * eliminaron — no cambiaban ninguna decisión, ver
 * docs/specs/simplificar-historial-noches.md).
 */
export function computeNightRecords(
  historyEvents: EventSummary[],
  windowDays = RECORDS_WINDOW_DAYS,
): NightRecord[] {
  if (historyEvents.length === 0) return [];

  const scoped = filterRecentNights(historyEvents, windowDays);
  const windowStart = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const hasRecent = historyEvents.some((e) => (e.closedAt ?? e.startedAt) >= windowStart);
  const windowLabel = hasRecent ? `últimos ${windowDays} días` : "historial total";

  const records: NightRecord[] = [];

  // Star drink (most sold dentro de la ventana)
  const drinkAcc = new Map<number, { name: string; qty: number }>();
  for (const e of scoped) {
    for (const d of e.totals.drinksSold) {
      const acc = drinkAcc.get(d.drinkId);
      if (acc) {
        acc.qty += d.qty;
      } else {
        drinkAcc.set(d.drinkId, { name: d.name, qty: d.qty });
      }
    }
  }
  const starEntries = Array.from(drinkAcc.values()).sort(
    (a, b) => b.qty - a.qty,
  );
  if (starEntries.length > 0) {
    const star = starEntries[0]!;
    records.push({
      type: "star_drink",
      label: "Trago Estrella",
      value: star.name,
      sub: `${star.qty} unidades vendidas (${windowLabel})`,
    });
  }

  return records;
}

// ─────────────────────── C4: Aggregated Deltas ───────────────────────

export function computeWeeklyDelta(historyEvents: EventSummary[]): {
  thisWeek: number;
  lastWeek: number;
  delta: DeltaInfo;
  thisWeekCount: number;
  thisWeekStart: number;
} {
  const now = new Date();
  const thisWeekStart = getWeekStart(now);
  const lastWeekStart = thisWeekStart - 7 * 24 * 60 * 60 * 1000;

  let thisWeek = 0;
  let lastWeek = 0;
  let thisWeekCount = 0;

  for (const e of historyEvents) {
    const ts = e.closedAt ?? e.startedAt;
    if (ts >= thisWeekStart) {
      thisWeek += e.totals.total;
      thisWeekCount++;
    } else if (ts >= lastWeekStart && ts < thisWeekStart) {
      lastWeek += e.totals.total;
    }
  }

  return { thisWeek, lastWeek, delta: computeDelta(thisWeek, lastWeek), thisWeekCount, thisWeekStart };
}

export function computeMonthlyDelta(historyEvents: EventSummary[]): {
  thisMonth: number;
  lastMonth: number;
  delta: DeltaInfo;
  thisMonthCount: number;
  thisMonthStart: number;
} {
  const now = new Date();
  const thisMonthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).getTime();
  const lastMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
  ).getTime();

  let thisMonth = 0;
  let lastMonth = 0;
  let thisMonthCount = 0;

  for (const e of historyEvents) {
    const ts = e.closedAt ?? e.startedAt;
    if (ts >= thisMonthStart) {
      thisMonth += e.totals.total;
      thisMonthCount++;
    } else if (ts >= lastMonthStart && ts < thisMonthStart) {
      lastMonth += e.totals.total;
    }
  }

  return { thisMonth, lastMonth, delta: computeDelta(thisMonth, lastMonth), thisMonthCount, thisMonthStart };
}

function getWeekStart(d: Date): number {
  const day = d.getDay();
  const offset = day === 0 ? 6 : day - 1;
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offset);
  return start.getTime();
}

// ─────────────────────── D1: CSV Export ───────────────────────

export function exportHistoryCSV(historyEvents: EventSummary[]): string {
  const WEEKDAYS = [
    "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
  ];
  const header =
    "Fecha,Día,Total,Ventas Web,Ventas Barra,Duración (min),Top 1,Top 2,Top 3";
  const rows = historyEvents.map((e) => {
    const d = new Date(e.closedAt ?? e.startedAt);
    const dateStr = d.toLocaleDateString("es-AR");
    const dayName = WEEKDAYS[d.getDay()];
    const duration = e.closedAt
      ? Math.round((e.closedAt - e.startedAt) / 60000)
      : 0;

    const webSales = e.totals.webTotal;
    const barraSales = e.totals.efectivoTotal + e.totals.qrTotal + e.totals.debitoTotal;

    const top3 = e.totals.drinksSold.slice(0, 3).map((t) => `${t.name} (×${t.qty})`);
    return [
      dateStr,
      dayName,
      e.totals.total,
      webSales,
      barraSales,
      duration,
      top3[0] ?? "",
      top3[1] ?? "",
      top3[2] ?? "",
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

