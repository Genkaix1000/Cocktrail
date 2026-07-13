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
  constructor(message: string, readonly mpCode: string, readonly mpData: unknown) {
    super(message);
    this.name = "MpApiError";
  }
}

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
        // "consultar la intención activa de este device" sin conocerlo de antemano. Se
        // propaga el error tal cual para que la cajera vea el mensaje claro de siempre.
        throw err;
      }

      try {
        await this.cancelPaymentIntent(queuedIntentId);
      } catch (cancelErr) {
        console.error(`No se pudo cancelar la intención en cola ${queuedIntentId} antes de reintentar:`, cancelErr);
        throw err; // se prioriza el error original (2205), más claro para la cajera
      }
      return attempt(); // reintento único, no hay loop
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
          // Experimental (ver env.MP_POINT_PAYMENT_TYPE): la doc legacy de Point Integration
          // API documenta un objeto "payment.type" ("credit_card" | "debit_card") pero no
          // confirma si elimina la pantalla intermedia "Tarjetas" del Posnet. Se manda solo
          // si está seteado para no cambiar el comportamiento actual por default.
          ...(env.MP_POINT_PAYMENT_TYPE
            ? { payment: { type: env.MP_POINT_PAYMENT_TYPE, installments: 1 } }
            : {}),
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
