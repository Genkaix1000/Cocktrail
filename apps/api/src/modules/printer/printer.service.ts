import { accessSync, constants, existsSync, readdirSync, writeFileSync } from "node:fs";
import type { NightEvent, Order } from "@cocktrail/shared";
import { toCP437 } from "./printer.charset.js";

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

export type PrintResult = {
  success: boolean;
  message: string;
};

export class PrinterService {
  private findDevice(): string | null {
    // En test (NODE_ENV=test) nunca se debe escribir a la impresora física real —
    // los tests de integración de orders/tickets crean ventas de staff, que disparan
    // impresión automática. Sin este guard, cada corrida de la suite manda tickets
    // reales al hardware conectado.
    if (process.env.NODE_ENV === "test") return null;
    try {
      const usbDir = "/dev/usb";
      if (!existsSync(usbDir)) return null;
      const candidates = readdirSync(usbDir).filter((f) => f.startsWith("lp"));
      for (const candidate of candidates) {
        const path = `${usbDir}/${candidate}`;
        try {
          accessSync(path, constants.W_OK);
          return path;
        } catch {
          continue;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  getStatus(): PrinterStatus {
    const device = this.findDevice();
    return device
      ? { connected: true, configured: true, message: `Impresora conectada en ${device}` }
      : { connected: false, configured: true, message: "Impresora no encontrada o sin permisos" };
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

  async printTicket(order: Order, nightEvent: NightEvent): Promise<PrintResult> {
    try {
      const device = this.findDevice();
      if (!device) return { success: false, message: "Impresora no encontrada" };
      writeFileSync(device, this.buildTicketBytes(order, nightEvent));
      return { success: true, message: "Impreso correctamente" };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "Error desconocido al imprimir" };
    }
  }

  async printTest(): Promise<PrintResult> {
    try {
      const device = this.findDevice();
      if (!device) return { success: false, message: "Impresora no encontrada" };
      writeFileSync(device, this.buildTestBytes());
      return { success: true, message: "Prueba enviada" };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "Error desconocido" };
    }
  }
}
