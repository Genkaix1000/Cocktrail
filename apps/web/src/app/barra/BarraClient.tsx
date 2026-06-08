"use client";

import { LogOut, Activity, X, AlertTriangle, Slash, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useRef } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { useSSE } from "@/lib/useSSE";
import { ordersService } from "@/services/orders.service";
import { authService } from "@/services/auth.service";
import { useScannerInput } from "@/hooks/useScannerInput";
import { ticketsService } from "@/services/tickets.service";
import { eventsService } from "@/services/events.service";
import type { Order, NightEvent } from "@cocktrail/shared";

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

  // Recent scans state (last 6 scans: 1 main + 5 history)
  const [recentScans, setRecentScans] = useState<Order[]>([]);

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

  // Load offline queue and recent scans on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedQueue = localStorage.getItem("cocktrail_offline_scans");
      const savedDelivered = localStorage.getItem("cocktrail_delivered_count");

      setTimeout(() => {
        if (savedQueue) {
          try {
            setOfflineQueue(JSON.parse(savedQueue));
          } catch {}
        }
        if (savedDelivered) {
          setDeliveredCount(Number(savedDelivered));
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
      if (state.event) {
        setEvent(state.event);
        
        // Night isolation: reset state if event changed
        const savedEventId = localStorage.getItem("cocktrail_last_event_id");
        if (savedEventId !== state.event.id) {
          localStorage.setItem("cocktrail_last_event_id", state.event.id);
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
              const filtered = scans.filter((s) => s.createdAt >= state.event.startedAt);
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

  // Scan processor handler with offline support
  const handleScan = useCallback(async (code: string) => {
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
      return;
    }

    try {
      const res = await ticketsService.redeem(code);
      if (res.success) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(200);
        }
        triggerFlash({
          type: "success",
          message: `¡Pedido #${res.order.displayNumber} entregado con éxito!`,
          displayNumber: res.order.displayNumber,
          items: res.order.items,
        });

        setDeliveredCount((prev) => {
          const nextCount = prev + 1;
          localStorage.setItem("cocktrail_delivered_count", String(nextCount));
          return nextCount;
        });

        setRecentScans((prev) => {
          const exists = prev.some((o) => o.id === res.order.id);
          if (exists) return prev;
          const next = [res.order, ...prev];
          const currentEvent = eventRef.current;
          const filtered = currentEvent ? next.filter((o) => o.createdAt >= currentEvent.startedAt) : next;
          const limited = filtered.slice(0, 6);
          localStorage.setItem("cocktrail_recent_scans", JSON.stringify(limited));
          return limited;
        });

        // Trigger refetch of pending list since order is now delivered
        fetchPendingOrders();
      }
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
        return;
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
    }
  }, [fetchPendingOrders, triggerFlash]);

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
            const limited = filtered.slice(0, 6);
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

  const handleRowClick = useCallback((order: Order) => {
    const hasCancelPermission = currentUser?.role === "admin" || currentUser?.permissions?.cancelarTickets;
    if (!hasCancelPermission) return;
    setCancelOrder(order);
    setCancellationStep("confirm");
    setCancelReason("");
    setCustomReason("");
  }, [currentUser]);

  async function logout() {
    await authService.logout();
    router.push("/login");
    router.refresh();
  }

  const latestScan = recentScans[0];
  const historicalScans = recentScans.slice(1, 6);

  return (
    <main className="min-h-screen bg-ink-950 text-ink-50 flex flex-col pb-10 selection:bg-emerald-500/20">
      {/* Dynamic Keyframes Injection */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
        @keyframes toastFadeInOut {
          0% { transform: translateX(20px); opacity: 0; }
          8% { transform: translateX(0); opacity: 1; }
          90% { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(20px); opacity: 0; }
        }
        @keyframes flashFadeInOut {
          0% { opacity: 0; }
          4% { opacity: 1; }
          96% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}} />

      {/* Header */}
      <header className="h-[60px] px-6 flex justify-between items-center border-b border-ink-800 bg-ink-925 shrink-0 relative">
        <div className="flex items-center gap-3.5">
          <BrandLogo size="lg" />
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400">
            Estación de Escaneo
          </span>
        </div>

        {/* Center Scanner Status */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 bg-ink-950/80 border border-red-500/25 rounded-full px-4 py-1.5 shadow-inner select-none animate-pulse">
          <div className="relative w-2 h-2 rounded-full bg-red-500">
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
          </div>
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-red-500">
            SCANNER NO ENCONTRADO
          </span>
        </div>

        <div className="flex items-center gap-4">
          <Stat label="Sesión" value={deliveredCount} tone="green" />
          {offlineQueue.length > 0 && (
            <>
              <Sep />
              <Stat label="Offline" value={`${offlineQueue.length} pnd.`} tone="amber" />
            </>
          )}
          <Sep />
          <button
            type="button"
            onClick={logout}
            className="ml-2 w-10 h-10 flex items-center justify-center text-ink-400 hover:text-white transition-colors active:scale-95 cursor-pointer"
            aria-label="Cerrar Sesión"
            title="Cerrar Sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Offline Pending Queue Banner */}
      {offlineQueue.length > 0 && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center justify-between text-xs font-mono text-amber-500 animate-pulse shrink-0">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>
              <strong>Modo Sin Conexión</strong> · Hay {offlineQueue.length} canjes pendientes de sincronización en este dispositivo.
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-amber-500/60">
            Se enviarán automáticamente al recuperar señal
          </span>
        </div>
      )}

      {/* Body: Main Workspace */}
      <div className="flex-1 w-full p-6 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start justify-start">
        
        {/* Left Column: Scans history & main details */}
        <div className="flex flex-col gap-6 w-full min-w-0 lg:col-span-2">
          {/* TOP: Latest Scan Large Container */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-black uppercase tracking-[0.22em] text-ink-400">
              Último Trago Escaneado
            </h3>
            
            {latestScan ? (
              <div className="relative overflow-hidden bg-ink-900 border-2 border-emerald-500/60 rounded-[28px] p-6 md:p-8 shadow-[0_0_40px_rgba(16,185,129,0.12)] flex flex-col md:flex-row items-center md:justify-between gap-6 transition-all duration-300 animate-in fade-in zoom-in-95">
                {/* Decorative radial blur background */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full filter blur-3xl pointer-events-none -mr-20 -mt-20" />
                
                <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 w-full">
                  {/* Huge Number */}
                  <div className="w-32 h-32 md:w-36 md:h-36 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col items-center justify-center font-serif text-[52px] md:text-[64px] font-black text-emerald-400 select-none shadow-inner shrink-0">
                    <span className="text-emerald-500/60 text-2xl leading-none font-sans font-medium uppercase tracking-wider -mb-1">Pedido</span>
                    #{latestScan.displayNumber}
                  </div>

                  {/* Main Drink Details */}
                  <div className="flex-1 flex flex-col text-center md:text-left min-w-0 w-full">
                    <div className="flex items-center justify-center md:justify-start gap-2.5 mb-2">
                      <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full px-2.5 py-0.5 font-bold uppercase tracking-wider font-mono">
                        Listo para servir
                      </span>
                      <span className="text-xs text-ink-400 font-mono">
                        Canjeado a las {latestScan.deliveredAt ? new Date(latestScan.deliveredAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : new Date().toLocaleTimeString("es-AR")} hs
                      </span>
                    </div>

                    {/* Drink Items */}
                    <ul className="flex flex-col gap-2.5 w-full">
                      {latestScan.items.map((it, idx) => (
                        <li key={`${it.drinkId}-${idx}`} className="flex items-center justify-between gap-4 w-full">
                          <div className="flex items-center gap-4 min-w-0">
                            <span className="font-mono font-black text-3xl md:text-4xl text-emerald-400 shrink-0">
                              {it.qty}×
                            </span>
                            <span className="text-2xl md:text-3xl font-extrabold text-white tracking-tight truncate text-left">
                              {it.name}
                            </span>
                          </div>
                          <span className="text-sm font-mono text-ink-500 font-semibold shrink-0">
                            {it.qty > 1 ? `${it.qty}x $${it.unitPrice.toLocaleString("es-AR")}` : `$${it.unitPrice.toLocaleString("es-AR")}`}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* Small total at the bottom-right, low prominence */}
                    <div className="flex justify-end w-full mt-3 pt-2.5 border-t border-ink-800/40">
                      <span className="text-xs font-mono text-ink-500">
                        Total: <strong className="text-ink-400 font-semibold">${latestScan.total.toLocaleString("es-AR")}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center py-16 border-2 border-dashed border-ink-800 rounded-[28px] text-center bg-ink-900/10 min-h-[180px]">
                <span className="text-4xl mb-2 select-none animate-pulse">🍸</span>
                <p className="text-sm font-serif-italic text-ink-400">— Esperando primer canje de ticket —</p>
                <p className="text-[11px] text-ink-500 max-w-xs mt-1">
                  Apunta la lectora de código QR a un ticket para registrar la entrega del trago.
                </p>
              </div>
            )}
          </section>

          {/* BOTTOM: Historical Recent Scans (Next 5 scans) */}
          <section className="flex flex-col gap-3 mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.22em] text-ink-400">
                Historial Reciente (Últimos 5 canjes)
              </h3>
              {historicalScans.length > 0 && (
                <span className="text-[10px] font-mono text-ink-500 uppercase tracking-wide">
                  Sesión del Barman
                </span>
              )}
            </div>

            <div className="flex flex-col border border-ink-800 rounded-[28px] overflow-hidden bg-ink-900 divide-y divide-ink-800 min-h-[220px]">
              {historicalScans.length === 0 ? (
                <div className="flex-grow flex flex-col items-center justify-center py-10 text-center bg-ink-900/5">
                  <p className="text-xs text-ink-500 font-serif-italic">— No hay canjes anteriores en esta sesión —</p>
                </div>
              ) : (
                historicalScans.map((o) => (
                  <div 
                    key={o.id} 
                    className="flex justify-between items-center py-3.5 px-4 bg-ink-900 hover:bg-ink-850/40 transition-colors gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      {/* Compact ID Badge */}
                      <div className="w-10 h-10 rounded-xl bg-ink-950 border border-ink-800 text-ink-400 flex items-center justify-center font-serif text-sm font-black select-none shrink-0">
                        #{o.displayNumber}
                      </div>
                      
                      {/* Item Details */}
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-white text-sm truncate">
                          {o.items.map(it => `x${it.qty} ${it.name}`).join(", ")}
                        </span>
                        <span className="text-[9px] text-ink-500 font-mono mt-0.5 uppercase tracking-wider">
                          Canjeado · {o.deliveredAt ? new Date(o.deliveredAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : new Date().toLocaleTimeString("es-AR")} hs
                        </span>
                      </div>
                    </div>

                    {/* Metadata & Status */}
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="flex flex-col items-end font-mono text-xs text-ink-450 select-none">
                        <span className="font-bold text-ink-300">${o.total.toLocaleString("es-AR")}</span>
                        <span className="text-[8px] uppercase tracking-wider mt-0.5">{o.paymentMethod}</span>
                      </div>
                      <span className="text-[9px] font-semibold bg-ink-800 text-ink-500 border border-ink-750 px-2 py-0.5 rounded-full select-none font-mono uppercase tracking-widest">
                        Entregado
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Pending Drinks List */}
        <aside className="relative w-full bg-ink-900 border border-ink-800 rounded-[28px] p-5 flex flex-col gap-4 shadow-xl lg:col-span-1">
          {/* Floating Notifications Stack inside Tragos Pendientes */}
          <div className="absolute top-2 right-2 z-50 flex flex-col gap-2 w-full max-w-[280px] pointer-events-none">
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

          <div className="flex justify-between items-center pb-2 border-b border-ink-800">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue"></span>
              </span>
              <h3 className="text-xs font-black uppercase tracking-[0.22em] text-ink-100">
                Tragos Pendientes
              </h3>
            </div>
            <span className="text-[10px] font-mono font-bold bg-ink-800 text-ink-400 px-2 py-0.5 rounded-md tabular-nums">
              {pendingOrders.length}
            </span>
          </div>

          <div className="flex flex-col border border-ink-800 rounded-2xl overflow-hidden bg-ink-900 divide-y divide-ink-800 max-h-[350px] overflow-y-auto no-scrollbar">
            {pendingOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-ink-500 font-serif-italic text-xs">
                — Sin tragos pendientes —
              </div>
            ) : (
              pendingOrders.map((o) => {
                const hasCancelPermission = currentUser?.role === "admin" || currentUser?.permissions?.cancelarTickets;
                return (
                  <div
                    key={o.id}
                    className="flex justify-between items-center py-3.5 px-4 bg-ink-900 hover:bg-ink-850/20 transition-colors gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      {/* Left: compact number */}
                      <div className="w-10 h-10 rounded-xl bg-ink-950 border border-ink-800 text-ink-300 flex items-center justify-center font-serif text-sm font-black select-none shrink-0">
                        #{o.displayNumber}
                      </div>
                      
                      {/* Center: items */}
                      <div className="text-sm font-bold text-white truncate">
                        {o.items.map((it) => `x${it.qty} ${it.name}`).join(", ")}
                      </div>
                    </div>

                    {/* Right: cancel button */}
                    {hasCancelPermission && (
                      <button
                        type="button"
                        onClick={() => handleRowClick(o)}
                        className="w-8 h-8 flex items-center justify-center bg-danger-soft hover:bg-danger-soft/80 border border-danger-line text-danger rounded-xl transition-all active:scale-95 cursor-pointer shrink-0"
                        title="Cancelar pedido"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

      </div>



      {/* Visual Flash Overlay for Scanner Feedback */}
      {flash && (
        <div
          onClick={dismissFlash}
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 cursor-pointer select-none transition-all duration-355 ${
            flash.type === "success"
              ? "bg-emerald-950/95 border-[12px] border-emerald-500 text-emerald-400"
              : flash.type === "duplicate"
                ? "bg-amber-950/95 border-[12px] border-amber-500 text-amber-400"
                : "bg-red-950/95 border-[12px] border-red-500 text-red-400"
          }`}
          style={{
            animation: "flashFadeInOut 5s ease-in-out forwards"
          }}
        >
          <div className="text-center max-w-xl flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200">
            <span className="text-[64px] leading-none mb-2 select-none">
              {flash.type === "success" ? "✓" : flash.type === "duplicate" ? "⚠️" : "✗"}
            </span>
            <h2 className="font-serif-italic text-[32px] md:text-[40px] leading-tight select-none">
              {flash.type === "success"
                ? "Pedido Entregado"
                : flash.type === "duplicate"
                  ? "Ticket Ya Canjeado"
                  : "Error de Ticket"}
            </h2>
            <p className="font-mono text-[16px] md:text-[18px] text-ink-100 select-none mt-2">
              {flash.message}
            </p>

            {/* List of order items */}
            {flash.items && flash.items.length > 0 && (
              <div className="mt-4 p-5 bg-ink-950/80 border border-ink-800 rounded-2xl w-full max-w-md flex flex-col gap-3 shadow-2xl">
                <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink-400 border-b border-ink-850 pb-2">
                  Detalle del Pedido {flash.displayNumber ? `#${flash.displayNumber}` : ""}
                </span>
                <ul className="flex flex-col gap-2">
                  {flash.items.map((it, idx) => (
                    <li key={idx} className="flex justify-between items-center text-left">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-emerald-400 text-lg">
                          {it.qty}×
                        </span>
                        <span className="font-extrabold text-white text-[15px] uppercase tracking-wide">
                          {it.name}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-ink-400 mt-6 select-none animate-pulse">
              Haz click en cualquier lado para cerrar
            </span>
          </div>

          {/* Progress bar at the bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-2 bg-ink-950/40">
            <div
              className={`h-full ${
                flash.type === "success"
                  ? "bg-emerald-500"
                  : flash.type === "duplicate"
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
              style={{
                animation: "shrinkWidth 5s linear forwards"
              }}
            />
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
                  <span className="text-3xl select-none">⚠️</span>
                  <h2 className="text-lg font-bold text-white tracking-tight font-sans">
                    ¿Estás seguro de que querés cancelar este ticket?
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

// ───────────────────────────── header helpers ─────────────────────────────

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
          ? "text-emerald-500"
          : "text-ink-50";
  return (
    <div className="flex flex-col gap-1 select-none">
      <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-ink-400 leading-none">
        {label}
      </span>
      <span
        className={`text-[16px] tabular leading-none ${color} ${mono ? "font-mono" : "font-medium"}`}
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
      className="relative overflow-hidden w-full max-w-[280px] bg-ink-900/95 border border-ink-800 backdrop-blur-md rounded-2xl p-3 shadow-2xl flex flex-col gap-1 pointer-events-auto"
      style={{
        animation: "toastFadeInOut 5s ease-in-out forwards"
      }}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-emerald-400 font-bold">
            Nuevo Pedido
          </span>
          <span className="font-serif text-sm font-black text-white">
            #{displayNumber}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-400 hover:text-white transition-colors cursor-pointer"
        >
          <X size={12} />
        </button>
      </div>
      <p className="text-xs font-bold text-white leading-tight">
        {text}
      </p>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-ink-950">
        <div 
          className="h-full bg-emerald-500" 
          style={{
            animation: "shrinkWidth 5s linear forwards"
          }}
        />
      </div>
    </div>
  );
}
