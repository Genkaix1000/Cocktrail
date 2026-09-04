import { randomUUID, createHash } from "node:crypto";
import { env } from "@/config/env";
import { SEED_CATEGORIES, SEED_DRINKS } from "@/data/drinks";
import { generateTicketCode } from "@/modules/tickets/tickets.crypto";
import { supabase } from "@/shared/supabase";
import type { OrderItem, PaymentMethod } from "@cocktrail/shared";

/**
 * Script de Seed para Noche Demo Comercial.
 * Genera exactamente los datos del dossier comercial (propuesta-comercial-miboliche.md):
 * - Facturación Total: $3.840.500 ARS
 * - Cajero 1 (Móvil):  $1.420.500 ARS
 * - Cajero 2 (Fijo):   $2.420.000 ARS
 * - Top Productos: 1. Fernet / 2. Gin Tonic / 3. Vodka con Speed / Cervezas
 *
 * Uso: pnpm --filter cocktrail-api db:seed-demo
 */

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

async function ensureStaffUsers() {
  const usersToEnsure = [
    { username: env.ADMIN_USER || "admin", role: "admin", pass: env.ADMIN_PASS || "admin123" },
    { username: "cajero1", role: "caja", pass: "caja123" },
    { username: "cajero2", role: "caja", pass: "caja123" },
    { username: "Cajero 1 (Móvil)", role: "caja", pass: "caja123" },
    { username: "Cajero 2 (Fijo)", role: "caja", pass: "caja123" },
  ];

  for (const u of usersToEnsure) {
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("username", u.username)
      .maybeSingle();

    if (!existing) {
      await supabase.from("users").insert({
        id: randomUUID(),
        username: u.username,
        password_hash: hashPassword(u.pass),
        role: u.role,
        permissions: {},
        created_at: new Date().toISOString(),
      });
      console.log(`[seed-demo] Usuario creado: ${u.username} (${u.role})`);
    }
  }
}

async function ensureCategoriesAndDrinks() {
  const { error: catError } = await supabase.from("drink_categories").upsert(
    SEED_CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      sort_order: c.sortOrder,
      is_system: c.isSystem ?? false,
    })),
  );
  if (catError) console.warn("[seed-demo] Warning drink_categories:", catError.message);

  const { error: drinksError } = await supabase.from("drinks").upsert(
    SEED_DRINKS.map((d) => ({
      id: d.id,
      name: d.name,
      price: d.price,
      description: d.description,
      vibe: d.vibe,
      flavors: d.flavors,
      icon_name: d.iconName,
      image: d.image || null,
      trending: d.trending,
      promo: d.promo || false,
      available: d.available,
      category_id: d.categoryId ?? null,
      sort_order: d.sortOrder ?? 0,
    })),
  );
  if (drinksError) console.warn("[seed-demo] Warning drinks:", drinksError.message);
}

// Tragos más vendidos y catálogo de referencia con precios exactos de data/drinks.ts:
const DRINKS_CATALOG = [
  { id: 22, name: "Fernet", price: 7000 },
  { id: 11, name: "Gin Fisherman", price: 7000 },
  { id: 13, name: "Beefeater", price: 9000 },
  { id: 4, name: "Vodka con Speed", price: 8000 },
  { id: 5, name: "Absolut con Speed", price: 11000 },
  { id: 1, name: "Andes", price: 5000 },
  { id: 2, name: "Corona", price: 6000 },
  { id: 20, name: "Jagger con Speed", price: 11000 },
  { id: 24, name: "Campari", price: 7000 },
  { id: 30, name: "Agua", price: 3000 },
  { id: 32, name: "Speed", price: 5000 },
  { id: 34, name: "Champagne Renaissance + 2 Speed", price: 18000 },
  { id: 39, name: "Fernet + Coca-Cola 2L", price: 70000 },
];

