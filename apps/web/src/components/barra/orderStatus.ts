import type { Order } from "@cocktrail/shared";

/**
 * Metadata visual del estado de un pedido en la lista de pendientes.
 * La usan tanto `PendingOrdersList` como `ManualRedeemModal` (el badge de
 * estado dentro del modal de confirmación) — vive acá para no duplicarla.
 */
export function getPendingStatus(status: Order["status"]) {
  switch (status) {
    case "entregado":
      return {
        label: "Entregado",
        className: "bg-green-soft text-green border-green-line",
      };
    case "cancelado":
      return {
        label: "Cancelado",
        className: "bg-danger-soft text-danger border-danger-line",
      };
    default:
      return {
        label: "Pendiente",
        className: "bg-amber-soft text-amber border-amber-line",
      };
  }
}
