export type Role = "admin" | "caja";
export type CustomTheme = {
  backgroundColor: string;
  surfaceColor: string;
  accentColor: string;
};
export type Theme = string;

export type DrinkCategory = {
  id: string;
  name: string;
  sortOrder: number;
  isSystem?: boolean;
};

export type Drink = {
  id: number;
  name: string;
  price: number;
  description: string;
  vibe: string;
  flavors: string[];
  iconName: string;
  image?: string;
  trending: boolean;
  promo?: boolean;
  available: boolean;
  categoryId?: string | null;
  /** Orden dentro de su categoría; menor = más arriba. 0/undefined = sin preferencia (al final). */
  sortOrder?: number;
};

export type OrderItem = {
  drinkId: number;
  name: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
};

export type OrderStatus =
  | "pendiente"
  | "entregado"
  | "cancelado";

export type PaymentMethod = "efectivo" | "qr" | "debito" | "cortesia" | "split";

export type OrderPaymentDetail = {
  method: PaymentMethod;
  amount: number;
};

export type Order = {
  id: string;
  token: string;
  displayNumber: number;
  items: OrderItem[];
  total: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt: number;
  readyAt?: number;
  deliveredAt?: number;
  ticketCode?: string;
  createdBy?: string;
  isGift?: boolean;
  isSplit?: boolean;
  payments?: OrderPaymentDetail[];
  cancelledBy?: string;
  cancelledAt?: number;
  deliveredBy?: string;
  deliveredByBar?: string;
  redeemMethod?: "scan" | "manual";
  paymentStatus?: "cobrado" | "pendiente_de_cobro" | "desconocido";
  paymentRef?: string;
  paymentRecordId?: string;
  idempotencyKey?: string;
};

export type NightEvent = {
  id: string;
  status: "activo" | "cerrado";
  startedAt: number;
  closedAt?: number;
  orderCounter: number;
  closedBy?: string;
  keyword?: string;
  /**
   * Noche de prueba: no se persiste nada (ni la noche, ni sus pedidos, ni sus tickets).
   * Opcional a propósito — las filas de la base lo dejan `undefined`, porque nada
   * persistido puede ser de prueba.
   */
  isTest?: boolean;
};

export type DrinkSold = {
  drinkId: number;
  name: string;
  qty: number;
  subtotal: number;
};

export type EventTotals = {
  webTotal: number;
  webCount: number;
  efectivoTotal: number;
  efectivoCount: number;
  qrTotal: number;
  qrCount: number;
  debitoTotal: number;
  debitoCount: number;
  cortesiaCount?: number;
  drinksSold: DrinkSold[];
  total: number;
};

export type EventSummary = NightEvent & {
  totals: EventTotals;
  orders: Order[];
};

export type NewOrderInput = {
  items: { drinkId: number; qty: number }[];
  paymentMethod: PaymentMethod;
  payment?: { provider: "mercadopago"; kind: "point_intent" | "qr_order"; id: string };
  idempotencyKey?: string;
  isGift?: boolean;
  isSplit?: boolean;
  payments?: OrderPaymentDetail[];
};

/**
 * Contenido de un ticket, ya formateado para mostrar (el server es dueño del
 * contenido; el device de caja lo convierte a su representación física:
 * ESC/POS texto en la ticketera USB, raster 384px en la impresora BLE).
 */
export type TicketContent = {
  /** Fecha de la noche, arriba del todo (ej: "NOCHE VIE 07/08/2026"). */
  nightDateText?: string;
  /** Solo el ticket de prueba lo usa; el de venta no lleva marca. */
  brand?: string;
  saleText?: string;
  /** Fecha/hora ya formateada es-AR (solo el ticket de prueba). */
  dateText?: string;
  items: { qty: number; name: string }[];
  keywordText?: string;
};

export type PrintPayload = {
  success: boolean;
  message: string;
  /** Bytes ESC/POS texto en base64 — transportes USB. */
  data: string;
  /** Contenido estructurado — el transporte Bluetooth lo rasteriza. */
  ticketContent: TicketContent;
};

export type CreateOrderResult = Order & {
  /** Siempre false en server: la impresión física vive en el device de caja. */
  printed: boolean;
  /** ESC/POS texto en base64 (solo ventas de caja con pago resuelto). */
  ticketData?: string;
  /** Contenido estructurado del mismo ticket (para el transporte Bluetooth). */
  ticketContent?: TicketContent;
};

export function computeTotals(orders: Order[]): EventTotals {
  let webTotal = 0;
  let webCount = 0;
  let efectivoTotal = 0;
  let efectivoCount = 0;
  let qrTotal = 0;
  let qrCount = 0;
  let debitoTotal = 0;
  let debitoCount = 0;
  let cortesiaCount = 0;
  const drinksByDrinkId = new Map<number, DrinkSold>();

  for (const order of orders) {
    if (order.status === "cancelado") continue;

    if (order.createdBy === "Cliente") {
      webTotal += order.total;
      webCount += 1;
    }

    if (order.isGift || order.paymentMethod === "cortesia") {
      cortesiaCount += 1;
    } else if (order.isSplit && order.payments) {
      for (const p of order.payments) {
        if (p.method === "efectivo") {
          efectivoTotal += p.amount;
          efectivoCount += 1;
        } else if (p.method === "qr") {
          qrTotal += p.amount;
          qrCount += 1;
        } else if (p.method === "debito") {
          debitoTotal += p.amount;
          debitoCount += 1;
        }
      }
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

  const drinksSold = [...drinksByDrinkId.values()].sort((a, b) => b.qty - a.qty);
  const total = efectivoTotal + qrTotal + debitoTotal;

  return {
    webTotal,
    webCount,
    efectivoTotal,
    efectivoCount,
    qrTotal,
    qrCount,
    debitoTotal,
    debitoCount,
    cortesiaCount,
    drinksSold,
    total,
  };
}
