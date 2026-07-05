"use client";

import { useMemo } from "react";

import { formatHm } from "@/lib/utils";

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
  computeNightEvolution,
  computeMovingAverage,
  computeNightRecords,
  computeWeeklyDelta,
  computeMonthlyDelta,
  filterRecentNights,
} from "@/lib/analytics";

import type { CashSale, EventSummary, EventTotals, Order } from "@cocktrail/shared";

/**
 * Hook compartido con todos los valores derivados de analytics que consumen
 * tanto DashboardSection (Monitoreo, fusionado con la ex-vista Estadísticas)
 * como HistorialSection en AdminClient. Extraído del useMemo gigante que
 * vivía inline en AdminClient — misma lógica, mismas dependencias.
 */
export function useAdminAnalytics(
  totals: EventTotals,
  eventStartedAt: number | undefined,
  orders: Order[],
  cashSales: CashSale[],
  historyEvents: EventSummary[],
) {
  return useMemo(() => {
    // 1. Base Variables
    const _maxDrinkQty = totals.drinksSold[0]?.qty ?? 0;
    const _totalDrinkUnits = totals.drinksSold.reduce((s, d) => s + d.qty, 0);

    // Correct totalOps calculation (include QR and Debit)
    const _totalOps =
      totals.efectivoCount +
      totals.qrCount +
      totals.debitoCount;

    // Web vs Barra calculation
    const _webTotal = totals.webTotal;
    const _webCount = totals.webCount;
    const _webPct = totals.total > 0 ? Math.round((_webTotal / totals.total) * 100) : 0;

    const _barraTotal = Math.max(0, totals.total - totals.webTotal);
    const _barraCount = Math.max(0, _totalOps - totals.webCount);
    const _barraPct = totals.total > 0 ? Math.round((_barraTotal / totals.total) * 100) : 0;

    const _startedAtStr = formatHm(eventStartedAt ?? 0);

    // 2. New Analytics (A)
    const prevTotals = getLastNightTotals(historyEvents);
    const _deltaTotal = prevTotals ? computeDelta(totals.total, prevTotals.total) : null;
    const _cancellationInfo = computeCancellationRate(orders);
    const _digitalConversion = computeDigitalConversion(orders, cashSales);

    // Calculate uniqueClients
    const _uniqueClients = Math.max(
      1,
      new Set(orders.filter((o) => o.status !== "cancelado").map((o) => o.token)).size +
        Math.round(cashSales.length * 0.8)
    );

    const prevTotalOps = prevTotals
      ? prevTotals.efectivoCount + prevTotals.qrCount + prevTotals.debitoCount
      : 0;

    const prevTotalDrinkUnits = prevTotals ? prevTotals.drinksSold.reduce((s, d) => s + d.qty, 0) : 0;
    const prevUniqueClients = prevTotals
      ? Math.max(
          1,
          new Set(historyEvents[0]?.orders?.filter((o) => o.status !== "cancelado").map((o) => o.token) ?? []).size +
            Math.round((historyEvents[0]?.cashSales?.length ?? 0) * 0.8)
        )
      : 0;

    const _deltaTickets = prevTotals ? computeDelta(_totalOps, prevTotalOps) : null;
    const _deltaUnits = prevTotals ? computeDelta(_totalDrinkUnits, prevTotalDrinkUnits) : null;
    const _deltaClients = prevTotals ? computeDelta(_uniqueClients, prevUniqueClients) : null;

    // 3. Dashboards (B)
    const _productRevenue = computeProductRevenue(totals.drinksSold);
    const _paymentBreakdown = computePaymentBreakdown(totals);
    const _operationalVelocity = computeOperationalVelocity(orders);
    const _hourlySlots = computeHourlySlots({ startedAt: eventStartedAt ?? 0 }, orders, cashSales);
    // reduce en vez de Math.max(...array): un spread revienta el call stack
    // si _hourlySlots llega a tener miles de franjas (ver computeHourlySlots).
    const _maxHourSales = _hourlySlots.reduce((max, s) => Math.max(max, s.totalSales), 1000);
    const peak = findPeakHours(_hourlySlots);
    const _peakHour = peak.peakRevenue ? `${peak.peakRevenue.label} hs` : "—";

    // 4. Historial & Evolución (C)
    const _nightEvolution = computeNightEvolution(historyEvents);
    const _movingAvg = computeMovingAverage(_nightEvolution, 3);
    const _nightRecords = computeNightRecords(historyEvents);
    const _weeklyDelta = computeWeeklyDelta(historyEvents);
    const _monthlyDelta = computeMonthlyDelta(historyEvents);
    const _allTotal = historyEvents.reduce((s, e) => s + e.totals.total, 0);
    // "Promedio Noche" se calcula sobre una ventana reciente (no todo el
    // historial acumulado) para que no lo distorsionen noches de hace
    // meses — mismo criterio que computeNightRecords.
    const recentNights = filterRecentNights(historyEvents);
    const recentTotal = recentNights.reduce((s, e) => s + e.totals.total, 0);
    const _avgNight = recentNights.length > 0 ? Math.round(recentTotal / recentNights.length) : 0;

    return {
      maxDrinkQty: _maxDrinkQty,
      totalDrinkUnits: _totalDrinkUnits,
      totalOps: _totalOps,
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
      nightEvolution: _nightEvolution,
      movingAvg: _movingAvg,
      nightRecords: _nightRecords,
      weeklyDelta: _weeklyDelta,
      monthlyDelta: _monthlyDelta,
      allTotal: _allTotal,
      avgNight: _avgNight,
      webTotal: _webTotal,
      webCount: _webCount,
      webPct: _webPct,
      barraTotal: _barraTotal,
      barraCount: _barraCount,
      barraPct: _barraPct,
      uniqueClients: _uniqueClients,
      deltaTickets: _deltaTickets,
      deltaUnits: _deltaUnits,
      deltaClients: _deltaClients,
    };
  }, [totals, eventStartedAt, orders, cashSales, historyEvents]);
}

export type AdminAnalytics = ReturnType<typeof useAdminAnalytics>;
