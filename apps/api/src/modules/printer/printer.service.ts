import type { NightEvent, Order } from "@cocktrail/shared";

const UTF8_TO_CP437: Record<string, number> = {
  á: 0xa0,
  é: 0x82,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  Á: 0xb5,
  É: 0x90,
  Í: 0xd6,
  Ó: 0xe0,
  Ú: 0xe9,
  ñ: 0xa4,
  Ñ: 0xa5,
  "¿": 0xa8,
  "¡": 0xad,
};

function toCP437(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 128) {
      bytes.push(code);
    } else if (UTF8_TO_CP437[ch] !== undefined) {
      bytes.push(UTF8_TO_CP437[ch]);
    } else {
      bytes.push(0x3f);
    }
  }
  return Buffer.from(bytes);
}

const ESC = 0x1b;
const GS = 0x1d;
const INIT = Buffer.from([ESC, 0x40]);
const ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
const ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
const DOUBLE_ON = Buffer.from([GS, 0x21, 0x11]); // doble alto + doble ancho
const DOUBLE_OFF = Buffer.from([GS, 0x21, 0x00]);
const FEED = Buffer.from([0x0a, 0x0a, 0x0a, 0x0a]); // sin comando de corte: la impresora no tiene cuchilla

export type PrinterStatus = {
  connected: boolean;
  configured: true;
  message: string;
};

export type PrintPayload = {
  success: true;
  message: string;
  /** Bytes ESC/POS en base64 — el dispositivo de caja los manda por WebUSB. */
  data: string;
};

/**
 * Arma tickets ESC/POS. No toca hardware: la impresión vive en el navegador
 * de la tablet de caja (WebUSB), porque la ticketera está enchufada ahí.
 */
export class PrinterService {
  getStatus(): PrinterStatus {
    return {
      connected: false,
      configured: true,
      message: "La impresora se vincula en el dispositivo de caja (WebUSB)",
    };
  }

  private buildTicketBytes(order: Order, nightEvent: NightEvent): Buffer {
    const parts: Buffer[] = [INIT, ALIGN_CENTER, DOUBLE_ON, toCP437("BOSKO\n"), DOUBLE_OFF, ALIGN_LEFT];

    parts.push(toCP437(`Venta #${order.displayNumber}\n`));
    parts.push(toCP437(`${new Date(order.createdAt).toLocaleString("es-AR")}\n`));
    parts.push(toCP437("--------------------------------\n"));

    for (const item of order.items) {
      parts.push(DOUBLE_ON, toCP437(`${item.qty}x ${item.name}\n`), DOUBLE_OFF);
    }

    parts.push(toCP437("--------------------------------\n"));
    parts.push(toCP437(`Clave noche: ${nightEvent.keyword ?? "(sin clave)"}\n`));
    if (order.ticketCode) {
      parts.push(toCP437(`cod: ${order.ticketCode.slice(0, 4)}\n`));
    }
    parts.push(FEED);

    return Buffer.concat(parts);
  }

  private buildTestBytes(): Buffer {
    return Buffer.concat([
      INIT,
      ALIGN_CENTER,
      toCP437("--- TICKET DE PRUEBA ---\n"),
      ALIGN_LEFT,
      toCP437(`${new Date().toLocaleString("es-AR")}\n`),
      FEED,
    ]);
  }

  /** Base64 ESC/POS del ticket de una venta (para auto-print o reprint en el cliente). */
  renderTicket(order: Order, nightEvent: NightEvent): string {
    return this.buildTicketBytes(order, nightEvent).toString("base64");
  }

  renderTest(): string {
    return this.buildTestBytes().toString("base64");
  }

  async printTicket(order: Order, nightEvent: NightEvent): Promise<PrintPayload> {
    return {
      success: true,
      message: "Ticket listo para imprimir en el dispositivo",
      data: this.renderTicket(order, nightEvent),
    };
  }

  async printTest(): Promise<PrintPayload> {
    return {
      success: true,
      message: "Prueba lista para imprimir en el dispositivo",
      data: this.renderTest(),
    };
  }
}
