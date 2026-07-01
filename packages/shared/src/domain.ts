export type Role = "admin" | "caja" | "barman";
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
};

export type CashSale = {
  id: string;
  amount: number;
  description: string;
  addedBy: string;
  createdAt: number;
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
  cashSales: CashSale[];
};

export type NewOrderInput = {
  items: { drinkId: number; qty: number }[];
  paymentMethod: PaymentMethod;
};

export type NewCashSaleInput = {
  amount: number;
  description: string;
};
