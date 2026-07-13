import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

// Middleware genérico de validación con Zod
export function validate(schema: z.Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Validación fallida",
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data; // Body sanitizado y filtrado (ignora campos extras)
    next();
  };
}

// ── Esquemas de validación ──

// 1. Esquema para Login
export const LoginSchema = z.object({
  username: z.string().min(1, "Usuario requerido").max(50, "Usuario demasiado largo").trim(),
  password: z.string().min(1, "Contraseña requerida").max(128, "Contraseña demasiado larga"),
});

// 2. Esquema para crear un pedido
export const CreateOrderSchema = z.object({
  items: z
    .array(
      z.object({
        drinkId: z.number().int("drinkId debe ser un entero").positive("drinkId debe ser positivo"),
        qty: z.number().int("qty debe ser un entero").positive("qty debe ser positivo").max(20, "Máximo 20 unidades por trago"),
      })
    )
    .min(1, "El pedido debe tener al menos 1 ítem")
    .max(50, "Máximo 50 ítems por pedido"),
  paymentMethod: z.enum(["efectivo", "qr", "debito"], {
    errorMap: () => ({ message: "Método de pago inválido" }),
  }),
});

// 3. Esquema para registrar venta en efectivo (barra)
export const CreateCashSaleSchema = z.object({
  amount: z.number().positive("El monto debe ser un número positivo"),
  description: z.string().min(1, "La descripción es requerida").max(500, "Descripción demasiado larga").trim(),
});

// 4. Esquema para cambiar tema de la noche
export const ThemeSchema = z.object({
  theme: z.enum(["bosko"], {
    errorMap: () => ({ message: "Tema inválido" }),
  }),
});

// 5. Esquema para actualizar estado de un pedido
export const UpdateOrderStatusSchema = z.object({
  status: z.enum(["pendiente", "entregado", "cancelado"], {
    errorMap: () => ({ message: "Estado de pedido inválido" }),
  }),
});

// 6. Esquema para canjear un ticket QR
export const RedeemTicketSchema = z.object({
  code: z
    .string()
    .min(1, "Código de ticket requerido")
    .max(50, "Código de ticket demasiado largo")
    .trim(),
  barCode: z
    .string()
    .min(1, "Código de barra requerido")
    .max(20, "Código de barra demasiado largo")
    .trim()
    .optional(),
  method: z.enum(["scan", "manual"]).optional(),
});

// 7. Esquema para crear un trago (CRUD Carta)
export const CreateDrinkSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(100, "Nombre demasiado largo").trim(),
  price: z.number().positive("El precio debe ser positivo"),
  description: z.string().max(500, "Descripción demasiado larga").trim().default(""),
  vibe: z.string().max(50, "Vibe demasiado largo").trim().default(""),
  flavors: z.array(z.string().max(30)).max(10, "Máximo 10 sabores").default([]),
  iconName: z.string().max(50).default("glass-water"),
  image: z.string().max(500).optional(),
  trending: z.boolean().default(false),
  promo: z.boolean().default(false),
  available: z.boolean().default(true),
});

// 8. Esquema para actualizar un trago (todos los campos opcionales)
export const UpdateDrinkSchema = z.object({
  name: z.string().min(1, "Nombre requerido").max(100, "Nombre demasiado largo").trim().optional(),
  price: z.number().positive("El precio debe ser positivo").optional(),
  description: z.string().max(500, "Descripción demasiado larga").trim().optional(),
  vibe: z.string().max(50, "Vibe demasiado largo").trim().optional(),
  flavors: z.array(z.string().max(30)).max(10, "Máximo 10 sabores").optional(),
  iconName: z.string().max(50).optional(),
  image: z.string().max(500).optional(),
  trending: z.boolean().optional(),
  promo: z.boolean().optional(),
  available: z.boolean().optional(),
});

// 9. Esquema para crear un usuario de staff
export const CreateUserSchema = z.object({
  username: z.string().min(1, "Usuario requerido").max(50, "Usuario demasiado largo").trim(),
  password: z.string().min(4, "Contraseña demasiado corta").max(128, "Contraseña demasiado larga"),
  role: z.enum(["admin", "caja"], {
    errorMap: () => ({ message: "Rol inválido" }),
  }),
});

// 10. Esquema para actualizar configuración general
export const UpdateConfigSchema = z.object({
  theme: z.enum(["bosko"]).optional(),
  brandName: z.string().max(100).trim().optional(),
  logoUrl: z.string().max(500).optional(),
  customTheme: z.null().optional(),
  mercadoPago: z.object({
    publicKey: z.string().max(200).default(""),
    accessToken: z.string().max(200).default(""),
    sandbox: z.boolean().default(true),
  }).optional(),
  clubId: z.string().max(100).optional(),
  clubName: z.string().max(100).optional(),
  useLogoUrl: z.boolean().optional(),
  logoSize: z.number().optional(),
  textLogoValue: z.string().max(100).optional(),
  textLogoSize: z.number().optional(),
});

// 11. Esquema para editar un usuario de staff
export const UpdateUserSchema = z.object({
  username: z.string().min(1, "Usuario requerido").max(50, "Usuario demasiado largo").trim().optional(),
  password: z.string().min(4, "Contraseña demasiado corta").max(128, "Contraseña demasiado larga").optional(),
  role: z.enum(["admin", "caja"], {
    errorMap: () => ({ message: "Rol inválido" }),
  }).optional(),
});
