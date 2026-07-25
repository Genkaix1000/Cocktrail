"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  addPendingSale,
  listPendingSales,
  pendingSaleProofKind,
  removePendingSale,
  updatePendingSale,
  type PendingSale,
} from "@/lib/pendingSales";
import { randomId } from "@/lib/utils";
import { ApiError } from "@/services/api-client";
import {
  mercadopagoService,
  type MpQrOrderStatus,
  type PosIntentVerdict,
} from "@/services/mercadopago.service";
import { ordersService } from "@/services/orders.service";
import type { Drink, Order, PaymentMethod } from "@cocktrail/shared";

type CartEntry = { drink: Drink; qty: number };

/** Reintentos automáticos ante un device "busy" (2205) antes de darse por vencido y
 * mostrar el error rojo con botón manual. Backoff simple: intento 1 a los 2s, intento 2 a los 4s. */
const MAX_POSNET_BUSY_RETRIES = 2;
const posnetBusyRetryDelayMs = (attempt: number) => attempt * 2000;

/** Gracia sobre el expiresAt (QR y Posnet) antes de cortar el polling: absorbe
 * drift chico de reloj entre la mini-PC y el backend sin dejar el polling
 * infinito. Defensa en profundidad: la autoridad del deadline es el server. */
const EXPIRY_GRACE_MS = 5000;

/** El cobro en MP salió bien pero `POST /api/orders` falló: mensaje específico
 * (nunca el genérico de polling) — la constancia queda en localStorage. */
const REGISTRO_FALLIDO_MSG =
  "El cobro se realizó correctamente pero no se pudo registrar la venta. Quedó guardada para reintentar — no volvés a cobrar.";

/** El backend no pudo confirmar el cobro contra MP: nunca se trata como cobrado (D1). */
const COBRO_NO_CONFIRMADO_MSG =
  "No se pudo confirmar el cobro — verificá en el panel de Mercado Pago antes de reintentar. No entregues el producto hasta confirmarlo.";

/** Motivos de rechazo de MP (statusDetail) con mensaje accionable para la cajera. */
const POSNET_RECHAZO_POR_DETALLE: Record<string, string> = {
  cc_rejected_insufficient_amount:
    "Tarjeta rechazada: fondos insuficientes — pedile al cliente otro medio de pago",
  // Descubierto en vivo (23-07): el dueño pagándose con su propia tarjeta da
  // este código genérico — MP no permite pagarse a uno mismo.
  cc_rejected_other_reason:
    "Tarjeta rechazada por Mercado Pago. Si la tarjeta es del titular de la cuenta de " +
    "Mercado Pago del local, MP la rechaza siempre (no se puede pagar a uno mismo) — " +
    "cobrale por otro medio.",
};

/** La caja no tiene Posnet activo vinculado (409 POSNET_NOT_LINKED del resolver). */
const POSNET_NOT_LINKED_MSG =
  "Esta caja no tiene Posnet vinculado — vinculá un lector desde /admin → PDV y Posnets " +
  "antes de cobrar con débito.";

function posnetRechazoMessage(statusDetail?: string): string {
  if (statusDetail && POSNET_RECHAZO_POR_DETALLE[statusDetail]) {
    return POSNET_RECHAZO_POR_DETALLE[statusDetail];
  }
  return statusDetail
    ? `Tarjeta rechazada (${statusDetail}). Pedile al cliente otro medio de pago.`
    : "Tarjeta rechazada. Pedile al cliente otro medio de pago.";
}

/** Código machine-readable del error del backend (`{ error, code }`). */
function apiErrorCode(err: unknown): string | undefined {
  return err instanceof ApiError && err.data && typeof err.data === "object"
    ? (err.data as { code?: string }).code
    : undefined;
}

/** Métodos que se cobran vía Posnet. Hoy solo "debito" — el Posnet físico no puede
 * diferenciar un cobro con QR del resto (ver docs/specs/mercadopago/cobro-posnet-mercadopago.md). */
type PosnetMethod = "debito";

type UseCheckoutArgs = {
  cart: Record<number, number>;
  cartEntries: CartEntry[];
  totalPrice: number;
  totalItems: number;
  clearCart: () => void;
  /** Imprime ESC/POS (base64) en la tablet vía WebUSB. Opcional en tests. */
  printTicketData?: (base64: string) => Promise<void>;
};

