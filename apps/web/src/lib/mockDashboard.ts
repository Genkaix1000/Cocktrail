import type { EventSummary, EventTotals, Order } from "@cocktrail/shared";

export const MOCK_DEMO_TOTALS: EventTotals = {
  total: 1485000,
  webTotal: 0,
  webCount: 0,
  efectivoTotal: 445500,
  efectivoCount: 102,
  qrTotal: 816750,
  qrCount: 188,
  debitoTotal: 222750,
  debitoCount: 52,
  drinksSold: [
    { drinkId: 1, name: "Fernet con Coca", qty: 210, subtotal: 630000 },
    { drinkId: 2, name: "Gin Tonic", qty: 145, subtotal: 507500 },
    { drinkId: 3, name: "Vodka con Energizante", qty: 115, subtotal: 402500 },
    { drinkId: 4, name: "Cerveza Pinta IPA", qty: 70, subtotal: 175000 },
    { drinkId: 5, name: "Agua Mineral 500ml", qty: 40, subtotal: 60000 },
  ],
};

const NOW = Date.now();
const HOUR_MS = 3600 * 1000;

export const MOCK_DEMO_ORDERS: Order[] = Array.from({ length: 45 }).map((_, i) => ({
  id: `mock-order-${i}`,
  token: `token-${i}`,
  displayNumber: i + 100,
  status: "entregado" as const,
  paymentMethod: i % 3 === 0 ? ("efectivo" as const) : i % 2 === 0 ? ("qr" as const) : ("debito" as const),
  total: 4500,
  items: [{ drinkId: 1, name: "Fernet con Coca", qty: 1, unitPrice: 4500, subtotal: 4500 }],
  createdAt: NOW - (i % 6) * HOUR_MS - 15 * 60 * 1000,
}));

export const MOCK_DEMO_HISTORY: EventSummary[] = [
  {
    id: "mock-last-night",
    keyword: "FIESTA",
    status: "cerrado",
    startedAt: NOW - 7 * 24 * HOUR_MS,
    closedAt: NOW - 7 * 24 * HOUR_MS + 7 * HOUR_MS,
    orderCounter: 300,
    orders: MOCK_DEMO_ORDERS,
    totals: {
      total: 1250000,
      webTotal: 0,
      webCount: 0,
      efectivoTotal: 375000,
      efectivoCount: 90,
      qrTotal: 687500,
      qrCount: 165,
      debitoTotal: 187500,
      debitoCount: 45,
      drinksSold: [
        { drinkId: 1, name: "Fernet con Coca", qty: 180, subtotal: 540000 },
        { drinkId: 2, name: "Gin Tonic", qty: 120, subtotal: 420000 },
        { drinkId: 3, name: "Vodka con Energizante", qty: 95, subtotal: 290000 },
      ],
    },
  },
];
