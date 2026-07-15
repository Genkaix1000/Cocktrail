import { describe, expect, it, vi, beforeEach } from "vitest";

import { exportHistorialPdf } from "./pdfExport";
import type { EventSummary, EventTotals } from "@cocktrail/shared";

// No vale la pena depender del motor de fuentes/canvas real de @react-pdf/renderer acá —
// se mockea el módulo entero: lo que importa testear es que exportHistorialPdf arma el
// documento sin tirar (con y sin datos) y dispara la descarga.
const toBlobMock = vi.fn().mockResolvedValue(new Blob(["stub"], { type: "application/pdf" }));
const pdfMock = vi.fn((_doc: unknown) => ({ toBlob: toBlobMock }));

vi.mock("@react-pdf/renderer", () => ({
  pdf: (doc: unknown) => pdfMock(doc),
  Document: () => null,
  Page: () => null,
  View: () => null,
  Text: () => null,
  Image: () => null,
  StyleSheet: { create: (styles: unknown) => styles },
}));

const emptyTotals: EventTotals = {
  webTotal: 0,
  webCount: 0,
  efectivoTotal: 0,
  efectivoCount: 0,
  qrTotal: 0,
  qrCount: 0,
  debitoTotal: 0,
  debitoCount: 0,
  drinksSold: [],
  total: 0,
};

function makeSession(overrides: Partial<EventSummary> = {}): EventSummary {
  const closedAt = overrides.closedAt ?? Date.now();
  return {
    id: "evt-1",
    status: "cerrado",
    startedAt: closedAt - 4 * 60 * 60 * 1000,
    closedAt,
    orderCounter: 5,
    orders: [],
    totals: {
      ...emptyTotals,
      efectivoTotal: 10000,
      efectivoCount: 2,
      total: 10000,
      drinksSold: [{ drinkId: 1, name: "Fernet", qty: 3, subtotal: 10000 }],
    },
    ...overrides,
  };
}

beforeEach(() => {
  // jsdom no implementa URL.createObjectURL/revokeObjectURL — se agregan acá sin
  // reemplazar el constructor `URL` (necesario para `new URL(...)` en el módulo).
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();
  pdfMock.mockClear();
  toBlobMock.mockClear();
});

describe("exportHistorialPdf", () => {
  it("no tira con historial vacío", async () => {
    await expect(
      exportHistorialPdf({
        historyEvents: [],
        isBosko: true,
        logoUrl: "",
        useLogoUrl: false,
        textLogoValue: "Bosko",
      }),
    ).resolves.toBeUndefined();

    expect(pdfMock).toHaveBeenCalledTimes(1);
    expect(toBlobMock).toHaveBeenCalledTimes(1);
  });

  it("no tira con historial real y dispara la descarga (URL.createObjectURL)", async () => {
    // useLogoUrl:false — jsdom no decodifica imágenes reales (sin backend de canvas), así que
    // este caso ejercita el fallback de texto en vez de la rasterización a PNG del logo.
    await exportHistorialPdf({
      historyEvents: [makeSession()],
      isBosko: false,
      logoUrl: "/bosko.webp",
      useLogoUrl: false,
      textLogoValue: "Bosko",
    });

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
