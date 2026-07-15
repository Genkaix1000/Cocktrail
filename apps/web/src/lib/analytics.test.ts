import { describe, expect, it } from "vitest";

import {
  groupNightsByDay,
  computeWeeklyBreakdown,
  computeMonthlyBreakdown,
  formatEventDuration,
} from "./analytics";

import type { EventSummary, EventTotals } from "@cocktrail/shared";

const emptyTotals: EventTotals = {
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

function makeSession(overrides: Partial<EventSummary> = {}): EventSummary {
  const closedAt = overrides.closedAt ?? Date.now();
  return {
    id: `evt-${Math.random()}`,
    status: "cerrado",
    startedAt: closedAt - 4 * 60 * 60 * 1000,
    closedAt,
    orderCounter: 5,
    orders: [],
    totals: {
      ...emptyTotals,
      efectivoTotal: 10000,
      efectivoCount: 2,
      total: 10000,
      drinksSold: [{ drinkId: 1, name: "Fernet", qty: 3, subtotal: 10000 }],
    },
    ...overrides,
  };
}

describe("groupNightsByDay", () => {
  it("con historial vacío, devuelve un array vacío", () => {
    expect(groupNightsByDay([])).toEqual([]);
  });

  it("agrupa 2 sesiones del mismo día calendario en una sola noche, sumando totales", () => {
    const day = new Date(2026, 6, 14, 22, 0, 0).getTime(); // 14 jul 22:00
    const s1 = makeSession({ id: "s1", closedAt: day, orderCounter: 2 });
    const s2 = makeSession({
      id: "s2",
      closedAt: day + 60 * 60 * 1000,
      orderCounter: 3,
      totals: { ...emptyTotals, efectivoTotal: 5000, efectivoCount: 1, total: 5000, drinksSold: [] },
    });

    const nights = groupNightsByDay([s1, s2]);

    expect(nights).toHaveLength(1);
    expect(nights[0]!.sessions).toHaveLength(2);
    expect(nights[0]!.orderCounter).toBe(5);
    expect(nights[0]!.totals.total).toBe(15000);
  });

  it("sesiones de días calendario distintos quedan en noches separadas", () => {
    const s1 = makeSession({ id: "s1", closedAt: new Date(2026, 6, 14, 20, 0, 0).getTime() });
    const s2 = makeSession({ id: "s2", closedAt: new Date(2026, 6, 15, 20, 0, 0).getTime() });

    expect(groupNightsByDay([s1, s2])).toHaveLength(2);
  });
});

describe("computeWeeklyBreakdown", () => {
  it("con historial vacío, devuelve un array vacío", () => {
    expect(computeWeeklyBreakdown([])).toEqual([]);
  });

  it("agrupa noches por semana calendario, sumando total y contando noches", () => {
    // Lunes 13 y martes 14 de julio de 2026 caen en la misma semana calendario.
    const s1 = makeSession({ closedAt: new Date(2026, 6, 13, 21, 0, 0).getTime(), totals: { ...emptyTotals, total: 1000 } });
    const s2 = makeSession({ closedAt: new Date(2026, 6, 14, 21, 0, 0).getTime(), totals: { ...emptyTotals, total: 2000 } });
    // Semana siguiente.
    const s3 = makeSession({ closedAt: new Date(2026, 6, 21, 21, 0, 0).getTime(), totals: { ...emptyTotals, total: 500 } });

    const weeks = computeWeeklyBreakdown([s1, s2, s3]);

    expect(weeks).toHaveLength(2);
    // Ordenado de más reciente a más antigua.
    expect(weeks[0]!.total).toBe(500);
    expect(weeks[0]!.nightsCount).toBe(1);
    expect(weeks[1]!.total).toBe(3000);
    expect(weeks[1]!.nightsCount).toBe(2);
  });
});

describe("computeMonthlyBreakdown", () => {
  it("con historial vacío, devuelve un array vacío", () => {
    expect(computeMonthlyBreakdown([])).toEqual([]);
  });

  it("agrupa noches por mes calendario, sumando total y contando noches", () => {
    const s1 = makeSession({ closedAt: new Date(2026, 5, 20, 21, 0, 0).getTime(), totals: { ...emptyTotals, total: 1000 } });
    const s2 = makeSession({ closedAt: new Date(2026, 6, 5, 21, 0, 0).getTime(), totals: { ...emptyTotals, total: 2000 } });
    const s3 = makeSession({ closedAt: new Date(2026, 6, 20, 21, 0, 0).getTime(), totals: { ...emptyTotals, total: 500 } });

    const months = computeMonthlyBreakdown([s1, s2, s3]);

    expect(months).toHaveLength(2);
    expect(months[0]!.monthLabel).toBe("julio 2026");
    expect(months[0]!.nightsCount).toBe(2);
    expect(months[0]!.total).toBe(2500);
    expect(months[1]!.monthLabel).toBe("junio 2026");
    expect(months[1]!.nightsCount).toBe(1);
    expect(months[1]!.total).toBe(1000);
  });
});

describe("formatEventDuration", () => {
  it("sin closedAt, devuelve '—'", () => {
    expect(formatEventDuration(Date.now(), undefined)).toBe("—");
  });

  it("formatea horas y minutos", () => {
    const start = Date.now();
    expect(formatEventDuration(start, start + (4 * 60 + 12) * 60 * 1000)).toBe("4h 12m");
  });

  it("formatea solo minutos cuando dura menos de 1 hora", () => {
    const start = Date.now();
    expect(formatEventDuration(start, start + 45 * 60 * 1000)).toBe("45m");
  });
});
