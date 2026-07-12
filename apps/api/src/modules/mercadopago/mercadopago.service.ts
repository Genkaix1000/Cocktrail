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
      throw new Conflict(`${errorMessage}: ${mpMessage} (MP Code: ${mpError})`);
    }

    return response.json();
  }

  async createPaymentIntent(amount: number): Promise<MpPaymentIntentResponse> {
    this.assertConfigured();
    const deviceId = env.MP_POS_DEVICE_ID;

    return this.pointApiRequest<MpPaymentIntentResponse>(
      `/point/integration-api/devices/${deviceId}/payment-intents`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          additional_info: {
            external_reference: "Cobro Cocktrail"
          }
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
