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
import { createCashSalesController } from "./modules/cash-sales/cash-sales.controller.js";
import { createEventsController } from "./modules/events/events.controller.js";
import { createSSEController } from "./modules/sse/sse.controller.js";
import { createTicketsController } from "./modules/tickets/tickets.controller.js";
import { createUsersController } from "./modules/users/users.controller.js";
import { createConfigController } from "./modules/config/config.controller.js";

// Services & Repositories
import { LocalJSONDrinksRepository } from "./modules/drinks/drinks.repository.js";
import { DrinksService } from "./modules/drinks/drinks.service.js";
import { InMemoryOrdersRepository } from "./modules/orders/orders.repository.js";
import { OrdersService } from "./modules/orders/orders.service.js";
import { InMemoryTicketsRepository } from "./modules/tickets/tickets.repository.js";
import { TicketsService } from "./modules/tickets/tickets.service.js";
import { InMemoryCashSalesRepository } from "./modules/cash-sales/cash-sales.repository.js";
import { CashSalesService } from "./modules/cash-sales/cash-sales.service.js";
import { EventsService } from "./modules/events/events.service.js";
import { LocalJSONUsersRepository } from "./modules/users/users.repository.js";
import { UsersService } from "./modules/users/users.service.js";
import { LocalJSONConfigRepository } from "./modules/config/config.repository.js";

// Middleware
import { errorHandler } from "./shared/middleware/error-handler.js";

// ── Dependency Injection ──

const drinksRepo = new LocalJSONDrinksRepository();
const ordersRepo = new InMemoryOrdersRepository();
const cashSalesRepo = new InMemoryCashSalesRepository();
const usersRepo = new LocalJSONUsersRepository();
const configRepo = new LocalJSONConfigRepository();

const drinksService = new DrinksService(drinksRepo);
const usersService = new UsersService(usersRepo);

const eventsService = new EventsService(ordersRepo, cashSalesRepo, drinksRepo, configRepo);

const ordersService: OrdersService = new OrdersService(
  ordersRepo,
  drinksRepo,
  () => eventsService.getEventStatus(),
  () => eventsService.incrementOrderCounter(),
  (orderId: string): string => ticketsService.generateForOrder(orderId),
);

const ticketsRepo = new InMemoryTicketsRepository();
const ticketsService: TicketsService = new TicketsService(
  ticketsRepo,
  ordersService,
  env.AUTH_SECRET,
);

const cashSalesService = new CashSalesService(
  cashSalesRepo,
  () => eventsService.getEventStatus(),
);

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
app.use("/api/auth", createAuthController(usersRepo));
app.use("/api/drinks", createDrinksController(drinksService));
app.use("/api/orders", createOrdersController(ordersService));
app.use("/api/cash-sales", createCashSalesController(cashSalesService));
app.use("/api/events", createSSEController());
app.use("/api/tickets", createTicketsController(ticketsService));
app.use("/api/users", createUsersController(usersService));
app.use("/api/config", createConfigController(configRepo, eventsService));
app.use("/api", createEventsController(eventsService, usersRepo));

// Error handler global (ÚLTIMO)
app.use(errorHandler);

export { app, eventsService };
