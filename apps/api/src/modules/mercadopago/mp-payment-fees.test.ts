import { describe, expect, it } from "vitest";
import { parsePaymentFees } from "./mp-payment-fees.js";

describe("parsePaymentFees", () => {
  it("usa net_received_amount y fee = bruto − neto", () => {
    expect(
      parsePaymentFees({
        transaction_amount: 100,
        transaction_details: { net_received_amount: 96.5 },
        fee_details: [{ type: "mercadopago_fee", amount: 3.5 }],
      }),
    ).toEqual({ netReceivedAmount: 96.5, mpFeeAmount: 3.5 });
  });

  it("sin neto → null (pending)", () => {
    expect(parsePaymentFees({ transaction_amount: 100, fee_details: [{ amount: 3 }] })).toBeNull();
  });

  it("sin bruto: cae a suma de fee_details", () => {
    expect(
      parsePaymentFees({
        transaction_details: { net_received_amount: 90 },
        fee_details: [{ amount: 4 }, { amount: 1.25 }],
      }),
    ).toEqual({ netReceivedAmount: 90, mpFeeAmount: 5.25 });
  });
});
