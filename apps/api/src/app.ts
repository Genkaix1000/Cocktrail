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

const ordersService = new OrdersService(
  ordersRepo,
  drinksRepo,
  async () => eventsService.getCurrentEvent(),
  async () => eventsService.incrementOrderCounter(),
  emit,
  (orderId: string): string => ticketsService.generateCodeString(orderId),
  async (orderId: string, code: string): Promise<void> => ticketsService.saveTicketForOrder(orderId, code),
  async (order, nightEvent): Promise<void> => {
    // printerService.printTicket ya atrapa toda excepción interna y devuelve
    // { success, message } en vez de tirar — si success es false, hay que propagar
    // el fallo (throw) para que OrdersService.createOrder marque printed=false.
    const result = await printerService.printTicket(order, nightEvent);
    if (!result.success) {
      throw new Error(result.message);
    }
  },
);

const ticketsService = new TicketsService(
  ticketsRepo,
  ordersService,
  env.AUTH_SECRET,
);

const mpService = new MercadoPagoService();
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
  allowedHeaders: ["Content-Type", "Authorization"],
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

app.use("/api/auth", createAuthController(usersRepo));
app.use("/api/drinks", createDrinksController(drinksService));
app.use("/api/orders", createOrdersController(ordersService));
app.use("/api/events", createSSEController());
app.use("/api/tickets", createTicketsController(ticketsService));
app.use("/api/users", createUsersController(usersService));
app.use("/api/config", createConfigController(configRepo, eventsService));
app.use("/api/mercadopago", createMercadoPagoController(mpService));
app.use("/api/printer", createPrinterController(printerService, ordersRepo, eventsService));
app.use("/api/system", createSystemController(usersRepo, systemService, syncService));
app.use("/api", createEventsController(eventsService, usersRepo));

// Error handler global (ÚLTIMO)
app.use(errorHandler);

export { app, eventsService, syncService };
