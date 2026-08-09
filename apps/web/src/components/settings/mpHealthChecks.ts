import type { MpHealth } from "@/services/mercadopago.service";

export const MP_HEALTH_CHECK_LABELS: Record<keyof MpHealth["checks"], string> = {
  singleSeller: "Cuenta de Mercado Pago",
  deviceOwnership: "Posnet en la cuenta activa",
  deviceMode: "Modo del lector (PDV)",
  cajaProvisioned: "Caja provisionada",
};

export const MP_HEALTH_CHECK_ORDER: (keyof MpHealth["checks"])[] = [
  "singleSeller",
  "cajaProvisioned",
  "deviceOwnership",
  "deviceMode",
];
