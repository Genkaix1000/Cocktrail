"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  addPendingSale,
  listPendingSales,
  removePendingSale,
  updatePendingSale,
  type PendingSale,
} from "@/lib/pendingSales";
import { ApiError } from "@/services/api-client";
import { mercadopagoService, type MpQrOrderStatus } from "@/services/mercadopago.service";
import { ordersService } from "@/services/orders.service";
import type { Drink, Order, PaymentMethod } from "@cocktrail/shared";

type CartEntry = { drink: Drink; qty: number };

/** Reintentos automáticos ante un device "busy" (2205) antes de darse por vencido y
 * mostrar el error rojo con botón manual. Backoff simple: intento 1 a los 2s, intento 2 a los 4s. */
const MAX_POSNET_BUSY_RETRIES = 2;
const posnetBusyRetryDelayMs = (attempt: number) => attempt * 2000;

/** Gracia sobre el expiresAt del QR antes de cortar el polling: absorbe drift
 * chico de reloj entre la mini-PC y el backend sin dejar el polling infinito. */
const QR_EXPIRY_GRACE_MS = 5000;

/** El cobro en MP salió bien pero `POST /api/orders` falló: mensaje específico
 * (nunca el genérico de polling) — la constancia queda en localStorage. */
const REGISTRO_FALLIDO_MSG =
  "El cobro se realizó correctamente pero no se pudo registrar la venta. Quedó guardada para reintentar — no volvés a cobrar.";

