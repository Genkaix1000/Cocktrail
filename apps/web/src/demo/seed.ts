import type { Drink, DrinkCategory, Order, PaymentMethod } from "@cocktrail/shared";

/** Snapshot Bosko 2026-08-20 + jitter ±12%. Imágenes en /public. */
export const DEMO_CATEGORIES: DrinkCategory[] = [
  {
    "id": "tendencias",
    "name": "Tendencias",
    "sortOrder": 1,
    "isSystem": true
  },
  {
    "id": "vodkas",
    "name": "Vodkas",
    "sortOrder": 3,
    "isSystem": true
  },
  {
    "id": "whiskys",
    "name": "Whiskys",
    "sortOrder": 4,
    "isSystem": true
  },
  {
    "id": "gines",
    "name": "Gines",
    "sortOrder": 5,
    "isSystem": true
  },
  {
    "id": "tequilas-shots",
    "name": "Tequilas & Shots",
    "sortOrder": 6,
    "isSystem": true
  },
  {
    "id": "jagermeister",
    "name": "Jägermeister",
    "sortOrder": 7,
    "isSystem": true
  },
  {
    "id": "tragos-aperitivos",
    "name": "Tragos & Aperitivos",
    "sortOrder": 8,
    "isSystem": true
  },
  {
    "id": "promos-combos",
    "name": "Promos",
    "sortOrder": 9,
    "isSystem": true
  },
  {
    "id": "sin-alcohol",
    "name": "Sin Alcohol & Energizantes",
    "sortOrder": 10,
    "isSystem": true
  }
];