function generateOrdersForTarget(
  targetTotal: number,
  cajeroName: string,
  eventId: string,
  startDisplayNumber: number,
  paymentWeights: { qr: number; debito: number; efectivo: number },
  startTimeMs: number,
  endTimeMs: number,
) {
  const orders: any[] = [];
  const tickets: any[] = [];
  const mpOrders: any[] = [];
  let currentTotal = 0;
  let dispNum = startDisplayNumber;

  const duration = endTimeMs - startTimeMs;

  while (currentTotal < targetTotal) {
    const remaining = targetTotal - currentTotal;

    // Elegir items que sumen un subtotal que no exceda el remaining
    let orderItems: OrderItem[] = [];
    let orderSubtotal = 0;

    // Si queda poco dinero, buscar un trago exacto o combinación exacta
    if (remaining <= 25000) {
      const exactDrink = DRINKS_CATALOG.find((d) => d.price === remaining);
      if (exactDrink) {
        orderItems = [{
          drinkId: exactDrink.id,
          name: exactDrink.name,
          qty: 1,
          unitPrice: exactDrink.price,
          subtotal: exactDrink.price,
        }];
        orderSubtotal = remaining;
      } else {
        let rem = remaining;
        for (const drink of [...DRINKS_CATALOG].sort((a, b) => b.price - a.price)) {
          if (drink.price <= rem) {
            const qty = Math.floor(rem / drink.price);
            orderItems.push({
              drinkId: drink.id,
              name: drink.name,
              qty,
              unitPrice: drink.price,
              subtotal: qty * drink.price,
            });
            rem -= qty * drink.price;
          }
        }
        orderSubtotal = remaining - rem;
        if (rem > 0 && orderItems.length > 0) {
          orderItems[0].subtotal += rem;
          orderItems[0].unitPrice = orderItems[0].subtotal / orderItems[0].qty;
          orderSubtotal += rem;
        }
      }
    } else {
      const isBigCombo = Math.random() < 0.12 && remaining >= 70000;
      if (isBigCombo) {
        const combo = DRINKS_CATALOG.find((d) => d.id === 39 || d.id === 34)!;
        orderItems.push({
          drinkId: combo.id,
          name: combo.name,
          qty: 1,
          unitPrice: combo.price,
          subtotal: combo.price,
        });
        orderSubtotal += combo.price;
      } else {
        const numItems = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < numItems; i++) {
          let pickedDrink = DRINKS_CATALOG[0]; // Fernet default
          const rand = Math.random();
          if (rand < 0.35) pickedDrink = DRINKS_CATALOG[0]; // Fernet 35%
          else if (rand < 0.55) pickedDrink = DRINKS_CATALOG[1]; // Gin 20%
          else if (rand < 0.70) pickedDrink = DRINKS_CATALOG[3]; // Vodka Speed 15%
          else if (rand < 0.85) pickedDrink = DRINKS_CATALOG[5]; // Andes/Corona 15%
          else {
            pickedDrink = DRINKS_CATALOG[Math.floor(Math.random() * DRINKS_CATALOG.length)];
          }

          if (orderSubtotal + pickedDrink.price <= remaining) {
            const existingItem = orderItems.find((it) => it.drinkId === pickedDrink.id);
            if (existingItem) {
              existingItem.qty += 1;
              existingItem.subtotal += pickedDrink.price;
            } else {
              orderItems.push({
                drinkId: pickedDrink.id,
                name: pickedDrink.name,
                qty: 1,
                unitPrice: pickedDrink.price,
                subtotal: pickedDrink.price,
              });
            }
            orderSubtotal += pickedDrink.price;
          }
        }
      }
    }

    if (orderSubtotal === 0 || orderItems.length === 0) {
      const minDrink = DRINKS_CATALOG.find((d) => d.price <= remaining) || DRINKS_CATALOG[0];
      orderItems = [{
        drinkId: minDrink.id,
        name: minDrink.name,
        qty: 1,
        unitPrice: remaining,
        subtotal: remaining,
      }];
      orderSubtotal = remaining;
    }

    const pRand = Math.random();
    let paymentMethod: PaymentMethod = "efectivo";
    if (pRand < paymentWeights.qr) {
      paymentMethod = "qr";
    } else if (pRand < paymentWeights.qr + paymentWeights.debito) {
      paymentMethod = "debito";
    } else {
      paymentMethod = "efectivo";
    }

    const orderId = randomUUID();
    const token = `T${dispNum.toString().padStart(4, "0")}`;
    const ticketCode = generateTicketCode(orderId, env.TICKET_SECRET || "cocktrail-ticket-secret-key-2026");

    const progress = (currentTotal + orderSubtotal) / targetTotal;
    const createdAtMs = startTimeMs + Math.floor(progress * duration) + Math.floor(Math.random() * 60000);
    const createdAtIso = new Date(createdAtMs).toISOString();

    const isDelivered = Math.random() < 0.88;
    const readyAtMs = isDelivered ? createdAtMs + 45000 : null;
    const deliveredAtMs = isDelivered ? createdAtMs + 120000 : null;

    let mpOrderId: string | null = null;
    if (paymentMethod !== "efectivo") {
      mpOrderId = randomUUID();
      const feeRate = paymentMethod === "qr" ? 0.008 : 0.018; // Tasas estándar MP
      const mpFee = Math.round(orderSubtotal * feeRate);
      const mpNet = orderSubtotal - mpFee;

      mpOrders.push({
        id: mpOrderId,
        order_id_mp: `ORD-${orderId.substring(0, 12).toUpperCase()}`,
        external_ref: `COCKTRAIL-${createdAtMs}-${dispNum}`,
        idempotency_key: randomUUID(),
        payment_transaction_id: `TX-${orderId.substring(0, 8)}`,
        payment_id: `PAY-${orderId.substring(0, 10)}`,
        amount: orderSubtotal,
        paid_amount: orderSubtotal,
        device_id: paymentMethod === "debito" ? "POSNET-POINT-01" : null,
        status: "processed",
        type: paymentMethod === "qr" ? "qr" : "point",
        bar_id: "BAR-01",
        created_at: createdAtIso,
        updated_at: createdAtIso,
        event_id: eventId,
        net_received_amount: mpNet,
        mp_fee_amount: mpFee,
        fee_status: "ready",
      });
    }

    const order = {
      id: orderId,
      event_id: eventId,
      token,
      display_number: dispNum,
      items: orderItems,
      total: orderSubtotal,
      payment_method: paymentMethod,
      status: isDelivered ? "entregado" : "pendiente",
      created_at: createdAtIso,
      ready_at: readyAtMs ? new Date(readyAtMs).toISOString() : null,
      delivered_at: deliveredAtMs ? new Date(deliveredAtMs).toISOString() : null,
      ticket_code: ticketCode,
      created_by: cajeroName,
      delivered_by: isDelivered ? "Barra Principal" : null,
      delivered_by_bar: isDelivered ? "BAR-01" : null,
      redeem_method: isDelivered ? (Math.random() > 0.3 ? "scan" : "manual") : null,
      payment_status: "cobrado",
      mp_payment_id: paymentMethod !== "efectivo" ? `PAY-${orderId.substring(0, 10)}` : null,
      mp_order_id: mpOrderId,
    };

    const ticket = {
      id: randomUUID(),
      order_id: orderId,
      code: ticketCode,
      created_at: createdAtIso,
      redeemed_at: deliveredAtMs ? new Date(deliveredAtMs).toISOString() : null,
      redeemed_by: isDelivered ? "Barra Principal" : null,
      redeemed_by_bar: isDelivered ? "BAR-01" : null,
      redeem_method: isDelivered ? (Math.random() > 0.3 ? "scan" : "manual") : null,
    };

    orders.push(order);
    tickets.push(ticket);

    currentTotal += orderSubtotal;
    dispNum += 1;
  }

  return { orders, tickets, mpOrders, currentTotal, nextDisplayNumber: dispNum };
}

