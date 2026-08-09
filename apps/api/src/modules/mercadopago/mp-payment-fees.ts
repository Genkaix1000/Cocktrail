/**
 * Extrae neto/fee reales de un pago MP (Payments API).
 * Sin tasas hardcodeadas: solo lo que dice `transaction_details` / `fee_details`.
 */

export type MpPaymentFeeFields = {
  transaction_amount?: number;
  transaction_details?: { net_received_amount?: number };
  fee_details?: Array<{ amount?: number; type?: string }>;
};

export type ParsedPaymentFees = {
  netReceivedAmount: number;
  mpFeeAmount: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `null` si MP todavía no informó el neto (retry/backfill después). */
export function parsePaymentFees(payment: MpPaymentFeeFields): ParsedPaymentFees | null {
  const net = payment.transaction_details?.net_received_amount;
  if (typeof net !== "number" || !Number.isFinite(net)) return null;

  const bruto = payment.transaction_amount;
  if (typeof bruto === "number" && Number.isFinite(bruto)) {
    return { netReceivedAmount: net, mpFeeAmount: round2(bruto - net) };
  }

  const fromDetails = Array.isArray(payment.fee_details)
    ? payment.fee_details.reduce((s, f) => s + (typeof f.amount === "number" ? f.amount : 0), 0)
    : 0;
  return { netReceivedAmount: net, mpFeeAmount: round2(fromDetails) };
}
