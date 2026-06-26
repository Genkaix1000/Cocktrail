import { env } from "../../config/env.js";
import { Conflict } from "../../shared/errors/http-errors.js";

export class MercadoPagoService {
  private readonly baseUrl = "https://api.mercadopago.com";

  async createPaymentIntent(amount: number, description: string) {
    if (!env.MP_ACCESS_TOKEN || !env.MP_POS_DEVICE_ID) {
      throw new Conflict("Mercado Pago no está configurado (faltan variables de entorno MP_ACCESS_TOKEN o MP_POS_DEVICE_ID).");
    }

    const deviceId = env.MP_POS_DEVICE_ID;
    
    const response = await fetch(`${this.baseUrl}/point/integration-api/devices/${deviceId}/payment-intents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        additional_info: {
          external_reference: "Cobro Cocktrail"
        }
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("MP Error creating intent:", errData);
      const mpMessage = errData?.message || response.statusText;
      const mpError = errData?.error || "";
      throw new Conflict(`Error al crear la intención de pago en el Posnet: ${mpMessage} (MP Code: ${mpError})`);
    }

    const data = await response.json();
    return data; 
  }

  async getPaymentIntentStatus(paymentIntentId: string) {
    if (!env.MP_ACCESS_TOKEN) {
      throw new Conflict("Falta configurar MP_ACCESS_TOKEN.");
    }

    const response = await fetch(`${this.baseUrl}/point/integration-api/payment-intents/${paymentIntentId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${env.MP_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("MP Error fetching intent status:", errData);
      throw new Conflict("Error al consultar estado del Posnet en Mercado Pago");
    }

    const data = await response.json();
    return {
      ...data,
      status: data.state || data.status,
    };
  }

  async cancelPaymentIntent(paymentIntentId: string) {
    if (!env.MP_ACCESS_TOKEN || !env.MP_POS_DEVICE_ID) {
      throw new Conflict("Falta configurar MP_ACCESS_TOKEN o MP_POS_DEVICE_ID.");
    }

    const deviceId = env.MP_POS_DEVICE_ID;

    const response = await fetch(`${this.baseUrl}/point/integration-api/devices/${deviceId}/payment-intents/${paymentIntentId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${env.MP_ACCESS_TOKEN}`,
      },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("MP Error canceling intent:", errData);
      throw new Conflict(`Error al cancelar la intención de pago en el Posnet: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  async checkDeviceConnection(): Promise<{ connected: boolean; message: string; device?: any }> {
    if (!env.MP_ACCESS_TOKEN || !env.MP_POS_DEVICE_ID) {
      return { connected: false, message: "Mercado Pago no está configurado (faltan variables de entorno)." };
    }
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
      const devices = data?.devices || [];
      const matchedDevice = devices.find((d: any) => d.id === env.MP_POS_DEVICE_ID);
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
