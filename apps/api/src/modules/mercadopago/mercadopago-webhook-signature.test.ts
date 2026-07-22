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

/** ts fresco en milisegundos (formato que manda MP en Orders API). */
function freshTsMs(): string {
  return Date.now().toString();
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

  it("valida una firma HMAC correcta con ts fresco", () => {
    const dataId = "ORD01TEST";
    const xRequestId = "req-abc";
    const ts = freshTsMs();
    const xSignature = sign(dataId, xRequestId, ts);

    expect(
      validateWebhookSignature(xSignature, xRequestId, dataId, SECRET),
    ).toBe(true);
  });

  it("acepta ts en segundos (normaliza por longitud del string)", () => {
    const dataId = "ORD01TEST";
    const xRequestId = "req-sec";
    const ts = Math.floor(Date.now() / 1000).toString(); // 10 dígitos
    const xSignature = sign(dataId, xRequestId, ts);

    expect(
      validateWebhookSignature(xSignature, xRequestId, dataId, SECRET),
    ).toBe(true);
  });

  it("rechaza firma inválida o secreto incorrecto", () => {
    const dataId = "ORD01TEST";
    const xRequestId = "req-abc";
    const ts = freshTsMs();
    const xSignature = sign(dataId, xRequestId, ts);

    expect(
      validateWebhookSignature(xSignature, xRequestId, dataId, "wrong-secret"),
    ).toBe(false);
    expect(
      validateWebhookSignature(`ts=${ts},v1=deadbeef`, xRequestId, dataId, SECRET),
    ).toBe(false);
    expect(validateWebhookSignature(undefined, xRequestId, dataId, SECRET)).toBe(
      false,
    );
  });

  it("rechaza un ts fuera de la ventana de frescura (anti-replay)", () => {
    const dataId = "ORD01TEST";
    const xRequestId = "req-old";

    // 10 minutos atrás con tolerancia default de 300s → rechazado, en ms y en segundos.
    const oldMs = (Date.now() - 10 * 60 * 1000).toString();
    expect(
      validateWebhookSignature(sign(dataId, xRequestId, oldMs), xRequestId, dataId, SECRET),
    ).toBe(false);

    const oldSec = Math.floor((Date.now() - 10 * 60 * 1000) / 1000).toString();
    expect(
      validateWebhookSignature(sign(dataId, xRequestId, oldSec), xRequestId, dataId, SECRET),
    ).toBe(false);
  });

  it("respeta una tolerancia custom", () => {
    const dataId = "ORD01TEST";
    const xRequestId = "req-tol";
    const ts = (Date.now() - 60 * 1000).toString(); // 1 minuto atrás
    const xSignature = sign(dataId, xRequestId, ts);

    expect(validateWebhookSignature(xSignature, xRequestId, dataId, SECRET, 120)).toBe(true);
    expect(validateWebhookSignature(xSignature, xRequestId, dataId, SECRET, 30)).toBe(false);
  });

  it("rechaza un ts no numérico", () => {
    const dataId = "ORD01TEST";
    const xRequestId = "req-bad-ts";
    const xSignature = sign(dataId, xRequestId, "no-es-un-ts");

    expect(validateWebhookSignature(xSignature, xRequestId, dataId, SECRET)).toBe(false);
  });
});
