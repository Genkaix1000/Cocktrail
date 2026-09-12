import { describe, expect, it } from "vitest";

import type { TicketContent } from "@cocktrail/shared";

import {
  buildTicketLines,
  computeTicketHeight,
  packMonochrome,
  RASTER_LAYOUT,
  wrapLine,
} from "./raster";

describe("packMonochrome", () => {
  it("píxel (0,0) enciende el bit MSB del byte 0", () => {
    const raster = packMonochrome((x, y) => x === 0 && y === 0, 384, 1);
    expect(raster.length).toBe(48);
    expect(raster[0]).toBe(0x80);
    expect(raster.slice(1).every((b) => b === 0)).toBe(true);
  });

  it("píxel (7,0) enciende el bit menos significativo del byte 0", () => {
    const raster = packMonochrome((x, y) => x === 7 && y === 0, 384, 1);
    expect(raster[0]).toBe(0x01);
  });

  it("fila de 384 píxeles negros produce 48 bytes 0xff", () => {
    const raster = packMonochrome(() => true, 384, 1);
    expect(raster.length).toBe(48);
    expect(Array.from(raster)).toEqual(new Array(48).fill(0xff));
  });

  it("cada fila es independiente (píxel (8,1) va al byte 1 de la fila 1)", () => {
    const raster = packMonochrome((x, y) => x === 8 && y === 1, 384, 2);
    expect(raster[48 + 1]).toBe(0x80);
    expect(raster[0]).toBe(0);
  });
});

describe("wrapLine", () => {
  // measure fake: 10px por caracter
  const measure = (t: string) => t.length * 10;

  it("texto que entra queda en una sola línea", () => {
    expect(wrapLine("hola", 100, measure)).toEqual(["hola"]);
  });

  it("corta por palabras sin pasarse del ancho", () => {
    expect(wrapLine("uno dos tres", 70, measure)).toEqual(["uno dos", "tres"]);
  });

  it("una palabra más larga que el máximo queda sola en su línea", () => {
    expect(wrapLine("corto palabralarguisima si", 100, measure)).toEqual([
      "corto",
      "palabralarguisima",
      "si",
    ]);
  });
});

describe("buildTicketLines", () => {
  const measure = (t: string) => t.length * 10;

  const fullContent: TicketContent = {
    nightDateText: "NOCHE VIE 07/08/2026",
    items: [
      { qty: 2, name: "Fernet con Coca" },
      { qty: 1, name: "Gin Tonic Premium con Pepino y mucho hielo picado" },
    ],
    keywordText: "Clave: PERRITO",
  };

  it("arma el layout del ticket de venta: noche → ítems → clave", () => {
    const lines = buildTicketLines(fullContent, measure);
    const texts = lines.map((l) => (l.kind === "text" ? l.text : "---"));

    expect(texts[0]).toBe("NOCHE VIE 07/08/2026");
    expect(texts[1]).toBe("2x Fernet con Coca");
    expect(texts[2].startsWith("1x Gin Tonic")).toBe(true);
    expect(texts[texts.length - 1]).toBe("Clave: PERRITO");
  });

  it("los tragos son lo más grande del ticket", () => {
    const lines = buildTicketLines(fullContent, measure);
    const night = lines[0];
    const item = lines[1];
    const clave = lines[lines.length - 1];
    expect(night.kind === "text" && night.px).toBe(RASTER_LAYOUT.NIGHT_PX);
    expect(night.kind === "text" && night.center).toBe(true);
    expect(item.kind === "text" && item.px).toBe(RASTER_LAYOUT.ITEM_PX);
    expect(clave.kind === "text" && clave.px).toBe(RASTER_LAYOUT.KEYWORD_PX);
    expect(RASTER_LAYOUT.ITEM_PX).toBeGreaterThan(RASTER_LAYOUT.KEYWORD_PX);
    expect(RASTER_LAYOUT.ITEM_PX).toBeGreaterThan(RASTER_LAYOUT.NIGHT_PX);
    expect(item.kind === "text" && item.thick).toBe(true);
    expect(clave.kind === "text" && clave.thick).toBe(true);
  });

  it("los valores calibrados quedan clavados en RASTER_LAYOUT", () => {
    expect(RASTER_LAYOUT).toMatchObject({
      WIDTH: 384,
      TOP_PADDING: 4,
      PADDING: 4,
      NIGHT_PX: 28,
      ITEM_PX: 50,
      KEYWORD_PX: 36,
      TEXT_PX: 22,
      FONT_FAMILY: "sans-serif",
    });
  });

  it("saltea los campos opcionales ausentes (ticket de prueba: solo brand + fecha)", () => {
    const testContent: TicketContent = {
      brand: "--- TICKET DE PRUEBA ---",
      dateText: "07/08/2026 23:45",
      items: [],
    };
    const lines = buildTicketLines(testContent, measure);
    const texts = lines.map((l) => (l.kind === "text" ? l.text : "---"));
    expect(texts).toEqual(["--- TICKET DE PRUEBA ---", "07/08/2026 23:45"]);
  });

  it("ítems con strike propagan strike a las líneas de texto", () => {
    const lines = buildTicketLines(
      {
        nightDateText: "NOCHE SAB 12/09/2026",
        items: [{ qty: 1, name: "Fernet", strike: true }],
        keywordText: "TICKET NO VALIDO",
      },
      measure,
    );
    const item = lines.find((l) => l.kind === "text" && l.text.includes("Fernet"));
    expect(item?.kind === "text" && item.strike).toBe(true);
    expect(lines[lines.length - 1]).toMatchObject({
      kind: "text",
      text: "TICKET NO VALIDO",
    });
  });
});

describe("computeTicketHeight", () => {
  it("redondea el alto a múltiplo de 8", () => {
    const measure = (t: string) => t.length * 10;
    const lines = buildTicketLines(
      { brand: "BOSKO", dateText: "x", items: [] },
      measure,
    );
    const height = computeTicketHeight(lines);
    expect(height % 8).toBe(0);
    expect(height).toBeGreaterThan(0);
  });
});
