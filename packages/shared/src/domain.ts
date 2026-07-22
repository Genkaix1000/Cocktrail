export type Role = "admin" | "caja";
export type CustomTheme = {
  backgroundColor: string;
  surfaceColor: string;
  accentColor: string;
};
export type Theme = "bosko";

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

export type PaymentMethod = "efectivo" | "qr" | "debito";

/**
 * Estado de cobro de la venta. "desconocido" es solo para filas pre-migración
 * y pedidos de /carta; "pendiente_de_cobro" queda reservado para la Fase 7.
 */
export type PaymentStatus = "cobrado" | "pendiente_de_cobro" | "desconocido";

/** Prueba de pago que la caja presenta al registrar una venta no-efectivo. */
export type PaymentProofInput = {
  provider: "mercadopago";
  kind: "point_intent" | "qr_order";
  id: string;
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
  cancelledBy?: string;
  cancelledAt?: number;
  deliveredBy?: string;
  deliveredByBar?: string;
  redeemMethod?: "scan" | "manual";
  paymentStatus?: PaymentStatus;
  /** Id del pago en el proveedor (ej. payment_id de MP) — lo que se busca en su panel. */
  paymentRef?: string;
  /** Id interno de la fila de cobro ligada (orders.mp_order_id). */
  paymentRecordId?: string;
  /** Key de replay del registro (orders.idempotency_key). */
  idempotencyKey?: string;
};

export type EventStatus = "activo" | "cerrado";

export type NightEvent = {
  id: string;
  status: EventStatus;
  startedAt: number;
  closedAt?: number;
  orderCounter: number;
  closedBy?: string;
  keyword?: string;
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
  /** Obligatoria para ventas de caja no-efectivo (el server la verifica). */
  payment?: PaymentProofInput;
  /** Replay: mismo key → misma Order, sin doble registro. */
  idempotencyKey?: string;
};
