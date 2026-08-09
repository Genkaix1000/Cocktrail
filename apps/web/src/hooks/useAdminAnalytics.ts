"use client";

import { useMemo } from "react";

import { formatHm } from "@/lib/utils";

import {
  computeDelta,
  getLastNightTotals,
  computeProductRevenue,
  computeHourlySlots,
  findPeakHours,
  computeNightRecords,
  computeWeeklyDelta,
  computeMonthlyDelta,
} from "@/lib/analytics";

import type { EventSummary, EventTotals, Order } from "@cocktrail/shared";
import { displayRevenue } from "@cocktrail/shared";

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
  historyEvents: EventSummary[],
) {
  return useMemo(() => {
    // 1. Base Variables
    const _totalDrinkUnits = totals.drinksSold.reduce((s, d) => s + d.qty, 0);

    // Correct totalOps calculation (include QR and Debit)
    const _totalOps =
      totals.efectivoCount +
      totals.qrCount +
      totals.debitoCount;

    // Sin noche (ni activa ni archivada) no hay hora que mostrar: formatear el
    // epoch 0 pintaba un "21:00" inventado en el dashboard.
    const _startedAtStr = eventStartedAt ? formatHm(eventStartedAt) : null;

    // 2. New Analytics (A)
    const prevTotals = getLastNightTotals(historyEvents);
    const _deltaTotal = prevTotals
      ? computeDelta(displayRevenue(totals), displayRevenue(prevTotals))
      : null;

    const prevTotalOps = prevTotals
      ? prevTotals.efectivoCount + prevTotals.qrCount + prevTotals.debitoCount
      : 0;

    const prevTotalDrinkUnits = prevTotals ? prevTotals.drinksSold.reduce((s, d) => s + d.qty, 0) : 0;

    const _deltaTickets = prevTotals ? computeDelta(_totalOps, prevTotalOps) : null;
    const _deltaUnits = prevTotals ? computeDelta(_totalDrinkUnits, prevTotalDrinkUnits) : null;

    // 3. Dashboards (B)
    const _productRevenue = computeProductRevenue(totals.drinksSold);
    const _hourlySlots = computeHourlySlots({ startedAt: eventStartedAt ?? 0 }, orders);
    // reduce en vez de Math.max(...array): un spread revienta el call stack
    // si _hourlySlots llega a tener miles de franjas (ver computeHourlySlots).
    const _maxHourSales = _hourlySlots.reduce((max, s) => Math.max(max, s.totalSales), 1000);
    const peak = findPeakHours(_hourlySlots);
    const _peakHour = peak.peakRevenue ? `${peak.peakRevenue.label} hs` : "—";

    // 4. Historial & Evolución (C)
    const _nightRecords = computeNightRecords(historyEvents);
    const _weeklyDelta = computeWeeklyDelta(historyEvents);
    const _monthlyDelta = computeMonthlyDelta(historyEvents);
    const _allTotal = historyEvents.reduce((s, e) => s + displayRevenue(e.totals), 0);

    return {
      totalDrinkUnits: _totalDrinkUnits,
      totalOps: _totalOps,
      startedAtStr: _startedAtStr,
      deltaTotal: _deltaTotal,
      productRevenue: _productRevenue,
      hourlyData: _hourlySlots,
      maxHourSales: _maxHourSales,
      peakHour: _peakHour,
      nightRecords: _nightRecords,
      weeklyDelta: _weeklyDelta,
      monthlyDelta: _monthlyDelta,
      allTotal: _allTotal,
      deltaTickets: _deltaTickets,
      deltaUnits: _deltaUnits,
    };
  }, [totals, eventStartedAt, orders, historyEvents]);
}

export type AdminAnalytics = ReturnType<typeof useAdminAnalytics>;
