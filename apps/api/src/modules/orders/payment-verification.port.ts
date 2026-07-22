import type { PaymentMethod } from "@cocktrail/shared";

/**
 * Puerto de verificación de pago del dominio de pedidos.
 *
 * Declarado en `modules/orders` a propósito: la dependencia apunta hacia el
 * dominio. `modules/orders` NUNCA importa nada de `modules/mercadopago` — el
 * adaptador vive allá y los une app.ts (mismo patrón que getActiveEvent /
 * printTicket).
 */

/** Prueba que presenta la caja: SIEMPRE el id del intent/order, nunca un paymentId (forjable). */
export type PaymentProof = {
  provider: "mercadopago";
  kind: "point_intent" | "qr_order";
  id: string;
};

/**
 * Tres valores, nunca un booleano: un booleano obliga a inventar un default y
 * por D1 el default no puede ser "cobrado".
 */
export type PaymentVerdict =
  | { result: "no_aplica" }
  | {
      result: "confirmado";
      /** Id del pago en el proveedor (para el panel de MP). */
      providerPaymentId: string;
      /** ⚠ En PESOS: lo efectivamente aprobado. */
      amount: number;
      /** Id interno de la fila de cobro a ligar (orders.mp_order_id). */
      proofRecordId: string;
    }
  | { result: "rechazado"; reason: string; detail?: string }
  | { result: "indeterminado"; reason: string };

export type VerifyPaymentInput = {
  proof?: PaymentProof;
  /** ⚠ En PESOS: total recomputado por OrdersService desde el catálogo. */
  expectedAmount: number;
  method: PaymentMethod;
};

/** Tipo función (no interfaz), consistente con los vecinos del constructor de OrdersService. */
export type VerifyPaymentFn = (input: VerifyPaymentInput) => Promise<PaymentVerdict>;
