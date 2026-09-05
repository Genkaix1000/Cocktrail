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
  /** Ventana horaria de vigencia (promos temporales). */
  scheduleEnabled?: boolean;
  /** HH:MM local. */
  scheduleFrom?: string | null;
  /** HH:MM local; puede ser menor que from (cruza medianoche). */
  scheduleUntil?: string | null;
  scheduleHideWhenExpired?: boolean;
  scheduleMoveToCategoryId?: string | null;
  /** Si false, al salir de la ventana queda vencida hasta reactivar. */
  scheduleRepeatNextEvent?: boolean;
  /** One-shot: ya venció al menos una vez sin repeat. */
  scheduleConsumed?: boolean;
};

export type DrinkScheduleState = {
  inWindow: boolean;
  /** false = no mostrar en caja. */
  visible: boolean;
  /** true = gris + confirmación al agregar. */
  gray: boolean;
  effectiveCategoryId: string | null;
};

function parseHHMM(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** ¿`now` está dentro de [from, until)? Soporta cruce de medianoche. */
export function isWithinScheduleWindow(
  from: string | null | undefined,
  until: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const a = parseHHMM(from);
  const b = parseHHMM(until);
  if (a === null || b === null) return true;
  const mins = now.getHours() * 60 + now.getMinutes();
  if (a === b) return true;
  if (a < b) return mins >= a && mins < b;
  return mins >= a || mins < b;
}

export function evaluateDrinkSchedule(drink: Drink, now: Date = new Date()): DrinkScheduleState {
  const categoryId = drink.categoryId ?? null;
  if (!drink.scheduleEnabled) {
    return { inWindow: true, visible: true, gray: false, effectiveCategoryId: categoryId };
  }

  const inWindow = isWithinScheduleWindow(drink.scheduleFrom, drink.scheduleUntil, now);
  const stickyExpired = Boolean(drink.scheduleConsumed) && !drink.scheduleRepeatNextEvent;
  const expired = stickyExpired || !inWindow;

  if (!expired) {
    return { inWindow: true, visible: true, gray: false, effectiveCategoryId: categoryId };
  }

  if (drink.scheduleHideWhenExpired) {
    return {
      inWindow: false,
      visible: false,
      gray: false,
      effectiveCategoryId: drink.scheduleMoveToCategoryId || categoryId,
    };
  }

  return {
    inWindow: false,
    visible: true,
    gray: true,
    effectiveCategoryId: drink.scheduleMoveToCategoryId || categoryId,
  };
}

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
  /**
   * Neto acreditado por MP (fee_status=ready en mp_orders).
   * El bruto del ticket sigue en `total`.
   */
  mpNetReceived?: number;
  /** Comisión MP del cobro (pesos), si ya está lista. */
  mpFeeAmount?: number;
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
  /** Comisión MP real (suma fee_status=ready). Opcional: ausente si no se enriqueció. */
  mpFeeTotal?: number;
  /**
   * Ingreso neto de la noche: efectivo (fee 0) + netos MP.
   * Facturado sigue en `total` (bruto).
   */
  netTotal?: number;
  /** Cobros MP processed aún sin neto de la API. */
  mpFeesPending?: number;
  /** Bruto real cobrado por MP QR (mp_orders.paid_amount). Fallback: qrTotal. */
  mpQrPaid?: number;
  /** Bruto real cobrado por Point/tarjeta (mp_orders.paid_amount). Fallback: debitoTotal. */
  mpDebitoPaid?: number;
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
  /** true = ghost mode: no persistió en registros. */
  ghost?: boolean;
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

/**
 * Plata que “entra” por ese ticket: neto MP si ya está, si no el bruto.
 */
export function displayOrderRevenue(order: Pick<Order, "total" | "mpNetReceived">): number {
  return order.mpNetReceived ?? order.total;
}

/**
 * Plata que “entra” al boliche: neto MP+efectivo si el server ya enriqueció fees;
 * si no, el facturado bruto.
 */
export function displayRevenue(totals: EventTotals): number {
  return totals.netTotal ?? totals.total;
}

/**
 * Totales live del carrito + fees MP del último snapshot del server.
 * El bruto (efectivo/qr/débito/total) sigue saliendo de `orders`; el neto
 * reusa la suma de netos MP del snapshot (no cambia con ventas en efectivo).
 */
export function withLiveMpFees(
  live: EventTotals,
  snapshot: EventTotals | null | undefined,
): EventTotals {
  if (snapshot == null) return live;
  if (snapshot.mpFeeTotal == null && snapshot.netTotal == null) return live;
  const snapshotMpNet = (snapshot.netTotal ?? snapshot.total) - snapshot.efectivoTotal;
  return {
    ...live,
    mpFeeTotal: snapshot.mpFeeTotal ?? 0,
    netTotal: live.efectivoTotal + Math.max(0, snapshotMpNet),
    mpFeesPending: snapshot.mpFeesPending,
    ...(snapshot.mpQrPaid != null ? { mpQrPaid: snapshot.mpQrPaid } : {}),
    ...(snapshot.mpDebitoPaid != null ? { mpDebitoPaid: snapshot.mpDebitoPaid } : {}),
  };
}
