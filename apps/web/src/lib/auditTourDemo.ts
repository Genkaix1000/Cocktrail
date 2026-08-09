import type { Order, PaymentMethod } from "@cocktrail/shared";

/**
 * Tickets hardcodeados para el tour de Auditoría.
 * No tocan API ni necesitan noche abierta: LogsSection los inyecta en pantalla.
 */
const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

const DRINKS = [
  { drinkId: 1, name: "Fernet con Coca", unitPrice: 4500 },
  { drinkId: 2, name: "Gin Tonic", unitPrice: 5500 },
  { drinkId: 3, name: "Vodka con Energizante", unitPrice: 5000 },
  { drinkId: 4, name: "Cerveza IPA", unitPrice: 3500 },
] as const;

const METHODS: PaymentMethod[] = ["efectivo", "qr", "debito", "cortesia"];
const CREATORS = ["Ana", "Luis", "Mora"];

export function buildAuditDemoOrders(now = Date.now()): Order[] {
  // 12 hoy (paginación) + 3 ayer (nav por día).
  return Array.from({ length: 15 }, (_, i) => {
    const drink = DRINKS[i % DRINKS.length]!;
    const qty = (i % 3) + 1;
    const subtotal = drink.unitPrice * qty;
    const yesterday = i >= 12;
    const cancelled = i === 2 || i === 7;
    return {
      id: `demo-audit-${i}`,
      token: `DEMO-${1400 + i}`,
      displayNumber: 40 + i,
      items: [{ drinkId: drink.drinkId, name: drink.name, qty, unitPrice: drink.unitPrice, subtotal }],
      total: subtotal,
      paymentMethod: METHODS[i % METHODS.length]!,
      status: cancelled ? ("cancelado" as const) : ("entregado" as const),
      createdAt: now - (yesterday ? DAY_MS : 0) - i * 8 * MIN_MS,
      createdBy: CREATORS[i % CREATORS.length],
      cancelledBy: cancelled ? "Ana" : undefined,
      cancelledAt: cancelled ? now - 30 * MIN_MS : undefined,
    };
  });
}

type Listener = () => void;

let demoOrders: Order[] | null = null;
const listeners = new Set<Listener>();

export function isAuditDemoActive(): boolean {
  return demoOrders != null;
}

export function getAuditDemoOrders(): Order[] | null {
  return demoOrders;
}

export function startAuditDemo(): void {
  demoOrders = buildAuditDemoOrders();
  listeners.forEach((l) => l());
}

export function endAuditDemo(): void {
  if (demoOrders == null) return;
  demoOrders = null;
  listeners.forEach((l) => l());
}

export function subscribeAuditDemo(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