export const DEMO_DRINKS: Drink[] = [
  {
    "id": 1,
    "name": "Andes",
    "price": 5200,
    "description": "Demo · Andes",
    "vibe": "TENDENCIAS",
    "flavors": [
      "tendencias"
    ],
    "iconName": "beer",
    "image": "/drinks/andes_origen.webp",
    "trending": true,
    "promo": false,
    "available": true,
    "categoryId": "tendencias",
    "sortOrder": 1
  },
  {
    "id": 2,
    "name": "Corona",
    "price": 6300,
    "description": "Demo · Corona",
    "vibe": "TENDENCIAS",
    "flavors": [
      "tendencias"
    ],
    "iconName": "beer",
    "image": "/drinks/corona.jpg",
    "trending": true,
    "promo": false,
    "available": true,
    "categoryId": "tendencias",
    "sortOrder": 2
  },
  {
    "id": 3,
    "name": "Vodka con jugo",
    "price": 7400,
    "description": "Demo · Vodka con jugo",
    "vibe": "VODKAS",
    "flavors": [
      "vodkas"
    ],
    "iconName": "zap",
    "image": "/drinks/vodka_jugo.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "vodkas",
    "sortOrder": 3
  },
  {
    "id": 4,
    "name": "Vodka con Speed",
    "price": 4500,
    "description": "Demo · Vodka con Speed",
    "vibe": "TENDENCIAS",
    "flavors": [
      "tendencias"
    ],
    "iconName": "zap",
    "image": "/vodka.webp",
    "trending": true,
    "promo": false,
    "available": true,
    "categoryId": "tendencias",
    "sortOrder": 4
  },
  {
    "id": 5,
    "name": "Absolut con Speed",
    "price": 11500,
    "description": "Demo · Absolut con Speed",
    "vibe": "TENDENCIAS",
    "flavors": [
      "tendencias"
    ],
    "iconName": "zap",
    "image": "/drinks/absolut_speed.webp",
    "trending": true,
    "promo": false,
    "available": true,
    "categoryId": "tendencias",
    "sortOrder": 5
  },
  {
    "id": 6,
    "name": "Absolut con RedBull",
    "price": 13100,
    "description": "Demo · Absolut con RedBull",
    "vibe": "VODKAS",
    "flavors": [
      "vodkas"
    ],
    "iconName": "zap",
    "image": "/drinks/absolut_redbull.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "vodkas",
    "sortOrder": 6
  },
  {
    "id": 7,
    "name": "Whisky con coca",
    "price": 6200,
    "description": "Demo · Whisky con coca",
    "vibe": "WHISKYS",
    "flavors": [
      "whiskys"
    ],
    "iconName": "wine",
    "image": "/drinks/whisky_coca.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "whiskys",
    "sortOrder": 7
  },
  {
    "id": 8,
    "name": "Whisky Red Label (Medida)",
    "price": 6400,
    "description": "Demo · Whisky Red Label (Medida)",
    "vibe": "WHISKYS",
    "flavors": [
      "whiskys"
    ],
    "iconName": "wine",
    "image": "/drinks/whisky_coca.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "whiskys",
    "sortOrder": 8
  },
  {
    "id": 9,
    "name": "Whisky con Speed",
    "price": 7400,
    "description": "Demo · Whisky con Speed",
    "vibe": "WHISKYS",
    "flavors": [
      "whiskys"
    ],
    "iconName": "wine",
    "image": "/drinks/whisky_coca.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "whiskys",
    "sortOrder": 9
  },
  {
    "id": 10,
    "name": "Whisky Red Label con Speed",
    "price": 10100,
    "description": "Demo · Whisky Red Label con Speed",
    "vibe": "WHISKYS",
    "flavors": [
      "whiskys"
    ],
    "iconName": "wine",
    "image": "/drinks/whisky_coca.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "whiskys",
    "sortOrder": 10
  },
  {
    "id": 11,
    "name": "Gin Fisherman",
    "price": 7100,
    "description": "Demo · Gin Fisherman",
    "vibe": "TENDENCIAS",
    "flavors": [
      "tendencias"
    ],
    "iconName": "martini",
    "image": "/drinks/gin_fisherman.webp",
    "trending": true,
    "promo": false,
    "available": true,
    "categoryId": "tendencias",
    "sortOrder": 11
  },
  {
    "id": 12,
    "name": "Sur (Sur Gin)",
    "price": 7600,
    "description": "Demo · Sur (Sur Gin)",
    "vibe": "GINES",
    "flavors": [
      "gines"
    ],
    "iconName": "martini",
    "image": "/drinks/gin.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "gines",
    "sortOrder": 12
  },
  {
    "id": 13,
    "name": "Beefeater",
    "price": 9100,
    "description": "Demo · Beefeater",
    "vibe": "GINES",
    "flavors": [
      "gines"
    ],
    "iconName": "martini",
    "image": "/drinks/beefeater.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "gines",
    "sortOrder": 13
  },
  {
    "id": 14,
    "name": "Bombay",
    "price": 11900,
    "description": "Demo · Bombay",
    "vibe": "GINES",
    "flavors": [
      "gines"
    ],
    "iconName": "martini",
    "image": "/drinks/bombay.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "gines",
    "sortOrder": 14
  },
  {
    "id": 15,
    "name": "Bulldog",
    "price": 11200,
    "description": "Demo · Bulldog",
    "vibe": "GINES",
    "flavors": [
      "gines"
    ],
    "iconName": "martini",
    "image": "/drinks/bulldog.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "gines",
    "sortOrder": 15
  },
  {
    "id": 16,
    "name": "Tequila (Shot)",
    "price": 2100,
    "description": "Demo · Tequila (Shot)",
    "vibe": "TEQUILAS-SHOTS",
    "flavors": [
      "tequilas-shots"
    ],
    "iconName": "cup-soda",
    "image": "/drinks/jose_cuervo.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "tequilas-shots",
    "sortOrder": 16
  },
  {
    "id": 17,
    "name": "Jose Cuervo (Shot)",
    "price": 5200,
    "description": "Demo · Jose Cuervo (Shot)",
    "vibe": "TEQUILAS-SHOTS",
    "flavors": [
      "tequilas-shots"
    ],
    "iconName": "cup-soda",
    "image": "/drinks/jose_cuervo.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "tequilas-shots",
    "sortOrder": 17
  },
  {
    "id": 18,
    "name": "Jagger (Shot)",
    "price": 4900,
    "description": "Demo · Jagger (Shot)",
    "vibe": "TEQUILAS-SHOTS",
    "flavors": [
      "tequilas-shots"
    ],
    "iconName": "cup-soda",
    "image": "/drinks/jagger.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "tequilas-shots",
    "sortOrder": 18
  },
  {
    "id": 19,
    "name": "Jagger con pomelo",
    "price": 8900,
    "description": "Demo · Jagger con pomelo",
    "vibe": "JAGERMEISTER",
    "flavors": [
      "jagermeister"
    ],
    "iconName": "wine",
    "image": "/drinks/jagger.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "jagermeister",
    "sortOrder": 19
  },
  {
    "id": 20,
    "name": "Jagger con Speed",
    "price": 11700,
    "description": "Demo · Jagger con Speed",
    "vibe": "TENDENCIAS",
    "flavors": [
      "tendencias"
    ],
    "iconName": "wine",
    "image": "/drinks/jagger.jpg",
    "trending": true,
    "promo": false,
    "available": true,
    "categoryId": "tendencias",
    "sortOrder": 20
  },
  {
    "id": 21,
    "name": "Jagger con RedBull",
    "price": 11800,
    "description": "Demo · Jagger con RedBull",
    "vibe": "JAGERMEISTER",
    "flavors": [
      "jagermeister"
    ],
    "iconName": "wine",
    "image": "/drinks/jagger.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "jagermeister",
    "sortOrder": 21
  },
  {
    "id": 22,
    "name": "Fernet",
    "price": 7200,
    "description": "Demo · Fernet",
    "vibe": "TENDENCIAS",
    "flavors": [
      "tendencias"
    ],
    "iconName": "glass-water",
    "image": "/fernacho.webp",
    "trending": true,
    "promo": false,
    "available": true,
    "categoryId": "tendencias",
    "sortOrder": 22
  },
  {
    "id": 23,
    "name": "Cuba Libre",
    "price": 6300,
    "description": "Demo · Cuba Libre",
    "vibe": "TRAGOS-APERITIVOS",
    "flavors": [
      "tragos-aperitivos"
    ],
    "iconName": "glass-water",
    "image": "/fernacho.webp",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "tragos-aperitivos",
    "sortOrder": 23
  },
  {
    "id": 24,
    "name": "Campari",
    "price": 6700,
    "description": "Demo · Campari",
    "vibe": "TRAGOS-APERITIVOS",
    "flavors": [
      "tragos-aperitivos"
    ],
    "iconName": "citrus",
    "image": "/drinks/campari.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "tragos-aperitivos",
    "sortOrder": 24
  },
  {
    "id": 25,
    "name": "Gancia",
    "price": 7200,
    "description": "Demo · Gancia",
    "vibe": "TRAGOS-APERITIVOS",
    "flavors": [
      "tragos-aperitivos"
    ],
    "iconName": "martini",
    "image": "/drinks/gancia.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "tragos-aperitivos",
    "sortOrder": 25
  },
  {
    "id": 26,
    "name": "Aperol con jugo",
    "price": 8100,
    "description": "Demo · Aperol con jugo",
    "vibe": "TRAGOS-APERITIVOS",
    "flavors": [
      "tragos-aperitivos"
    ],
    "iconName": "citrus",
    "image": "/drinks/aperol.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "tragos-aperitivos",
    "sortOrder": 26
  },
  {
    "id": 27,
    "name": "Aperol con Champagne",
    "price": 8800,
    "description": "Demo · Aperol con Champagne",
    "vibe": "TRAGOS-APERITIVOS",
    "flavors": [
      "tragos-aperitivos"
    ],
    "iconName": "wine",
    "image": "/drinks/aperol.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "tragos-aperitivos",
    "sortOrder": 27
  },
  {
    "id": 28,
    "name": "Melón con Speed",
    "price": 7900,
    "description": "Demo · Melón con Speed",
    "vibe": "TRAGOS-APERITIVOS",
    "flavors": [
      "tragos-aperitivos"
    ],
    "iconName": "zap",
    "image": "/vodka.webp",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "tragos-aperitivos",
    "sortOrder": 28
  },
  {
    "id": 29,
    "name": "Malibú",
    "price": 7400,
    "description": "Demo · Malibú",
    "vibe": "TRAGOS-APERITIVOS",
    "flavors": [
      "tragos-aperitivos"
    ],
    "iconName": "glass-water",
    "image": "/drinks/malibu.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "tragos-aperitivos",
    "sortOrder": 29
  },
  {
    "id": 30,
    "name": "Agua",
    "price": 3300,
    "description": "Demo · Agua",
    "vibe": "TENDENCIAS",
    "flavors": [
      "tendencias"
    ],
    "iconName": "droplet",
    "image": "/drinks/agua_mineral.webp",
    "trending": true,
    "promo": false,
    "available": true,
    "categoryId": "tendencias",
    "sortOrder": 30
  },
  {
    "id": 31,
    "name": "Gaseosa",
    "price": 3100,
    "description": "Demo · Gaseosa",
    "vibe": "SIN-ALCOHOL",
    "flavors": [
      "sin-alcohol"
    ],
    "iconName": "cup-soda",
    "image": "/drinks/whisky_coca.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "sin-alcohol",
    "sortOrder": 31
  },
  {
    "id": 32,
    "name": "Speed",
    "price": 4900,
    "description": "Demo · Speed",
    "vibe": "SIN-ALCOHOL",
    "flavors": [
      "sin-alcohol"
    ],
    "iconName": "zap",
    "image": "/vodka.webp",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "sin-alcohol",
    "sortOrder": 32
  },
  {
    "id": 33,
    "name": "RedBull",
    "price": 6100,
    "description": "Demo · RedBull",
    "vibe": "SIN-ALCOHOL",
    "flavors": [
      "sin-alcohol"
    ],
    "iconName": "zap",
    "image": "/drinks/redbull.jpg",
    "trending": false,
    "promo": false,
    "available": true,
    "categoryId": "sin-alcohol",
    "sortOrder": 33
  },
  {
    "id": 34,
    "name": "Champagne Renaissance + 2 Speed",
    "price": 18500,
    "description": "Demo · Champagne Renaissance + 2 Speed",
    "vibe": "TENDENCIAS",
    "flavors": [
      "tendencias"
    ],
    "iconName": "wine",
    "image": "/drinks/champagne_renaissance_speed.webp",
    "trending": true,
    "promo": false,
    "available": true,
    "categoryId": "tendencias",
    "sortOrder": 34
  },
  {
    "id": 35,
    "name": "Champagne Chandon o María + 2 Speed",
    "price": 42300,
    "description": "Demo · Champagne Chandon o María + 2 Speed",
    "vibe": "PROMOS-COMBOS",
    "flavors": [
      "promos-combos"
    ],
    "iconName": "wine",
    "image": "/drinks/champagne.jpg",
    "trending": false,
    "promo": true,
    "available": true,
    "categoryId": "promos-combos",
    "sortOrder": 35
  },
  {
    "id": 36,
    "name": "Champagne Liason (1.5 L) + 2 Speed",
    "price": 77700,
    "description": "Demo · Champagne Liason (1.5 L) + 2 Speed",
    "vibe": "PROMOS-COMBOS",
    "flavors": [
      "promos-combos"
    ],
    "iconName": "wine",
    "image": "/drinks/champagne.jpg",
    "trending": false,
    "promo": true,
    "available": true,
    "categoryId": "promos-combos",
    "sortOrder": 36
  },
  {
    "id": 37,
    "name": "Champagne Baron B + 2 Speed",
    "price": 90400,
    "description": "Demo · Champagne Baron B + 2 Speed",
    "vibe": "PROMOS-COMBOS",
    "flavors": [
      "promos-combos"
    ],
    "iconName": "wine",
    "image": "/drinks/champagne.jpg",
    "trending": false,
    "promo": true,
    "available": true,
    "categoryId": "promos-combos",
    "sortOrder": 37
  },
  {
    "id": 38,
    "name": "Smirnoff + 6 Speed",
    "price": 63200,
    "description": "Demo · Smirnoff + 6 Speed",
    "vibe": "PROMOS-COMBOS",
    "flavors": [
      "promos-combos"
    ],
    "iconName": "zap",
    "image": "/vodka.webp",
    "trending": false,
    "promo": true,
    "available": true,
    "categoryId": "promos-combos",
    "sortOrder": 38
  },
  {
    "id": 39,
    "name": "Fernet + Coca-Cola 2L",
    "price": 62900,
    "description": "Demo · Fernet + Coca-Cola 2L",
    "vibe": "PROMOS-COMBOS",
    "flavors": [
      "promos-combos"
    ],
    "iconName": "glass-water",
    "image": "/fernacho.webp",
    "trending": false,
    "promo": true,
    "available": true,
    "categoryId": "promos-combos",
    "sortOrder": 39
  },
  {
    "id": 40,
    "name": "Absolut + 6 Speed",
    "price": 82700,
    "description": "Demo · Absolut + 6 Speed",
    "vibe": "PROMOS-COMBOS",
    "flavors": [
      "promos-combos"
    ],
    "iconName": "zap",
    "image": "/drinks/absolut_redbull.jpg",
    "trending": false,
    "promo": true,
    "available": true,
    "categoryId": "promos-combos",
    "sortOrder": 40
  }
];

