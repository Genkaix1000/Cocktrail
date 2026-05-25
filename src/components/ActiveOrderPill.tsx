"use client";

import { ChevronRight, Hourglass } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSSE } from "@/lib/useSSE";
import { clearActiveOrder, readActiveOrder } from "@/lib/activeOrder";
import { STATUS_META } from "@/lib/orderStatus";
import type { Order } from "@/types/domain";

const TERMINAL = new Set<Order["status"]>(["entregado", "cancelado"]);

/**
 * Pill flotante arriba de /carta. Si hay un token guardado en localStorage y
 * la orden todavía no está en estado terminal, ofrece volver al ticket en vivo.
 * Se hidrata sin pintar nada para evitar mismatch SSR/CSR.
 */
export default function ActiveOrderPill() {
  const [order, setOrder] = useState<Order | null>(null);
  // Token vive en ref (no participa del render — solo lo necesita el SSE
  // handler para filtrar). Evita el cascading-render warning del setState
  // sincrónico en effect.
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    const ref = readActiveOrder();
    if (!ref) return;
    tokenRef.current = ref.token;

    let cancelled = false;
    fetch("/api/state", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((state: { orders?: Order[] } | null) => {
        if (cancelled || !state) return;
        const found = state.orders?.find((o) => o.token === ref.token);
        if (!found || TERMINAL.has(found.status)) {
          clearActiveOrder();
          tokenRef.current = null;
          return;
        }
        setOrder(found);
      })
      .catch(() => {
        // No frenar la carta si /api/state falla.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useSSE({
    "order.updated": ({ order: updated }) => {
      if (!tokenRef.current || updated.token !== tokenRef.current) return;
      if (TERMINAL.has(updated.status)) {
        clearActiveOrder();
        tokenRef.current = null;
        setOrder(null);
        return;
      }
      setOrder(updated);
    },
  });

  if (!order) return null;

  const meta = STATUS_META[order.status];
  
  // Mapear colores dinámicos para el ícono según el estado
  const iconColorClass = 
    order.status === "pagado" ? "text-[#38bdf8] bg-[#38bdf8]/10" :
    order.status === "preparando" ? "text-amber-300 bg-amber-300/10" :
    order.status === "listo" || order.status === "entregado" ? "text-emerald-400 bg-emerald-400/10" :
    "text-red-400 bg-red-400/10";

  return (
    <Link
      href={`/pedido/${order.token}`}
      className="block bg-ink-850 border border-white/5 rounded-[14px] mx-[18px] mt-3 px-4 py-3 hover:border-white/20 hover:bg-ink-800 active:scale-[0.98] transition-all"
      aria-label={`Volver al pedido #${order.displayNumber}, estado: ${meta.short}`}
    >
      <div className="flex items-center gap-3">
        <div className={`rounded-xl w-10 h-10 flex items-center justify-center shrink-0 ${iconColorClass}`}>
          <Hourglass size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] text-ink-400 uppercase tracking-[0.22em] font-medium leading-none mb-1.5">
            Tu pedido en curso
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif-italic text-[22px] leading-none text-ink-50 tabular">
              #{order.displayNumber}
            </span>
            <span className={`text-[10px] font-medium uppercase tracking-[0.14em] ${meta.tone}`}>
              · {meta.short}
            </span>
          </div>
        </div>
        <ChevronRight size={20} className="text-ink-400 shrink-0" />
      </div>
    </Link>
  );
}
