"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/services/api-client";
import { mercadopagoService } from "@/services/mercadopago.service";
import { ordersService } from "@/services/orders.service";
import type { Drink, Order, PaymentMethod } from "@cocktrail/shared";

type CartEntry = { drink: Drink; qty: number };

/** Métodos que se cobran vía Posnet. Hoy solo "debito" — el Posnet físico no puede
 * diferenciar un cobro con QR del resto (ver docs/specs/cobro-posnet-mercadopago.md). */
type PosnetMethod = Exclude<PaymentMethod, "efectivo" | "qr">;

type UseCheckoutArgs = {
  cart: Record<number, number>;
  cartEntries: CartEntry[];
  totalPrice: number;
  totalItems: number;
  clearCart: () => void;
};

/**
 * Estado y lógica de checkout/pagos de la Terminal de Caja: selección de
 * método, cobro en efectivo, cobro Posnet (Mercado Pago) con polling de la
 * intención de cobro, y el pedido recién concretado para la pantalla de
 * éxito. Extraído de CajaClient.tsx sin cambios de comportamiento.
 *
 * Nota: `confirmOrderWithMethod` (código muerto, sin callers en el archivo
 * original — confirmado con grep) no se migró.
 */
export function useCheckout({ cart, cartEntries, totalPrice, totalItems, clearCart }: UseCheckoutArgs) {
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [receivedAmount, setReceivedAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [posnetStatus, setPosnetStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [currentIntentId, setCurrentIntentId] = useState<string | null>(null);
  const [paymentIntentState, setPaymentIntentState] = useState<string | null>(null);
  const [posnetErrorMessage, setPosnetErrorMessage] = useState<string | null>(null);

  // Pedido recién concretado (para mostrar en pantalla de éxito)
  const [latestOrder, setLatestOrder] = useState<Order | null>(null);

  // Estado de venta
  const [saleError, setSaleError] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isSubmittingRef = useRef(false);
  // Espejo de currentIntentId accesible desde closures que no pueden depender
  // del state (cleanup de unmount) sin re-suscribirse en cada cambio.
  const intentIdRef = useRef<string | null>(null);

  useEffect(() => {
    intentIdRef.current = currentIntentId;
  }, [currentIntentId]);

  // Best-effort: cancela en el device cualquier intención que haya quedado
  // activa (no confirmada/no cerrada) cuando se abandona el cobro por afuera
  // del flujo normal de éxito/cancelación explícita — cerrar el modal a mitad
  // de camino, recargar la página, navegar a otra pantalla. Sin esto el
  // device queda con la intención en cola y el próximo cobro tira 2205.
  const cancelActiveIntent = useCallback(() => {
    const id = intentIdRef.current;
    if (!id) return;
    intentIdRef.current = null;
    Promise.resolve(mercadopagoService.cancelPosIntent(id)).catch((err) => {
      console.error("No se pudo cancelar la intención de pago abandonada:", err);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      cancelActiveIntent();
    };
  }, [cancelActiveIntent]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Formateador de efectivo
  const handleChangeCash = useCallback((val: string) => {
    const clean = val.replace(/\D/g, ""); // dejar solo dígitos
    setReceivedAmount(clean);
  }, []);

  const displayCashValue = receivedAmount ? Number(receivedAmount).toLocaleString("es-AR") : "";
  const receivedNum = Number(receivedAmount);
  const change = receivedNum - totalPrice;
  const canConfirmCash = receivedAmount !== "" && change >= 0;

  const handleOpenCheckout = useCallback(() => {
    // Si quedó una intención activa de un cobro anterior sin cerrar (ej. la
    // cajera abrió y abandonó un cobro Posnet sin pasar por el botón X ni
    // Escape), cancelarla antes de resetear el estado — si no, el device
    // queda en cola y el próximo createPosIntent tira 2205.
    cancelActiveIntent();
    setIsCheckoutOpen(true);
    setPaymentMethod(null);
    setReceivedAmount("");
    setPosnetStatus("idle");
    setCurrentIntentId(null);
    setLatestOrder(null);
    stopPolling();
  }, [stopPolling, cancelActiveIntent]);

  const confirmOrder = useCallback(async () => {
    if (isSubmittingRef.current || submitting || totalItems === 0 || !paymentMethod) return;
    if (paymentMethod === "efectivo" && !canConfirmCash) return;

    isSubmittingRef.current = true;
    setSubmitting(true);
    setSaleError(null);
    try {
      const items = Object.entries(cart).map(([idStr, qty]) => ({ drinkId: Number(idStr), qty }));
      const order = await ordersService.create({ items, paymentMethod });

      setLatestOrder(order);
      clearCart();
      return order;
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : "No se pudo registrar la venta.");
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }, [cart, canConfirmCash, clearCart, paymentMethod, submitting, totalItems]);

  const startPolling = useCallback((intentId: string, method: PosnetMethod) => {
    stopPolling();

    pollingRef.current = setInterval(async () => {
      try {
        const st = await mercadopagoService.getPosIntentStatus(intentId);
        const currentState = st.status;
        if (currentState) {
          setPaymentIntentState(currentState);
        }

        if (currentState === "FINISHED") {
          stopPolling();
          const items = Object.entries(cart).map(([idStr, qty]) => ({ drinkId: Number(idStr), qty }));
          const order = await ordersService.create({ items, paymentMethod: method });
          setLatestOrder(order);
          clearCart();
          setPosnetStatus("idle");
          setCurrentIntentId(null);
          setPaymentIntentState(null);
          setPosnetErrorMessage(null);
        } else if (currentState === "CANCELED") {
          stopPolling();
          setPosnetStatus("error");
          setCurrentIntentId(null);
          setPaymentIntentState(null);
          // Sentinel (no un mensaje de error real, ver "busy_device" más arriba): la
          // cajera o el cliente cancelaron a propósito desde el dispositivo — no es una
          // falla del sistema, así que la UI lo muestra distinto de un error genérico.
          setPosnetErrorMessage("cancelled_by_device");
        }
      } catch (err) {
        console.error("Error polling MP status:", err);
        stopPolling();
        setPosnetStatus("error");
        setCurrentIntentId(null);
        setPaymentIntentState(null);
        setPosnetErrorMessage("Error al consultar el estado del cobro. Verificá la conexión.");
      }
    }, 3000);
  }, [cart, clearCart, stopPolling]);

  const startPosnetPayment = useCallback(async (method: PosnetMethod) => {
    if (isSubmittingRef.current || submitting || totalItems === 0) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setPaymentMethod(method);
    setPosnetStatus("connecting");
    setPaymentIntentState("CREATING");
    setPosnetErrorMessage(null);
    try {
      const drinksText = cartEntries.map((e) => `${e.drink.name} x${e.qty}`).join(", ");
      const intent = await mercadopagoService.createPosIntent(totalPrice, drinksText || "Cobro Cocktrail");
      setCurrentIntentId(intent.id);
      setPaymentIntentState("OPEN");

      startPolling(intent.id, method);
    } catch (err) {
      console.warn("Error creating MP intent (handled):", err);
      const message = err instanceof Error ? err.message : undefined;
      const dataError = err instanceof ApiError && err.data && typeof err.data === "object"
        ? (err.data as { error?: string }).error
        : undefined;
      const errString = String(err);
      const isAlreadyQueued = err instanceof ApiError && err.status === 409 && (
        message?.includes("queued intent") ||
        message?.includes("2205") ||
        dataError?.includes("queued intent") ||
        dataError?.includes("2205") ||
        errString.includes("queued intent") ||
        errString.includes("2205")
      );

      setPosnetStatus("error");
      setCurrentIntentId(null);
      setPaymentIntentState(null);
      if (isAlreadyQueued) {
        setPosnetErrorMessage("busy_device");
      } else {
        setPosnetErrorMessage(message || "Error al iniciar cobro con Posnet. Verifique la conexión o configuración.");
      }
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }, [cartEntries, startPolling, submitting, totalItems, totalPrice]);

  return {
    isCheckoutOpen,
    setIsCheckoutOpen,
    paymentMethod,
    setPaymentMethod,
    receivedAmount,
    submitting,
    posnetStatus,
    setPosnetStatus,
    currentIntentId,
    setCurrentIntentId,
    paymentIntentState,
    setPaymentIntentState,
    posnetErrorMessage,
    setPosnetErrorMessage,
    latestOrder,
    saleError,
    displayCashValue,
    receivedNum,
    change,
    canConfirmCash,
    handleChangeCash,
    handleOpenCheckout,
    confirmOrder,
    startPolling,
    stopPolling,
    startPosnetPayment,
  };
}

