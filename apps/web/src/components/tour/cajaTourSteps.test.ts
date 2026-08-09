import { describe, expect, it } from "vitest";
import { buildCajaSteps } from "./cajaTourSteps";

const base = {
  hasHistorial: false,
  hasMetricas: false,
  canCloseNight: false,
  hasLinkedDevice: null,
};

describe("buildCajaSteps", () => {
  it("cubre el flujo básico de venta", () => {
    const ids = buildCajaSteps(base).map((step) => step.id);

    expect(ids).toEqual([
      "caja-welcome",
      "caja-menu",
      "caja-productos",
      "caja-carrito",
      "caja-cobro",
      "caja-dispositivos",
      "caja-done",
    ]);
  });

  it("incluye solo las funciones permitidas", () => {
    const ids = buildCajaSteps({
      ...base,
      hasHistorial: true,
      hasMetricas: true,
      canCloseNight: true,
    }).map((step) => step.id);

    expect(ids).toContain("caja-historial");
    expect(ids).toContain("caja-metricas");
    expect(ids).toContain("caja-cierre");
    expect(ids.at(-1)).toBe("caja-done");
  });

  it("explica la alternativa cuando no hay Posnet", () => {
    const deviceStep = buildCajaSteps({ ...base, hasLinkedDevice: false }).find(
      (step) => step.id === "caja-dispositivos",
    );

    expect(deviceStep?.body).toMatch(/efectivo o con QR/i);
  });
});
