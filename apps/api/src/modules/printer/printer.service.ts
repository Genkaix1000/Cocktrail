import type { NightEvent, Order, PrintPayload, TicketContent } from "@cocktrail/shared";

export type { PrintPayload } from "@cocktrail/shared";

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

/**
 * Arma tickets. No toca hardware: el server es dueño del CONTENIDO del ticket
 * (`TicketContent`, valores listos para mostrar); el device de caja es dueño de
 * la representación física (ESC/POS texto por USB o raster por Bluetooth).
 */
export class PrinterService {
  getStatus(): PrinterStatus {
    return {
      connected: false,
      configured: true,
      message: "La impresora se vincula en el dispositivo de caja (WebUSB)",
    };
  }

  /** Único lugar que sabe QUÉ dice un ticket; los transportes deciden CÓMO se ve. */
  buildTicketContent(order: Order, nightEvent: NightEvent): TicketContent {
    return {
      nightDateText:
        "NOCHE " +
        new Date(nightEvent.startedAt)
          .toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
          .toUpperCase(),
      brand: "BOSKO",
      saleText: `Venta #${order.displayNumber}`,
      dateText: new Date(order.createdAt).toLocaleString("es-AR"),
      items: order.items.map((item) => ({ qty: item.qty, name: item.name })),
      keywordText: `Clave noche: ${nightEvent.keyword ?? "(sin clave)"}`,
      codeText: order.ticketCode ? `cod: ${order.ticketCode.slice(0, 4)}` : undefined,
    };
  }

  buildTestContent(): TicketContent {
    return {
      brand: "--- TICKET DE PRUEBA ---",
      dateText: new Date().toLocaleString("es-AR"),
      items: [],
    };
  }

  private buildTicketBytes(content: TicketContent): Buffer {
    const parts: Buffer[] = [INIT, ALIGN_CENTER];

    if (content.nightDateText) {
      parts.push(toCP437(`${content.nightDateText}\n`));
    }
    parts.push(DOUBLE_ON, toCP437(`${content.brand}\n`), DOUBLE_OFF, ALIGN_LEFT);

    if (content.saleText) {
      parts.push(toCP437(`${content.saleText}\n`));
    }
    parts.push(toCP437(`${content.dateText}\n`));
    parts.push(toCP437("--------------------------------\n"));

    for (const item of content.items) {
      parts.push(DOUBLE_ON, toCP437(`${item.qty}x ${item.name}\n`), DOUBLE_OFF);
    }

    parts.push(toCP437("--------------------------------\n"));
    if (content.keywordText) {
      parts.push(toCP437(`${content.keywordText}\n`));
    }
    if (content.codeText) {
      parts.push(toCP437(`${content.codeText}\n`));
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
    return this.buildTicketBytes(this.buildTicketContent(order, nightEvent)).toString("base64");
  }

  /** Par bytes + content de un mismo ticket: cada transporte consume el que le sirve. */
  renderTicketPayload(order: Order, nightEvent: NightEvent): { ticketData: string; ticketContent: TicketContent } {
    const ticketContent = this.buildTicketContent(order, nightEvent);
    return {
      ticketData: this.buildTicketBytes(ticketContent).toString("base64"),
      ticketContent,
    };
  }

  renderTest(): string {
    return this.buildTestBytes().toString("base64");
  }

  async printTicket(order: Order, nightEvent: NightEvent): Promise<PrintPayload> {
    const { ticketData, ticketContent } = this.renderTicketPayload(order, nightEvent);
    return {
      success: true,
      message: "Ticket listo para imprimir en el dispositivo",
      data: ticketData,
      ticketContent,
    };
  }

  async printTest(): Promise<PrintPayload> {
    return {
      success: true,
      message: "Prueba lista para imprimir en el dispositivo",
      data: this.renderTest(),
      ticketContent: this.buildTestContent(),
    };
  }
}
