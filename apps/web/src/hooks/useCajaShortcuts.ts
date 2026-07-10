"use client";

import { useEffect } from "react";

import type { Order, PaymentMethod } from "@cocktrail/shared";

type CajaShortcutsState = {
  isCheckoutOpen: boolean;
  paymentMethod: PaymentMethod | null;
  latestOrder: Order | null;
  canConfirmCash: boolean;
  totalItems: number;
  highlightedGridIndex: number | null;
};

type CajaShortcutsCallbacks = {
  onOpenCheckout: () => void;
  onSelectMethod: (method: PaymentMethod) => void;
  onExactAmount: () => void;
  onConfirmCash: () => void;
  onNewSale: () => void;
  onSelectHighlighted: () => void;
  onEscape: () => void;
};

/**
 * Atajos de teclado de la pantalla de venta de caja: Enter resuelve una de
 * tres acciones según el estado (agregar el producto resaltado del grid /
 * confirmar efectivo / nueva venta — nunca más de una a la vez), C abre el
 * cobro (separado de Enter a propósito: si el grid tiene un producto
 * resaltado, Enter siempre lo agrega, así que abrir el cobro necesita su
 * propia tecla en vez de competir con esa acción), 1/2/3 eligen método de
 * pago, E carga el monto exacto en efectivo, Escape retrocede un paso en
 * el checkout y Espacio repite el "Nueva Venta" de la pantalla de éxito.
 * Mismo patrón que useScannerInput.ts: listener único en window, con
 * guardas de foco para no interferir con inputs de texto. `onEscape`
 * decide qué significa "retroceder" según el estado — esa lógica vive en
 * el componente porque depende de campos de Posnet que este hook no
 * necesita conocer.
 */
export function useCajaShortcuts(state: CajaShortcutsState, callbacks: CajaShortcutsCallbacks) {
  const { isCheckoutOpen, paymentMethod, latestOrder, canConfirmCash, totalItems, highlightedGridIndex } = state;
  const { onOpenCheckout, onSelectMethod, onExactAmount, onConfirmCash, onNewSale, onSelectHighlighted, onEscape } = callbacks;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const isTextInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Enter y Escape siempre se procesan (incluso con foco en el input de
      // monto en efectivo); el resto de los atajos se ignora si se está
      // tipeando.
      if (isTextInput && event.key !== "Enter" && event.key !== "Escape") return;

      if (event.key === "Enter") {
        if (latestOrder) {
          onNewSale();
        } else if (isCheckoutOpen && paymentMethod === "efectivo" && canConfirmCash) {
          onConfirmCash();
        } else if (!isCheckoutOpen && highlightedGridIndex !== null) {
          onSelectHighlighted();
        }
        return;
      }

      if (event.key === "Escape") {
        onEscape();
        return;
      }

      if (isCheckoutOpen && paymentMethod === null) {
        if (event.key === "1") onSelectMethod("efectivo");
        else if (event.key === "2") onSelectMethod("debito");
        else if (event.key === "3") onSelectMethod("qr");
        return;
      }

      if (event.key.toLowerCase() === "c" && !isCheckoutOpen && totalItems > 0) {
        onOpenCheckout();
        return;
      }

      if (event.key.toLowerCase() === "e" && isCheckoutOpen && paymentMethod === "efectivo") {
        onExactAmount();
        return;
      }

      if (event.key === " " && latestOrder) {
        event.preventDefault();
        onNewSale();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isCheckoutOpen,
    paymentMethod,
    latestOrder,
    canConfirmCash,
    totalItems,
    highlightedGridIndex,
    onOpenCheckout,
    onSelectMethod,
    onExactAmount,
    onConfirmCash,
    onNewSale,
    onSelectHighlighted,
    onEscape,
  ]);
}
