import { describe, it, expect, vi, beforeEach } from "vitest";

type QueryResult = { data: any; error: any };

function makeQueryBuilder(result: QueryResult) {
  const builder: any = {};
  const chainable = ["select", "upsert", "in", "eq", "is", "update"];
  for (const method of chainable) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (r: QueryResult) => void) => resolve(result);
  return builder;
}

const localResults = new Map<string, QueryResult>();
const cloudResults = new Map<string, QueryResult>();
/** Último builder creado por tabla (cloud y local), para inspeccionar qué se upserteó. */
const cloudBuilders = new Map<string, any>();
const localBuilders = new Map<string, any>();
let cloudConfigured = true;

vi.mock("../../shared/supabase.js", () => ({
  get supabase() {
    return {
      from: (table: string) => {
        const builder = makeQueryBuilder(localResults.get(table) ?? { data: null, error: null });
        localBuilders.set(table, builder);
        return builder;
      },
    };
  },
  get supabaseCloud() {
    if (!cloudConfigured) return null;
    return {
      from: (table: string) => {
        const builder = makeQueryBuilder(cloudResults.get(table) ?? { data: [], error: null });
        cloudBuilders.set(table, builder);
        return builder;
      },
    };
  },
}));

const { SupabaseCloudSyncRepository } = await import("./cloud-sync.repository.js");

beforeEach(() => {
  localResults.clear();
  cloudResults.clear();
  cloudBuilders.clear();
  localBuilders.clear();
  cloudConfigured = true;
});

