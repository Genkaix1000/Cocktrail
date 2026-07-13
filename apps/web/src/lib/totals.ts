import type {
  DrinkSold,
  EventTotals,
  Order,
} from "@cocktrail/shared";

/**
 * Función pura: agrega los totales de la noche a partir de la lista de
 * pedidos. Se usa tanto desde el server (store.getEventTotals) como desde
 * el client (AdminClient con useMemo). Cancelados se excluyen.
 */
export function computeTotals(orders: Order[]): EventTotals {
  let webTotal = 0;
  let webCount = 0;
  let efectivoTotal = 0;
  let efectivoCount = 0;
  let qrTotal = 0;
  let qrCount = 0;
  let debitoTotal = 0;
  let debitoCount = 0;
  const drinksByDrinkId = new Map<number, DrinkSold>();

  for (const order of orders) {
    if (order.status === "cancelado") continue;

    if (order.createdBy === "Cliente") {
      webTotal += order.total;
      webCount += 1;
    }

    if (order.paymentMethod === "efectivo") {
      efectivoTotal += order.total;
      efectivoCount += 1;
    } else if (order.paymentMethod === "qr") {
      qrTotal += order.total;
      qrCount += 1;
    } else if (order.paymentMethod === "debito") {
      debitoTotal += order.total;
      debitoCount += 1;
    }

    for (const item of order.items) {
      const acc = drinksByDrinkId.get(item.drinkId);
      if (acc) {
        acc.qty += item.qty;
        acc.subtotal += item.subtotal;
      } else {
        drinksByDrinkId.set(item.drinkId, {
          drinkId: item.drinkId,
          name: item.name,
          qty: item.qty,
          subtotal: item.subtotal,
        });
      }
    }
  }

  return {
    webTotal,
    webCount,
    efectivoTotal,
    efectivoCount,
    qrTotal,
    qrCount,
    debitoTotal,
    debitoCount,
    drinksSold: Array.from(drinksByDrinkId.values()).sort(
      (a, b) => b.qty - a.qty,
    ),
    total: efectivoTotal + qrTotal + debitoTotal,
  };
}
