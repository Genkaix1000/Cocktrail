/**
 * Render de un TicketContent a bitmap monocromo de 384px para la impresora
 * térmica BLE (S1). La parte de bits y layout es pura y testeable sin DOM;
 * solo `renderTicketBitmap` necesita canvas.
 */

import type { TicketContent } from "@cocktrail/shared";

/**
 * Tipografía y espaciados CALIBRADOS en el gate físico T1 (2026-08-07, con la
 * S1 real imprimiendo en papel). Ajustar solo acá.
 */
export const RASTER_LAYOUT = {
  WIDTH: 384,
  PADDING: 4,
  TOP_PADDING: 4,
  FONT_FAMILY: "sans-serif",
  NIGHT_PX: 28,
  BRAND_PX: 46,
  /** Los tragos son lo que el barman lee: el tamaño más grande del ticket. */
  ITEM_PX: 50,
  KEYWORD_PX: 36,
  TEXT_PX: 22,
  SEPARATOR_HEIGHT: 2,
  /** Alto de fila del separador: 2px de tinta + 1 de aire arriba. */
  SEPARATOR_ROW: 3,
  GAP_DEFAULT: 4,
  GAP_HEADER: 4,
  GAP_DATE: 6,
  GAP_ITEM: 4,
  GAP_SEPARATOR: 12,
  GAP_FINAL: 0,
} as const;

export type TicketLine =
  | { kind: "separator"; gapAfter: number }
  | {
      kind: "text";
      text: string;
      px: number;
      bold: boolean;
      center: boolean;
      /** Doble pasada con 1px de corrimiento: trazo más grueso, imprime más negro. */
      thick: boolean;
      /** Raya horizontal a media altura (noche de prueba). */
      strike?: boolean;
      gapAfter: number;
    };

/** Corta `text` en pedazos que entren en `maxWidth` px, por palabras. */
export function wrapLine(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  if (measure(text) <= maxWidth) return [text];
  const words = text.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const word of words) {
    const probe = cur ? `${cur} ${word}` : word;
    if (measure(probe) <= maxWidth) {
      cur = probe;
    } else {
      if (cur) out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Arma la lista de líneas del ticket (orden y campos opcionales salteados).
 * `measure` devuelve el ancho en px de `text` con la fuente indicada — se
 * inyecta para poder testear el layout sin canvas.
 */
export function buildTicketLines(
  content: TicketContent,
  measure: (text: string, px: number, bold: boolean) => number,
): TicketLine[] {
  const L = RASTER_LAYOUT;
  const maxWidth = L.WIDTH - L.PADDING * 2;
  const lines: TicketLine[] = [];

  const text = (
    t: string,
    px: number,
    opts: {
      bold?: boolean;
      center?: boolean;
      thick?: boolean;
      strike?: boolean;
      gapAfter?: number;
    } = {},
  ) =>
    lines.push({
      kind: "text",
      text: t,
      px,
      bold: !!opts.bold,
      center: !!opts.center,
      thick: !!opts.thick,
      ...(opts.strike ? { strike: true } : {}),
      gapAfter: opts.gapAfter ?? L.GAP_DEFAULT,
    });

  if (content.nightDateText) {
    text(content.nightDateText, L.NIGHT_PX, { bold: true, center: true, gapAfter: L.GAP_HEADER });
  }
  if (content.brand) {
    text(content.brand, L.BRAND_PX, { bold: true, center: true, gapAfter: L.GAP_HEADER });
  }
  if (content.dateText) text(content.dateText, L.TEXT_PX, { gapAfter: L.GAP_DATE });

  for (const item of content.items) {
    const pieces = wrapLine(`${item.qty}x ${item.name}`, maxWidth, (t) =>
      measure(t, L.ITEM_PX, true),
    );
    for (const piece of pieces) {
      text(piece, L.ITEM_PX, {
        bold: true,
        thick: true,
        gapAfter: L.GAP_ITEM,
        ...(item.strike ? { strike: true } : {}),
      });
    }
  }

  if (content.keywordText) {
    text(content.keywordText, L.KEYWORD_PX, { bold: true, thick: true, gapAfter: L.GAP_FINAL });
  }

  return lines;
}

/** Alto total del ticket en px, redondeado a múltiplo de 8 (raster en bytes). */
export function computeTicketHeight(lines: TicketLine[]): number {
  const L = RASTER_LAYOUT;
  let height = L.TOP_PADDING;
  for (const line of lines) {
    height += (line.kind === "separator" ? L.SEPARATOR_ROW : line.px) + line.gapAfter;
  }
  return Math.ceil(height / 8) * 8;
}

/**
 * Empaqueta un bitmap a monocromo MSB-first (formato raster GS v 0):
 * el píxel (0,0) es el bit 0x80 del byte 0.
 */
export function packMonochrome(
  isBlack: (x: number, y: number) => boolean,
  width: number,
  height: number,
): Uint8Array {
  const widthBytes = Math.ceil(width / 8);
  const raster = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isBlack(x, y)) {
        raster[y * widthBytes + (x >> 3)] |= 0x80 >> (x % 8);
      }
    }
  }
  return raster;
}

export type TicketBitmap = {
  widthBytes: number;
  height: number;
  data: Uint8Array;
};

/** Dibuja el ticket en un canvas y lo binariza (threshold 128 sobre gris promedio). */
export function renderTicketBitmap(content: TicketContent): TicketBitmap {
  if (typeof document === "undefined") {
    throw new Error("renderTicketBitmap necesita DOM (canvas) — no corre en SSR.");
  }
  const L = RASTER_LAYOUT;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No se pudo crear el contexto 2D para rasterizar el ticket.");
  }

  const font = (px: number, bold: boolean) =>
    `${bold ? "bold " : ""}${px}px ${L.FONT_FAMILY}`;
  const measure = (text: string, px: number, bold: boolean) => {
    ctx.font = font(px, bold);
    return ctx.measureText(text).width;
  };

  const lines = buildTicketLines(content, measure);
  const height = computeTicketHeight(lines);

  canvas.width = L.WIDTH;
  canvas.height = height;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, L.WIDTH, height);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";

  let y = L.TOP_PADDING;
  for (const line of lines) {
    if (line.kind === "separator") {
      // Línea sólida: en raster queda mejor que los guiones del ESC/POS texto.
      ctx.fillRect(L.PADDING, y + 1, L.WIDTH - L.PADDING * 2, L.SEPARATOR_HEIGHT);
      y += L.SEPARATOR_ROW + line.gapAfter;
      continue;
    }
    ctx.font = font(line.px, line.bold);
    const textW = ctx.measureText(line.text).width;
    const x = line.center ? (L.WIDTH - textW) / 2 : L.PADDING;
    ctx.fillText(line.text, x, y);
    if (line.thick) {
      // Doble pasada con 1px de corrimiento: trazo más grueso -> más negro en papel.
      ctx.fillText(line.text, x + 1, y);
      ctx.fillText(line.text, x, y + 1);
    }
    if (line.strike) {
      const midY = y + Math.round(line.px * 0.55);
      ctx.fillRect(x, midY, textW, 3);
    }
    y += line.px + line.gapAfter;
  }

  const img = ctx.getImageData(0, 0, L.WIDTH, height).data;
  const data = packMonochrome(
    (x, py) => {
      const i = (py * L.WIDTH + x) * 4;
      return (img[i] + img[i + 1] + img[i + 2]) / 3 < 128;
    },
    L.WIDTH,
    height,
  );

  return { widthBytes: L.WIDTH / 8, height, data };
}