describe("SupabaseCloudSyncRepository.pushOrders", () => {
  it("mapea las 4 columnas de cobro-verificado (mp_order_id, mp_payment_id, idempotency_key, payment_status)", async () => {
    cloudResults.set("orders", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    await repo.pushOrders("event-1", [
      {
        id: "o1",
        token: "tok",
        displayNumber: 1,
        items: [],
        total: 1500,
        paymentMethod: "debito",
        status: "pendiente",
        createdAt: Date.now(),
        paymentStatus: "cobrado",
        paymentRef: "pay-99",
        paymentRecordId: "mp-row-uuid",
        idempotencyKey: "attempt-1111-2222",
      } as any,
    ]);

    const upserted = cloudBuilders.get("orders").upsert.mock.calls[0][0];
    expect(upserted[0]).toMatchObject({
      id: "o1",
      mp_order_id: "mp-row-uuid",
      mp_payment_id: "pay-99",
      idempotency_key: "attempt-1111-2222",
      payment_status: "cobrado",
    });
  });

  it("filas pre-migración sin datos de cobro suben con payment_status='desconocido' y nulls", async () => {
    cloudResults.set("orders", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    await repo.pushOrders("event-1", [
      {
        id: "o-legacy",
        token: "tok",
        displayNumber: 2,
        items: [],
        total: 1000,
        paymentMethod: "efectivo",
        status: "entregado",
        createdAt: Date.now(),
      } as any,
    ]);

    const upserted = cloudBuilders.get("orders").upsert.mock.calls[0][0];
    expect(upserted[0]).toMatchObject({
      id: "o-legacy",
      mp_order_id: null,
      mp_payment_id: null,
      idempotency_key: null,
      payment_status: "desconocido",
    });
  });
});

describe("SupabaseCloudSyncRepository.pullDrinks", () => {
  it("con datos en cloud y upsert local OK, devuelve el count real", async () => {
    cloudResults.set("drinks", { data: [{ id: 1, name: "Fernet" }], error: null });
    localResults.set("drinks", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullDrinks();

    expect(result).toEqual({ count: 1 });
  });

  it("si el upsert LOCAL falla, devuelve count 0 (no reporta éxito falso) — bug real del 2026-07-13", async () => {
    cloudResults.set("drinks", { data: [{ id: 1, name: "Fernet" }], error: null });
    localResults.set("drinks", { data: null, error: { message: "constraint violation" } });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullDrinks();

    // Antes de este fix, esto devolvía { count: 1 } aunque el upsert local hubiera
    // fallado — SyncService.pullMasterData nunca se enteraba y la tabla local de
    // drinks quedaba vacía en silencio, sin loguear el error real ni caer al seed.
    expect(result).toEqual({ count: 0 });
  });

  it("sin cloud configurada, devuelve count 0 sin tocar local", async () => {
    cloudConfigured = false;
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullDrinks();

    expect(result).toEqual({ count: 0 });
  });
});

describe("SupabaseCloudSyncRepository.pullUsers", () => {
  it("si el upsert LOCAL falla, devuelve count 0", async () => {
    cloudResults.set("users", { data: [{ id: "u1", username: "admin" }], error: null });
    localResults.set("users", { data: null, error: { message: "constraint violation" } });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullUsers();

    expect(result).toEqual({ count: 0 });
  });
});

describe("SupabaseCloudSyncRepository.pullNightEvents", () => {
  it("mapea explícito: fuerza status='cerrado', descarta totals (cloud-only), marca synced", async () => {
    cloudResults.set("night_events", {
      data: [{ id: "e1", started_at: "2026-01-01T00:00:00Z", closed_at: "2026-01-01T05:00:00Z", order_counter: 3, totals: { total: 100 }, closed_by: "admin" }],
      error: null,
    });
    localResults.set("night_events", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullNightEvents();

    expect(result).toEqual({ ok: 1, failed: 0 });
  });

  it("si el upsert local falla, reporta failed con el error", async () => {
    cloudResults.set("night_events", { data: [{ id: "e1", started_at: "x", closed_at: null, order_counter: 0, totals: {}, closed_by: null }], error: null });
    localResults.set("night_events", { data: null, error: { message: "constraint violation" } });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullNightEvents();

    expect(result.ok).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.error).toMatch(/constraint violation/);
  });

  it("sin cloud configurada, no hace nada", async () => {
    cloudConfigured = false;
    const repo = new SupabaseCloudSyncRepository();
    expect(await repo.pullNightEvents()).toEqual({ ok: 0, failed: 0 });
  });
});

describe("SupabaseCloudSyncRepository.pullOrders", () => {
  it("con datos en cloud y upsert OK, devuelve ok=N", async () => {
    cloudResults.set("orders", { data: [{ id: "o1", event_id: "e1" }, { id: "o2", event_id: "e1" }], error: null });
    localResults.set("orders", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    expect(await repo.pullOrders()).toEqual({ ok: 2, failed: 0 });
  });

  it("normaliza payment_status NULL de cloud a 'desconocido' (el NULL explícito no dispara el DEFAULT local y violaba el NOT NULL)", async () => {
    cloudResults.set("orders", {
      data: [{ id: "o1", event_id: "e1", payment_status: null, mp_order_id: null, mp_payment_id: null, idempotency_key: null }],
      error: null,
    });
    localResults.set("orders", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullOrders();

    expect(result).toEqual({ ok: 1, failed: 0 });
    const upserted = localBuilders.get("orders").upsert.mock.calls[0][0];
    expect(upserted[0].payment_status).toBe("desconocido");
  });

  it("mp_order_id sin fila en la mp_orders local se anula; mp_payment_id se conserva SIEMPRE (red de seguridad para restores parciales — el restore ya baja mp_orders ANTES, PR 5)", async () => {
    cloudResults.set("orders", {
      data: [{ id: "o1", event_id: "e1", payment_status: "cobrado", mp_order_id: "mp-huerfano", mp_payment_id: "pay-99" }],
      error: null,
    });
    localResults.set("mp_orders", { data: [], error: null });
    localResults.set("orders", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullOrders();

    expect(result).toEqual({ ok: 1, failed: 0 });
    const upserted = localBuilders.get("orders").upsert.mock.calls[0][0];
    expect(upserted[0]).toMatchObject({
      id: "o1",
      mp_order_id: null,
      mp_payment_id: "pay-99",
      payment_status: "cobrado",
    });
  });

  it("mp_order_id que SÍ existe en la mp_orders local se conserva", async () => {
    cloudResults.set("orders", {
      data: [{ id: "o1", event_id: "e1", payment_status: "cobrado", mp_order_id: "mp-1", mp_payment_id: "pay-1" }],
      error: null,
    });
    localResults.set("mp_orders", { data: [{ id: "mp-1" }], error: null });
    localResults.set("orders", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullOrders();

    expect(result).toEqual({ ok: 1, failed: 0 });
    const upserted = localBuilders.get("orders").upsert.mock.calls[0][0];
    expect(upserted[0]).toMatchObject({ mp_order_id: "mp-1", mp_payment_id: "pay-1" });
  });

  it("si el upsert falla por FK (night_event no restaurada), el error queda distinguible", async () => {
    cloudResults.set("orders", { data: [{ id: "o1", event_id: "e-inexistente" }], error: null });
    localResults.set("orders", { data: null, error: { message: 'insert or update on table "orders" violates foreign key constraint' } });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullOrders();

    expect(result.failed).toBe(1);
    expect(result.error).toMatch(/no llegó de cloud/);
  });
});

describe("SupabaseCloudSyncRepository.pullTickets", () => {
  it("pullTickets: passthrough directo, ok=N", async () => {
    cloudResults.set("tickets", { data: [{ id: "t1" }], error: null });
    localResults.set("tickets", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();
    expect(await repo.pullTickets()).toEqual({ ok: 1, failed: 0 });
  });
});

describe("SupabaseCloudSyncRepository.pushAuditLogs / pullAuditLogs", () => {
  it("pushAuditLogs sube toda la tabla local a cloud", async () => {
    localResults.set("audit_logs", { data: [{ id: "a1", action: "order.created" }], error: null });
    cloudResults.set("audit_logs", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    expect(await repo.pushAuditLogs()).toEqual({ ok: 1, failed: 0 });
  });

  it("pushAuditLogs sin logs locales, no hace nada", async () => {
    localResults.set("audit_logs", { data: [], error: null });
    const repo = new SupabaseCloudSyncRepository();
    expect(await repo.pushAuditLogs()).toEqual({ ok: 0, failed: 0 });
  });

  it("pullAuditLogs trae de cloud y hace upsert local", async () => {
    cloudResults.set("audit_logs", { data: [{ id: "a1", action: "order.created" }], error: null });
    localResults.set("audit_logs", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();
    expect(await repo.pullAuditLogs()).toEqual({ ok: 1, failed: 0 });
  });
});

describe("SupabaseCloudSyncRepository.pushMpOrders", () => {
  it("filtra por event_id y sube los cobros de ESA noche a cloud (passthrough)", async () => {
    localResults.set("mp_orders", {
      data: [{ id: "mp-1", event_id: "event-1", order_id_mp: "ORD01", amount: 1500, status: "processed", type: "point" }],
      error: null,
    });
    cloudResults.set("mp_orders", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pushMpOrders("event-1");

    expect(result).toEqual({ ok: 1, failed: 0 });
    expect(localBuilders.get("mp_orders").eq).toHaveBeenCalledWith("event_id", "event-1");
    const upserted = cloudBuilders.get("mp_orders").upsert.mock.calls[0][0];
    expect(upserted[0]).toMatchObject({ id: "mp-1", event_id: "event-1", status: "processed" });
  });

  it("sin cobros para la noche, no toca cloud", async () => {
    localResults.set("mp_orders", { data: [], error: null });
    const repo = new SupabaseCloudSyncRepository();

    expect(await repo.pushMpOrders("event-1")).toEqual({ ok: 0, failed: 0 });
    expect(cloudBuilders.has("mp_orders")).toBe(false);
  });

  it("si el upsert a cloud falla, reporta failed con el error (nunca boolean suelto)", async () => {
    localResults.set("mp_orders", { data: [{ id: "mp-1", event_id: "event-1" }], error: null });
    cloudResults.set("mp_orders", { data: null, error: { message: "cloud caída" } });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pushMpOrders("event-1");

    expect(result.ok).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.error).toMatch(/cloud caída/);
  });

  it("sin cloud configurada, no hace nada", async () => {
    cloudConfigured = false;
    const repo = new SupabaseCloudSyncRepository();
    expect(await repo.pushMpOrders("event-1")).toEqual({ ok: 0, failed: 0 });
  });
});

describe("SupabaseCloudSyncRepository.pushMpCajas / pushMpDevices", () => {
  it("pushMpCajas sube la tabla local completa a cloud", async () => {
    localResults.set("mercadopago_cajas", { data: [{ id: "c1", bar_id: "b1", store_id: "85068168", store_name: "Bosko" }], error: null });
    cloudResults.set("mercadopago_cajas", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    expect(await repo.pushMpCajas()).toEqual({ ok: 1, failed: 0 });
    const upserted = cloudBuilders.get("mercadopago_cajas").upsert.mock.calls[0][0];
    expect(upserted[0]).toMatchObject({ id: "c1", store_name: "Bosko" });
  });

  it("pushMpDevices sube la tabla local completa a cloud (incluye columnas de gestion-posnets)", async () => {
    localResults.set("mercadopago_cajas_devices", {
      data: [{ id: "d1", caja_id: "c1", device_id: "PAX_A910__X", is_active: true, linked_at: "2026-07-23T00:00:00Z" }],
      error: null,
    });
    cloudResults.set("mercadopago_cajas_devices", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    expect(await repo.pushMpDevices()).toEqual({ ok: 1, failed: 0 });
    const upserted = cloudBuilders.get("mercadopago_cajas_devices").upsert.mock.calls[0][0];
    expect(upserted[0]).toMatchObject({ id: "d1", device_id: "PAX_A910__X", is_active: true });
  });

  it("sin cloud configurada, ninguno hace nada", async () => {
    cloudConfigured = false;
    const repo = new SupabaseCloudSyncRepository();
    expect(await repo.pushMpCajas()).toEqual({ ok: 0, failed: 0 });
    expect(await repo.pushMpDevices()).toEqual({ ok: 0, failed: 0 });
  });
});

describe("SupabaseCloudSyncRepository.pushSellerMetadata", () => {
  const PENDING_SELLER = {
    user_id: "1517393956",
    seller_nickname: "BOSKO",
    seller_first_name: "Manuel",
    seller_last_name: "García",
    seller_email: "bosko@example.com",
    created_at: "2026-07-23T00:00:00Z",
    updated_at: "2026-07-23T00:00:00Z",
    // El mock devuelve la fila entera aunque el select real pida columnas: exactamente
    // el escenario que la whitelist del mapeo tiene que sobrevivir (D3).
    access_token_enc: "v1.SECRETO",
    refresh_token_enc: "v1.SECRETO2",
    key_version: 1,
    cloud_synced_at: null,
  };

  it("sube SOLO metadata (las columnas _enc jamás viajan) con onConflict user_id, y estampa cloud_synced_at", async () => {
    localResults.set("mercadopago_sellers", { data: [PENDING_SELLER], error: null });
    cloudResults.set("mercadopago_sellers", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pushSellerMetadata();

    expect(result).toEqual({ ok: 1, failed: 0 });
    const [rows, options] = cloudBuilders.get("mercadopago_sellers").upsert.mock.calls[0];
    expect(rows[0]).toEqual({
      user_id: "1517393956",
      seller_nickname: "BOSKO",
      seller_first_name: "Manuel",
      seller_last_name: "García",
      seller_email: "bosko@example.com",
      created_at: "2026-07-23T00:00:00Z",
      updated_at: "2026-07-23T00:00:00Z",
    });
    expect(rows[0]).not.toHaveProperty("access_token_enc");
    expect(rows[0]).not.toHaveProperty("refresh_token_enc");
    expect(rows[0]).not.toHaveProperty("key_version");
    expect(options).toEqual({ onConflict: "user_id" });

    // Estampa del outbox: el último builder local de la tabla es el del UPDATE.
    const stampBuilder = localBuilders.get("mercadopago_sellers");
    expect(stampBuilder.update).toHaveBeenCalledWith({ cloud_synced_at: expect.any(String) });
    expect(stampBuilder.in).toHaveBeenCalledWith("user_id", ["1517393956"]);
  });

  it("sin filas pendientes en el outbox, no toca cloud ni estampa nada", async () => {
    localResults.set("mercadopago_sellers", { data: [], error: null });
    const repo = new SupabaseCloudSyncRepository();

    expect(await repo.pushSellerMetadata()).toEqual({ ok: 0, failed: 0 });
    expect(cloudBuilders.has("mercadopago_sellers")).toBe(false);
  });

  it("si el upsert a cloud falla, reporta failed y NO estampa cloud_synced_at (el outbox reintenta)", async () => {
    localResults.set("mercadopago_sellers", { data: [PENDING_SELLER], error: null });
    cloudResults.set("mercadopago_sellers", { data: null, error: { message: "cloud caída" } });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pushSellerMetadata();

    expect(result.failed).toBe(1);
    expect(result.error).toMatch(/cloud caída/);
    // Si hubiera estampado, el último builder local sería el del UPDATE con una llamada.
    expect(localBuilders.get("mercadopago_sellers").update).not.toHaveBeenCalled();
  });

  it("sin cloud configurada, no hace nada", async () => {
    cloudConfigured = false;
    const repo = new SupabaseCloudSyncRepository();
    expect(await repo.pushSellerMetadata()).toEqual({ ok: 0, failed: 0 });
  });
});

describe("SupabaseCloudSyncRepository.pullMpCajas", () => {
  it("mapeo explícito con normalización de NULLs opcionales", async () => {
    cloudResults.set("mercadopago_cajas", {
      data: [{ id: "c1", bar_id: "b1", store_id: "85068168", external_pos_id: "COCKTRAIL-BAR-01", seller_user_id: "1517393956" }],
      error: null,
    });
    localResults.set("mercadopago_cajas", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullMpCajas();

    expect(result).toEqual({ ok: 1, failed: 0 });
    const upserted = localBuilders.get("mercadopago_cajas").upsert.mock.calls[0][0];
    expect(upserted[0]).toEqual({
      id: "c1",
      bar_id: "b1",
      store_id: "85068168",
      external_pos_id: "COCKTRAIL-BAR-01",
      pos_id_mp: null,
      qr_image: null,
      qr_template: null,
      seller_user_id: "1517393956",
      created_at: null,
      store_name: null,
    });
  });

  it("si el upsert falla por FK (seller local ausente tras restore de cero), el error pide re-vincular", async () => {
    cloudResults.set("mercadopago_cajas", {
      data: [{ id: "c1", bar_id: "b1", store_id: "85068168", external_pos_id: "X", seller_user_id: "1517393956" }],
      error: null,
    });
    localResults.set("mercadopago_cajas", { data: null, error: { message: 'violates foreign key constraint "mercadopago_cajas_seller_user_id_fkey"' } });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullMpCajas();

    expect(result.failed).toBe(1);
    expect(result.error).toMatch(/re-vincular/);
  });
});

describe("SupabaseCloudSyncRepository.pullMpDevices", () => {
  it("normaliza NULLs de filas cloud viejas: is_active→false, created_at→relleno, operating_mode inválido→null", async () => {
    cloudResults.set("mercadopago_cajas_devices", {
      data: [{ id: "d1", device_id: "PAX_A910__X", is_active: null, created_at: null, operating_mode: "CUALQUIERA" }],
      error: null,
    });
    localResults.set("mercadopago_cajas_devices", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullMpDevices();

    expect(result).toEqual({ ok: 1, failed: 0 });
    const upserted = localBuilders.get("mercadopago_cajas_devices").upsert.mock.calls[0][0];
    expect(upserted[0]).toMatchObject({
      id: "d1",
      device_id: "PAX_A910__X",
      caja_id: null,
      is_active: false,
      operating_mode: null,
    });
    expect(upserted[0].created_at).toEqual(expect.any(String));
  });

  it("operating_mode válido (PDV/STANDALONE) se conserva", async () => {
    cloudResults.set("mercadopago_cajas_devices", {
      data: [{ id: "d1", caja_id: "c1", device_id: "PAX_A910__X", operating_mode: "PDV", is_active: true, created_at: "2026-07-23T00:00:00Z" }],
      error: null,
    });
    localResults.set("mercadopago_cajas_devices", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    await repo.pullMpDevices();

    const upserted = localBuilders.get("mercadopago_cajas_devices").upsert.mock.calls[0][0];
    expect(upserted[0]).toMatchObject({ caja_id: "c1", operating_mode: "PDV", is_active: true });
  });
});

describe("SupabaseCloudSyncRepository.pullMpOrders", () => {
  it("mapeo explícito: status NULL se normaliza a 'unknown', el resto pasa con ?? null", async () => {
    cloudResults.set("mp_orders", {
      data: [{
        id: "mp-1", order_id_mp: "ORD01", external_ref: "COCKTRAIL-1", idempotency_key: "k1",
        amount: 1500, status: null, type: "point", event_id: "e1", device_id: "PAX_A910__X",
        payment_id: "pay-99", paid_amount: 1500, cart_items: [{ drinkId: 1 }],
      }],
      error: null,
    });
    localResults.set("mp_orders", { data: null, error: null });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullMpOrders();

    expect(result).toEqual({ ok: 1, failed: 0 });
    const upserted = localBuilders.get("mp_orders").upsert.mock.calls[0][0];
    expect(upserted[0]).toMatchObject({
      id: "mp-1",
      order_id_mp: "ORD01",
      status: "unknown",
      type: "point",
      event_id: "e1",
      payment_id: "pay-99",
      paid_amount: 1500,
      payment_transaction_id: null,
      qr_data: null,
      verification_error: null,
    });
  });

  it("si el upsert falla por FK (noche/caja no restaurada), el error queda distinguible", async () => {
    cloudResults.set("mp_orders", {
      data: [{ id: "mp-1", order_id_mp: "ORD01", external_ref: "X", idempotency_key: "k1", amount: 1, status: "created", type: "qr", event_id: "e-inexistente" }],
      error: null,
    });
    localResults.set("mp_orders", { data: null, error: { message: 'violates foreign key constraint "mp_orders_event_id_fkey"' } });
    const repo = new SupabaseCloudSyncRepository();

    const result = await repo.pullMpOrders();

    expect(result.failed).toBe(1);
    expect(result.error).toMatch(/no llegó de cloud/);
  });

  it("sin cloud configurada, no hace nada", async () => {
    cloudConfigured = false;
    const repo = new SupabaseCloudSyncRepository();
    expect(await repo.pullMpOrders()).toEqual({ ok: 0, failed: 0 });
  });
});
