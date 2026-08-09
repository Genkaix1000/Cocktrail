import { describe, expect, it } from "vitest";
import { qrDisplaySrc } from "./qr-display";

describe("qrDisplaySrc", () => {
  it("pasa URLs y data-URLs tal cual", () => {
    expect(qrDisplaySrc("https://mp.example/qr.png")).toBe("https://mp.example/qr.png");
    expect(qrDisplaySrc("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });

  it("envuelve trama EMVCo en un generador de imagen", () => {
    const emv = "00020101021243650016com.mercadolibre";
    const src = qrDisplaySrc(emv);
    expect(src).toContain("api.qrserver.com");
    expect(src).toContain(encodeURIComponent(emv));
  });

  it("null/vacío → null", () => {
    expect(qrDisplaySrc(null)).toBeNull();
    expect(qrDisplaySrc("  ")).toBeNull();
  });
});