type SeedTicket = {
  /** horas antes de ahora */
  agoH: number;
  drinkIds: number[];
  qtys: number[];
  method: "efectivo" | "qr" | "debito";
  status: "entregado" | "pendiente" | "cancelado";
};

/** Tickets de ejemplo para historial / métricas de la demo. */
const SEED_TICKETS: SeedTicket[] = [
  { agoH: 4.6, drinkIds: [1, 5], qtys: [2, 1], method: "efectivo", status: "entregado" },
  { agoH: 4.2, drinkIds: [3], qtys: [3], method: "qr", status: "entregado" },
  { agoH: 3.9, drinkIds: [12, 8], qtys: [1, 2], method: "debito", status: "entregado" },
  { agoH: 3.5, drinkIds: [2], qtys: [4], method: "efectivo", status: "entregado" },
  { agoH: 3.1, drinkIds: [39], qtys: [1], method: "efectivo", status: "entregado" },
  { agoH: 2.8, drinkIds: [7, 1], qtys: [2, 2], method: "qr", status: "entregado" },
  { agoH: 2.4, drinkIds: [15], qtys: [2], method: "debito", status: "entregado" },
  { agoH: 2.1, drinkIds: [4, 6], qtys: [1, 1], method: "efectivo", status: "cancelado" },
  { agoH: 1.8, drinkIds: [40], qtys: [1], method: "qr", status: "entregado" },
  { agoH: 1.5, drinkIds: [9, 10, 1], qtys: [1, 1, 2], method: "efectivo", status: "entregado" },
  { agoH: 1.2, drinkIds: [18], qtys: [3], method: "debito", status: "entregado" },
  { agoH: 0.9, drinkIds: [22, 5], qtys: [2, 1], method: "efectivo", status: "entregado" },
  { agoH: 0.6, drinkIds: [11], qtys: [2], method: "qr", status: "entregado" },
  { agoH: 0.35, drinkIds: [1, 3], qtys: [1, 1], method: "efectivo", status: "pendiente" },
  { agoH: 0.15, drinkIds: [8], qtys: [2], method: "debito", status: "pendiente" },
  { agoH: 0.05, drinkIds: [2, 14], qtys: [1, 1], method: "efectivo", status: "entregado" },
];

