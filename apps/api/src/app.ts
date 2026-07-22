import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { env } from "./config/env.js";
import { generalLimiter } from "./shared/middleware/rate-limit.js";

// Controllers
import { createAuthController } from "./modules/auth/auth.controller.js";
import { createDrinksController } from "./modules/drinks/drinks.controller.js";
import { createOrdersController } from "./modules/orders/orders.controller.js";
import { createEventsController } from "./modules/events/events.controller.js";
import { createSSEController } from "./modules/sse/sse.controller.js";
import { createTicketsController } from "./modules/tickets/tickets.controller.js";
import { createUsersController } from "./modules/users/users.controller.js";
import { createConfigController } from "./modules/config/config.controller.js";
import { createMercadoPagoController } from "./modules/mercadopago/mercadopago.controller.js";
import { createMercadoPagoOAuthController } from "./modules/mercadopago/mercadopago-oauth.controller.js";
import { createMercadoPagoProvisioningController } from "./modules/mercadopago/mercadopago-provisioning.controller.js";
import { createMercadoPagoOrdersController } from "./modules/mercadopago/mercadopago-orders.controller.js";
import { createMercadoPagoWebhooksController } from "./modules/mercadopago/mercadopago-webhooks.controller.js";
import { MercadoPagoWebhooksService } from "./modules/mercadopago/mercadopago-webhooks.service.js";
import { createBarSessionsController } from "./modules/bar-sessions/bar-sessions.controller.js";
import { createPrinterController } from "./modules/printer/printer.controller.js";

// Services & Repositories
import { SupabaseDrinksRepository } from "./modules/drinks/drinks.repository.js";
import { DrinksService } from "./modules/drinks/drinks.service.js";
import { SupabaseOrdersRepository } from "./modules/orders/orders.repository.js";
import { OrdersService } from "./modules/orders/orders.service.js";
import { SupabaseTicketsRepository } from "./modules/tickets/tickets.repository.js";
import { TicketsService } from "./modules/tickets/tickets.service.js";
import { SupabaseEventsRepository } from "./modules/events/events.repository.js";
import { EventsService } from "./modules/events/events.service.js";
import { SupabaseUsersRepository } from "./modules/users/users.repository.js";
import { UsersService } from "./modules/users/users.service.js";
import { SupabaseConfigRepository } from "./modules/config/config.repository.js";
import { MercadoPagoService } from "./modules/mercadopago/mercadopago.service.js";
import { MercadoPagoOAuthService } from "./modules/mercadopago/mercadopago-oauth.service.js";
import { SupabaseOAuthStatesRepository } from "./modules/mercadopago/oauth-states.repository.js";
import { SupabaseMercadoPagoSellersRepository } from "./modules/mercadopago/mercadopago-sellers.repository.js";
import { SupabaseMercadoPagoCajasRepository } from "./modules/mercadopago/mercadopago-cajas.repository.js";
import { SupabaseMercadoPagoCajasDevicesRepository } from "./modules/mercadopago/mercadopago-cajas-devices.repository.js";
import { SupabaseBarsRepository } from "./modules/mercadopago/bars.repository.js";
import { CredentialsResolverService } from "./modules/mercadopago/credentials-resolver.service.js";
import { MercadoPagoProvisioningService } from "./modules/mercadopago/mercadopago-provisioning.service.js";
import { MercadoPagoOrdersService } from "./modules/mercadopago/mercadopago-orders.service.js";
import { PointPaymentsService } from "./modules/mercadopago/point-payments.service.js";
import { createMercadoPagoPaymentAdapter } from "./modules/mercadopago/mercadopago-payment-adapter.js";
import { SupabaseMpOrdersRepository } from "./modules/mercadopago/mp-orders.repository.js";
import { getMigrationsStatus } from "./infra/migrations/migrations-status.js";
import { SupabaseMpWebhookEventsRepository } from "./modules/mercadopago/mp-webhook-events.repository.js";
import {
  BarSessionsService,
  barSessionUserId,
} from "./modules/bar-sessions/bar-sessions.service.js";
import { SupabaseBarSessionsRepository } from "./modules/bar-sessions/bar-sessions.repository.js";
import { PrinterService } from "./modules/printer/printer.service.js";
import { emit } from "./shared/sse/sse-manager.js";
import { SupabaseCloudSyncRepository } from "./modules/sync/cloud-sync.repository.js";
import { SyncService } from "./modules/sync/sync.service.js";
import { SystemService } from "./modules/system/system.service.js";
import { supabase, supabaseCloud } from "./shared/supabase.js";

