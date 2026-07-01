import { EventEmitter } from "node:events";
import type {
  CashSale,
  EventSummary,
  NightEvent,
  Order,
  Theme,
  CustomTheme,
} from "@cocktrail/shared";

export type DomainEvent =
  | { type: "order.created"; order: Order }
  | { type: "order.updated"; order: Order }
  | { type: "cash_sale.added"; cashSale: CashSale }
  | { type: "event.closed"; summary: EventSummary }
  | { type: "event.opened"; event: NightEvent }
  | {
      type: "theme.changed";
      theme: Theme;
      customTheme?: CustomTheme | null;
      useLogoUrl?: boolean;
      logoUrl?: string;
      logoSize?: number;
      textLogoValue?: string;
      textLogoSize?: number;
      clubId?: string;
      clubName?: string;
    };

const CHANNEL = "domain";

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export function emit(event: DomainEvent): void {
  emitter.emit(CHANNEL, event);
}

export function subscribe(handler: (event: DomainEvent) => void): () => void {
  emitter.on(CHANNEL, handler);
  return () => {
    emitter.off(CHANNEL, handler);
  };
}
