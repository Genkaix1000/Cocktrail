import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildWebhookManifest,
  validateWebhookSignature,
} from "./mercadopago-webhook-signature.js";

const SECRET = "test-webhook-secret";

function sign(
  dataId: string,
  xRequestId: string,
  ts: string,
  secret = SECRET,
): string {
  const manifest = buildWebhookManifest(dataId, xRequestId, ts);
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("mercadopago-webhook-signature", () => {
  it("construye el manifest con espacios y dataId en minúsculas", () => {
    expect(
      buildWebhookManifest(
        "ORD01JV3AW3NFSTSTB669F41NACDX",
        "2066ca19-c6f1-498a-be75-1923005edd06",
        "1742505638683",
      ),
    ).toBe(
      "id:ord01jv3aw3nfststb669f41nacdx request-id:2066ca19-c6f1-498a-be75-1923005edd06 ts:1742505638683",
    );
  });

  it("omite partes ausentes del manifest", () => {
    expect(buildWebhookManifest(undefined, "req-1", "123")).toBe(
      "request-id:req-1 ts:123",
    );
    expect(buildWebhookManifest("ORD-1", undefined, "123")).toBe("id:ord-1 ts:123");
  });

  it("valida una firma HMAC correcta", () => {
    const dataId = "ORD01TEST";
    const xRequestId = "req-abc";
    const ts = "1700000000000";
    const xSignature = sign(dataId, xRequestId, ts);

    expect(
      validateWebhookSignature(xSignature, xRequestId, dataId, SECRET),
    ).toBe(true);
  });

  it("rechaza firma inválida o secreto incorrecto", () => {
    const dataId = "ORD01TEST";
    const xRequestId = "req-abc";
    const ts = "1700000000000";
    const xSignature = sign(dataId, xRequestId, ts);

    expect(
      validateWebhookSignature(xSignature, xRequestId, dataId, "wrong-secret"),
    ).toBe(false);
    expect(
      validateWebhookSignature("ts=1,v1=deadbeef", xRequestId, dataId, SECRET),
    ).toBe(false);
    expect(validateWebhookSignature(undefined, xRequestId, dataId, SECRET)).toBe(
      false,
    );
  });
});
