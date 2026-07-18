"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/services/api-client";
import { mercadopagoService } from "@/services/mercadopago.service";
import { ordersService } from "@/services/orders.service";
import type { Drink, Order, PaymentMethod } from "@cocktrail/shared";

type CartEntry = { drink: Drink; qty: number };

/** Reintentos automáticos ante un device "busy" (2205) antes de darse por vencido y
 * mostrar el error rojo con botón manual. Backoff simple: intento 1 a los 2s, intento 2 a los 4s. */
const MAX_POSNET_BUSY_RETRIES = 2;
const posnetBusyRetryDelayMs = (attempt: number) => attempt * 2000;

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
 * intención de cobro, cobro QR estático (Fase 4), y el pedido recién
 * concretado para la pantalla de éxito.
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
  const [posnetRetryAttempt, setPosnetRetryAttempt] = useState(0);
  const [qrImage, setQrImage] = useState<string | null>(null);

  // Pedido recién concretado (para mostrar en pantalla de éxito)
  const [latestOrder, setLatestOrder] = useState<Order | null>(null);

  // Estado de venta
  const [saleError, setSaleError] = useState<string | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isSubmittingRef = useRef(false);
  // Espejo de currentIntentId accesible desde closures que no pueden depender
  // del state (cleanup de unmount) sin re-suscribirse en cada cambio.
  const intentIdRef = useRef<string | null>(null);
  // Distingue Posnet vs QR para el cleanup de abandono (cancel endpoints distintos).
  const activePaymentKindRef = useRef<"posnet" | "qr" | null>(null);
  // Contador de reintentos ante device busy (2205) y su timer de backoff, para poder
  // cancelarlo si se cierra/reabre el modal o se desmonta el componente a mitad de camino.
  const posnetRetryCountRef = useRef(0);
  const posnetRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    intentIdRef.current = currentIntentId;
  }, [currentIntentId]);

  // Best-effort: cancela en el device / MP cualquier intención/order que haya
  // quedado activa cuando se abandona el cobro por afuera del flujo normal.
  const cancelActiveIntent = useCallback(() => {
    const id = intentIdRef.current;
    const kind = activePaymentKindRef.current;
    if (!id) return;
    intentIdRef.current = null;
    activePaymentKindRef.current = null;
    if (kind === "qr") {
      Promise.resolve(mercadopagoService.cancelQrOrder(id)).catch((err) => {
        console.error("No se pudo cancelar la order QR abandonada:", err);
      });
      return;
    }
    Promise.resolve(mercadopagoService.cancelPosIntent(id)).catch((err) => {
      console.error("No se pudo cancelar la intención de pago abandonada:", err);
    });
  }, []);

  const stopPosnetRetry = useCallback(() => {
    if (posnetRetryTimeoutRef.current) {
      clearTimeout(posnetRetryTimeoutRef.current);
      posnetRetryTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      stopPosnetRetry();
      cancelActiveIntent();
    };
  }, [cancelActiveIntent, stopPosnetRetry]);

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
    // Si quedó una intención/order activa de un cobro anterior sin cerrar,
    // cancelarla antes de resetear el estado.
    cancelActiveIntent();
    stopPosnetRetry();
    posnetRetryCountRef.current = 0;
    setPosnetRetryAttempt(0);
    setIsCheckoutOpen(true);
    setPaymentMethod(null);
    setReceivedAmount("");
    setPosnetStatus("idle");
    setCurrentIntentId(null);
    setQrImage(null);
    setLatestOrder(null);
    stopPolling();
  }, [stopPolling, cancelActiveIntent, stopPosnetRetry]);

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
    activePaymentKindRef.current = "posnet";

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
          activePaymentKindRef.current = null;
          setPaymentIntentState(null);
          setPosnetErrorMessage(null);
        } else if (currentState === "CANCELED") {
          stopPolling();
          setPosnetStatus("error");
          setCurrentIntentId(null);
          activePaymentKindRef.current = null;
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
        activePaymentKindRef.current = null;
        setPaymentIntentState(null);
        setPosnetErrorMessage("Error al consultar el estado del cobro. Verificá la conexión.");
      }
    }, 3000);
  }, [cart, clearCart, stopPolling]);

  const startQrPolling = useCallback((orderId: string) => {
    stopPolling();
    activePaymentKindRef.current = "qr";

    pollingRef.current = setInterval(async () => {
      try {
        const st = await mercadopagoService.getQrOrderStatus(orderId);
        if (st.status) {
          setPaymentIntentState(st.status);
        }

        if (st.status === "processed") {
          stopPolling();
          const items = Object.entries(cart).map(([idStr, qty]) => ({ drinkId: Number(idStr), qty }));
          const order = await ordersService.create({ items, paymentMethod: "qr" });
          setLatestOrder(order);
          clearCart();
          setPosnetStatus("idle");
          setCurrentIntentId(null);
          activePaymentKindRef.current = null;
          setPaymentIntentState(null);
          setPosnetErrorMessage(null);
          setQrImage(null);
        } else if (st.status === "canceled" || st.status === "expired") {
          stopPolling();
          setPosnetStatus("error");
          setCurrentIntentId(null);
          activePaymentKindRef.current = null;
          setPaymentIntentState(null);
          setQrImage(null);
          setPosnetErrorMessage(
            st.status === "expired"
              ? "La order QR expiró. Volvé a intentar el cobro."
              : "cancelled_by_device",
          );
        }
      } catch (err) {
        console.error("Error polling QR order status:", err);
        stopPolling();
        setPosnetStatus("error");
        setCurrentIntentId(null);
        activePaymentKindRef.current = null;
        setPaymentIntentState(null);
        setQrImage(null);
        setPosnetErrorMessage("Error al consultar el estado del cobro QR. Verificá la conexión.");
      }
    }, 3000);
  }, [cart, clearCart, stopPolling]);

  const startPosnetPayment = useCallback(async (method: PosnetMethod, opts?: { isAutoRetry?: boolean }) => {
    if (isSubmittingRef.current || submitting || totalItems === 0) return;
    if (!opts?.isAutoRetry) {
      // Intento "fresco" (botón inicial o "Reintentar" manual): arrancar contador de nuevo.
      stopPosnetRetry();
      posnetRetryCountRef.current = 0;
      setPosnetRetryAttempt(0);
    }
    isSubmittingRef.current = true;
    setSubmitting(true);
    setPaymentMethod(method);
    setPosnetStatus("connecting");
    setPaymentIntentState("CREATING");
    setPosnetErrorMessage(null);
    setQrImage(null);
    try {
      const drinksText = cartEntries.map((e) => `${e.drink.name} x${e.qty}`).join(", ");
      const intent = await mercadopagoService.createPosIntent(totalPrice, drinksText || "Cobro Cocktrail");
      setCurrentIntentId(intent.id);
      setPaymentIntentState("OPEN");
      posnetRetryCountRef.current = 0;
      setPosnetRetryAttempt(0);

      startPolling(intent.id, method);
    } catch (err) {
      console.warn("Error creating MP intent (handled):", err);
      const message = err instanceof Error ? err.message : undefined;
      const dataCode = err instanceof ApiError && err.data && typeof err.data === "object"
        ? (err.data as { code?: string }).code
        : undefined;
      const dataError = err instanceof ApiError && err.data && typeof err.data === "object"
        ? (err.data as { error?: string }).error
        : undefined;
      const errString = String(err);
      // El backend hoy tagea esto como `code: "DEVICE_BUSY"` (ver mercadopago.service.ts); el
      // match por texto queda de fallback por si corre contra un backend viejo sin el campo.
      const isAlreadyQueued = err instanceof ApiError && err.status === 409 && (
        dataCode === "DEVICE_BUSY" ||
        message?.includes("queued intent") ||
        message?.includes("2205") ||
        dataError?.includes("queued intent") ||
        dataError?.includes("2205") ||
        errString.includes("queued intent") ||
        errString.includes("2205")
      );

      setCurrentIntentId(null);
      activePaymentKindRef.current = null;
      setPaymentIntentState(null);

      if (isAlreadyQueued && posnetRetryCountRef.current < MAX_POSNET_BUSY_RETRIES) {
        // Reintento automático con backoff antes de darse por vencido: la intención en
        // cola en el device suele liberarse sola en unos segundos.
        const attemptNumber = posnetRetryCountRef.current + 1;
        posnetRetryCountRef.current = attemptNumber;
        setPosnetRetryAttempt(attemptNumber);
        setPosnetStatus("error");
        setPosnetErrorMessage("busy_device");
        posnetRetryTimeoutRef.current = setTimeout(() => {
          startPosnetPayment(method, { isAutoRetry: true });
        }, posnetBusyRetryDelayMs(attemptNumber));
      } else if (isAlreadyQueued) {
        // Se agotaron los reintentos automáticos: ya no es ambiguo, es un error real que
        // necesita intervención (la cajera decide reintentar de nuevo o cancelar).
        setPosnetStatus("error");
        setPosnetErrorMessage("busy_device_exhausted");
      } else {
        setPosnetStatus("error");
        setPosnetErrorMessage(message || "Error al iniciar cobro con Posnet. Verifique la conexión o configuración.");
      }
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }, [cartEntries, startPolling, stopPosnetRetry, submitting, totalItems, totalPrice]);

  const startQrPayment = useCallback(async () => {
    if (isSubmittingRef.current || submitting || totalItems === 0) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setPaymentMethod("qr");
    setPosnetStatus("connecting");
    setPaymentIntentState("created");
    setPosnetErrorMessage(null);
    setQrImage(null);
    try {
      const drinksText = cartEntries.map((e) => `${e.drink.name} x${e.qty}`).join(", ");
      const created = await mercadopagoService.createQrOrder(
        totalPrice,
        drinksText || "Cobro Cocktrail",
      );
      setCurrentIntentId(created.orderId);
      setQrImage(created.qrImage);
      setPaymentIntentState("created");
      startQrPolling(created.orderId);
    } catch (err) {
      console.warn("Error creating QR order (handled):", err);
      const message = err instanceof Error ? err.message : undefined;
      setCurrentIntentId(null);
      activePaymentKindRef.current = null;
      setPaymentIntentState(null);
      setQrImage(null);
      setPosnetStatus("error");
      setPosnetErrorMessage(message || "Error al iniciar cobro con QR. Verificá que el PDV esté provisionado.");
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }, [cartEntries, startQrPolling, submitting, totalItems, totalPrice]);

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
    posnetRetryAttempt,
    qrImage,
    setQrImage,
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
    startQrPayment,
    stopPosnetRetry,
  };
}
