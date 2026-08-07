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
    brand: "BOSKO",
    saleText: "Venta #123",
    dateText: "07/08/2026 23:45",
    items: [
      { qty: 2, name: "Fernet con Coca" },
      { qty: 1, name: "Gin Tonic Premium con Pepino y mucho hielo picado" },
    ],
    keywordText: "Clave noche: PERRITO",
    codeText: "cod: A7F3",
  };

  it("arma el layout completo en orden: noche → brand → venta → fecha → sep → ítems → sep → clave·código", () => {
    const lines = buildTicketLines(fullContent, measure);
    const texts = lines.map((l) => (l.kind === "text" ? l.text : "---"));

    expect(texts[0]).toBe("NOCHE VIE 07/08/2026");
    expect(texts[1]).toBe("BOSKO");
    expect(texts[2]).toBe("Venta #123");
    expect(texts[3]).toBe("07/08/2026 23:45");
    expect(texts[4]).toBe("---");
    expect(texts[5]).toBe("2x Fernet con Coca");
    // el ítem largo (49 chars > 37 que entran en 376px con el measure fake) se parte
    expect(texts[6].startsWith("1x Gin Tonic")).toBe(true);
    expect(texts[texts.length - 2]).toBe("---");
    // clave + código fusionados en UN renglón (una línea menos de papel)
    expect(texts[texts.length - 1]).toBe("Clave noche: PERRITO · cod: A7F3");
  });

  it("sin codeText el renglón final es solo la clave (sin el separador ·)", () => {
    const lines = buildTicketLines({ ...fullContent, codeText: undefined }, measure);
    const last = lines[lines.length - 1];
    expect(last.kind === "text" && last.text).toBe("Clave noche: PERRITO");
  });

  it("usa la tipografía calibrada en el gate T1 (noche 30, brand 46, ítems 38 thick, texto 22)", () => {
    const lines = buildTicketLines(fullContent, measure);
    const night = lines[0];
    const brand = lines[1];
    const item = lines[5];
    const date = lines[3];
    expect(night.kind === "text" && night.px).toBe(RASTER_LAYOUT.NIGHT_PX);
    expect(night.kind === "text" && night.center).toBe(true);
    expect(brand.kind === "text" && brand.px).toBe(RASTER_LAYOUT.BRAND_PX);
    expect(brand.kind === "text" && brand.center).toBe(true);
    expect(item.kind === "text" && item.px).toBe(RASTER_LAYOUT.ITEM_PX);
    expect(item.kind === "text" && item.bold).toBe(true);
    // doble pasada solo en los ítems (lo que se lee de lejos)
    expect(item.kind === "text" && item.thick).toBe(true);
    expect(brand.kind === "text" && brand.thick).toBe(false);
    expect(date.kind === "text" && date.px).toBe(RASTER_LAYOUT.TEXT_PX);
  });

  it("los valores calibrados quedan clavados en RASTER_LAYOUT", () => {
    expect(RASTER_LAYOUT).toMatchObject({
      WIDTH: 384,
      TOP_PADDING: 10,
      PADDING: 4,
      NIGHT_PX: 30,
      BRAND_PX: 46,
      ITEM_PX: 38,
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
    expect(texts).toEqual(["--- TICKET DE PRUEBA ---", "07/08/2026 23:45", "---", "---"]);
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
