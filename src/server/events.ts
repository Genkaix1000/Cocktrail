import "server-only";
import { EventEmitter } from "node:events";
import type {
  CashSale,
  EventSummary,
  Order,
} from "@/types/domain";

export type DomainEvent =
  | { type: "order.created"; order: Order }
  | { type: "order.updated"; order: Order }
  | { type: "cash_sale.added"; cashSale: CashSale }
  | { type: "event.closed"; summary: EventSummary };

const CHANNEL = "domain";

type GlobalWithEmitter = typeof globalThis & {
  __cocktrailEmitter?: EventEmitter;
};

const g = globalThis as GlobalWithEmitter;

function getEmitter(): EventEmitter {
  if (!g.__cocktrailEmitter) {
    const ee = new EventEmitter();
    // Subimos el límite: KDS + admin + cada cliente con su ticket abierto pueden
    // sumar varios listeners simultáneos. 100 es holgado para una demo.
    ee.setMaxListeners(100);
    g.__cocktrailEmitter = ee;
  }
  return g.__cocktrailEmitter;
}

export function emit(event: DomainEvent): void {
  getEmitter().emit(CHANNEL, event);
}

export function subscribe(handler: (event: DomainEvent) => void): () => void {
  const ee = getEmitter();
  ee.on(CHANNEL, handler);
  return () => {
    ee.off(CHANNEL, handler);
  };
}
