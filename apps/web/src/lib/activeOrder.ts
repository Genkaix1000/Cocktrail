/**
 * Persistencia client-side del pedido activo del cliente. Sin DB en MVP, la
 * única forma de que un cliente que vuelve a /carta pueda recuperar su pedido
 * pendiente es esto.
 */

const STORAGE_KEY = "cocktrail:lastOrder";

export type ActiveOrderRef = {
  token: string;
  displayNumber: number;
  createdAt: number;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readActiveOrder(): ActiveOrderRef | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveOrderRef>;
    if (
      typeof parsed.token === "string" &&
      typeof parsed.displayNumber === "number" &&
      typeof parsed.createdAt === "number"
    ) {
      return parsed as ActiveOrderRef;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveActiveOrder(ref: ActiveOrderRef): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ref));
  } catch {
    // QuotaExceeded / SecurityError en modo privado: silenciar.
  }
}

export function clearActiveOrder(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignorar
  }
}
