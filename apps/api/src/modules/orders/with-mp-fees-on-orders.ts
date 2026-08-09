import type { Order } from "@cocktrail/shared";

/** Adjunta neto/fee de mp_orders a los pedidos que tienen paymentRecordId. */
export function withMpFeesOnOrders(
  orders: Order[],
  fees: {
    id: string;
    netReceivedAmount: number | null;
    mpFeeAmount: number | null;
    feeStatus: string;
  }[],
): Order[] {
  if (orders.length === 0 || fees.length === 0) return orders;
  const byId = new Map<string, { net: number; fee: number | undefined }>();
  for (const f of fees) {
    if (f.feeStatus !== "ready" || f.netReceivedAmount == null) continue;
    byId.set(f.id, {
      net: Number(f.netReceivedAmount),
      fee: f.mpFeeAmount == null ? undefined : Number(f.mpFeeAmount),
    });
  }
  if (byId.size === 0) return orders;
  return orders.map((o) => {
    if (!o.paymentRecordId) return o;
    const fee = byId.get(o.paymentRecordId);
    if (!fee) return o;
    return {
      ...o,
      mpNetReceived: fee.net,
      ...(fee.fee != null ? { mpFeeAmount: fee.fee } : {}),
    };
  });
}
