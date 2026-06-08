import type {
  CashSale,
  DrinkSold,
  EventTotals,
  Order,
} from "@cocktrail/shared";

/**
 * Función pura: agrega los totales de la noche a partir de listas de pedidos
 * y ventas en efectivo. Cancelados se excluyen. Las ventas en efectivo del
 * barman cuentan como efectivo pero NO suman tragos (no tienen items).
 */
export function computeTotals(
  orders: Order[],
  cashSales: CashSale[],
): EventTotals {
  let transferenciaTotal = 0;
  let transferenciaCount = 0;
  let efectivoTotal = 0;
  let efectivoCount = 0;
  let qrTotal = 0;
  let qrCount = 0;
  let debitoTotal = 0;
  let debitoCount = 0;
  const drinksByDrinkId = new Map<number, DrinkSold>();

  for (const order of orders) {
    if (order.status === "cancelado") continue;

    if (order.paymentMethod === "transferencia") {
      transferenciaTotal += order.total;
      transferenciaCount += 1;
    } else if (order.paymentMethod === "efectivo") {
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

  for (const sale of cashSales) {
    efectivoTotal += sale.amount;
    efectivoCount += 1;
  }

  return {
    transferenciaTotal,
    transferenciaCount,
    efectivoTotal,
    efectivoCount,
    qrTotal,
    qrCount,
    debitoTotal,
    debitoCount,
    drinksSold: Array.from(drinksByDrinkId.values()).sort(
      (a, b) => b.qty - a.qty,
    ),
    total: transferenciaTotal + efectivoTotal + qrTotal + debitoTotal,
  };
}