// Middleware
import { errorHandler } from "./shared/middleware/error-handler.js";

// ── Dependency Injection ──

const drinksRepo = new SupabaseDrinksRepository();
const eventsRepo = new SupabaseEventsRepository();
const ordersRepo = new SupabaseOrdersRepository();
const ticketsRepo = new SupabaseTicketsRepository();
const usersRepo = new SupabaseUsersRepository();
const configRepo = new SupabaseConfigRepository();

const drinksService = new DrinksService(drinksRepo);
const usersService = new UsersService(usersRepo);

const cloudSyncRepo = new SupabaseCloudSyncRepository();
const syncService = new SyncService(usersRepo, drinksRepo, ordersRepo, ticketsRepo, eventsRepo, cloudSyncRepo);

const eventsService = new EventsService(eventsRepo, ordersRepo, drinksRepo, emit, syncService, configRepo);

const printerService = new PrinterService();

const oauthStatesRepo = new SupabaseOAuthStatesRepository();
const mpSellersRepo = new SupabaseMercadoPagoSellersRepository();
const mpCajasRepo = new SupabaseMercadoPagoCajasRepository();
const mpCajasDevicesRepo = new SupabaseMercadoPagoCajasDevicesRepository();
const barsRepo = new SupabaseBarsRepository();
const mpOAuthService = new MercadoPagoOAuthService(
  oauthStatesRepo,
  mpSellersRepo,
  {
    appId: env.MP_APP_ID,
    clientSecret: env.MP_CLIENT_SECRET,
    redirectUri: env.MP_REDIRECT_URI,
    refreshMarginDays: env.MP_REFRESH_MARGIN_DAYS,
  },
  supabaseCloud, // buzón de handoff + limpieza de metadata al desvincular
);

// Fase 2 — resuelve el access_token del único seller vinculado (single-seller).
const credentialsResolver = new CredentialsResolverService(mpSellersRepo, mpOAuthService);

const mpService = new MercadoPagoService(credentialsResolver);

// Sesiones de caja por barra
const barSessionsRepo = new SupabaseBarSessionsRepository();
const barSessionsService = new BarSessionsService(barSessionsRepo, barsRepo);

// Fase 3 — Store / POS / Point devices.
const mpProvisioningService = new MercadoPagoProvisioningService(
  credentialsResolver,
  mpSellersRepo,
  barsRepo,
  mpCajasRepo,
  mpCajasDevicesRepo,
);

// Fase 4 — Orders QR estático. `getActiveEvent` liga cada cobro a la noche
// abierta (mismo patrón que OrdersService).
const mpOrdersRepo = new SupabaseMpOrdersRepository();
const mpOrdersService = new MercadoPagoOrdersService(
  credentialsResolver,
  barsRepo,
  mpCajasRepo,
  mpOrdersRepo,
  async () => eventsService.getCurrentEvent(),
);

// cobro-verificado (R27) — política del cobro con Posnet: crea+persiste el
// intent y resuelve el veredicto contra el pago real.
const pointPaymentsService = new PointPaymentsService(
  mpService,
  mpOrdersRepo,
  async () => eventsService.getCurrentEvent(),
  emit,
);

// Adaptador del puerto de verificación de pago declarado en modules/orders —
// modules/orders NUNCA importa modules/mercadopago; los une este archivo.
const verifyPayment = createMercadoPagoPaymentAdapter({
  mpOrdersRepo,
  pointPayments: pointPaymentsService,
  qrOrders: mpOrdersService,
});

// Guarda del runner fail-open: si M1/M2 (esquema del cobro) no aplicaron, la
// venta no-efectivo se bloquea con mensaje claro en vez de romper el INSERT.
const COBRO_MIGRATIONS = ["20260722000000_mp_orders_point.sql", "20260722000100_orders_cobro.sql"];
const isPaymentSchemaReady = (): boolean => {
  const st = getMigrationsStatus();
  const notApplied = [...st.pending, ...(st.failed ? [st.failed.version] : [])];
  return !notApplied.some((version) => COBRO_MIGRATIONS.includes(version));
};

