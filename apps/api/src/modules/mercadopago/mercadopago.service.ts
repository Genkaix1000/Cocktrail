import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { Conflict } from "../../shared/errors/http-errors.js";

type MpNormalizedStatus = "OPEN" | "ON_TERMINAL" | "FINISHED" | "CANCELED" | "PENDING";

type MpDevice = {
  id: string;
  model?: string;
  serial_number?: string;
  operating_mode?: string;
};

type MpPaymentIntentResponse = {
  id?: string;
  state?: string;
  status?: string;
  payment?: { id: string };
  [key: string]: unknown;
};

type MpPayment = {
  id: string;
  status: string;
};

/** Mapea el estado real de un pago de MP al status normalizado que expone el service. */
export function mapPaymentStatusToNormalized(mpPaymentStatus: string): "FINISHED" | "CANCELED" | "PENDING" {
  if (mpPaymentStatus === "approved") return "FINISHED";
  if (mpPaymentStatus === "rejected" || mpPaymentStatus === "cancelled") return "CANCELED";
  return "PENDING";
}

/**
 * Conflict enriquecido con el payload de error crudo de MP, para que
 * createPaymentIntent pueda inspeccionar el código (ej. 2205 "queued
 * intent") sin volver a parsear el mensaje de texto.
 */
export class MpApiError extends Conflict {
  constructor(message: string, readonly mpCode: string, readonly mpData: unknown, code?: string) {
    super(message, code);
    this.name = "MpApiError";
  }
}

/**
 * Código estable que exponemos al frontend (vía `Conflict.code` → error-handler
 * → `ApiError.data.code`) cuando el device quedó con una intención en cola (2205)
 * y no pudimos auto-recuperarlo. El frontend usa esto para decidir reintentar/
 * mostrar error, en vez de tener que parsear el mensaje de texto.
 */
const DEVICE_BUSY_CODE = "DEVICE_BUSY";

function isQueuedIntentError(err: unknown): err is MpApiError {
  if (!(err instanceof MpApiError)) return false;
  return err.mpCode === "2205" || err.message.includes("2205") || err.message.toLowerCase().includes("queued intent");
}

/**
 * La Point Integration API no tiene un campo "description" propio en el
 * payment-intent (confirmado contra la doc oficial: additional_info solo
 * admite external_reference, print_on_terminal y ticket_number). Por eso el
 * texto descriptivo del cobro se mete adentro de external_reference, que
 * además tiene que ser único por cobro para no pisar reintentos. MP limita
 * external_reference a 64 caracteres y solo letras/números/guiones.
 */
function buildExternalReference(description?: string): string {
  const base = `cocktrail-${Date.now()}`;
  if (!description) return base;

  const sanitized = description
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // sacar acentos (ej. "Fernét" -> "Fernet")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${base}-${sanitized}`.slice(0, 64);
}

/**
 * Best-effort: si algún día MP agrega el id de la intención en cola dentro
 * del payload de error 2205, lo tomamos de acá. HOY la doc pública de la
 * Point Integration API no documenta ese campo (el error 409 solo trae
 * status/error/message/cause, sin el id de la intención bloqueante) ni existe
 * un endpoint para consultar "cuál es la intención activa de este device" sin
 * conocer ya su id. Si no lo encontramos, devolvemos undefined y
 * createPaymentIntent no intenta auto-recuperarse (ver comentario ahí).
 */
function extractQueuedIntentId(mpData: unknown): string | undefined {
  if (!mpData || typeof mpData !== "object") return undefined;
  const data = mpData as Record<string, unknown>;

  const direct = data.payment_intent_id ?? data.id;
  if (typeof direct === "string") return direct;

  const cause = Array.isArray(data.cause) ? data.cause : [];
  for (const c of cause) {
    if (!c || typeof c !== "object") continue;
    const causeData = (c as Record<string, unknown>).data;
    if (causeData && typeof causeData === "object") {
      const id = (causeData as Record<string, unknown>).payment_intent_id ?? (causeData as Record<string, unknown>).id;
      if (typeof id === "string") return id;
    }
  }

  return undefined;
}

export class MercadoPagoService {
  private readonly baseUrl = "https://api.mercadopago.com";

  private assertConfigured(requireDevice = true): void {
    if (!env.MP_ACCESS_TOKEN || (requireDevice && !env.MP_POS_DEVICE_ID)) {
      throw new Conflict("Mercado Pago no está configurado (faltan variables de entorno MP_ACCESS_TOKEN o MP_POS_DEVICE_ID).");
    }
  }

  private async pointApiRequest<T>(path: string, init: RequestInit, errorMessage: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Authorization": `Bearer ${env.MP_ACCESS_TOKEN}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`MP Error (${path}):`, errData);
      const mpMessage = errData?.message || response.statusText;
      const mpError = errData?.error || "";
      throw new MpApiError(`${errorMessage}: ${mpMessage} (MP Code: ${mpError})`, mpError, errData);
    }

