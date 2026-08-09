import { describe, expect, it, beforeEach } from "vitest";

import {
  buildAuditDemoOrders,
  endAuditDemo,
  getAuditDemoOrders,
  isAuditDemoActive,
  startAuditDemo,
  subscribeAuditDemo,
} from "./auditTourDemo";

beforeEach(() => {
  endAuditDemo();
});

describe("auditTourDemo", () => {
  it("arma tickets demo con cancelados, 2 días y >10 en el día reciente", () => {
    const now = new Date(2026, 7, 9, 18, 0, 0).getTime();
    const orders = buildAuditDemoOrders(now);
    expect(orders.length).toBe(15);
    expect(orders.filter((o) => o.status === "cancelado").length).toBe(2);

    const counts = new Map<string, number>();
    for (const o of orders) {
      const d = new Date(o.createdAt);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(counts.size).toBe(2);
    expect(Math.max(...counts.values())).toBeGreaterThan(10);
  });

  it("notifica a suscriptores al entrar y salir del demo", () => {
    let n = 0;
    const unsub = subscribeAuditDemo(() => {
      n += 1;
    });
    startAuditDemo();
    expect(isAuditDemoActive()).toBe(true);
    expect(getAuditDemoOrders()?.length).toBe(15);
    endAuditDemo();
    expect(isAuditDemoActive()).toBe(false);
    expect(n).toBe(2);
    unsub();
  });
});
