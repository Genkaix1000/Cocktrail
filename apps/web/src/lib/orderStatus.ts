import type { CashSale, Order, OrderStatus } from "@cocktrail/shared";

/**
 * Metadata visual de cada status de pedido, compartida entre Ticket (cliente),
 * BarraClient (KDS) y AdminClient (dashboard).
 *
 * - `short` para badges chicas y columnas Kanban.
 * - `long` para el mensaje principal del ticket del cliente.
 * - `tone` clase Tailwind del color del label.
 */
export const STATUS_META: Record<
  OrderStatus,
  { short: string; long: string; tone: string }
> = {
  pagado: {
    short: "Pagado",
    long: "Pagado · esperando preparación",
    tone: "text-[#38bdf8]",
  },
  preparando: {
    short: "Preparando",
    long: "El barman lo está preparando",
    tone: "text-amber-300",
  },
  listo: {
    short: "Listo",
    long: "¡Listo! Retiralo en la barra",
    tone: "text-emerald-400",
  },
  entregado: {
    short: "Entregado",
    long: "Entregado",
    tone: "text-slate-400",
  },
  cancelado: {
    short: "Cancelado",
    long: "Cancelado",
    tone: "text-red-400",
  },
};

/** Comparador: ascendente por createdAt (más viejo primero). */
export const byCreatedAtAsc = (a: Order | CashSale, b: Order | CashSale) =>
  a.createdAt - b.createdAt;

/** Comparador: descendente por createdAt (más nuevo primero). */
export const byCreatedAtDesc = (a: Order | CashSale, b: Order | CashSale) =>
  b.createdAt - a.createdAt;
