import { computeTotals, type CreateOrderResult, type NewOrderInput, type Order, type Role } from "@cocktrail/shared";
import { DEMO_CATEGORIES } from "./seed";
import {
  clearRole,
  demoState,
  readGateExp,
  readRole,
  resetDemoState,
  writeGateExp,
  writeRole,
} from "./store";

type Opts = { method?: string; body?: unknown };

function ok<T>(data: T, status = 200): { status: number; data: T } {
  return { status, data };
}

function err(status: number, error: string): { status: number; data: { error: string } } {
  return { status, data: { error } };
}

function requireRole(...roles: Role[]) {
  const role = readRole();
  if (!role || !readGateExp()) return null;
  if (roles.length && !roles.includes(role)) return null;
  return role;
}

function mintKeyHours(hours: number): string {
  // Client-side demo keys: `demo.<hours>` or literal "demo" (48h).
  // Production-grade HMAC keys still work if pasted as `exp.hmac` — we only check exp > now for the numeric prefix.
  void hours;
  return "";
}

/** Valida clave: "demo", "demo.<hours>", o token `exp.hex` con exp futuro. */
export function redeemDemoKeyClient(key: string): number | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  if (trimmed === "demo") return Date.now() + 48 * 60 * 60 * 1000;
  const demoHours = /^demo\.(\d+)$/i.exec(trimmed);
  if (demoHours) {
    const h = Number(demoHours[1]);
    if (Number.isFinite(h) && h > 0) return Date.now() + h * 60 * 60 * 1000;
  }
  const parts = trimmed.split(".");
  if (parts.length === 2) {
    const exp = Number(parts[0]);
    if (Number.isFinite(exp) && exp > Date.now()) return exp;
  }
  return null;
}

/**
 * Router in-memory para `apiFetch` cuando NEXT_PUBLIC_DEMO_STATIC=1.
 * Cubre Admin + Caja. Endpoints MP/sistema → stubs seguros.
 */
export async function demoFetch<T>(path: string, opts: Opts = {}): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  const body = (opts.body ?? {}) as Record<string, unknown>;
  const url = path.split("?")[0];

  const result = handle(url, method, body);
  if (result.status >= 400) {
    const { ApiError } = await import("@/services/api-client");
    throw new ApiError(result.status, (result.data as { error?: string }).error ?? "Error", result.data);
  }
  return result.data as T;
}

