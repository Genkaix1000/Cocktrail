import type { Order, OrderStatus } from "@cocktrail/shared";

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
  pendiente: {
    short: "Pendiente",
    long: "Pendiente · retiralo en la barra",
    tone: "text-[#38bdf8]",
  },
  entregado: {
    short: "Entregado",
    long: "Entregado",
    tone: "text-slate-400",
  },
  cancelado: {
    short: "Cancelado",
    long: "Cancelado",
    tone: "text-danger",
  },
};

