import { EventEmitter } from "node:events";
import type {
  EventSummary,
  NightEvent,
  Order,
  Theme,
  CustomTheme,
} from "@cocktrail/shared";

export type DomainEvent =
  | { type: "order.created"; order: Order }
  | { type: "order.updated"; order: Order }
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
    }
  | {
      type: "bar-session.expired";
      barId: string;
      ejectedUser: string;
      ejectedBy: string;
    }
  | {
      type: "mp.order.updated";
      mpOrder: {
        orderIdMp: string;
        externalRef: string;
        status: string;
        paymentId: string | null;
        type: "qr" | "point";
        amount: number;
        barId: string | null;
      };
      action?: string;
      isPartialRefund?: boolean;
    }
  | { type: "carta.updated" };

/** Firma inyectable de `emit`, para pasar por constructor en vez de importar el singleton. */
export type EmitFn = (event: DomainEvent) => void;

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