async function main() {
  console.log(`[seed-demo] Iniciando siembra de noche comercial demo en: ${env.SUPABASE_URL}`);

  await ensureStaffUsers();
  await ensureCategoriesAndDrinks();

  // 1. Crear o reutilizar la noche de evento activa
  const now = Date.now();
  // Horario simulado: noche que comenzó hace ~6 horas (ej: 23:30 hs a 05:30 hs)
  const startedAtMs = now - (6 * 60 * 60 * 1000);
  const startedAtIso = new Date(startedAtMs).toISOString();

  // Cerrar cualquier evento previo para dejar limpia la demo
  await supabase
    .from("night_events")
    .update({ status: "cerrado", closed_at: new Date().toISOString(), closed_by: "sistema" })
    .eq("status", "activo");

  const eventId = randomUUID();
  const eventKeyword = "BOSKO-NOCHE-ESTRELLA";

  const { error: eventError } = await supabase.from("night_events").insert({
    id: eventId,
    status: "activo",
    started_at: startedAtIso,
    order_counter: 0,
    keyword: eventKeyword,
    closed_by: null,
    closed_at: null,
  });

  if (eventError) {
    throw new Error(`Error al crear night_event: ${eventError.message}`);
  }
  console.log(`[seed-demo] Noche activa creada: ${eventId} (Clave: "${eventKeyword}")`);

  // Objetivos exactos del dossier:
  // Total: $3.840.500
  // Cajero 1 (Móvil): $1.420.500 (QR + Efectivo)
  // Cajero 2 (Fijo):  $2.420.000 (Débito Point + Efectivo + QR)
  const targetCajero1 = 1420500;
  const targetCajero2 = 2420000;

  console.log(`[seed-demo] Generando pedidos para Cajero 1 (Móvil): $${targetCajero1.toLocaleString("es-AR")}...`);
  const c1Data = generateOrdersForTarget(
    targetCajero1,
    "Cajero 1 (Móvil)",
    eventId,
    1,
    { qr: 0.55, debito: 0.0, efectivo: 0.45 },
    startedAtMs,
    now,
  );

  console.log(`[seed-demo] Generando pedidos para Cajero 2 (Fijo): $${targetCajero2.toLocaleString("es-AR")}...`);
  const c2Data = generateOrdersForTarget(
    targetCajero2,
    "Cajero 2 (Fijo)",
    eventId,
    c1Data.nextDisplayNumber,
    { qr: 0.25, debito: 0.50, efectivo: 0.25 },
    startedAtMs,
    now,
  );

  const allMpOrders = [...c1Data.mpOrders, ...c2Data.mpOrders];
  const allOrders = [...c1Data.orders, ...c2Data.orders];
  const allTickets = [...c1Data.tickets, ...c2Data.tickets];
  const grandTotal = c1Data.currentTotal + c2Data.currentTotal;

  console.log(`[seed-demo] Insertando ${allMpOrders.length} cobros MP, ${allOrders.length} pedidos y ${allTickets.length} tickets en Supabase...`);

  // Inserción en lotes para evitar límites de payload
  const BATCH_SIZE = 50;

  for (let i = 0; i < allMpOrders.length; i += BATCH_SIZE) {
    const mpBatch = allMpOrders.slice(i, i + BATCH_SIZE);
    const { error: mpErr } = await supabase.from("mp_orders").insert(mpBatch);
    if (mpErr) throw new Error(`Error insertando mp_orders (lote ${i}): ${mpErr.message}`);
  }

  for (let i = 0; i < allOrders.length; i += BATCH_SIZE) {
    const orderBatch = allOrders.slice(i, i + BATCH_SIZE);
    const { error: ordErr } = await supabase.from("orders").insert(orderBatch);
    if (ordErr) throw new Error(`Error insertando pedidos (lote ${i}): ${ordErr.message}`);

    const ticketBatch = allTickets.slice(i, i + BATCH_SIZE);
    const { error: tktErr } = await supabase.from("tickets").insert(ticketBatch);
    if (tktErr) throw new Error(`Error insertando tickets (lote ${i}): ${tktErr.message}`);
  }

  // Actualizar orderCounter en la noche
  await supabase
    .from("night_events")
    .update({ order_counter: allOrders.length })
    .eq("id", eventId);

  console.log("\n=================================================");
  console.log("🎉 SEED DEMO COMPLETADO CON ÉXITO");
  console.log("=================================================");
  console.log(`⚡ Facturación Total:  $${grandTotal.toLocaleString("es-AR")} ARS`);
  console.log(`👤 Cajero 1 (Móvil):   $${c1Data.currentTotal.toLocaleString("es-AR")} ARS (${c1Data.orders.length} pedidos)`);
  console.log(`👤 Cajero 2 (Fijo):    $${c2Data.currentTotal.toLocaleString("es-AR")} ARS (${c2Data.orders.length} pedidos)`);
  console.log(`🎟️ Total Pedidos:      ${allOrders.length}`);
  console.log(`🔑 Clave de Noche:     "${eventKeyword}"`);
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error("[seed-demo] ❌ Error fatal:", err);
  process.exit(1);
});
