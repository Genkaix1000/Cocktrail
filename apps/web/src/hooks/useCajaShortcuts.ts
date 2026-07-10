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
};

/**
 * Atajos de teclado de la pantalla de venta de caja: Enter resuelve una de
 * cuatro acciones distintas según el estado (agregar el producto resaltado
 * del grid / abrir cobro / confirmar efectivo / nueva venta — nunca más de
 * una a la vez), 1/2/3 eligen método de pago, E carga el monto exacto en
 * efectivo y Espacio repite el "Nueva Venta" de la pantalla de éxito.
 * Mismo patrón que useScannerInput.ts: listener único en window, con
 * guardas de foco para no interferir con inputs de texto.
 */
export function useCajaShortcuts(state: CajaShortcutsState, callbacks: CajaShortcutsCallbacks) {
  const { isCheckoutOpen, paymentMethod, latestOrder, canConfirmCash, totalItems, highlightedGridIndex } = state;
  const { onOpenCheckout, onSelectMethod, onExactAmount, onConfirmCash, onNewSale, onSelectHighlighted } = callbacks;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const isTextInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // Enter siempre se procesa (incluso con foco en el input de monto en
      // efectivo); el resto de los atajos se ignora si se está tipeando.
      if (isTextInput && event.key !== "Enter") return;

      if (event.key === "Enter") {
        if (latestOrder) {
          onNewSale();
        } else if (isCheckoutOpen && paymentMethod === "efectivo" && canConfirmCash) {
          onConfirmCash();
        } else if (!isCheckoutOpen && highlightedGridIndex !== null) {
          onSelectHighlighted();
        } else if (!isCheckoutOpen && totalItems > 0) {
          onOpenCheckout();
        }
        return;
      }

      if (isCheckoutOpen && paymentMethod === null) {
        if (event.key === "1") onSelectMethod("efectivo");
        else if (event.key === "2") onSelectMethod("debito");
        else if (event.key === "3") onSelectMethod("qr");
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
  ]);
}
