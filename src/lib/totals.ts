import type {
  CashSale,
  DrinkSold,
  EventTotals,
  Order,
} from "@/types/domain";

/**
 * Función pura: agrega los totales de la noche a partir de listas de pedidos
 * y ventas en efectivo. Se usa tanto desde el server (store.getEventTotals)
 * como desde el client (AdminClient con useMemo).
 *
 * Cancelados se excluyen. Las ventas en efectivo del barman cuentan como
 * efectivo pero NO suman tragos (no tienen items).
 */
export function computeTotals(
  orders: Order[],
  cashSales: CashSale[],
): EventTotals {
  let transferenciaTotal = 0;
  let transferenciaCount = 0;
  let efectivoTotal = 0;
  let efectivoCount = 0;
  const drinksByDrinkId = new Map<number, DrinkSold>();

  for (const order of orders) {
    if (order.status === "cancelado") continue;

    if (order.paymentMethod === "transferencia") {
      transferenciaTotal += order.total;
      transferenciaCount += 1;
    } else {
      efectivoTotal += order.total;
      efectivoCount += 1;
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

  for (const sale of cashSales) {
    efectivoTotal += sale.amount;
    efectivoCount += 1;
  }

  return {
    transferenciaTotal,
    transferenciaCount,
    efectivoTotal,
    efectivoCount,
    drinksSold: Array.from(drinksByDrinkId.values()).sort(
      (a, b) => b.qty - a.qty,
    ),
    total: transferenciaTotal + efectivoTotal,
  };
}