/**
 * Estado y lógica de checkout/pagos de la Terminal de Caja: selección de
 * método, cobro en efectivo, cobro Posnet (Mercado Pago) con polling de la
 * intención de cobro, cobro QR estático (Fase 4), y el pedido recién
 * concretado para la pantalla de éxito.
 */
export function useCheckout({
  cart,
  cartEntries,
  totalPrice,
  totalItems,
  clearCart,
  printTicketData,
}: UseCheckoutArgs) {
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
  // Semilla de idempotencia del intento de cobro (QR y Posnet): una por
  // intento, se REUSA en doble click/reintento (el backend devuelve la misma
  // order; en Posnet además es la idempotencyKey del registro de la venta) y
  // se resetea al confirmar/cancelar manual/expirar/fallar terminal.
  const paymentAttemptIdRef = useRef<string | null>(null);
  // expiresAt (epoch ms) del cobro activo (order QR o intent Posnet), del
  // response del create — corta el polling localmente (A10 / criterio F).
  const paymentExpiresAtRef = useRef<number | null>(null);

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
    paymentExpiresAtRef.current = null;
  }, []);

  // Best-effort: cancela en el device / MP cualquier intención/order que haya
  // quedado activa cuando se abandona el cobro por afuera del flujo normal.
  const cancelActiveIntent = useCallback(() => {
    const id = intentIdRef.current;
    const kind = activePaymentKindRef.current;
    // Abandonar el cobro invalida el intento en curso: la próxima venta arranca
    // con semilla nueva (reusar la de una order cancelada devolvería esa order).
    paymentAttemptIdRef.current = null;
    paymentExpiresAtRef.current = null;
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
      if (order.ticketData && printTicketData) {
        try {
          await printTicketData(order.ticketData);
        } catch {
          // La venta ya quedó; reprint desde la UI de éxito.
        }
      }
      return order;
    } catch (err) {
      setSaleError(err instanceof Error ? err.message : "No se pudo registrar la venta.");
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  }, [cart, canConfirmCash, clearCart, paymentMethod, printTicketData, submitting, totalItems]);

  const buildPendingSale = useCallback(
    (method: "qr" | "debito", mpRef: string, idempotencyKey?: string): PendingSale => ({
      id: randomId(),
      createdAt: Date.now(),
      paymentMethod: method,
      mpRef,
      // La prueba de pago que exige POST /api/orders (criterio C).
      mpKind: method === "qr" ? "qr_order" : "point_intent",
      ...(idempotencyKey ? { idempotencyKey } : {}),
      amount: totalPrice,
      items: Object.entries(cart).map(([idStr, qty]) => ({ drinkId: Number(idStr), qty })),
      attempts: 0,
    }),
    [cart, totalPrice],
  );

  /**
   * A11 — registra la venta de un cobro YA verificado en MP, presentando la
   * prueba de pago que el server valida (criterio C). Vive FUERA del try del
   * polling: si `ordersService.create` falla acá el error es "cobrado pero sin
   * registrar" (la constancia queda en localStorage), nunca el genérico de
   * "no se pudo consultar el estado".
   */
  const registerPaidOrder = useCallback(
    async (entry: PendingSale, opts?: { fromRetry?: boolean }): Promise<boolean> => {
      try {
        const order = await ordersService.create({
          items: entry.items,
          paymentMethod: entry.paymentMethod,
          payment: { provider: "mercadopago", kind: pendingSaleProofKind(entry), id: entry.mpRef },
          ...(entry.idempotencyKey ? { idempotencyKey: entry.idempotencyKey } : {}),
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
        if (order.ticketData && printTicketData) {
          try {
            await printTicketData(order.ticketData);
          } catch {
            // reprint desde la UI
          }
        }
        return true;
      } catch (err) {
        console.error("Cobro OK pero falló el registro de la venta:", err);
        const message = err instanceof Error ? err.message : "Error desconocido";
        const code = apiErrorCode(err);
        if (code === "PAYMENT_REJECTED" || code === "PAYMENT_UNVERIFIED") {
          // Veredicto terminal del server: un cobro rechazado/no verificado NO
          // es una venta por registrar. Reintentar no sirve — la constancia
          // queda marcada con el motivo (el "Reintentar" del banner es solo
          // para fallos de red/registro).
          updatePendingSale(entry.id, {
            attempts: entry.attempts + 1,
            lastError: message,
            blocked: { code, reason: message },
          });
          setPendingSales(listPendingSales());
          if (!opts?.fromRetry) {
            setPosnetStatus("error");
            setPaymentIntentState(null);
            setQrImage(null);
            setPosnetErrorMessage(message);
          }
          return false;
        }
        updatePendingSale(entry.id, {
          attempts: entry.attempts + 1,
          lastError: message,
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
    [clearCart, printTicketData],
  );

  /** Reintenta desde el banner el registro de una venta cobrada sin registrar. */
  const retryPendingSale = useCallback(
    (id: string): Promise<boolean> => {
      const entry = listPendingSales().find((s) => s.id === id);
      if (!entry) {
        setPendingSales(listPendingSales());
        return Promise.resolve(false);
      }
      // Un 409 terminal del server (rechazo / no verificado) no se reintenta:
      // el banner solo ofrece descartar tras verificar a mano.
      if (entry.blocked) return Promise.resolve(false);
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

    // Último veredicto visto: si el corte local por deadline llega después de
    // un UNKNOWN, el mensaje es "no confirmado" (D1), no el de expiración.
    let lastStatus: PosIntentVerdict["status"] | null = null;

    pollingRef.current = setInterval(async () => {
      // Criterio F — deadline local (defensa en profundidad; la autoridad es el
      // expiresAt del server): cortar ANTES de pegarle al backend, mismo patrón
      // que el QR. Sin esto, un backend inalcanzable dejaría la caja colgada.
      const expiresAt = paymentExpiresAtRef.current;
      if (expiresAt !== null && Date.now() > expiresAt + EXPIRY_GRACE_MS) {
        stopPolling();
        resetPaymentAttempt();
        setCurrentIntentId(null);
        intentIdRef.current = null;
        activePaymentKindRef.current = null;
        // Best-effort: si quedó en cola en el device, liberarlo (MP rechaza el
        // cancel de un intent ya terminal, y eso está bien).
        Promise.resolve(mercadopagoService.cancelPosIntent(intentId)).catch(() => {});
        setPosnetStatus("error");
        setPaymentIntentState(null);
        setPosnetErrorMessage(lastStatus === "UNKNOWN" ? COBRO_NO_CONFIRMADO_MSG : "intent_expired");
        return;
      }

      let verdict: PosIntentVerdict;
      try {
        verdict = await mercadopagoService.getPosIntentStatus(intentId);
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
      lastStatus = verdict.status;
      // Mientras el veredicto es PENDING, el detalle visible es el rawState del
      // intent (OPEN/ON_TERMINAL/…) — la UI lo usa para el texto de progreso y
      // para bloquear la salida con el cobro activo en el lector.
      setPaymentIntentState(
        verdict.status === "PENDING" ? (verdict.rawState ?? "PENDING") : verdict.status,
      );

      if (verdict.status === "FINISHED") {
        // Cobro verificado por el server (pago approved + monto correcto):
        // soltar toda referencia al intent ANTES de registrar la venta, para
        // que un unmount/cancel no cancele en MP un cobro concretado.
        stopPolling();
        setCurrentIntentId(null);
        intentIdRef.current = null;
        activePaymentKindRef.current = null;
        const attemptKey = paymentAttemptIdRef.current ?? undefined;
        resetPaymentAttempt();
        // Orden cobro → constancia → registro (D6): la constancia nace recién
        // con el veredicto confirmado y es espejo de lo persistido en el server.
        const entry = buildPendingSale(method, intentId, attemptKey);
        addPendingSale(entry);
        setPendingSales(listPendingSales());
        await registerPaidOrder(entry);
      } else if (verdict.status === "REJECTED") {
        // Criterio E: rechazo ≠ cancelación. El motivo real (statusDetail) le
        // dice a la cajera que pida otro medio de pago.
        stopPolling();
        resetPaymentAttempt();
        setPosnetStatus("error");
        setCurrentIntentId(null);
        activePaymentKindRef.current = null;
        setPaymentIntentState(null);
        setPosnetErrorMessage(posnetRechazoMessage(verdict.statusDetail));
      } else if (verdict.status === "CANCELED") {
        stopPolling();
        resetPaymentAttempt();
        setPosnetStatus("error");
        setCurrentIntentId(null);
        activePaymentKindRef.current = null;
        setPaymentIntentState(null);
        // Sentinel (no un mensaje de error real, ver "busy_device" más arriba): la
        // cajera o el cliente cancelaron a propósito desde el dispositivo — no es una
        // falla del sistema, así que la UI lo muestra distinto de un error genérico.
        setPosnetErrorMessage("cancelled_by_device");
      } else if (verdict.status === "EXPIRED") {
        // El server venció el intent sin confirmación (autoridad del deadline).
        stopPolling();
        resetPaymentAttempt();
        setPosnetStatus("error");
        setCurrentIntentId(null);
        activePaymentKindRef.current = null;
        setPaymentIntentState(null);
        setPosnetErrorMessage("intent_expired");
      }
      // PENDING sigue esperando. UNKNOWN también sigue (el server re-consulta
      // MP en cada poll y puede resolverlo), acotado por el deadline local: la
      // UI lo muestra como advertencia vía paymentIntentState === "UNKNOWN",
      // NUNCA como cobrado (D1).
    }, 3000);
  }, [buildPendingSale, registerPaidOrder, resetPaymentAttempt, stopPolling]);

  const startQrPolling = useCallback((orderId: string) => {
    stopPolling();
    activePaymentKindRef.current = "qr";

    pollingRef.current = setInterval(async () => {
      // A10 — el QR venció (con gracia): cortar ANTES de pegarle al backend.
      // Sin esto, un status raro ("unknown") dejaría el polling girando infinito.
      const expiresAt = paymentExpiresAtRef.current;
      if (expiresAt !== null && Date.now() > expiresAt + EXPIRY_GRACE_MS) {
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
        const attemptKey = paymentAttemptIdRef.current ?? undefined;
        resetPaymentAttempt();
        setCurrentIntentId(null);
        intentIdRef.current = null;
        activePaymentKindRef.current = null;
        const entry = buildPendingSale("qr", orderId, attemptKey);
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
    // Semilla del intento de cobro: se REUSA en el auto-retry del 2205 (mismo
    // intento lógico) y es la idempotencyKey con la que después se registra la
    // venta. Nace una nueva recién después de un reset (terminal/cancel).
    if (!paymentAttemptIdRef.current) {
      paymentAttemptIdRef.current = randomId();
    }
    const attemptId = paymentAttemptIdRef.current;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setPaymentMethod(method);
    setPosnetStatus("connecting");
    setPaymentIntentState("CREATING");
    setPosnetErrorMessage(null);
    setQrImage(null);
    try {
      const drinksText = cartEntries.map((e) => `${e.drink.name} x${e.qty}`).join(", ");
      // Los items viajan al backend, que los persiste junto al intent como
      // respaldo server-side de la venta (sobrevive al cierre de la pestaña).
      const items = cartEntries.map((e) => ({ drinkId: e.drink.id, qty: e.qty }));
      const intent = await mercadopagoService.createPosIntent(
        totalPrice,
        drinksText || "Cobro Cocktrail",
        { attemptId, items },
      );
      setCurrentIntentId(intent.id);
      const expiresAtMs = Date.parse(intent.expiresAt);
      paymentExpiresAtRef.current = Number.isNaN(expiresAtMs) ? null : expiresAtMs;
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

      if (dataCode === "POSNET_NOT_LINKED") {
        // 409 de configuración (la caja no tiene lector activo): distinguible
        // del rechazo de tarjeta — acá no hubo tarjeta ni cobro.
        setPosnetStatus("error");
        setPosnetErrorMessage(POSNET_NOT_LINKED_MSG);
      } else if (dataCode === "POSNET_WRONG_ACCOUNT") {
        // Caso grave (bloqueo server-side): el mensaje del backend explica que
        // la plata entraría a OTRA cuenta — se muestra tal cual.
        setPosnetStatus("error");
        setPosnetErrorMessage(
          dataError ??
            message ??
            "Cobro bloqueado: el Posnet pertenece a otra cuenta de Mercado Pago.",
        );
      } else if (isAlreadyQueued && posnetRetryCountRef.current < MAX_POSNET_BUSY_RETRIES) {
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
      paymentAttemptIdRef.current = randomId();
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
      paymentExpiresAtRef.current = Number.isNaN(expiresAtMs) ? null : expiresAtMs;
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
