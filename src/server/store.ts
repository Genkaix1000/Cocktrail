import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { SEED_DRINKS } from "@/data/drinks";
import { computeTotals } from "@/lib/totals";
import type {
  CashSale,
  Drink,
  EventSummary,
  EventTotals,
  NewCashSaleInput,
  NewOrderInput,
  NightEvent,
  Order,
  OrderStatus,
} from "@/types/domain";
import { BadRequest, Conflict, NotFound } from "./errors";
import { emit } from "./events";

type State = {
  drinks: Map<number, Drink>;
  orders: Map<string, Order>;
  cashSales: Map<string, CashSale>;
  event: NightEvent;
  // Historial in-memory de noches cerradas. Capped a HISTORY_CAP. Sobrevive
  // entre cierres de noche pero NO entre restarts del proceso (MVP sin DB).
  closedEvents: EventSummary[];
};

const HISTORY_CAP = 60;

type GlobalWithStore = typeof globalThis & {
  __cocktrailStore?: State;
};

const g = globalThis as GlobalWithStore;

function buildSeedState(): State {
  const drinks = new Map<number, Drink>();
  for (const d of SEED_DRINKS) drinks.set(d.id, d);

  const event: NightEvent = {
    id: randomUUID(),
    status: "activo",
    startedAt: Date.now(),
    orderCounter: 0,
  };

  return {
    drinks,
    orders: new Map(),
    cashSales: new Map(),
    event,
    closedEvents: [],
  };
}

function getState(): State {
  const state = (g.__cocktrailStore ??= buildSeedState());
  // HMR / migración: si el cached state no tiene `closedEvents` (porque se
  // construyó antes de que existiera el campo), agregarlo en runtime.
  if (!state.closedEvents) state.closedEvents = [];
  return state;
}

/** Idempotent. Called from instrumentation.ts on server boot. */
export function init(): void {
  getState();
}

// ──────────────────────────── Drinks ────────────────────────────

export function listDrinks(): Drink[] {
  return Array.from(getState().drinks.values());
}

export function getDrink(id: number): Drink | undefined {
  return getState().drinks.get(id);
}

// ──────────────────────────── Orders ────────────────────────────

function shortToken(): string {
  // 8 hex chars — colisión despreciable para una noche de boliche.
  return randomBytes(4).toString("hex");
}

