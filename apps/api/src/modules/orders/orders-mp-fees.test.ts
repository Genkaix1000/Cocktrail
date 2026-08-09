import { describe, expect, it } from "vitest";
import type { Order } from "@cocktrail/shared";
import { withMpFeesOnOrders } from "./with-mp-fees-on-orders.js";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    token: "T",
    displayNumber: 1,
    items: [],
    total: 15,
    paymentMethod: "qr",
    status: "entregado",
    createdAt: Date.now(),
    paymentRecordId: "mp-1",
    ...overrides,
  };
}

describe("withMpFeesOnOrders", () => {
  it("adjunta neto/fee cuando fee_status=ready", () => {
    const [enriched] = withMpFeesOnOrders(
      [makeOrder()],
      [{ id: "mp-1", netReceivedAmount: 14.25, mpFeeAmount: 0.75, feeStatus: "ready" }],
    );
    expect(enriched!.total).toBe(15);
    expect(enriched!.mpNetReceived).toBe(14.25);
    expect(enriched!.mpFeeAmount).toBe(0.75);
  });

  it("no toca el pedido si el fee aún está pending", () => {
    const [out] = withMpFeesOnOrders(
      [makeOrder()],
      [{ id: "mp-1", netReceivedAmount: null, mpFeeAmount: null, feeStatus: "pending" }],
    );
    expect(out!.mpNetReceived).toBeUndefined();
  });
});
