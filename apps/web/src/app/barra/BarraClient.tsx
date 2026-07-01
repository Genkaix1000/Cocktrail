"use client";

import {
  LogOut,
  X,
  AlertTriangle,
  Slash,
  MoreHorizontal,
  ScanLine,
  Radio,
  WifiOff,
  Clock,
  History,
  Package,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Inbox,
  Hand,
  Pencil,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useRef, type ReactNode, type MouseEvent } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { useSSE } from "@/lib/useSSE";
import { ordersService } from "@/services/orders.service";
import { authService } from "@/services/auth.service";
import { useScannerInput } from "@/hooks/useScannerInput";
import { ticketsService } from "@/services/tickets.service";
import { eventsService } from "@/services/events.service";
import type { Order, NightEvent } from "@cocktrail/shared";

const RECENT_SCANS_LIMIT = 8;
const HERO_SCANS_COUNT = 3;
const DEFAULT_BAR_CODE = process.env.NEXT_PUBLIC_BAR_CODE || "BARRA-01";

export default function BarraClient() {
  const router = useRouter();
  const [deliveredCount, setDeliveredCount] = useState<number>(0);

  // Feedback overlays
  const [flash, setFlash] = useState<{
    type: "success" | "duplicate" | "error";
    message: string;
    displayNumber?: number;
    items?: Array<{ name: string; qty: number }>;
  } | null>(null);

  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerFlash = useCallback((data: {
    type: "success" | "duplicate" | "error";
    message: string;
    displayNumber?: number;
    items?: Array<{ name: string; qty: number }>;
  }) => {
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }
    setFlash(data);
    flashTimeoutRef.current = setTimeout(() => {
      setFlash(null);
      flashTimeoutRef.current = null;
    }, 5000);
  }, []);

  const dismissFlash = useCallback(() => {
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
    setFlash(null);
  }, []);

  // Dev Simulator States
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [devOrders, setDevOrders] = useState<Order[]>([]);

  // Recent scans state (last 8 scans: 3 hero + 5 history)
  const [recentScans, setRecentScans] = useState<Order[]>([]);

  // Bar station identity (persisted per device)
  const [barCode, setBarCode] = useState(DEFAULT_BAR_CODE);
  const [barCodeEditing, setBarCodeEditing] = useState(false);
  const [barCodeDraft, setBarCodeDraft] = useState("");

  // Manual redeem from pending list
  const [manualRedeemOrder, setManualRedeemOrder] = useState<Order | null>(null);
  const [manualRedeeming, setManualRedeeming] = useState(false);

  // Offline queue state
  const [offlineQueue, setOfflineQueue] = useState<string[]>([]);

  // Authenticated user state
  const [currentUser, setCurrentUser] = useState<{ role: string; username: string; permissions: any } | null>(null);

  // Pending paid orders state
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);

  // Toast notifications state
  const [notifications, setNotifications] = useState<{ id: string; displayNumber: number; text: string; duration: number }[]>([]);

  // Cancellation Modal states
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [cancellationStep, setCancellationStep] = useState<"confirm" | "reason">("confirm");
  const [cancelReason, setCancelReason] = useState<string>("");
  const [customReason, setCustomReason] = useState<string>("");
  const [cancelling, setCancelling] = useState(false);

  // Active night event state (with ref to avoid SSE stale closures)
  const eventRef = useRef<NightEvent | null>(null);
  const [event, setEventState] = useState<NightEvent | null>(null);
  const setEvent = (ev: NightEvent | null) => {
    eventRef.current = ev;
    setEventState(ev);
  };

  // Load offline queue, bar code and recent scans on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedQueue = localStorage.getItem("cocktrail_offline_scans");
      const savedDelivered = localStorage.getItem("cocktrail_delivered_count");
      const savedBarCode = localStorage.getItem("cocktrail_bar_code");

      setTimeout(() => {
        if (savedQueue) {
          try {
            setOfflineQueue(JSON.parse(savedQueue));
          } catch {}
        }
        if (savedDelivered) {
          setDeliveredCount(Number(savedDelivered));
        }
        if (savedBarCode) {
          setBarCode(savedBarCode);
        }
      }, 0);
    }
  }, []);

  // Fetch current user and active event details
  useEffect(() => {
    authService.getMe().then((u) => {
      if (u) setCurrentUser(u);
    });

    eventsService.getState().then((state) => {
      const activeEvent = state.event;
      if (activeEvent) {
        setEvent(activeEvent);

        // Night isolation: reset state if event changed
        const savedEventId = localStorage.getItem("cocktrail_last_event_id");
        if (savedEventId !== activeEvent.id) {
          localStorage.setItem("cocktrail_last_event_id", activeEvent.id);
          localStorage.setItem("cocktrail_delivered_count", "0");
          localStorage.setItem("cocktrail_recent_scans", "[]");
          setDeliveredCount(0);
          setRecentScans([]);
        } else {
          // Same event, load history
          const savedScans = localStorage.getItem("cocktrail_recent_scans");
          if (savedScans) {
            try {
              const scans: Order[] = JSON.parse(savedScans);
              const filtered = scans.filter((s) => s.createdAt >= activeEvent.startedAt);
              setRecentScans(filtered);
            } catch {
              setRecentScans([]);
            }
          }
        }
      } else {
        setEvent(null);
        setRecentScans([]);
        setDeliveredCount(0);
      }
    }).catch(() => {
      setRecentScans([]);
    });
  }, []);

  const fetchPendingOrders = useCallback(async () => {
    try {
      const active = await ordersService.listActive();
      setPendingOrders(active);
    } catch (err) {
      console.error("Error fetching pending orders:", err);
    }
  }, []);

  useEffect(() => {
    fetchPendingOrders();
  }, [fetchPendingOrders]);

  const saveBarCode = useCallback((code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setBarCode(trimmed);
    localStorage.setItem("cocktrail_bar_code", trimmed);
    setBarCodeEditing(false);
  }, []);

  const appendRecentScan = useCallback((order: Order) => {
    setRecentScans((prev) => {
      const exists = prev.some((o) => o.id === order.id);
      if (exists) return prev;
      const next = [order, ...prev];
      const currentEvent = eventRef.current;
      const filtered = currentEvent ? next.filter((o) => o.createdAt >= currentEvent.startedAt) : next;
      const limited = filtered.slice(0, RECENT_SCANS_LIMIT);
      localStorage.setItem("cocktrail_recent_scans", JSON.stringify(limited));
      return limited;
    });
  }, []);

  // Scan processor handler with offline support
  const handleScan = useCallback(async (code: string, method: "scan" | "manual" = "scan"): Promise<boolean> => {
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

    if (isOffline) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      triggerFlash({
        type: "duplicate",
        message: "Offline: Guardado en la cola local de pendientes.",
      });

      setOfflineQueue((prev) => {
        if (prev.includes(code)) return prev;
        const next = [...prev, code];
        localStorage.setItem("cocktrail_offline_scans", JSON.stringify(next));
        return next;
      });
      return false;
    }

    try {
      const res = await ticketsService.redeem(code, { barCode, method });
      if (res.success) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(200);
        }
        const methodLabel = method === "manual" ? " (manual)" : "";
        triggerFlash({
          type: "success",
          message: `¡Pedido #${res.order.displayNumber} entregado con éxito${methodLabel}!`,
          displayNumber: res.order.displayNumber,
          items: res.order.items,
        });

        setDeliveredCount((prev) => {
          const nextCount = prev + 1;
          localStorage.setItem("cocktrail_delivered_count", String(nextCount));
          return nextCount;
        });

        appendRecentScan(res.order);
        fetchPendingOrders();
        return true;
      }
      return false;
    } catch (err) {
      const isNetworkError =
        err instanceof TypeError ||
        (err instanceof Error &&
          (err.message.includes("Failed to fetch") ||
            err.message.includes("NetworkError") ||
            err.message.includes("network")));

      if (isNetworkError) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
        triggerFlash({
          type: "duplicate",
          message: "Red inestable: guardado en la cola local de pendientes.",
        });

        setOfflineQueue((prev) => {
          if (prev.includes(code)) return prev;
          const next = [...prev, code];
          localStorage.setItem("cocktrail_offline_scans", JSON.stringify(next));
          return next;
        });
        return false;
      }

      let msg = "Error al procesar ticket";
      let type: "error" | "duplicate" = "error";
      let vibratePattern = 400;

      if (err instanceof Error) {
        msg = err.message;
        if (err.message.toLowerCase().includes("canjeado")) {
          type = "duplicate";
          vibratePattern = 100;
        }
      }

      if (typeof navigator !== "undefined" && navigator.vibrate) {
        if (type === "duplicate") {
          navigator.vibrate([100, 50, 100]);
        } else {
          navigator.vibrate(vibratePattern);
        }
      }

      triggerFlash({ type, message: msg });
      return false;
    }
  }, [barCode, fetchPendingOrders, triggerFlash, appendRecentScan]);

  // Hook to capture barcode gun scanner input
  useScannerInput({
    onScan: handleScan,
  });

  // Auto-sync offline scans when connection is restored
  useEffect(() => {
    let active = true;

    const syncQueue = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      const saved = localStorage.getItem("cocktrail_offline_scans");
      if (!saved) return;

      let queue: string[] = [];
      try {
        queue = JSON.parse(saved);
      } catch {
        return;
      }

      if (queue.length === 0) return;

      console.log(`[sync] Sincronizando ${queue.length} canjes offline...`);
      const remaining: string[] = [];

      for (const code of queue) {
        if (!active) return;
        try {
          await ticketsService.redeem(code);
        } catch (err) {
          const isNetworkError =
            err instanceof TypeError ||
            (err instanceof Error &&
              (err.message.includes("Failed to fetch") ||
                err.message.includes("NetworkError") ||
                err.message.includes("network")));

          if (isNetworkError) {
            remaining.push(code);
          }
        }
      }

      if (active) {
        setOfflineQueue(remaining);
        localStorage.setItem("cocktrail_offline_scans", JSON.stringify(remaining));
        if (remaining.length === 0 && queue.length > 0) {
          triggerFlash({
            type: "success",
            message: "Sincronizados con éxito todos los canjes offline.",
          });
          fetchPendingOrders();
        }
      }
    };

    window.addEventListener("online", syncQueue);
    const interval = setInterval(syncQueue, 10000);
    syncQueue();

    return () => {
      active = false;
      window.removeEventListener("online", syncQueue);
      clearInterval(interval);
    };
  }, [fetchPendingOrders]);

  useSSE(
    {
      "order.created": ({ order }) => {
        if (process.env.NODE_ENV === "development") {
          setDevOrders((prev) =>
            prev.some((o) => o.id === order.id) ? prev : [...prev, order]
          );
        }
        setPendingOrders((prev) => {
          if (prev.some((o) => o.id === order.id)) return prev;
          if (order.status === "pagado" || order.status === "preparando" || order.status === "listo") {
            return [...prev, order];
          }
          return prev;
        });

        // Push toast notification
        const itemsStr = order.items.map((it) => `x${it.qty} ${it.name}`).join(", ");
        const newToast = {
          id: order.id + "-" + Date.now(),
          displayNumber: order.displayNumber,
          text: itemsStr,
          duration: 5000,
        };
        setNotifications((prev) => [...prev, newToast]);
      },
      "order.updated": ({ order }) => {
        if (order.status === "entregado") {
          setDeliveredCount((prev) => {
            const nextCount = prev + 1;
            localStorage.setItem("cocktrail_delivered_count", String(nextCount));
            return nextCount;
          });
          setRecentScans((prev) => {
            const exists = prev.some((o) => o.id === order.id);
            if (exists) return prev;
            const next = [order, ...prev];
            const currentEvent = eventRef.current;
            const filtered = currentEvent ? next.filter((o) => o.createdAt >= currentEvent.startedAt) : next;
            const limited = filtered.slice(0, RECENT_SCANS_LIMIT);
            localStorage.setItem("cocktrail_recent_scans", JSON.stringify(limited));
            return limited;
          });
        }

        if (order.status === "cancelado") {
          setRecentScans((prev) => {
            const next = prev.filter((o) => o.id !== order.id);
            localStorage.setItem("cocktrail_recent_scans", JSON.stringify(next));
            return next;
          });
        }

        if (process.env.NODE_ENV === "development") {
          setDevOrders((prev) => {
            const isTerminal = order.status === "entregado" || order.status === "cancelado";
            if (isTerminal) return prev.filter((o) => o.id !== order.id);
            const idx = prev.findIndex((o) => o.id === order.id);
            if (idx === -1) return [...prev, order];
            const next = [...prev];
            next[idx] = order;
            return next;
          });
        }

        setPendingOrders((prev) => {
          const isTerminal = order.status === "entregado" || order.status === "cancelado";
          if (isTerminal) return prev.filter((o) => o.id !== order.id);
          const idx = prev.findIndex((o) => o.id === order.id);
          if (idx === -1) {
            if (order.status === "pagado" || order.status === "preparando" || order.status === "listo") {
              return [...prev, order];
            }
            return prev;
          }
          const next = [...prev];
          next[idx] = order;
          return next;
        });
      },
      "event.closed": () => {
        setDeliveredCount(0);
        setRecentScans([]);
        setPendingOrders([]);
        localStorage.removeItem("cocktrail_recent_scans");
        localStorage.removeItem("cocktrail_delivered_count");
        localStorage.removeItem("cocktrail_last_event_id");
        if (process.env.NODE_ENV === "development") {
          setDevOrders([]);
        }
      },
    },
    {
      onOpen: () => {
        fetchPendingOrders();
        if (process.env.NODE_ENV === "development") {
          ordersService.listActive().then(setDevOrders).catch(() => {});
        }
      },
    }
  );

  const handleCancelClick = useCallback((order: Order, e: MouseEvent) => {
    e.stopPropagation();
    const hasCancelPermission = currentUser?.role === "admin" || currentUser?.permissions?.cancelarTickets;
    if (!hasCancelPermission) return;
    setCancelOrder(order);
    setCancellationStep("confirm");
    setCancelReason("");
    setCustomReason("");
  }, [currentUser]);

  const handleManualRedeemConfirm = useCallback(async () => {
    if (!manualRedeemOrder || manualRedeeming) return;
    const code = manualRedeemOrder.ticketCode;
    if (!code) {
      triggerFlash({ type: "error", message: "Este pedido no tiene código de ticket asociado." });
      setManualRedeemOrder(null);
      return;
    }
    setManualRedeeming(true);
    try {
      const ok = await handleScan(code, "manual");
      if (ok) setManualRedeemOrder(null);
    } finally {
      setManualRedeeming(false);
    }
  }, [manualRedeemOrder, manualRedeeming, handleScan, triggerFlash]);

  async function logout() {
    await authService.logout();
    router.push("/login");
    router.refresh();
  }

  const heroScans = recentScans.slice(0, HERO_SCANS_COUNT);
  const historicalScans = recentScans.slice(HERO_SCANS_COUNT, RECENT_SCANS_LIMIT);

  return (
    <main className="min-h-screen bg-ink-950 text-ink-50 flex flex-col selection:bg-green-soft relative overflow-hidden">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 left-1/4 h-[480px] w-[480px] rounded-full bg-green/5 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[360px] rounded-full bg-blue/5 blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--ink-925)_0%,_var(--ink-950)_55%)]" />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
        @keyframes toastSlideIn {
          0% { transform: translateY(-8px) scale(0.96); opacity: 0; }
          8% { transform: translateY(0) scale(1); opacity: 1; }
          90% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-8px) scale(0.96); opacity: 0; }
        }
        @keyframes flashFadeInOut {
          0% { opacity: 0; }
          4% { opacity: 1; }
          96% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes scanPulse {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        @keyframes scanLine {
          0% { transform: translateY(-100%); opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { transform: translateY(100%); opacity: 0; }
        }
      `}} />

      {/* Header */}
      <header className="relative z-10 h-14 px-4 md:px-6 flex justify-between items-center border-b border-ink-800/80 bg-ink-925/70 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <BrandLogo size="lg" />
          <div className="hidden sm:flex flex-col min-w-0">
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-300 leading-none">
              Estación de Escaneo
            </span>
            {event && (
              <span className="text-[10px] text-ink-500 font-mono truncate mt-1">
                Noche activa · {new Date(event.startedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-2.5 bg-green-soft/80 border border-green-line rounded-full px-4 py-1.5 backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green" />
          </span>
          <ScanLine size={12} className="text-green" strokeWidth={2.5} />
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-green">
            Listo para escanear
          </span>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <button
            type="button"
            onClick={() => {
              setBarCodeDraft(barCode);
              setBarCodeEditing(true);
            }}
            className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-xl border border-ink-800 bg-ink-900/60 hover:border-ink-700 transition-all cursor-pointer group"
            title="Código de esta barra"
          >
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-ink-500">Barra</span>
            <span className="font-mono text-xs font-bold text-blue tabular">{barCode}</span>
            <Pencil size={11} className="text-ink-600 group-hover:text-ink-400" />
          </button>
          <Stat label="Entregados" value={deliveredCount} tone="green" />
          {offlineQueue.length > 0 && (
            <>
              <Sep />
              <Stat label="Cola offline" value={offlineQueue.length} tone="amber" />
            </>
          )}
          <Sep />
          <button
            type="button"
            onClick={logout}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-ink-800 bg-ink-900/60 text-ink-400 hover:text-white hover:border-ink-700 transition-all active:scale-95 cursor-pointer"
            aria-label="Cerrar Sesión"
            title="Cerrar Sesión"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Offline banner */}
      {offlineQueue.length > 0 && (
        <div className="relative z-10 bg-amber-soft/90 border-b border-amber-line px-4 md:px-6 py-2.5 flex items-center justify-between gap-4 shrink-0 backdrop-blur-sm">
          <div className="flex items-center gap-2.5 text-xs font-mono text-amber">
            <WifiOff size={14} className="shrink-0" />
            <span>
              <strong className="font-bold">Sin conexión</strong>
              <span className="text-amber/80"> · {offlineQueue.length} canje{offlineQueue.length !== 1 ? "s" : ""} en cola local</span>
            </span>
          </div>
          <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-amber/60">
            Sincroniza al recuperar señal
          </span>
        </div>
      )}

      {/* Main workspace */}
      <div className="relative z-10 flex-1 w-full max-w-[1680px] mx-auto p-4 md:p-6 flex flex-col xl:flex-row gap-5 md:gap-6 min-h-0">
        {/* Primary: scan hero + history */}
        <div className="flex-1 flex flex-col gap-5 min-w-0 min-h-0">
          {/* Hero: last 3 scans side by side */}
          <section className="flex-1 flex flex-col min-h-[280px] md:min-h-[320px]">
            <SectionTitle icon={<CheckCircle2 size={12} />}>
              Últimos canjes
              <span className="ml-auto text-[10px] font-mono font-normal normal-case tracking-normal text-ink-600">
                {heroScans.length}/{HERO_SCANS_COUNT}
              </span>
            </SectionTitle>

            {heroScans.length === 0 ? (
              <div className="relative flex-1 overflow-hidden rounded-3xl border border-dashed border-ink-700/80 bg-ink-900/30 backdrop-blur-sm flex flex-col items-center justify-center text-center px-6 py-12">
                <div className="relative mb-6">
                  <div
                    className="absolute inset-0 rounded-full border border-ink-700/60"
                    style={{ animation: "scanPulse 2.4s ease-in-out infinite" }}
                  />
                  <div
                    className="absolute -inset-4 rounded-full border border-green-line/30"
                    style={{ animation: "scanPulse 2.4s ease-in-out infinite 0.4s" }}
                  />
                  <div className="relative w-20 h-20 rounded-2xl bg-ink-900 border border-ink-800 flex items-center justify-center overflow-hidden">
                    <ScanLine size={32} className="text-ink-400" strokeWidth={1.5} />
                    <div
                      className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-green/60 to-transparent"
                      style={{ animation: "scanLine 2.8s ease-in-out infinite" }}
                    />
                  </div>
                </div>
                <h2 className="font-serif-italic text-xl md:text-2xl text-ink-200 mb-2">
                  Esperando escaneo
                </h2>
                <p className="text-sm text-ink-500 max-w-sm leading-relaxed">
                  Apuntá el lector de código QR al ticket del cliente. Los últimos 3 canjes se muestran acá.
                </p>
                <div className="mt-6 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-ink-600">
                  <Radio size={11} />
                  Escucha activa · {barCode}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 min-h-[280px]">
                {Array.from({ length: HERO_SCANS_COUNT }).map((_, slot) => {
                  const scan = heroScans[slot];
                  if (scan) {
                    return <RecentScanCard key={scan.id} order={scan} highlight={slot === 0} />;
                  }
                  return <EmptyScanSlot key={`empty-${slot}`} slot={slot} />;
                })}
              </div>
            )}
          </section>

          {/* History */}
          <section className="shrink-0">
            <SectionTitle icon={<History size={12} />}>
              Historial reciente
              {historicalScans.length > 0 && (
                <span className="ml-auto text-[10px] font-mono font-normal normal-case tracking-normal text-ink-600">
                  {historicalScans.length} canje{historicalScans.length !== 1 ? "s" : ""}
                </span>
              )}
            </SectionTitle>

            {historicalScans.length === 0 ? (
              <div className="rounded-2xl border border-ink-800/60 bg-ink-900/20 px-4 py-8 text-center">
                <p className="text-xs text-ink-600 font-serif-italic">
                  Los últimos canjes aparecerán acá
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
                {historicalScans.map((o, idx) => (
                  <div
                    key={o.id}
                    className="group relative rounded-2xl border border-ink-800 bg-ink-900/50 p-3.5 hover:border-ink-700 hover:bg-ink-900/80 transition-all"
                    style={{ opacity: 1 - idx * 0.12 }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-mono text-lg font-black text-ink-300 tabular">
                        #{o.displayNumber}
                      </span>
                      <span className="text-[9px] font-mono text-ink-600 tabular">
                        {o.deliveredAt
                          ? new Date(o.deliveredAt).toLocaleTimeString("es-AR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-ink-200 leading-snug line-clamp-2">
                      {o.items.map((it) => `${it.qty}× ${it.name}`).join(" · ")}
                    </p>
                    <p className="mt-2 text-[10px] font-mono text-ink-600 tabular">
                      ${o.total.toLocaleString("es-AR")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar: pending orders */}
        <aside className="w-full xl:w-[360px] shrink-0 flex flex-col min-h-[320px] xl:min-h-0">
          <div className="relative flex-1 flex flex-col rounded-3xl border border-ink-800 bg-ink-900/60 backdrop-blur-sm overflow-hidden shadow-xl">
            {/* Toast stack */}
            <div className="absolute top-3 right-3 z-50 flex flex-col gap-2 w-full max-w-[300px] pointer-events-none">
              {notifications.map((n) => (
                <ToastItem
                  key={n.id}
                  id={n.id}
                  displayNumber={n.displayNumber}
                  text={n.text}
                  onClose={() => setNotifications((prev) => prev.filter((item) => item.id !== n.id))}
                />
              ))}
            </div>

            <div className="px-5 py-4 border-b border-ink-800/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-soft border border-blue-line flex items-center justify-center">
                  <Package size={15} className="text-blue" />
                </div>
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-100">
                    Tragos pendientes
                  </h3>
                  <p className="text-[10px] text-ink-500 font-mono mt-0.5">Tocá un pedido para canjear manual</p>
                </div>
              </div>
              <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-xl bg-ink-950 border border-ink-800 font-mono text-sm font-black text-blue tabular">
                {pendingOrders.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar min-h-0">
              {pendingOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[240px] px-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-ink-950 border border-ink-800 flex items-center justify-center mb-3">
                    <Inbox size={20} className="text-ink-600" />
                  </div>
                  <p className="text-sm font-serif-italic text-ink-500">Sin tragos pendientes</p>
                  <p className="text-[11px] text-ink-600 mt-1">Los nuevos pedidos aparecen acá en vivo</p>
                </div>
              ) : (
                <ul className="divide-y divide-ink-800/60">
                  {pendingOrders.map((o) => {
                    const hasCancelPermission =
                      currentUser?.role === "admin" || currentUser?.permissions?.cancelarTickets;
                    const statusMeta = getPendingStatus(o.status);
                    return (
                      <li
                        key={o.id}
                        onClick={() => setManualRedeemOrder(o)}
                        className="flex items-center gap-3 px-4 py-3.5 hover:bg-ink-850/30 transition-colors cursor-pointer active:bg-ink-850/50"
                      >
                        <div className="w-11 h-11 rounded-xl bg-ink-950 border border-ink-800 flex items-center justify-center shrink-0">
                          <span className="font-mono text-sm font-black text-ink-200 tabular">
                            {o.displayNumber}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate leading-tight">
                            {o.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                            <span className="text-[10px] font-mono text-ink-600 tabular">
                              ${o.total.toLocaleString("es-AR")}
                            </span>
                          </div>
                        </div>

                        {hasCancelPermission && (
                          <button
                            type="button"
                            onClick={(e) => handleCancelClick(o, e)}
                            className="w-8 h-8 flex items-center justify-center bg-danger-soft hover:bg-danger-soft/80 border border-danger-line text-danger rounded-xl transition-all active:scale-95 cursor-pointer shrink-0"
                            title="Cancelar pedido"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {pendingOrders.length > 0 && (
              <div className="px-5 py-3 border-t border-ink-800/80 bg-ink-950/40 shrink-0">
                <div className="flex items-center gap-2 text-[10px] font-mono text-ink-500">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue" />
                  </span>
                  Actualización en tiempo real
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Visual Flash Overlay for Scanner Feedback */}
      {flash && (
        <div
          onClick={dismissFlash}
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 cursor-pointer select-none backdrop-blur-md transition-all duration-300 ${
            flash.type === "success"
              ? "bg-green/10"
              : flash.type === "duplicate"
                ? "bg-amber/10"
                : "bg-danger/10"
          }`}
          style={{
            animation: "flashFadeInOut 5s ease-in-out forwards",
          }}
        >
          <div
            className={`absolute inset-4 md:inset-8 rounded-[32px] border-2 pointer-events-none ${
              flash.type === "success"
                ? "border-green/30"
                : flash.type === "duplicate"
                  ? "border-amber/30"
                  : "border-danger/30"
            }`}
          />

          <div className="relative text-center max-w-xl flex flex-col items-center gap-5 animate-in zoom-in-95 duration-200">
            <div
              className={`w-20 h-20 rounded-3xl flex items-center justify-center border ${
                flash.type === "success"
                  ? "bg-green-soft border-green-line text-green"
                  : flash.type === "duplicate"
                    ? "bg-amber-soft border-amber-line text-amber"
                    : "bg-danger-soft border-danger-line text-danger"
              }`}
            >
              {flash.type === "success" ? (
                <CheckCircle2 size={40} strokeWidth={2} />
              ) : flash.type === "duplicate" ? (
                <CircleAlert size={40} strokeWidth={2} />
              ) : (
                <CircleX size={40} strokeWidth={2} />
              )}
            </div>

            <div>
              <h2 className="font-serif-italic text-3xl md:text-4xl leading-tight text-white mb-2">
                {flash.type === "success"
                  ? "Pedido entregado"
                  : flash.type === "duplicate"
                    ? "Ticket ya canjeado"
                    : "Error de ticket"}
              </h2>
              <p className="font-mono text-sm md:text-base text-ink-200 max-w-md mx-auto">
                {flash.message}
              </p>
            </div>

            {flash.items && flash.items.length > 0 && (
              <div className="mt-1 p-5 bg-ink-950/90 border border-ink-800 rounded-2xl w-full max-w-md flex flex-col gap-3 shadow-2xl backdrop-blur-sm">
                <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink-400 border-b border-ink-850 pb-2 text-left">
                  Pedido {flash.displayNumber ? `#${flash.displayNumber}` : ""}
                </span>
                <ul className="flex flex-col gap-2.5">
                  {flash.items.map((it, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-left">
                      <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-1.5 rounded-lg bg-green-soft border border-green-line font-mono font-black text-green text-sm tabular">
                        {it.qty}×
                      </span>
                      <span className="font-bold text-white text-base tracking-tight">
                        {it.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink-500 mt-2">
              Tocá para cerrar
            </span>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-1 bg-ink-950/50">
            <div
              className={`h-full ${
                flash.type === "success"
                  ? "bg-green"
                  : flash.type === "duplicate"
                    ? "bg-amber"
                    : "bg-danger"
              }`}
              style={{
                animation: "shrinkWidth 5s linear forwards",
              }}
            />
          </div>
        </div>
      )}

      {/* Manual redeem confirmation modal */}
      {manualRedeemOrder && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-ink-900 border border-ink-800 w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-soft border border-blue-line flex items-center justify-center text-blue">
                <Hand size={22} />
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                ¿Canjear pedido manualmente?
              </h2>
              <p className="text-xs text-ink-400">
                Se registrará como entrega manual desde {barCode}.
              </p>
            </div>

            <div className="bg-ink-950/60 border border-ink-800 rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex justify-between items-center border-b border-ink-800 pb-2">
                <span className="font-mono text-sm font-black text-white">
                  Pedido #{manualRedeemOrder.displayNumber}
                </span>
                <span className="text-[10px] font-mono text-ink-500 uppercase">
                  {getPendingStatus(manualRedeemOrder.status).label}
                </span>
              </div>
              <ul className="space-y-1.5">
                {manualRedeemOrder.items.map((it, idx) => (
                  <li key={idx} className="text-xs text-ink-300">
                    {it.qty}× <strong className="text-white font-semibold">{it.name}</strong>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between pt-2 border-t border-ink-800 text-xs font-mono">
                <span className="text-ink-500">Total</span>
                <span className="text-ink-200 font-bold tabular">
                  ${manualRedeemOrder.total.toLocaleString("es-AR")}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setManualRedeemOrder(null)}
                disabled={manualRedeeming}
                className="flex-1 h-11 rounded-xl bg-ink-800 border border-ink-700 text-xs font-bold uppercase tracking-wider text-ink-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleManualRedeemConfirm}
                disabled={manualRedeeming}
                className="flex-grow-[1.5] h-11 rounded-xl bg-green-soft border border-green-line text-xs font-bold uppercase tracking-wider text-green hover:brightness-115 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {manualRedeeming ? "Canjeando..." : "Confirmar canje"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bar code configuration modal */}
      {barCodeEditing && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-ink-900 border border-ink-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Código de barra</h2>
              <p className="text-xs text-ink-400 mt-1">
                Identificador de esta estación para auditoría de tickets.
              </p>
            </div>
            <input
              type="text"
              value={barCodeDraft}
              onChange={(e) => setBarCodeDraft(e.target.value.toUpperCase())}
              placeholder="BARRA-01"
              maxLength={20}
              className="h-11 px-4 bg-ink-950 border border-ink-700 rounded-xl text-sm font-mono text-ink-50 placeholder-ink-500 focus:outline-none focus:border-blue uppercase"
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              {["BARRA-01", "BARRA-02", "BARRA-03"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setBarCodeDraft(preset)}
                  className="px-2.5 py-1 rounded-lg bg-ink-950 border border-ink-800 text-[10px] font-mono text-ink-300 hover:border-ink-600 cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setBarCodeEditing(false)}
                className="flex-1 h-10 rounded-xl bg-ink-800 border border-ink-700 text-xs font-bold uppercase tracking-wider text-ink-300 cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => saveBarCode(barCodeDraft)}
                disabled={!barCodeDraft.trim()}
                className="flex-1 h-10 rounded-xl bg-blue-soft border border-blue-line text-xs font-bold uppercase tracking-wider text-blue cursor-pointer disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation modal overlay */}
      {cancelOrder && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-ink-900 border border-ink-800 w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col gap-5">
            {cancellationStep === "confirm" ? (
              <>
                <div className="flex flex-col gap-1.5 text-center">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-soft border border-amber-line flex items-center justify-center text-amber">
                    <AlertTriangle size={22} />
                  </div>
                  <h2 className="text-lg font-bold text-white tracking-tight font-sans">
                    ¿Cancelar este ticket?
                  </h2>
                  <p className="text-xs text-ink-400 font-sans">
                    Esta acción modificará el estado del pedido a cancelado en el sistema.
                  </p>
                </div>

                <div className="bg-ink-950/60 border border-ink-800 rounded-2xl p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-center border-b border-ink-800 pb-2">
                    <span className="font-mono text-sm font-black text-white">Pedido #{cancelOrder.displayNumber}</span>
                    <span className="font-mono text-[10px] text-ink-500">{cancelOrder.token}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {cancelOrder.items.map((it, idx) => (
                      <li key={idx} className="text-xs text-ink-300">
                        {it.qty}x <strong className="text-white font-semibold">{it.name}</strong>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCancelOrder(null)}
                    className="flex-1 h-11 rounded-xl bg-ink-800 border border-ink-700 text-xs font-bold uppercase tracking-wider text-ink-300 hover:text-white transition-all cursor-pointer"
                  >
                    Volver
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancellationStep("reason")}
                    className="flex-grow-[1.5] h-11 rounded-xl bg-danger-soft border border-danger-line text-xs font-bold uppercase tracking-wider text-danger hover:brightness-115 transition-all cursor-pointer"
                  >
                    Confirmar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5 text-center">
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    Motivo de la cancelación
                  </h2>
                  <p className="text-xs text-white">
                    Por favor, selecciona por qué se cancela el ticket #{cancelOrder.displayNumber}.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 my-2">
                  {[
                    { reason: "No podia canjearlo", label: "No podía canjearlo", icon: Slash },
                    { reason: "No se canceló", label: "No se canceló", icon: AlertTriangle },
                    { reason: "Otro", label: "Otro motivo", icon: MoreHorizontal }
                  ].map(({ reason, label, icon: Icon }) => {
                    const isSelected = cancelReason === reason;
                    return (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setCancelReason(reason)}
                        className={`aspect-square flex flex-col items-center justify-center gap-3 p-2 rounded-2xl border transition-all cursor-pointer text-center ${
                          isSelected
                            ? "bg-purple-500/20 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                            : "bg-ink-850 border-ink-750 text-ink-300 hover:text-white hover:border-ink-600"
                        }`}
                      >
                        <Icon size={24} className={isSelected ? "text-purple-400" : "text-ink-400"} />
                        <span className="text-[11px] font-bold text-white leading-tight">
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setCancellationStep("confirm")}
                    className="flex-1 h-11 rounded-xl bg-ink-800 border border-ink-700 text-xs font-bold uppercase tracking-wider text-ink-300 hover:text-white transition-all cursor-pointer"
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (cancelling) return;
                      
                      setCancelling(true);
                      try {
                        await ordersService.updateStatus(cancelOrder.id, "cancelado");
                        triggerFlash({
                          type: "duplicate",
                          message: `Pedido #${cancelOrder.displayNumber} cancelado por: "${cancelReason}"`,
                          displayNumber: cancelOrder.displayNumber,
                          items: cancelOrder.items,
                        });
                        setCancelOrder(null);
                        fetchPendingOrders();
                      } catch (err) {
                        triggerFlash({
                          type: "error",
                          message: err instanceof Error ? err.message : "Error al cancelar ticket",
                        });
                      } finally {
                        setCancelling(false);
                      }
                    }}
                    disabled={!cancelReason || cancelling}
                    className="flex-grow-[1.5] h-11 rounded-xl bg-danger border border-danger-line text-white font-black text-xs uppercase tracking-wider disabled:opacity-50 hover:brightness-110 transition-all cursor-pointer flex items-center justify-center"
                  >
                    {cancelling ? "Cancelando..." : "Confirmar Cancelación"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Dev Simulator Panel (Development only) */}
      {process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-0 right-0 left-0 bg-ink-950/95 border-t border-ink-800 z-50 transition-all duration-300">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setDevPanelOpen(!devPanelOpen)}
              className="flex items-center gap-2 text-xs font-mono font-semibold text-warning hover:text-warning/80 active:scale-95 transition-all cursor-pointer"
            >
              <span>🛠️ Dev Scanner Simulator</span>
              <span className="text-[10px] opacity-75">{devPanelOpen ? "▲ Ocultar" : "▼ Mostrar"}</span>
            </button>
            <div className="text-[10px] font-mono text-ink-500">
              Modo desarrollo habilitado
            </div>
          </div>

          {devPanelOpen && (
            <div className="max-w-7xl mx-auto px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-ink-900 pt-4 bg-ink-925 animate-in slide-in-from-bottom-5">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-ink-400 uppercase tracking-wider font-mono">
                  1. Simulación por Eventos de Hardware (useScannerInput)
                </span>
                <div className="flex flex-wrap gap-2">
                  {devOrders.length === 0 ? (
                    <span className="text-xs text-ink-500 font-serif-italic">No hay pedidos activos pagados para simular canje</span>
                  ) : (
                    devOrders.slice(0, 3).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => {
                          const chars = o.ticketCode || "";
                          let delay = 0;
                          for (let i = 0; i < chars.length; i++) {
                            setTimeout(() => {
                              const e = new KeyboardEvent("keydown", {
                                key: chars[i],
                              });
                              window.dispatchEvent(e);
                            }, delay);
                            delay += 10;
                          }
                          setTimeout(() => {
                            const e = new KeyboardEvent("keydown", {
                              key: "Enter",
                            });
                            window.dispatchEvent(e);
                          }, delay + 10);
                        }}
                        className="px-2.5 py-1 bg-ink-900 border border-ink-800 text-[10px] font-mono rounded hover:bg-ink-800 text-ink-200 cursor-pointer"
                      >
                        ⚡ Simular Gun Scan #{o.displayNumber}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-ink-400 uppercase tracking-wider font-mono">
                  2. Entrada Manual de Código de Ticket (Fallback)
                </span>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleScan(manualCode.trim());
                    setManualCode("");
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    placeholder="ABCD1234-a1b2c3d4"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    className="flex-1 h-9 px-3 bg-ink-900 border border-ink-700 rounded-lg text-xs font-mono text-ink-50 placeholder-ink-500 focus:outline-none focus:border-ink-500"
                  />
                  <button
                    type="submit"
                    disabled={!manualCode.trim()}
                    className="px-4 h-9 bg-ink-50 text-ink-950 font-semibold rounded-lg text-xs hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Procesar Canje
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

// ───────────────────────────── UI helpers ─────────────────────────────

function RecentScanCard({ order, highlight }: { order: Order; highlight: boolean }) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border backdrop-blur-sm h-full min-h-[260px] ${
        highlight
          ? "border-green-line bg-ink-900/90 shadow-[0_0_40px_-12px_var(--success-soft)]"
          : "border-ink-800 bg-ink-900/60"
      }`}
    >
      {highlight && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--success-soft)_0%,_transparent_60%)] pointer-events-none" />
      )}

      <div className="relative p-4 flex flex-col h-full">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-500 block mb-1">
              {highlight ? "Más reciente" : "Canje anterior"}
            </span>
            <div className="flex items-baseline gap-0.5">
              <span className={`font-mono text-sm font-bold ${highlight ? "text-green/60" : "text-ink-500"}`}>#</span>
              <span
                className={`font-mono font-black tabular leading-none ${
                  highlight ? "text-[52px] text-green" : "text-[40px] text-ink-200"
                }`}
              >
                {order.displayNumber}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {order.redeemMethod === "manual" && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-blue-soft text-blue border border-blue-line">
                <Hand size={9} />
                Manual
              </span>
            )}
            {order.deliveredByBar && (
              <span className="text-[9px] font-mono text-ink-600 uppercase">{order.deliveredByBar}</span>
            )}
          </div>
        </div>

        <ul className="flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
          {order.items.map((it, idx) => (
            <li key={`${it.drinkId}-${idx}`} className="flex items-start gap-2 min-w-0">
              <span
                className={`font-mono font-black text-sm tabular shrink-0 ${
                  highlight ? "text-green" : "text-ink-400"
                }`}
              >
                {it.qty}×
              </span>
              <span className="text-sm font-bold text-white leading-snug line-clamp-2">{it.name}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 pt-3 border-t border-ink-800/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-ink-500">
            <Clock size={10} />
            {order.deliveredAt
              ? new Date(order.deliveredAt).toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </div>
          <span className="text-[10px] font-mono text-ink-400 tabular">
            ${order.total.toLocaleString("es-AR")}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyScanSlot({ slot }: { slot: number }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-800/80 bg-ink-900/20 min-h-[260px] p-4 text-center">
      <div className="w-10 h-10 rounded-xl bg-ink-950 border border-ink-800 flex items-center justify-center mb-2 opacity-50">
        <span className="font-mono text-xs font-bold text-ink-600">{slot + 1}</span>
      </div>
      <p className="text-[11px] text-ink-600 font-serif-italic">Slot libre</p>
    </div>
  );
}

function SectionTitle({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      {icon && <span className="text-ink-500">{icon}</span>}
      <h3 className="text-[10px] font-black uppercase tracking-[0.22em] text-ink-400 flex items-center gap-2 w-full">
        {children}
      </h3>
      <span className="flex-1 h-px bg-ink-800/80" />
    </div>
  );
}

function getPendingStatus(status: Order["status"]) {
  switch (status) {
    case "listo":
      return {
        label: "Listo",
        className: "bg-green-soft text-green border-green-line",
      };
    case "preparando":
      return {
        label: "Preparando",
        className: "bg-blue-soft text-blue border-blue-line",
      };
    default:
      return {
        label: "Pendiente",
        className: "bg-amber-soft text-amber border-amber-line",
      };
  }
}

function Stat({
  label,
  value,
  tone,
  mono = true,
}: {
  label: string;
  value: number | string;
  tone: "blue" | "amber" | "green" | "ink";
  mono?: boolean;
}) {
  const color =
    tone === "blue"
      ? "text-sky-500"
      : tone === "amber"
        ? "text-orange-500"
        : tone === "green"
          ? "text-green"
          : "text-ink-50";
  return (
    <div className="flex flex-col gap-0.5 select-none items-end">
      <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-ink-500 leading-none">
        {label}
      </span>
      <span
        className={`text-[15px] tabular leading-none ${color} ${mono ? "font-mono font-bold" : "font-semibold"}`}
      >
        {value}
      </span>
    </div>
  );
}

function Sep() {
  return <span className="w-px h-6 bg-ink-800" />;
}

function ToastItem({ 
  id, 
  displayNumber, 
  text, 
  onClose 
}: { 
  id: string; 
  displayNumber: number; 
  text: string; 
  onClose: () => void; 
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className="relative overflow-hidden w-full bg-ink-900/95 border border-green-line/40 backdrop-blur-xl rounded-2xl p-3.5 shadow-2xl flex flex-col gap-1.5 pointer-events-auto"
      style={{
        animation: "toastSlideIn 5s ease-in-out forwards",
      }}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-green-soft border border-green-line flex items-center justify-center shrink-0">
            <Package size={13} className="text-green" />
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-green font-bold block">
              Nuevo pedido
            </span>
            <span className="font-mono text-base font-black text-white tabular">
              #{displayNumber}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-lg text-ink-500 hover:text-white hover:bg-ink-800 transition-colors cursor-pointer shrink-0"
        >
          <X size={12} />
        </button>
      </div>
      <p className="text-xs font-semibold text-ink-200 leading-snug line-clamp-2 pl-9">
        {text}
      </p>

      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ink-950">
        <div
          className="h-full bg-green"
          style={{
            animation: "shrinkWidth 5s linear forwards",
          }}
        />
      </div>
    </div>
  );
}