const ordersService = new OrdersService({
  ordersRepo,
  drinksRepo,
  getActiveEvent: async () => eventsService.getCurrentEvent(),
  incrementOrderCounter: async () => eventsService.incrementOrderCounter(),
  emit,
  generateTicketCodeString: (orderId: string): string => ticketsService.generateCodeString(orderId),
  saveTicket: async (orderId: string, code: string): Promise<void> => ticketsService.saveTicketForOrder(orderId, code),
  printTicket: async (order, nightEvent): Promise<void> => {
    // printerService.printTicket ya atrapa toda excepción interna y devuelve
    // { success, message } en vez de tirar — si success es false, hay que propagar
    // el fallo (throw) para que OrdersService.createOrder marque printed=false.
    const result = await printerService.printTicket(order, nightEvent);
    if (!result.success) {
      throw new Error(result.message);
    }
  },
  verifyPayment,
  isPaymentSchemaReady,
});

const ticketsService = new TicketsService(
  ticketsRepo,
  ordersService,
  env.AUTH_SECRET,
);

// Fase 6 — Webhooks Orders API (durables: se persisten antes del 200 y se
// reconcilian async; replayPending() corre en el boot desde server.ts).
const mpWebhookEventsRepo = new SupabaseMpWebhookEventsRepository();
const mpWebhooksService = new MercadoPagoWebhooksService(
  mpOrdersService,
  mpWebhookEventsRepo,
  emit,
);

const systemService = new SystemService(eventsRepo, mpService, printerService, supabase, supabaseCloud);

// ── Express App ──

const app = express();

// Middlewares globales de seguridad

// 1. Helmet para endurecimiento de cabeceras HTTP y políticas CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
      connectSrc: ["'self'", env.FRONTEND_URL, "ws:", "wss:", "http://localhost:*", "http://127.0.0.1:*", "http://192.168.*", "http://10.*", "http://172.*"],
    },
  },
  crossOriginEmbedderPolicy: false, // Para permitir Server-Sent Events (SSE)
}));

// 2. CORS con soporte para origen dinámico de red local (LAN)
app.use(cors({
  origin: (origin, callback) => {
    // Si no hay origin (ej. llamadas de servidor), si es dev, o coincide con FRONTEND_URL, o es IP local
    if (!origin || env.NODE_ENV === "development" || origin === env.FRONTEND_URL || /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Bar-Id", "X-Device-Id"],
}));

// 3. Limitador de solicitudes general (Rate Limiter)
app.use(generalLimiter);

app.use(express.json());
app.use(cookieParser());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// Routes
import { createSystemController } from "./modules/system/system.controller.js";

app.use(
  "/api/auth",
  createAuthController(usersRepo, {
    onLogout: async (user) => {
      await barSessionsService.leave(barSessionUserId(user.username, user.role, "default"));
    },
  }),
);
app.use("/api/drinks", createDrinksController(drinksService));
app.use("/api/orders", createOrdersController(ordersService));
app.use("/api/events", createSSEController());
app.use("/api/tickets", createTicketsController(ticketsService));
app.use("/api/users", createUsersController(usersService));
app.use("/api/config", createConfigController(configRepo, eventsService));
app.use("/api/mercadopago", createMercadoPagoOAuthController(mpOAuthService));
app.use("/api/mercadopago", createMercadoPagoProvisioningController(mpProvisioningService));
app.use("/api/mercadopago", createMercadoPagoOrdersController(mpOrdersService));
app.use("/api/mercadopago", createMercadoPagoWebhooksController(mpWebhooksService));
app.use("/api/mercadopago", createMercadoPagoController(mpService, pointPaymentsService));
app.use("/api/bar-sessions", createBarSessionsController(barSessionsService));
app.use("/api/printer", createPrinterController(printerService, ordersRepo, eventsService));
app.use("/api/system", createSystemController(usersRepo, systemService, syncService));
app.use("/api", createEventsController(eventsService, usersRepo));

// Error handler global (ÚLTIMO)
app.use(errorHandler);

// mpSellersRepo y mpOAuthService se exportan para el boot de server.ts
// (backfill de cifrado + pull del seller — fail-open).
export { app, eventsService, syncService, mpWebhooksService, mpSellersRepo, mpOAuthService };
