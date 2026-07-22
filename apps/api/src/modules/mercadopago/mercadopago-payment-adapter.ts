import type {
  PaymentVerdict,
  VerifyPaymentFn,
} from "../orders/payment-verification.port.js";
import type { MercadoPagoOrdersService } from "./mercadopago-orders.service.js";
import type { MpOrder, MpOrdersRepository, MpOrderStatus } from "./mp-orders.repository.js";
import type { PointPaymentsService } from "./point-payments.service.js";

/**
 * Adaptador del puerto VerifyPaymentFn sobre el módulo de Mercado Pago.
 *
 * Regla de red: lee mp_orders LOCAL (el veredicto se resolvió y persistió en el
 * polling). Solo re-consulta MP en vivo si la fila está ausente o su estado es
 * indeterminado — y si esa consulta falla, el resultado es "indeterminado",
 * NUNCA "confirmado" (D1). Así el registro no le suma latencia al camino
 * crítico y el reintento desde la constancia funciona aunque MP esté caído.
 */

/** Estados locales que ya son un veredicto: no hay nada que re-consultar. */
const SETTLED: ReadonlySet<MpOrderStatus> = new Set([
  "processed",
  "rejected",
  "canceled",
  "refunded",
  "failed",
  "expired",
]);

export function createMercadoPagoPaymentAdapter(deps: {
  mpOrdersRepo: MpOrdersRepository;
  pointPayments: PointPaymentsService;
  qrOrders: MercadoPagoOrdersService;
}): VerifyPaymentFn {
  const { mpOrdersRepo, pointPayments, qrOrders } = deps;

  return async ({ proof, expectedAmount, method }): Promise<PaymentVerdict> => {
    // El efectivo pasa por el mismo camino que todo lo demás — sin red, sin proof.
    if (method === "efectivo") return { result: "no_aplica" };

    if (!proof) {
      return { result: "indeterminado", reason: "Falta la prueba de pago (payment)." };
    }

    const expectedType = proof.kind === "point_intent" ? "point" : "qr";
    let row = await mpOrdersRepo.findByMpId(proof.id);

    if (row && row.type !== expectedType) {
      return {
        result: "indeterminado",
        reason: `La prueba de pago no coincide con el tipo de cobro registrado (${row.type}).`,
      };
    }

    if (!row || !SETTLED.has(row.status)) {
      // Fila ausente o no concluyente: UNA re-consulta viva a MP.
      try {
        if (proof.kind === "point_intent") {
          if (row) {
            await pointPayments.resolveIntent(proof.id);
            row = await mpOrdersRepo.findByMpId(proof.id);
          } else {
            row = await pointPayments.recoverUnregisteredIntent(proof.id);
          }
        } else {
          // El camino QR persiste la fila al crear la order: ausente = id ajeno.
          row = row ? await qrOrders.getOrderStatus(proof.id) : null;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          result: "indeterminado",
          reason: `No se pudo verificar el cobro contra Mercado Pago: ${message}`,
        };
      }
    }

    if (!row) {
      return {
        result: "indeterminado",
        reason: "El cobro no está registrado en el sistema y Mercado Pago no lo confirma.",
      };
    }

    return verdictFromRow(row, expectedAmount);
  };
}

function verdictFromRow(row: MpOrder, expectedAmount: number): PaymentVerdict {
  switch (row.status) {
    case "processed": {
      if (row.paidAmount == null || !row.paymentId) {
        // El CHECK de DB lo impide, pero por D1 acá tampoco se confía.
        return { result: "indeterminado", reason: "Cobro procesado sin monto/pago verificado." };
      }
      if (row.paidAmount !== expectedAmount || Number(row.amount) !== expectedAmount) {
        return {
          result: "indeterminado",
          reason: `El monto cobrado ($${row.paidAmount}) no coincide con el total de la venta ($${expectedAmount}).`,
        };
      }
      return {
        result: "confirmado",
        providerPaymentId: row.paymentId,
        amount: row.paidAmount,
        proofRecordId: row.id,
      };
    }
    case "rejected":
      return {
        result: "rechazado",
        reason: "Pago rechazado por Mercado Pago.",
        ...(row.paymentStatusDetail ? { detail: row.paymentStatusDetail } : {}),
      };
    case "failed":
      return {
        result: "rechazado",
        reason: "El pago falló en Mercado Pago.",
        ...(row.paymentStatusDetail ? { detail: row.paymentStatusDetail } : {}),
      };
    case "canceled":
      return { result: "rechazado", reason: "El cobro fue cancelado antes de completarse." };
    case "refunded":
      return { result: "rechazado", reason: "El cobro fue devuelto (refund)." };
    case "expired":
      return { result: "indeterminado", reason: "El cobro venció sin confirmación de Mercado Pago." };
    default:
      return {
        result: "indeterminado",
        reason: row.verificationError ?? "El cobro todavía no está confirmado por Mercado Pago.",
      };
  }
}
