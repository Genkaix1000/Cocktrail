import "server-only";
import { randomUUID } from "node:crypto";
import { SEED_DRINKS } from "@/data/drinks";
import { computeTotals } from "@/lib/totals";
import type {
  CashSale,
  EventSummary,
  Order,
  OrderItem,
} from "@/types/domain";
import { listClosedEvents, seedClosedEvent } from "./store";

// Datos sintéticos para el historial del demo. Tres noches con escalas
// distintas para que las agregaciones (semana/mes) se vean creíbles desde
// el primer load.

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function findDrink(id: number) {
  const drink = SEED_DRINKS.find((d) => d.id === id);
  if (!drink) throw new Error(`Seed: drink ${id} no existe`);
  return drink;
}

function makeOrderItem(drinkId: number, qty: number): OrderItem {
  const d = findDrink(drinkId);
  return {
    drinkId: d.id,
    name: d.name,
    qty,
    unitPrice: d.price,
    subtotal: d.price * qty,
  };
}

function makeOrder(
  displayNumber: number,
  itemsSpec: ReadonlyArray<readonly [number, number]>,
  baseDate: number,
  minutesAfter: number,
): Order {
  const items = itemsSpec.map(([id, qty]) => makeOrderItem(id, qty));
  const total = items.reduce((s, it) => s + it.subtotal, 0);
  const createdAt = baseDate + minutesAfter * 60 * 1000;
  return {
    id: randomUUID(),
    token: randomUUID().slice(0, 8),
    displayNumber,
    items,
    total,
    paymentMethod: "transferencia",
    status: "entregado",
    createdAt,
    readyAt: createdAt + 3 * 60 * 1000,
    deliveredAt: createdAt + 8 * 60 * 1000,
  };
}

function makeCashSale(
  amount: number,
  description: string,
  baseDate: number,
  minutesAfter: number,
): CashSale {
  return {
    id: randomUUID(),
    amount,
    description,
    addedBy: "admin",
    createdAt: baseDate + minutesAfter * 60 * 1000,
  };
}

function buildSummary(params: {
  daysAgo: number;
  durationHours: number;
  orders: ReadonlyArray<{
    n: number;
    items: ReadonlyArray<readonly [number, number]>;
    minute: number;
  }>;
  cash: ReadonlyArray<{ amount: number; desc: string; minute: number }>;
}): EventSummary {
  // Noche típica: arranca 23:00 hs, cierra ~4:00 AM. La marcamos como cerrada
  // a las (now - daysAgo * 24hs). Para hacerlo simple, startedAt = now -
  // daysAgo*24h - durationHours, closedAt = startedAt + durationHours.
  const closedAt = Date.now() - params.daysAgo * DAY;
  const startedAt = closedAt - params.durationHours * HOUR;

  const orders = params.orders.map(({ n, items, minute }) =>
    makeOrder(n, items, startedAt, minute),
  );
  const cashSales = params.cash.map(({ amount, desc, minute }) =>
    makeCashSale(amount, desc, startedAt, minute),
  );

  return {
    id: randomUUID(),
    status: "cerrado",
    startedAt,
    closedAt,
    orderCounter: orders.length,
    totals: computeTotals(orders, cashSales),
    orders,
    cashSales,
  };
}

export function seedHistoryDemo(): void {
  // Idempotente: si ya hay algo cargado (por seed previo o cierre real),
  // no agregamos nada más. Permite invocarlo desde instrumentation.ts (boot)
  // y también desde un Server Component como fallback si el boot no corrió.
  if (listClosedEvents().length > 0) return;

  const noches = [
    // Anoche — noche grande.
    buildSummary({
      daysAgo: 1,
      durationHours: 6,
      orders: [
        { n: 1, items: [[1, 2]], minute: 12 },
        { n: 2, items: [[2, 3], [4, 1]], minute: 28 },
        { n: 3, items: [[1, 1], [5, 2]], minute: 45 },
        { n: 4, items: [[6, 4]], minute: 72 },
        { n: 5, items: [[2, 2], [3, 1]], minute: 95 },
        { n: 6, items: [[1, 1]], minute: 130 },
        { n: 7, items: [[7, 1], [8, 1]], minute: 175 },
        { n: 8, items: [[3, 2], [4, 1]], minute: 210 },
        { n: 9, items: [[1, 2], [2, 1]], minute: 245 },
        { n: 10, items: [[6, 2]], minute: 290 },
      ],
      cash: [
        { amount: 5500, desc: "Fernet", minute: 60 },
        { amount: 8000, desc: "2 Vodka Speed", minute: 140 },
        { amount: 4200, desc: "Gancia", minute: 220 },
      ],
    }),

    // Hace 3 días — noche tranquila.
    buildSummary({
      daysAgo: 3,
      durationHours: 4,
      orders: [
        { n: 1, items: [[1, 1]], minute: 15 },
        { n: 2, items: [[2, 1], [3, 1]], minute: 40 },
        { n: 3, items: [[4, 2]], minute: 78 },
        { n: 4, items: [[1, 2]], minute: 120 },
        { n: 5, items: [[5, 1], [7, 1]], minute: 165 },
      ],
      cash: [
        { amount: 5500, desc: "Fernet", minute: 80 },
        { amount: 3500, desc: "Cerveza", minute: 155 },
      ],
    }),

    // Hace 7 días — fin de semana fuerte.
    buildSummary({
      daysAgo: 7,
      durationHours: 7,
      orders: [
        { n: 1, items: [[1, 3]], minute: 10 },
        { n: 2, items: [[2, 2], [3, 2]], minute: 25 },
        { n: 3, items: [[1, 2]], minute: 55 },
        { n: 4, items: [[6, 5]], minute: 80 },
        { n: 5, items: [[2, 4]], minute: 105 },
        { n: 6, items: [[1, 1], [4, 1]], minute: 140 },
        { n: 7, items: [[3, 2], [5, 1]], minute: 175 },
        { n: 8, items: [[7, 2], [8, 1]], minute: 220 },
        { n: 9, items: [[2, 3], [6, 2]], minute: 255 },
        { n: 10, items: [[1, 2]], minute: 290 },
        { n: 11, items: [[4, 3], [3, 1]], minute: 325 },
        { n: 12, items: [[1, 1], [2, 1], [6, 1]], minute: 365 },
      ],
      cash: [
        { amount: 11000, desc: "2 Fernet", minute: 50 },
        { amount: 5500, desc: "Fernet", minute: 130 },
        { amount: 7000, desc: "2 Cerveza", minute: 200 },
        { amount: 4800, desc: "Campari", minute: 310 },
      ],
    }),
  ];

  for (const n of noches) seedClosedEvent(n);
}
