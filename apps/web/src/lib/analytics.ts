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

export type SegmentedTicket = {
  digital: number; // promedio de pedidos digitales
  barra: number; // promedio de ventas barra (CashSale)
  general: number; // promedio combinado
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

export type OperationalVelocity = {
  avgReactionTime: number | null; // pagado → preparando (ms)
  avgPrepTime: number | null; // preparando → listo (ms)
  avgWaitTime: number | null; // listo → entregado (ms)
  avgTotalTime: number | null; // pagado → entregado (ms)
};

export type NightRecord = {
  type: "best" | "worst" | "longest" | "shortest" | "star_drink";
  label: string;
  value: string;
  sub: string;
  event?: EventSummary;
};

export type SmartInsight = {
  icon: string;
  text: string;
  tone: "positive" | "negative" | "neutral";
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

// ─────────────────────── A2: Tasa de Cancelación ───────────────────────

export function computeCancellationRate(orders: Order[]): {
  rate: number; // 0-100
  cancelled: number;
  total: number;
  lostRevenue: number;
} {
  const total = orders.length;
  const cancelledOrders = orders.filter((o) => o.status === "cancelado");
  const cancelled = cancelledOrders.length;
  const lostRevenue = cancelledOrders.reduce((s, o) => s + o.total, 0);
  const rate = total > 0 ? Math.round((cancelled / total) * 100) : 0;
  return { rate, cancelled, total, lostRevenue };
}

// ─────────────────────── A3: Conversión Digital ───────────────────────

export function computeDigitalConversion(
  orders: Order[],
  cashSales: CashSale[],
): {
  rate: number; // 0-100
  digitalCount: number;
  totalOps: number;
} {
  const digitalCount = orders.filter((o) => o.status !== "cancelado").length;
  const totalOps = digitalCount + cashSales.length;
  const rate = totalOps > 0 ? Math.round((digitalCount / totalOps) * 100) : 0;
  return { rate, digitalCount, totalOps };
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

// ─────────────────────── B2: Distribución por Método de Pago ───────────────────────

export function computePaymentBreakdown(
  totals: EventTotals,
): PaymentBreakdown[] {
  const webTotal = totals.webTotal;
  const webCount = totals.webCount;

  const barraTotal =
    totals.efectivoTotal + totals.qrTotal + totals.debitoTotal;
  const barraCount =
    totals.efectivoCount + totals.qrCount + totals.debitoCount;

  const grandTotal = totals.total;
  const all = [
    {
      method: "web",
      label: "Página Web",
      total: webTotal,
      count: webCount,
      color: "#6db3f2",
    },
    {
      method: "barra",
      label: "Ventas Barra",
      total: barraTotal,
      count: barraCount,
      color: "#c084fc",
    },
  ];

  return all
    .filter((a) => a.total > 0 || a.count > 0)
    .map((a) => ({
      ...a,
      pct: grandTotal > 0 ? Math.round((a.total / grandTotal) * 100) : 0,
    }));
}

// ─────────────────────── B3: Velocidad Operativa ───────────────────────

export function computeOperationalVelocity(
  orders: Order[],
): OperationalVelocity {
  const delivered = orders.filter(
    (o) => o.status === "entregado" && o.deliveredAt,
  );

  if (delivered.length === 0) {
    return {
      avgReactionTime: null,
      avgPrepTime: null,
      avgWaitTime: null,
      avgTotalTime: null,
    };
  }

  let totalTime = 0;
  let countTotal = 0;

  for (const o of delivered) {
    totalTime += o.deliveredAt! - o.createdAt;
    countTotal++;
  }

  return {
    avgReactionTime: null,
    avgPrepTime: null,
    avgWaitTime: null,
    avgTotalTime: countTotal > 0 ? totalTime / countTotal : null,
  };
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
  slotCount = 10,
): HourlySlot[] {
  const startHourDate = new Date(event.startedAt);
  startHourDate.setMinutes(0, 0, 0);

  const slots: HourlySlot[] = [];
  for (let i = 0; i < slotCount; i++) {
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

  for (const order of orders) {
    if (order.status === "cancelado") continue;
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

// ─────────────────────── B5: Ticket Promedio Segmentado ───────────────────────

export function computeSegmentedTicket(
  orders: Order[],
  cashSales: CashSale[],
): SegmentedTicket {
  const validOrders = orders.filter((o) => o.status !== "cancelado");

  // Web purchases
  const webOrders = validOrders.filter((o) => o.createdBy === "Cliente");
  const webTotal = webOrders.reduce((s, o) => s + o.total, 0);
  const webCount = webOrders.length;

  // Barra purchases = cashSales + orders with other payment methods
  const barraOrders = validOrders.filter((o) => o.createdBy !== "Cliente");
  const barraOrdersTotal = barraOrders.reduce((s, o) => s + o.total, 0);
  const barraOrdersCount = barraOrders.length;

  const cashSalesTotal = cashSales.reduce((s, c) => s + c.amount, 0);
  const cashSalesCount = cashSales.length;

  const barraTotal = barraOrdersTotal + cashSalesTotal;
  const barraCount = barraOrdersCount + cashSalesCount;

  const digital = webCount > 0 ? Math.round(webTotal / webCount) : 0;
  const barra = barraCount > 0 ? Math.round(barraTotal / barraCount) : 0;
  const generalTotal = webTotal + barraTotal;
  const generalCount = webCount + barraCount;
  const general = generalCount > 0 ? Math.round(generalTotal / generalCount) : 0;

  return { digital, barra, general };
}

// ─────────────────────── C1: Evolución de Noches ───────────────────────

export type NightPoint = {
  id: string;
  date: string; // "Vie 6 jun"
  total: number;
  web: number;
  efectivo: number;
  orderCount: number;
  closedAt: number;
};

export function computeNightEvolution(
  historyEvents: EventSummary[],
  maxNights = 15,
): NightPoint[] {
  const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const MONTHS_SHORT = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];

  // historyEvents is sorted newest first; we want oldest first for the chart
  const sorted = [...historyEvents].reverse().slice(-maxNights);

  return sorted.map((e) => {
    const d = new Date(e.closedAt ?? e.startedAt);
    return {
      id: e.id,
      date: `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`,
      total: e.totals.total,
      web: e.totals.webTotal,
      efectivo: e.totals.efectivoTotal,
      orderCount: e.orderCounter,
      closedAt: e.closedAt ?? e.startedAt,
    };
  });
}

export function computeMovingAverage(
  points: NightPoint[],
  window = 3,
): (number | null)[] {
  return points.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) {
      sum += points[j]!.total;
    }
    return Math.round(sum / window);
  });
}

// ─────────────────────── C3: Records ───────────────────────

export function computeNightRecords(
  historyEvents: EventSummary[],
): NightRecord[] {
  if (historyEvents.length === 0) return [];

  const WEEKDAYS = [
    "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
  ];
  const MONTHS_SHORT = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  };

  const records: NightRecord[] = [];

  // Best night by revenue
  const best = [...historyEvents].sort(
    (a, b) => b.totals.total - a.totals.total,
  )[0]!;
  records.push({
    type: "best",
    label: "Mejor Noche",
    value: `$${best.totals.total.toLocaleString("es-AR")}`,
    sub: formatDate(best.closedAt ?? best.startedAt),
    event: best,
  });

  // Worst night (exclude events shorter than 1 hour)
  const validNights = historyEvents.filter((e) => {
    if (!e.closedAt) return false;
    return e.closedAt - e.startedAt >= 3600 * 1000;
  });
  if (validNights.length > 0) {
    const worst = [...validNights].sort(
      (a, b) => a.totals.total - b.totals.total,
    )[0]!;
    records.push({
      type: "worst",
      label: "Peor Noche",
      value: `$${worst.totals.total.toLocaleString("es-AR")}`,
      sub: formatDate(worst.closedAt ?? worst.startedAt),
      event: worst,
    });
  }

  // Longest night
  const withDuration = historyEvents
    .filter((e) => e.closedAt)
    .map((e) => ({ ...e, duration: e.closedAt! - e.startedAt }));
  if (withDuration.length > 0) {
    const longest = [...withDuration].sort(
      (a, b) => b.duration - a.duration,
    )[0]!;
    const hrs = Math.floor(longest.duration / (60 * 60 * 1000));
    const mins = Math.round(
      (longest.duration % (60 * 60 * 1000)) / 60000,
    );
    records.push({
      type: "longest",
      label: "Noche Más Larga",
      value: `${hrs}h ${mins}m`,
      sub: formatDate(longest.closedAt ?? longest.startedAt),
      event: longest,
    });
  }

  // Star drink (most sold across all nights)
  const drinkAcc = new Map<number, { name: string; qty: number }>();
  for (const e of historyEvents) {
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
      sub: `${star.qty} unidades vendidas (historial total)`,
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

  return { thisWeek, lastWeek, delta: computeDelta(thisWeek, lastWeek), thisWeekCount };
}

export function computeMonthlyDelta(historyEvents: EventSummary[]): {
  thisMonth: number;
  lastMonth: number;
  delta: DeltaInfo;
  thisMonthCount: number;
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

  return { thisMonth, lastMonth, delta: computeDelta(thisMonth, lastMonth), thisMonthCount };
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

// ─────────────────────── D2: Smart Insights ───────────────────────

export function generateInsights(
  totals: EventTotals,
  orders: Order[],
  cashSales: CashSale[],
  hourlySlots: HourlySlot[],
  lastNight: EventTotals | null,
): SmartInsight[] {
  const insights: SmartInsight[] = [];

  // Delta vs last night
  if (lastNight) {
    const delta = computeDelta(totals.total, lastNight.total);
    if (delta.direction === "up") {
      insights.push({
        icon: "📈",
        text: `Esta noche facturaste un ${delta.label} más que la noche anterior.`,
        tone: "positive",
      });
    } else if (delta.direction === "down") {
      insights.push({
        icon: "📉",
        text: `Esta noche estás facturando un ${Math.abs(delta.pct)}% menos que la noche anterior.`,
        tone: "negative",
      });
    }
  }

  // Star drink
  if (totals.drinksSold.length > 0) {
    const star = totals.drinksSold[0]!;
    const totalRev = totals.drinksSold.reduce((s, d) => s + d.subtotal, 0);
    const pct =
      totalRev > 0 ? Math.round((star.subtotal / totalRev) * 100) : 0;
    insights.push({
      icon: "🍹",
      text: `Tu trago estrella es ${star.name} con ×${star.qty} unidades (${pct}% del revenue de tragos).`,
      tone: "neutral",
    });
  }

  // Peak hour
  const peaks = findPeakHours(hourlySlots);
  if (peaks.peakRevenue) {
    insights.push({
      icon: "⏰",
      text: `La hora pico fue a las ${peaks.peakRevenue.label} hs con $${peaks.peakRevenue.totalSales.toLocaleString("es-AR")} facturados.`,
      tone: "neutral",
    });
  }

  // Web conversion
  const webOrdersCount = orders.filter((o) => o.status !== "cancelado" && o.createdBy === "Cliente").length;
  const totalOpsCount = orders.filter((o) => o.status !== "cancelado").length + cashSales.length;
  if (totalOpsCount > 0) {
    const rate = Math.round((webOrdersCount / totalOpsCount) * 100);
    const tone = rate >= 50 ? "positive" : rate >= 30 ? "neutral" : "negative";
    insights.push({
      icon: "🌐",
      text: `El ${rate}% de las ventas totales se realizaron a través de la Web (${webOrdersCount} de ${totalOpsCount}).`,
      tone,
    });
  }

  // Hourly redemption wait delay
  const delivered = orders.filter(
    (o) => o.status === "entregado" && o.deliveredAt,
  );
  if (delivered.length > 0) {
    const hourlyDelays = new Map<number, { totalDelay: number; count: number }>();
    for (const o of delivered) {
      const hr = new Date(o.createdAt).getHours();
      const delay = o.deliveredAt! - o.createdAt;
      const existing = hourlyDelays.get(hr) || { totalDelay: 0, count: 0 };
      existing.totalDelay += delay;
      existing.count += 1;
      hourlyDelays.set(hr, existing);
    }

    let worstHour = -1;
    let worstAvgDelay = -1;
    for (const [hr, data] of hourlyDelays.entries()) {
      const avg = data.totalDelay / data.count;
      if (avg > worstAvgDelay) {
        worstAvgDelay = avg;
        worstHour = hr;
      }
    }

    if (worstHour !== -1 && worstAvgDelay > 10 * 1000) {
      const delayStr = formatDuration(worstAvgDelay);
      const hourStr = `${String(worstHour).padStart(2, "0")}:00`;
      insights.push({
        icon: "⏳",
        text: `La hora con mayor demora de canje en barra fue a las ${hourStr} hs, tardando un promedio de ${delayStr} por pedido.`,
        tone: worstAvgDelay > 5 * 60 * 1000 ? "negative" : "neutral",
      });
    }
  }

  return insights;
}
