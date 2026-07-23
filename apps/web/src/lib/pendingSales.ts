/**
 * Constancia de cobros ya VERIFICADOS en Mercado Pago cuyo registro de venta
 * (`POST /api/orders`) todavía no se concretó. Se escribe después del veredicto
 * de cobro confirmado y antes de registrar: si el registro falla (red, backend
 * caído), la plata ya entró y esta entrada evita volver a cobrar o perder el
 * pedido. Desde `cobro-verificado` es un ESPEJO de lo persistido en el server
 * (mp_orders guarda el intent con su carrito): la recuperación real es
 * `POST /pos/intent/:id/resolve`. Patrón espejo de `activeOrder.ts`
 * (localStorage, tolerante a storage roto, SSR-safe).
 */

import { isBrowser } from "@/lib/utils";

const STORAGE_KEY = "cocktrail:pendingSales";

export type PendingSaleBlockedCode = "PAYMENT_REJECTED" | "PAYMENT_UNVERIFIED";

export type PendingSale = {
  id: string;
  createdAt: number;
  paymentMethod: "qr" | "debito";
  /** Referencia en MP: orderId (QR) o intentId (Posnet), para conciliar a mano. */
  mpRef: string;
  /**
   * Tipo de prueba de pago que exige `POST /api/orders`. Opcional por
   * retrocompatibilidad con constancias viejas: si falta se infiere de
   * `paymentMethod` (ver `pendingSaleProofKind`).
   */
  mpKind?: "point_intent" | "qr_order";
  /** Key de replay del registro (el attemptId del intento de cobro). */
  idempotencyKey?: string;
  amount: number;
  items: { drinkId: number; qty: number }[];
  attempts: number;
  lastError?: string;
  /**
   * El server rechazó el REGISTRO con un 409 terminal (PAYMENT_REJECTED /
   * PAYMENT_UNVERIFIED): reintentar no sirve — la constancia queda marcada
   * con el motivo y solo se puede descartar tras verificar a mano.
   */
  blocked?: { code: PendingSaleBlockedCode; reason: string };
};

/** Infiere el `kind` de la prueba de pago para constancias viejas sin `mpKind`. */
export function pendingSaleProofKind(sale: PendingSale): "point_intent" | "qr_order" {
  return sale.mpKind ?? (sale.paymentMethod === "debito" ? "point_intent" : "qr_order");
}

export function listPendingSales(): PendingSale[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filtro mínimo: si alguien pisó la key con basura, no propagar entradas rotas.
    return parsed.filter(
      (s): s is PendingSale =>
        typeof s === "object" && s !== null &&
        typeof (s as PendingSale).id === "string" &&
        Array.isArray((s as PendingSale).items),
    );
  } catch {
    return [];
  }
}

function persist(sales: PendingSale[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sales));
  } catch {
    // QuotaExceeded / SecurityError en modo privado: silenciar.
  }
}

export function addPendingSale(sale: PendingSale): void {
  persist([...listPendingSales(), sale]);
}

export function removePendingSale(id: string): void {
  persist(listPendingSales().filter((s) => s.id !== id));
}

export function updatePendingSale(id: string, patch: Partial<Omit<PendingSale, "id">>): void {
  persist(listPendingSales().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}