function handle(url: string, method: string, body: Record<string, unknown>) {
  // ── Auth / gate ──────────────────────────────────────────
  if (url === "/api/auth/login" && method === "POST") {
    const key = String(body.key ?? body.password ?? "");
    const username = String(body.username ?? "");
    // Flujo gate: { key }
    if (body.key != null || (!username && key)) {
      const exp = redeemDemoKeyClient(key || String(body.key ?? ""));
      if (exp == null) return err(400, "Clave inválida o vencida");
      writeGateExp(exp);
      writeRole("admin");
      return ok({ username: "demo", role: "admin" as Role, expiresAt: exp });
    }
    // Flujo rol: ya hay gate, eligen admin/caja
    if (!readGateExp()) return err(401, "Necesitás una clave de acceso demo");
    const role: Role = username === "caja" || body.role === "caja" ? "caja" : "admin";
    writeRole(role);
    return ok({ username: role === "caja" ? "caja" : "admin", role });
  }

  if (url === "/api/auth/logout" && method === "POST") {
    // Conserva la clave TTL en localStorage; solo cierra la sesión de rol.
    clearRole();
    demoState().barSession = null;
    return ok({ ok: true });
  }

  if (url === "/api/auth/me" && method === "GET") {
    const role = requireRole("admin", "caja");
    if (!role) return ok(null);
    return ok({
      role,
      username: role === "admin" ? "admin" : "caja",
      permissions: {
        closeNight: true,
        cancelarTickets: true,
        historial: true,
        metricas: true,
      },
    });
  }

  if (url === "/api/demo/reset" && method === "POST") {
    if (!requireRole("admin", "caja")) return err(401, "Unauthorized");
    resetDemoState();
    return ok({ ok: true });
  }

  // ── State / events ───────────────────────────────────────
  if (url === "/api/state" && method === "GET") {
    if (!requireRole("admin", "caja")) return err(401, "Unauthorized");
    const s = demoState();
    return ok({
      event: s.event,
      drinks: s.drinks,
      orders: s.orders,
      totals: computeTotals(s.orders),
      activeTheme: s.theme,
    });
  }

  if (url === "/api/theme" && method === "GET") {
    const s = demoState();
    return ok({
      theme: s.theme,
      useLogoUrl: true,
      logoUrl: "/miboliche-mark.svg",
      logoSize: 56,
      textLogoValue: "miBoliche",
      textLogoSize: 26,
    });
  }

  if (url === "/api/theme" && method === "POST") {
    const s = demoState();
    s.theme = String(body.theme ?? "miboliche");
    return ok({ success: true, theme: s.theme });
  }

  if (url === "/api/events/open" && method === "POST") {
    if (!requireRole("admin")) return err(401, "Unauthorized");
    const s = demoState();
    s.event = {
      id: crypto.randomUUID(),
      status: "activo",
      startedAt: Date.now(),
      orderCounter: 0,
      keyword: String(body.keyword ?? "DEMO"),
    };
    s.orders = [];
    return ok(s.event);
  }

  if (url === "/api/event/close" && method === "POST") {
    if (!requireRole("admin", "caja")) return err(401, "Unauthorized");
    const s = demoState();
    if (s.event.status !== "activo") return err(409, "No hay noche activa");
    s.event = { ...s.event, status: "cerrado", closedAt: Date.now() };
    const summary = {
      ...s.event,
      totals: computeTotals(s.orders),
      orders: [...s.orders],
    };
    s.closedEvents.unshift(summary);
    s.event = {
      id: crypto.randomUUID(),
      status: "activo",
      startedAt: Date.now(),
      orderCounter: 0,
      keyword: "DEMO",
    };
    s.orders = [];
    return ok(summary);
  }

  if (url === "/api/events/history" && method === "GET") {
    if (!requireRole("admin")) return err(401, "Unauthorized");
    return ok(demoState().closedEvents);
  }

  if (url === "/api/events/current/keyword" && method === "PATCH") {
    if (!requireRole("admin")) return err(401, "Unauthorized");
    const s = demoState();
    s.event = { ...s.event, keyword: String(body.keyword ?? s.event.keyword) };
    return ok(s.event);
  }

  // ── Drinks / categories ──────────────────────────────────
  if (url === "/api/drinks" && method === "GET") {
    return ok(demoState().drinks);
  }
  if (url === "/api/drink-categories" && method === "GET") {
    return ok(DEMO_CATEGORIES);
  }
  if (url.startsWith("/api/drinks/") && method === "PATCH") {
    if (!requireRole("admin")) return err(401, "Unauthorized");
    const id = Number(url.split("/").pop());
    const s = demoState();
    const idx = s.drinks.findIndex((d) => d.id === id);
    if (idx < 0) return err(404, "No encontrado");
    s.drinks[idx] = { ...s.drinks[idx], ...body } as typeof s.drinks[number];
    return ok(s.drinks[idx]);
  }

  // ── Orders ───────────────────────────────────────────────
  if (url === "/api/orders" && method === "POST") {
    if (!requireRole("admin", "caja")) return err(401, "Unauthorized");
    const input = body as unknown as NewOrderInput;
    const s = demoState();
    if (s.event.status !== "activo") return err(409, "No hay noche activa");
    const items = (input.items ?? []).map((it) => {
      const drink = s.drinks.find((d) => d.id === it.drinkId);
      if (!drink) throw new Error("drink missing");
      return {
        drinkId: drink.id,
        name: drink.name,
        qty: it.qty,
        unitPrice: drink.price,
        subtotal: drink.price * it.qty,
      };
    });
    const total = items.reduce((a, i) => a + i.subtotal, 0);
    s.event = { ...s.event, orderCounter: s.event.orderCounter + 1 };
    const order: Order = {
      id: crypto.randomUUID(),
      token: crypto.randomUUID().slice(0, 8),
      displayNumber: s.event.orderCounter,
      items,
      total,
      paymentMethod: input.paymentMethod ?? "efectivo",
      status: "pendiente",
      createdAt: Date.now(),
      createdBy: readRole() ?? "caja",
      ticketCode: String(s.event.orderCounter).padStart(3, "0"),
    };
    s.orders.push(order);
    const result: CreateOrderResult = {
      ...order,
      printed: false,
      ticketContent: {
        brand: "miBoliche",
        items: items.map((i) => ({ qty: i.qty, name: i.name })),
        keywordText: s.event.keyword ?? "DEMO",
      },
      ticketData: "",
    };
    return ok(result);
  }

  if (url === "/api/orders" && method === "GET") {
    return ok(demoState().orders);
  }
  if (url === "/api/orders/active" && method === "GET") {
    return ok(demoState().orders.filter((o) => o.status === "pendiente"));
  }
  if (url === "/api/orders/log" || url.startsWith("/api/orders/log")) {
    return ok(demoState().orders);
  }
  if (url.startsWith("/api/orders/") && method === "PATCH") {
    const id = url.split("/")[3];
    const s = demoState();
    const order = s.orders.find((o) => o.id === id);
    if (!order) return err(404, "No encontrado");
    if (typeof body.status === "string") {
      order.status = body.status as Order["status"];
      if (order.status === "entregado") order.deliveredAt = Date.now();
      if (order.status === "cancelado") {
        order.cancelledAt = Date.now();
        order.cancelledBy = "demo";
      }
    }
    return ok(order);
  }

  // ── Bar sessions (caja onboarding) — plan base: 2 cajas ─
  if (url === "/api/bar-sessions/options" && method === "GET") {
    if (!requireRole("caja", "admin")) return err(401, "Unauthorized");
    const s = demoState();
    const session = s.barSession;
    const boxes = [
      {
        barId: "demo-caja-qr",
        name: "Caja QR dinámico",
        code: "QR-01",
        status: (session?.barId === "demo-caja-qr" ? "mine" : "available") as
          | "mine"
          | "available",
        session:
          session?.barId === "demo-caja-qr"
            ? { username: session.username, connectedAt: session.connectedAt }
            : null,
      },
      {
        barId: "demo-caja-pos",
        name: "Caja Posnet",
        code: "POS-01",
        status: (session?.barId === "demo-caja-pos" ? "mine" : "available") as
          | "mine"
          | "available",
        session:
          session?.barId === "demo-caja-pos"
            ? { username: session.username, connectedAt: session.connectedAt }
            : null,
      },
    ];
    return ok({ boxes, currentSession: session });
  }
  if (url === "/api/bar-sessions/join" && method === "POST") {
    const now = new Date().toISOString();
    const barId = String(body.barId ?? "demo-caja-qr");
    const session = {
      id: "demo-session",
      barId,
      userId: "demo-caja",
      username: "caja",
      role: "caja" as const,
      connectedAt: now,
      lastSeenAt: now,
    };
    demoState().barSession = session;
    return ok({ joined: true as const, session });
  }
  if (url === "/api/bar-sessions/heartbeat" && method === "POST") {
    const s = demoState();
    if (!s.barSession) return err(404, "Sin sesión");
    s.barSession = { ...s.barSession, lastSeenAt: new Date().toISOString() };
    return ok(s.barSession);
  }
  if (url === "/api/bar-sessions/leave" && (method === "POST" || method === "DELETE")) {
    demoState().barSession = null;
    return ok({ ok: true });
  }
  if (url === "/api/bar-sessions" && method === "GET") {
    const session = demoState().barSession;
    return ok(session ? [session] : []);
  }

  // ── Stubs (MP / users / config / system / printer) ───────
  if (url.startsWith("/api/mercadopago")) {
    if (url.includes("seller-status")) {
      return ok({
        linked: true,
        status: "active",
        displayName: "miBoliche Demo",
        email: "demo@miboliche.com",
      });
    }
    if (url.includes("health")) {
      // Shape MpHealth completo — Caja llama derivePosnetStatus(health.checks).
      return ok({
        checks: {
          singleSeller: { ok: true, detail: "Demo: 1 seller" },
          deviceOwnership: { ok: true, detail: "Demo: Posnet en cuenta" },
          deviceMode: { ok: true, detail: "PDV" },
          cajaProvisioned: { ok: true, detail: "Demo" },
        },
        fallback: { status: "unknown" as const, checkedAt: null },
        usingEnvDevice: false,
        blocking: false,
        hasLinkedDevice: true,
        checkedAt: new Date().toISOString(),
      });
    }
    if (url.includes("provisioning/summary")) {
      return ok({
        store: {
          linked: true,
          storeId: "demo-store",
          name: "miBoliche Demo",
          storeName: "miBoliche Demo",
          sellerUserId: "demo-seller",
        },
        bars: 2,
        posnets: 1,
      });
    }
    if (url.includes("provisioning/cajas")) {
      return ok([
        {
          id: "caja-qr",
          barId: "demo-caja-qr",
          storeId: "demo-store",
          externalPosId: "MIBOLICHEQR01",
          posIdMp: "pos-qr",
          qrImage: null,
          qrTemplate: null,
          sellerUserId: "demo-seller",
          storeName: "miBoliche Demo",
          barCode: "QR-01",
          barEnabled: true,
          isOrphan: false,
          createdAt: new Date().toISOString(),
          device: null,
        },
        {
          id: "caja-pos",
          barId: "demo-caja-pos",
          storeId: "demo-store",
          externalPosId: "MIBOLICHEPOS01",
          posIdMp: "pos-posnet",
          qrImage: null,
          qrTemplate: null,
          sellerUserId: "demo-seller",
          storeName: "miBoliche Demo",
          barCode: "POS-01",
          barEnabled: true,
          isOrphan: false,
          createdAt: new Date().toISOString(),
          device: {
            id: "dev-1",
            cajaId: "caja-pos",
            deviceId: "PAX_A910__DEMO",
            deviceUsername: "Posnet Demo",
            operatingMode: "PDV",
            operatingModeSyncedAt: new Date().toISOString(),
            isActive: true,
            linkedAt: new Date().toISOString(),
            deactivatedAt: null,
          },
        },
      ]);
    }
    if (url.includes("provisioning/devices")) {
      return ok([
        {
          id: "dev-1",
          cajaId: "caja-pos",
          deviceId: "PAX_A910__DEMO",
          deviceUsername: "Posnet Demo",
          operatingMode: "PDV",
          operatingModeSyncedAt: new Date().toISOString(),
          isActive: true,
          linkedAt: new Date().toISOString(),
          deactivatedAt: null,
        },
      ]);
    }
    if (url.includes("oauth/url")) {
      return ok({ url: "#" });
    }
    return ok({ ok: true, demo: true });
  }
  if (url === "/api/users" && method === "GET") {
    return ok([
      { id: "1", username: "admin", role: "admin" },
      { id: "2", username: "caja", role: "caja" },
    ]);
  }
  if (url === "/api/config" && method === "GET") {
    return ok({
      clubName: "miBoliche Demo",
      useLogoUrl: true,
      logoUrl: "/miboliche-mark.svg",
      textLogoValue: "miBoliche",
    });
  }
  if (url === "/api/system/health") {
    return ok({
      status: "ok",
      migrations: {
        state: "ok",
        lastRunAt: null,
        appliedNow: [],
        pending: [],
        failed: null,
        drift: [],
      },
      serverStartedAt: Date.now() - 60_000,
      mpFallback: {
        status: "unknown",
        reason: "Demo sin Mercado Pago",
        checkedAt: new Date().toISOString(),
      },
    });
  }
  if (url === "/api/system/version") {
    const started = Date.now() - 60_000;
    return ok({
      version: "0.0.0-demo",
      channel: "demo",
      label: "miBoliche Demo",
      environment: "demo",
      deploy: {
        provider: "local",
        service: "miboliche-demo",
        commit: null,
        commitShort: null,
        branch: "demo/miboliche",
        externalUrl: null,
      },
      runtime: {
        node: typeof process !== "undefined" ? process.version : "n/a",
        serverStartedAt: started,
        uptimeSec: 60,
      },
      migrations: {
        state: "ok",
        pendingCount: 0,
        lastApplied: null,
      },
      releaseNotes: {
        version: "0.0.0-demo",
        date: null,
        highlights: ["Demo estática miBoliche · sin DB · plan base 2 cajas"],
      },
    });
  }
  if (url.startsWith("/api/printer")) {
    return ok({
      success: true,
      message: "Demo: sin impresora",
      data: "",
      ticketContent: { items: [] },
    });
  }

  console.warn("[demo] unhandled", method, url);
  return ok({ ok: true, demo: true, path: url });
}

void mintKeyHours;
