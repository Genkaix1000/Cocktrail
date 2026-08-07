import { describe, expect, it } from "vitest";

import type { TicketContent } from "@cocktrail/shared";

import {
  buildTicketLines,
  computeTicketHeight,
  downsampleRowPairs,
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
    saleText: "Venta #123",
    items: [
      { qty: 2, name: "Fernet con Coca" },
      { qty: 1, name: "Gin Tonic Premium con Pepino y mucho hielo picado" },
    ],
    keywordText: "Clave: PERRITO",
  };

  it("arma el layout del ticket de venta: noche → venta → ítems → clave, sin separadores", () => {
    const lines = buildTicketLines(fullContent, measure);
    const texts = lines.map((l) => (l.kind === "text" ? l.text : "---"));

    expect(texts[0]).toBe("NOCHE VIE 07/08/2026");
    expect(texts[1]).toBe("Venta #123");
    expect(texts[2]).toBe("2x Fernet con Coca");
    // el ítem largo se parte en varias líneas
    expect(texts[3].startsWith("1x Gin Tonic")).toBe(true);
    expect(texts[texts.length - 1]).toBe("Clave: PERRITO");
    // sin marca, sin fecha de la venta y sin líneas separadoras
    expect(texts).not.toContain("---");
    expect(texts.some((t) => t.includes("BOSKO"))).toBe(false);
    expect(texts.some((t) => t.includes("cod:"))).toBe(false);
  });

  it("los tragos son lo más grande del ticket", () => {
    const lines = buildTicketLines(fullContent, measure);
    const night = lines[0];
    const venta = lines[1];
    const item = lines[2];
    const clave = lines[lines.length - 1];
    expect(night.kind === "text" && night.px).toBe(RASTER_LAYOUT.NIGHT_PX);
    expect(night.kind === "text" && night.center).toBe(true);
    expect(venta.kind === "text" && venta.px).toBe(RASTER_LAYOUT.SALE_PX);
    expect(item.kind === "text" && item.px).toBe(RASTER_LAYOUT.ITEM_PX);
    expect(clave.kind === "text" && clave.px).toBe(RASTER_LAYOUT.KEYWORD_PX);
    // el trago le gana a todo lo demás
    expect(RASTER_LAYOUT.ITEM_PX).toBeGreaterThan(RASTER_LAYOUT.SALE_PX);
    expect(RASTER_LAYOUT.ITEM_PX).toBeGreaterThan(RASTER_LAYOUT.KEYWORD_PX);
    // trazo grueso en lo que se lee de lejos: trago, venta y clave
    expect(item.kind === "text" && item.thick).toBe(true);
    expect(clave.kind === "text" && clave.thick).toBe(true);
  });

  it("los valores calibrados quedan clavados en RASTER_LAYOUT", () => {
    expect(RASTER_LAYOUT).toMatchObject({
      WIDTH: 384,
      TOP_PADDING: 10,
      PADDING: 4,
      NIGHT_PX: 28,
      ITEM_PX: 50,
      SALE_PX: 32,
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
});

describe("downsampleRowPairs", () => {
  it("combina filas de a pares con OR (conserva trazos finos de 1px)", () => {
    // widthBytes=2, 4 filas: la tinta de cada fila del par sobrevive
    const data = new Uint8Array([
      0xf0, 0x00, // fila 0
      0x0f, 0x00, // fila 1
      0x00, 0xff, // fila 2
      0x00, 0x00, // fila 3
    ]);
    const half = downsampleRowPairs({ widthBytes: 2, height: 4, data });

    expect(half.widthBytes).toBe(2);
    expect(half.height).toBe(2);
    expect(Array.from(half.data)).toEqual([0xff, 0x00, 0x00, 0xff]);
  });

  it("una fila con tinta y otra en blanco produce fila con tinta (OR, no promedio)", () => {
    // fila 0 con tinta, fila 1 blanca
    const half = downsampleRowPairs({ widthBytes: 1, height: 2, data: new Uint8Array([0x81, 0x00]) });
    expect(half.height).toBe(1);
    expect(Array.from(half.data)).toEqual([0x81]);
  });

  it("alto impar: la última fila se combina consigo misma", () => {
    const data = new Uint8Array([0x01, 0x02, 0x04]); // 3 filas de 1 byte
    const half = downsampleRowPairs({ widthBytes: 1, height: 3, data });
    expect(half.height).toBe(2);
    expect(Array.from(half.data)).toEqual([0x01 | 0x02, 0x04]);
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
