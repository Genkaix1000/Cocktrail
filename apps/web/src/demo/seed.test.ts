import { describe, expect, it } from "vitest";
import { computeTotals } from "@cocktrail/shared";
import { DEMO_DRINKS, buildDemoOrders } from "./seed";

describe("buildDemoOrders", () => {
  it("arma tickets mixtos con totales > 0", () => {
    const startedAt = Date.now() - 5 * 3600_000;
    const orders = buildDemoOrders(DEMO_DRINKS, startedAt);
    const totals = computeTotals(orders);
    expect(orders.length).toBeGreaterThanOrEqual(12);
    expect(orders.some((o) => o.status === "pendiente")).toBe(true);
    expect(orders.some((o) => o.status === "cancelado")).toBe(true);
    expect(orders.some((o) => o.paymentMethod === "qr")).toBe(true);
    expect(totals.total).toBeGreaterThan(0);
    expect(totals.drinksSold.length).toBeGreaterThan(0);
  });
});
