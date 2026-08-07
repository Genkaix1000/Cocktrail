/**
 * Self-check mínimo del render ESC/POS → base64 (sin hardware).
 * Correr: pnpm --filter cocktrail-api exec tsx src/modules/printer/printer.service.selfcheck.ts
 */
import { PrinterService } from "./printer.service.js";
import type { NightEvent, Order } from "@cocktrail/shared";

const order = {
  id: "o1",
  displayNumber: 7,
  createdAt: Date.UTC(2026, 6, 24, 15, 0, 0),
  items: [{ drinkId: 1, name: "Fernet", qty: 2, unitPrice: 5000, subtotal: 10000 }],
  ticketCode: "ABCD1234",
  total: 10000,
  status: "pendiente",
  paymentMethod: "efectivo",
  token: "deadbeef",
  createdBy: "caja",
} as unknown as Order;

const event = {
  id: "e1",
  keyword: "luna",
  status: "activo",
  startedAt: Date.now(),
} as NightEvent;

const svc = new PrinterService();
const b64 = svc.renderTicket(order, event);
const bytes = Buffer.from(b64, "base64");

if (!b64 || bytes.length < 20) throw new Error("ticket vacío o demasiado corto");
if (!bytes.includes(Buffer.from("NOCHE"))) throw new Error("falta la línea de fecha de la noche");
if (!bytes.includes(Buffer.from("BOSKO"))) throw new Error("falta marca BOSKO");
if (!bytes.includes(Buffer.from("Fernet"))) throw new Error("falta ítem");
if (!bytes.includes(Buffer.from("luna"))) throw new Error("falta keyword");

const content = svc.buildTicketContent(order, event);
if (content.brand !== "BOSKO") throw new Error(`content.brand roto: ${content.brand}`);
if (content.saleText !== "Venta #7") throw new Error(`content.saleText roto: ${content.saleText}`);
if (content.codeText !== "cod: ABCD") throw new Error(`content.codeText roto: ${content.codeText}`);
if (!content.keywordText?.includes("luna")) throw new Error(`content.keywordText roto: ${content.keywordText}`);
if (!content.nightDateText?.startsWith("NOCHE")) throw new Error(`content.nightDateText roto: ${content.nightDateText}`);
if (content.items.length !== 1 || content.items[0]?.name !== "Fernet" || content.items[0]?.qty !== 2) {
  throw new Error(`content.items roto: ${JSON.stringify(content.items)}`);
}

const test = Buffer.from(svc.renderTest(), "base64");
if (!test.includes(Buffer.from("TICKET DE PRUEBA"))) throw new Error("test payload roto");

console.log("printer.service.selfcheck: ok", { ticketBytes: bytes.length, testBytes: test.length });