export function getActiveOrders(): Order[] {
  return Array.from(getState().orders.values())
    .filter((o) => o.status !== "entregado" && o.status !== "cancelado")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function listOrders(): Order[] {
  return Array.from(getState().orders.values()).sort(
    (a, b) => a.createdAt - b.createdAt,
  );
}

export function getOrder(id: string): Order | undefined {
  return getState().orders.get(id);
}

export function getOrderByToken(token: string): Order | undefined {
  for (const order of getState().orders.values()) {
    if (order.token === token) return order;
  }
  return undefined;
}

export function createOrder(input: NewOrderInput): Order {
  const state = getState();

  if (state.event.status !== "activo") {
    throw new Conflict("No hay un evento activo. No se pueden crear pedidos.");
  }
  if (input.items.length === 0) {
    throw new BadRequest("El pedido no tiene items.");
  }

  const items = input.items.map((it) => {
    const drink = state.drinks.get(it.drinkId);
    if (!drink) throw new NotFound(`Drink ${it.drinkId} no existe.`);
    if (!drink.available) throw new Conflict(`${drink.name} no está disponible.`);
    if (it.qty <= 0) throw new BadRequest("Cantidad inválida.");
    return {
      drinkId: drink.id,
      name: drink.name,
      qty: it.qty,
      unitPrice: drink.price,
      subtotal: drink.price * it.qty,
    };
  });

  const total = items.reduce((sum, it) => sum + it.subtotal, 0);

  state.event.orderCounter += 1;
  const order: Order = {
    id: randomUUID(),
    token: shortToken(),
    displayNumber: state.event.orderCounter,
    items,
    total,
    paymentMethod: input.paymentMethod,
    status: "pagado",
    createdAt: Date.now(),
  };

  state.orders.set(order.id, order);
  emit({ type: "order.created", order });
  return order;
}

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pagado: ["preparando", "cancelado"],
  preparando: ["listo", "cancelado"],
  listo: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

export function updateOrderStatus(id: string, status: OrderStatus): Order {
  const state = getState();
  const order = state.orders.get(id);
  if (!order) throw new NotFound(`Order ${id} no existe.`);

  const allowed = STATUS_TRANSITIONS[order.status];
  if (!allowed.includes(status)) {
    throw new Conflict(
      `Transición inválida: ${order.status} → ${status}.`,
    );
  }

  order.status = status;
  if (status === "listo") order.readyAt = Date.now();
  if (status === "entregado") order.deliveredAt = Date.now();

  emit({ type: "order.updated", order });
  return order;
}

// ────────────────────────── Cash sales ──────────────────────────

export function listCashSales(): CashSale[] {
  return Array.from(getState().cashSales.values()).sort(
    (a, b) => a.createdAt - b.createdAt,
  );
}

export function addCashSale(input: NewCashSaleInput): CashSale {
  const state = getState();
  if (state.event.status !== "activo") {
    throw new Conflict("No hay un evento activo.");
  }
  if (input.amount <= 0) throw new BadRequest("Monto inválido.");

  const cashSale: CashSale = {
    id: randomUUID(),
    amount: input.amount,
    description: input.description,
    addedBy: "admin",
    createdAt: Date.now(),
  };
  state.cashSales.set(cashSale.id, cashSale);
  emit({ type: "cash_sale.added", cashSale });
  return cashSale;
}

// ──────────────────────────── Event ─────────────────────────────

export function getCurrentEvent(): NightEvent {
  return getState().event;
}

export function getEventTotals(): EventTotals {
  const state = getState();
  return computeTotals(
    Array.from(state.orders.values()),
    Array.from(state.cashSales.values()),
  );
}

export function closeEvent(): EventSummary {
  const state = getState();
  if (state.event.status !== "activo") {
    throw new Conflict("El evento ya está cerrado.");
  }

  state.event.status = "cerrado";
  state.event.closedAt = Date.now();

  const summary: EventSummary = {
    ...state.event,
    totals: getEventTotals(),
    orders: listOrders(),
    cashSales: listCashSales(),
  };

  // Snapshot al historial (más nuevo primero, capped).
  state.closedEvents.unshift(summary);
  if (state.closedEvents.length > HISTORY_CAP) {
    state.closedEvents.length = HISTORY_CAP;
  }

  emit({ type: "event.closed", summary });

  // Reset: nuevo evento activo, drinks se mantienen, orders/cashSales se vacían.
  state.event = {
    id: randomUUID(),
    status: "activo",
    startedAt: Date.now(),
    orderCounter: 0,
  };
  state.orders.clear();
  state.cashSales.clear();

  return summary;
}

// ─────────────────────────── Historial ──────────────────────────

export function listClosedEvents(): EventSummary[] {
  // Devuelve una copia ya ordenada (más reciente primero — se mantiene así
  // por la inserción con unshift en closeEvent).
  return [...getState().closedEvents];
}

/**
 * Seed para el demo: agrega un EventSummary fabricado al historial. Solo se
 * usa desde `instrumentation.ts` al boot, NUNCA desde una request handler.
 */
export function seedClosedEvent(summary: EventSummary): void {
  const state = getState();
  state.closedEvents.push(summary);
  // Mantener orden desc por closedAt.
  state.closedEvents.sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  if (state.closedEvents.length > HISTORY_CAP) {
    state.closedEvents.length = HISTORY_CAP;
  }
}

// ──────────────────────── Debug snapshot ─────────────────────────

export function snapshot() {
  return {
    event: getCurrentEvent(),
    drinks: listDrinks(),
    orders: listOrders(),
    cashSales: listCashSales(),
    totals: getEventTotals(),
  };
}
