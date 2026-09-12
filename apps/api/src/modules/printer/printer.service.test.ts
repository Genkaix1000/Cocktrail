import { describe, expect, it } from "vitest";
import type { NightEvent, Order } from "@cocktrail/shared";
import { PrinterService } from "./printer.service.js";

const order: Order = {
  id: "o1",
  token: "tok",
  displayNumber: 1,
  items: [{ drinkId: 1, name: "Fernet", qty: 2, unitPrice: 5000, subtotal: 10000 }],
  total: 10000,
  paymentMethod: "efectivo",
  status: "pendiente",
  createdAt: Date.now(),
  createdBy: "Caja",
};

function night(overrides: Partial<NightEvent> = {}): NightEvent {
  return {
    id: "n1",
    status: "activo",
    startedAt: Date.UTC(2026, 8, 12),
    orderCounter: 0,
    keyword: "PERRITO",
    ...overrides,
  };
}

describe("PrinterService.buildTicketContent", () => {
  const printer = new PrinterService();

  it("noche real: clave + ítems sin tachar ni brand", () => {
    const content = printer.buildTicketContent(order, night());
    expect(content.brand).toBeUndefined();
    expect(content.keywordText).toBe("Clave: PERRITO");
    expect(content.items).toEqual([{ qty: 2, name: "Fernet" }]);
  });

  it("noche de prueba: TICKET NO VALIDO + tragos tachados, sin brand", () => {
    const content = printer.buildTicketContent(order, night({ isTest: true }));
    expect(content.brand).toBeUndefined();
    expect(content.keywordText).toBe("TICKET NO VALIDO");
    expect(content.items).toEqual([{ qty: 2, name: "Fernet", strike: true }]);
  });
});