    return response.json();
  }

  /**
   * Crea la intención de cobro en el Posnet. Si el device ya tiene una
   * intención en cola (error 2205), intenta cancelarla y reintenta UNA sola
   * vez — sin esto, dos cobros seguidos siempre chocan (ver docs/ARCHITECTURE.md §11).
   */
  async createPaymentIntent(amount: number, description?: string): Promise<MpPaymentIntentResponse> {
    this.assertConfigured();

    const attempt = () => this.createPaymentIntentAttempt(amount, description);

    try {
      return await attempt();
    } catch (err) {
      if (!isQueuedIntentError(err)) throw err;

      const queuedIntentId = extractQueuedIntentId(err.mpData);
      if (!queuedIntentId) {
        // No hay forma de recuperar el id de la intención bloqueante: ni el error 2205 lo
        // trae, ni existe (en la doc pública de la Point Integration API) un endpoint para
        // "consultar la intención activa de este device" sin conocerlo de antemano (confirmado
        // contra la doc oficial de Mercado Pago). Se propaga el error tageado como DEVICE_BUSY
        // para que el frontend pueda reintentar/mostrar un estado claro sin parsear texto.
        throw new MpApiError(err.message, err.mpCode, err.mpData, DEVICE_BUSY_CODE);
      }

      try {
        await this.cancelPaymentIntent(queuedIntentId);
      } catch (cancelErr) {
        console.error(`No se pudo cancelar la intención en cola ${queuedIntentId} antes de reintentar:`, cancelErr);
        // se prioriza el error original (2205), más claro para la cajera, pero tageado igual
        throw new MpApiError(err.message, err.mpCode, err.mpData, DEVICE_BUSY_CODE);
      }

      try {
        return await attempt(); // reintento único, no hay loop
      } catch (retryErr) {
        if (isQueuedIntentError(retryErr)) {
          // El auto-cancel+retry no alcanzó (ej. el device volvió a encolar algo entre
          // medio). Se propaga igual tageado para que el frontend sepa que sigue "busy".
          throw new MpApiError(retryErr.message, retryErr.mpCode, retryErr.mpData, DEVICE_BUSY_CODE);
        }
        throw retryErr;
      }
    }
  }

  private createPaymentIntentAttempt(amount: number, description?: string): Promise<MpPaymentIntentResponse> {
    const deviceId = env.MP_POS_DEVICE_ID;

    return this.pointApiRequest<MpPaymentIntentResponse>(
      `/point/integration-api/devices/${deviceId}/payment-intents`,
      {
        method: "POST",
        headers: { "X-Idempotency-Key": randomUUID() },
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          additional_info: {
            external_reference: buildExternalReference(description),
          },
        }),
      },
      "Error al crear la intención de pago en el Posnet",
    );
  }

  async getPayment(paymentId: string): Promise<MpPayment> {
    this.assertConfigured(false);
    return this.pointApiRequest<MpPayment>(
      `/v1/payments/${paymentId}`,
      { method: "GET" },
      "Error al consultar el pago en Mercado Pago",
    );
  }

  async getPaymentIntentStatus(paymentIntentId: string): Promise<MpPaymentIntentResponse & { status: MpNormalizedStatus }> {
    this.assertConfigured(false);

    const data = await this.pointApiRequest<MpPaymentIntentResponse>(
      `/point/integration-api/payment-intents/${paymentIntentId}`,
      { method: "GET" },
      "Error al consultar estado del Posnet en Mercado Pago",
    );

    const rawStatus = data.state || data.status;

    // Estado final: MP no puede confirmar el resultado desde el device. Se resuelve solo
    // consultando el pago real (payment.id) en vez de pedirle a la cajera que mire la pantalla.
    if (rawStatus === "CONFIRMATION_REQUIRED" && data.payment?.id) {
      const payment = await this.getPayment(data.payment.id);
      return { ...data, status: mapPaymentStatusToNormalized(payment.status) };
    }

    return { ...data, status: (rawStatus as MpNormalizedStatus) ?? "PENDING" };
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<MpPaymentIntentResponse> {
    this.assertConfigured();
    const deviceId = env.MP_POS_DEVICE_ID;

    return this.pointApiRequest<MpPaymentIntentResponse>(
      `/point/integration-api/devices/${deviceId}/payment-intents/${paymentIntentId}`,
      { method: "DELETE" },
      "Error al cancelar la intención de pago en el Posnet",
    );
  }

  /**
   * NO IMPLEMENTADO A PROPÓSITO: se investigó (doc pública de Mercado Pago,
   * incluyendo la guía de migración Payment Intent API -> Orders API) si existe
   * un endpoint para "consultar la intención/orden activa de un device sin
   * conocer su id de antemano" y NO existe uno documentado hoy. Tampoco lo
   * resuelve la Orders API nueva (su `POST /v1/orders/{id}/cancel` con header
   * `x-allow-cancelable-status: at_terminal` permite cancelar incluso una orden
   * ya enviada a la terminal, pero igual requiere conocer el {id} de antemano).
   *
   * El único mecanismo oficial para enterarse de una intención zombie sin
   * conocer su id es el topic de webhook "Payment Intent" (distinto del topic
   * "payment"): activándolo en "Tus integraciones" en el panel de Mercado
   * Pago, sus servidores notifican proactivamente el estado/id de la
   * intención. Hoy Cocktrail no tiene webhooks de MP conectados (ver
   * docs/ARCHITECTURE.md §11) — cablear ese topic es la vía recomendada para
   * resolver esto de raíz, pendiente para cuando se aborden webhooks.
   */

  /**
   * Test funcional real (a diferencia de checkDeviceConnection, que solo
   * consulta metadata de vinculación): manda una intención de cobro mínima
   * ($15 — la Point Integration API rechaza montos por debajo de 1500
   * centavos con "amount: Must be greater than or equal to 1500", confirmado
   * contra la API real) al device y espera a que su estado deje de ser
   * "OPEN" — es decir, que el Posnet físico la haya recibido y esté
   * mostrando la pantalla de cobro. Esto detecta el caso real de hoy (device
   * vinculado y en modo PDV, pero con el canal de push a MP colgado) que
   * checkDeviceConnection no puede ver. Cancela la intención de prueba
   * apenas confirma que llegó (o al agotar el timeout), para no dejarla
   * colgada ni cobrar nada real.
   */
  async testDeviceReachability(): Promise<{ reachedDevice: boolean; message: string }> {
    this.assertConfigured();

    let intent: MpPaymentIntentResponse;
    try {
      intent = await this.createPaymentIntent(15, "Prueba de conexion Cocktrail");
    } catch (err) {
      return { reachedDevice: false, message: err instanceof Error ? err.message : "Error al crear la intención de prueba." };
    }

    const intentId = intent.id;
    if (!intentId) {
      return { reachedDevice: false, message: "Mercado Pago no devolvió un id para la intención de prueba." };
    }

    const deadline = Date.now() + 15000;
    let reachedDevice = false;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        const status = await this.getPaymentIntentStatus(intentId);
        if (status.status !== "OPEN") {
          reachedDevice = true;
          break;
        }
      } catch {
        // error transitorio de polling: seguimos intentando hasta el deadline
      }
    }

    try {
      await this.cancelPaymentIntent(intentId);
    } catch (cancelErr) {
      console.error(`No se pudo cancelar la intención de prueba ${intentId}:`, cancelErr);
    }

    return reachedDevice
      ? { reachedDevice: true, message: "El Posnet recibió la prueba correctamente. Listo para cobrar." }
      : { reachedDevice: false, message: "El Posnet no respondió en 15 segundos. Reiniciálo y volvé a probar." };
  }

  async checkDeviceConnection(): Promise<{ connected: boolean; message: string; device?: { model: string; serialNumber: string; operatingMode: string } }> {
    if (!env.MP_ACCESS_TOKEN || !env.MP_POS_DEVICE_ID) {
      return { connected: false, message: "Mercado Pago no está configurado (faltan variables de entorno)." };
    }
    // No usa pointApiRequest: acá un error de red o HTTP no es excepcional, es un estado
    // legítimo ("no conectado") que hay que devolver, no lanzar.
    try {
      const response = await fetch(`${this.baseUrl}/point/integration-api/devices?offset=0&limit=50`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${env.MP_ACCESS_TOKEN}`,
        },
      });
      if (!response.ok) {
        return { connected: false, message: `Mercado Pago API retornó HTTP ${response.status}: ${response.statusText}` };
      }
      const data = await response.json();
      const devices: MpDevice[] = data?.devices || [];
      const matchedDevice = devices.find((d) => d.id === env.MP_POS_DEVICE_ID);
      if (matchedDevice) {
        return {
          connected: true,
          message: "Posnet vinculado y conectado.",
          device: {
            model: matchedDevice.model || "Desconocido",
            serialNumber: matchedDevice.serial_number || "Desconocido",
            operatingMode: matchedDevice.operating_mode || "Desconocido",
          },
        };
      } else {
        return { connected: false, message: `El dispositivo con ID ${env.MP_POS_DEVICE_ID} no está vinculado a esta cuenta de Mercado Pago.` };
      }
    } catch (err: any) {
      return { connected: false, message: `Error de red al conectar con Mercado Pago: ${err.message || err}` };
    }
  }
}
