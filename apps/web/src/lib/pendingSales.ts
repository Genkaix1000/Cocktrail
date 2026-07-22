/**
 * Constancia write-ahead de cobros ya realizados en Mercado Pago cuyo registro
 * de venta (`POST /api/orders`) todavía no se concretó. Se escribe ANTES de
 * intentar registrar la venta: si el registro falla (red, backend caído), la
 * plata ya entró y esta entrada es lo único que evita volver a cobrar o perder
 * el pedido. Patrón espejo de `activeOrder.ts` (localStorage, tolerante a
 * storage roto, SSR-safe).
 */

const STORAGE_KEY = "cocktrail:pendingSales";

export type PendingSale = {
  id: string;
  createdAt: number;
  paymentMethod: "qr" | "debito";
  /** Referencia en MP: orderId (QR) o intentId (Posnet), para conciliar a mano. */
  mpRef: string;
  amount: number;
  items: { drinkId: number; qty: number }[];
  attempts: number;
  lastError?: string;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
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