/** Métodos que se cobran vía Posnet. Hoy solo "debito" — el Posnet físico no puede
 * diferenciar un cobro con QR del resto (ver docs/specs/mercadopago/cobro-posnet-mercadopago.md). */
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

  // Ventas ya cobradas en MP cuyo registro (`POST /api/orders`) falló (A11).
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);

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
  // Semilla de idempotencia del intento de cobro QR: una por intento, se REUSA
  // en doble click/reintento (el backend devuelve la misma order) y se resetea
  // al confirmar/cancelar manual/expirar/fallar terminal.
  const paymentAttemptIdRef = useRef<string | null>(null);
  // expiresAt (epoch ms) de la order QR activa, del response del create (A10).
  const qrExpiresAtRef = useRef<number | null>(null);

  useEffect(() => {
    intentIdRef.current = currentIntentId;
  }, [currentIntentId]);

  useEffect(() => {
    // Carga diferida a un effect: en el render de hidratación el server no ve
    // localStorage y renderizar distinto rompería la hidratación.
    setPendingSales(listPendingSales());
  }, []);

  const resetPaymentAttempt = useCallback(() => {
    paymentAttemptIdRef.current = null;
    qrExpiresAtRef.current = null;
  }, []);

  // Best-effort: cancela en el device / MP cualquier intención/order que haya
  // quedado activa cuando se abandona el cobro por afuera del flujo normal.
  const cancelActiveIntent = useCallback(() => {
    const id = intentIdRef.current;
    const kind = activePaymentKindRef.current;
    // Abandonar el cobro invalida el intento en curso: la próxima venta arranca
    // con semilla nueva (reusar la de una order cancelada devolvería esa order).
    paymentAttemptIdRef.current = null;
    qrExpiresAtRef.current = null;
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

  const buildPendingSale = useCallback(
    (method: "qr" | "debito", mpRef: string): PendingSale => ({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      paymentMethod: method,
      mpRef,
      amount: totalPrice,
      items: Object.entries(cart).map(([idStr, qty]) => ({ drinkId: Number(idStr), qty })),
      attempts: 0,
    }),
    [cart, totalPrice],
  );

  /**
   * A11 — registra la venta de un cobro YA hecho en MP. Vive FUERA del
   * try del polling: si `ordersService.create` falla acá el error es "cobrado
   * pero sin registrar" (la constancia queda en localStorage), nunca el
   * genérico de "no se pudo consultar el estado".
   */
  const registerPaidOrder = useCallback(
    async (entry: PendingSale, opts?: { fromRetry?: boolean }): Promise<boolean> => {
      try {
        const order = await ordersService.create({
          items: entry.items,
          paymentMethod: entry.paymentMethod,
        });
        removePendingSale(entry.id);
        setPendingSales(listPendingSales());
        if (!opts?.fromRetry) {
          setLatestOrder(order);
          clearCart();
          setPosnetStatus("idle");
          setPaymentIntentState(null);
          setPosnetErrorMessage(null);
          setQrImage(null);
        }
        return true;
      } catch (err) {
        console.error("Cobro OK pero falló el registro de la venta:", err);
        updatePendingSale(entry.id, {
          attempts: entry.attempts + 1,
          lastError: err instanceof Error ? err.message : "Error desconocido",
        });
        setPendingSales(listPendingSales());
        if (!opts?.fromRetry) {
          setPosnetStatus("error");
          setPaymentIntentState(null);
          setQrImage(null);
          setPosnetErrorMessage(REGISTRO_FALLIDO_MSG);
        }
        return false;
      }
    },
    [clearCart],
  );

  /** Reintenta desde el banner el registro de una venta cobrada sin registrar. */
  const retryPendingSale = useCallback(
    (id: string): Promise<boolean> => {
      const entry = listPendingSales().find((s) => s.id === id);
      if (!entry) {
        setPendingSales(listPendingSales());
        return Promise.resolve(false);
      }
      return registerPaidOrder(entry, { fromRetry: true });
    },
    [registerPaidOrder],
  );

  /** Descarta la constancia. La confirmación explícita es responsabilidad de la UI. */
  const discardPendingSale = useCallback((id: string) => {
    removePendingSale(id);
    setPendingSales(listPendingSales());
  }, []);

  const startPolling = useCallback((intentId: string, method: PosnetMethod) => {
    stopPolling();
    activePaymentKindRef.current = "posnet";

    pollingRef.current = setInterval(async () => {
      let currentState: string;
      try {
        const st = await mercadopagoService.getPosIntentStatus(intentId);
        currentState = st.status;
      } catch (err) {
        console.error("Error polling MP status:", err);
        stopPolling();
        setPosnetStatus("error");
        setCurrentIntentId(null);
        activePaymentKindRef.current = null;
        setPaymentIntentState(null);
        setPosnetErrorMessage("Error al consultar el estado del cobro. Verificá la conexión.");
        return;
      }
      if (currentState) {
        setPaymentIntentState(currentState);
      }

      if (currentState === "FINISHED") {
        // El cobro ya está hecho: soltar toda referencia al intent ANTES de
        // registrar la venta, para que un unmount/cancel no cancele en MP un
        // cobro concretado.
        stopPolling();
        setCurrentIntentId(null);
        intentIdRef.current = null;
        activePaymentKindRef.current = null;
        const entry = buildPendingSale(method, intentId);
        addPendingSale(entry);
        setPendingSales(listPendingSales());
        await registerPaidOrder(entry);
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
    }, 3000);
  }, [buildPendingSale, registerPaidOrder, stopPolling]);

  const startQrPolling = useCallback((orderId: string) => {
    stopPolling();
    activePaymentKindRef.current = "qr";

    pollingRef.current = setInterval(async () => {
      // A10 — el QR venció (con gracia): cortar ANTES de pegarle al backend.
      // Sin esto, un status raro ("unknown") dejaría el polling girando infinito.
      const expiresAt = qrExpiresAtRef.current;
      if (expiresAt !== null && Date.now() > expiresAt + QR_EXPIRY_GRACE_MS) {
        stopPolling();
        resetPaymentAttempt();
        setCurrentIntentId(null);
        intentIdRef.current = null;
        activePaymentKindRef.current = null;
        // Best-effort: si MP no responde, la order igual muere sola por expiración.
        Promise.resolve(mercadopagoService.cancelQrOrder(orderId)).catch(() => {});
        setPosnetStatus("error");
        setPaymentIntentState(null);
        setQrImage(null);
        setPosnetErrorMessage("El QR expiró sin que se registrara el pago. Generá uno nuevo.");
        return;
      }

      let status: MpQrOrderStatus;
      try {
        const st = await mercadopagoService.getQrOrderStatus(orderId);
        status = st.status;
      } catch (err) {
        console.error("Error polling QR order status:", err);
        stopPolling();
        setPosnetStatus("error");
        setCurrentIntentId(null);
        activePaymentKindRef.current = null;
        setPaymentIntentState(null);
        setQrImage(null);
        setPosnetErrorMessage("Error al consultar el estado del cobro QR. Verificá la conexión.");
        return;
      }

      if (status) {
        setPaymentIntentState(status);
      }

      if (status === "processed") {
        // Cobro concretado: soltar toda referencia a la order ANTES de registrar
        // la venta, para que un unmount/cancel no cancele en MP un cobro hecho.
        stopPolling();
        resetPaymentAttempt();
        setCurrentIntentId(null);
        intentIdRef.current = null;
        activePaymentKindRef.current = null;
        const entry = buildPendingSale("qr", orderId);
        addPendingSale(entry);
        setPendingSales(listPendingSales());
        await registerPaidOrder(entry);
      } else if (status === "failed" || status === "canceled" || status === "expired") {
        stopPolling();
        resetPaymentAttempt();
        setPosnetStatus("error");
        setCurrentIntentId(null);
        activePaymentKindRef.current = null;
        setPaymentIntentState(null);
        setQrImage(null);
        setPosnetErrorMessage(
          status === "failed"
            ? "El cobro falló en Mercado Pago."
            : status === "expired"
              ? "La order QR expiró. Volvé a intentar el cobro."
              : "cancelled_by_device",
        );
      }
      // "created" | "action_required" | "unknown" (y "refunded"): el polling
      // sigue — "unknown" queda acotado por el expiresAt y la UI lo muestra
      // como advertencia, nunca como "pendiente".
    }, 3000);
  }, [buildPendingSale, registerPaidOrder, resetPaymentAttempt, stopPolling]);

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
    // Semilla de idempotencia: si ya hay una viva (doble click, reintento tras
    // corte de red) se REUSA — el backend devuelve la misma order en vez de
    // crear un segundo cobro. Nace una nueva recién después de un reset.
    if (!paymentAttemptIdRef.current) {
      paymentAttemptIdRef.current = crypto.randomUUID();
    }
    const idempotencyKey = paymentAttemptIdRef.current;
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
        { idempotencyKey },
      );
      setCurrentIntentId(created.orderId);
      setQrImage(created.qrImage);
      const expiresAtMs = Date.parse(created.expiresAt);
      qrExpiresAtRef.current = Number.isNaN(expiresAtMs) ? null : expiresAtMs;
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
    pendingSales,
    retryPendingSale,
    discardPendingSale,
    resetPaymentAttempt,
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
