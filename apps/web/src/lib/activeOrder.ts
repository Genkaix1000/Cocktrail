/**
 * Persistencia client-side del pedido activo del cliente. Sin DB en MVP, la
 * única forma de que un cliente que vuelve a /carta pueda recuperar su pedido
 * pendiente es esto.
 */

import { isBrowser } from "@/lib/utils";

const STORAGE_KEY = "cocktrail:lastOrder";

export type ActiveOrderRef = {
  token: string;
  displayNumber: number;
  createdAt: number;
};

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