/** Arma pedidos falsos anclados a `startedAt` de la noche demo. */
export function buildDemoOrders(drinks: Drink[], startedAt: number): Order[] {
  const byId = new Map(drinks.map((d) => [d.id, d]));
  const now = Date.now();
  const orders: Order[] = [];

  for (let i = 0; i < SEED_TICKETS.length; i++) {
    const t = SEED_TICKETS[i]!;
    const createdAt = Math.max(startedAt + 60_000, now - Math.round(t.agoH * 3600_000));
    const items = t.drinkIds.map((id, j) => {
      const drink = byId.get(id) ?? drinks[0]!;
      const qty = t.qtys[j] ?? 1;
      return {
        drinkId: drink.id,
        name: drink.name,
        qty,
        unitPrice: drink.price,
        subtotal: drink.price * qty,
      };
    });
    const total = items.reduce((a, it) => a + it.subtotal, 0);
    const n = i + 1;
    const method = t.method as PaymentMethod;
    const order: Order = {
      id: `demo-order-${n}`,
      token: `tok${String(n).padStart(4, "0")}`,
      displayNumber: n,
      items,
      total,
      paymentMethod: method,
      status: t.status,
      createdAt,
      createdBy: "caja",
      ticketCode: String(n).padStart(3, "0"),
      paymentStatus: t.status === "cancelado" ? "desconocido" : "cobrado",
    };
    if (t.status === "entregado") {
      order.deliveredAt = createdAt + 90_000;
      order.deliveredBy = "barra";
    }
    if (t.status === "cancelado") {
      order.cancelledAt = createdAt + 120_000;
      order.cancelledBy = "caja";
    }
    if (method === "qr" || method === "debito") {
      order.mpFeeAmount = Math.round(total * 0.029);
      order.mpNetReceived = total - order.mpFeeAmount;
    }
    orders.push(order);
  }

  return orders;
}
