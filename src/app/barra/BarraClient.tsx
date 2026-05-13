"use client";

import { LogOut, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { byCreatedAtAsc } from "@/lib/orderStatus";
import { useSSE } from "@/lib/useSSE";
import { formatHm } from "@/lib/utils";
import type { Order, OrderStatus } from "@/types/domain";

type Props = {
  initialOrders: Order[];
};

type ColTone = "nuevo" | "preparando" | "listo";

/**
 * Barra V2 — tablero kanban 3 columnas (handoff design v2).
 * Cols: Tomar pedido (azul) · Preparando (ámbar) · Entregar (verde).
 * Cada card tiene un solo CTA que avanza al estado siguiente.
 */
export default function BarraClient({ initialOrders }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  // Contador local de entregados durante esta sesión del barman. Se incrementa
  // por SSE cuando llega `order.updated` con status `entregado`. No persiste
  // entre refreshes — es solo un feedback visual del flujo del turno.
  const [deliveredCount, setDeliveredCount] = useState<number>(0);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const state = (await res.json()) as { orders?: Order[] };
      const active = (state.orders ?? [])
        .filter((o) => o.status !== "entregado" && o.status !== "cancelado")
        .sort(byCreatedAtAsc);
      setOrders(active);
    } catch {}
  }, []);

  useSSE(
    {
      "order.created": ({ order }) => {
        setOrders((prev) =>
          prev.some((o) => o.id === order.id)
            ? prev
            : [...prev, order].sort(byCreatedAtAsc),
        );
      },
      "order.updated": ({ order }) => {
        if (order.status === "entregado") {
          setDeliveredCount((n) => n + 1);
        }
        setOrders((prev) => {
          const isTerminal =
            order.status === "entregado" || order.status === "cancelado";
          if (isTerminal) return prev.filter((o) => o.id !== order.id);
          const idx = prev.findIndex((o) => o.id === order.id);
          if (idx === -1) return [...prev, order].sort(byCreatedAtAsc);
          const next = [...prev];
          next[idx] = order;
          return next;
        });
      },
      "event.closed": () => {
        setOrders([]);
        setDeliveredCount(0);
      },
    },
    { onOpen: refetch },
  );

  async function advance(order: Order, status: OrderStatus) {
    if (pendingIds.has(order.id)) return;
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.add(order.id);
      return next;
    });
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      // 409 = transición ya aplicada (otro click / actor). Lo ignoramos.
      if (!res.ok && res.status !== 409) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        console.error("[barra] avance fallido:", body.error);
      }
    } catch (err) {
      console.error("[barra] network:", err);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  }

  async function cancelOrder(order: Order) {
    const ok = window.confirm(`¿Cancelar pedido #${order.displayNumber}?`);
    if (!ok) return;
    await advance(order, "cancelado");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const pagados = orders.filter((o) => o.status === "pagado");
  const preparando = orders.filter((o) => o.status === "preparando");
  const listos = orders.filter((o) => o.status === "listo");

  return (
    <main className="min-h-screen bg-ink-950 text-ink-50 flex flex-col">
      {/* Header */}
      <header className="h-[60px] px-6 flex justify-between items-center border-b border-ink-800 bg-ink-925 shrink-0">
        <div className="flex items-baseline gap-3.5">
          <span className="font-serif-italic text-[22px] leading-none text-ink-50">
            Cocktrail
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400">
            Barra · Tablero
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Stat label="Nuevos" value={pagados.length} tone="blue" />
          <Sep />
          <Stat label="Preparando" value={preparando.length} tone="amber" />
          <Sep />
          <Stat label="Listos" value={listos.length} tone="green" />
          <Sep />
          <Stat label="Entregados" value={deliveredCount} tone="ink" />
          <button
            type="button"
            onClick={logout}
            className="ml-2 w-10 h-10 flex items-center justify-center text-ink-400 hover:text-danger transition-colors active:scale-95"
            aria-label="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Body — 3-column kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 flex-1 min-h-0">
        <Column
          tone="nuevo"
          title="Tomar pedido"
          sub="Pagos verificados · listos para aceptar"
          count={pagados.length}
          emptyText="— Sin pedidos nuevos —"
          orders={pagados}
          buttonLabel="Aceptar"
          pendingIds={pendingIds}
          onAdvance={(o) => advance(o, "preparando")}
          onCancel={cancelOrder}
        />
        <Column
          tone="preparando"
          title="Preparando"
          sub="En barra · marcá listo al terminar"
          count={preparando.length}
          emptyText="— Nada en barra —"
          orders={preparando}
          buttonLabel="Marcar listo"
          pendingIds={pendingIds}
          onAdvance={(o) => advance(o, "listo")}
          onCancel={cancelOrder}
        />
        <Column
          tone="listo"
          title="Entregar"
          sub="Esperando retiro del cliente"
          count={listos.length}
          emptyText="— Nada listo todavía —"
          orders={listos}
          buttonLabel="Entregar"
          pendingIds={pendingIds}
          onAdvance={(o) => advance(o, "entregado")}
          onCancel={cancelOrder}
          lastCol
        />
      </div>
    </main>
  );
}

// ───────────────────────────── Column ─────────────────────────────

const TONE_DOT: Record<ColTone, string> = {
  nuevo: "bg-blue shadow-[0_0_0_3px_var(--blue-soft)]",
  preparando: "bg-amber shadow-[0_0_0_3px_var(--amber-soft)] ct-soft-pulse",
  listo: "bg-green shadow-[0_0_0_3px_var(--green-soft)]",
};

const TONE_EYEBROW: Record<ColTone, string> = {
  nuevo: "text-blue",
  preparando: "text-amber",
  listo: "text-green",
};

const TONE_TOP_ACCENT: Record<ColTone, string> = {
  nuevo: "bg-blue",
  preparando: "bg-amber",
  listo: "bg-green",
};

const TONE_CARD_BORDER: Record<ColTone, string> = {
  nuevo: "border-blue-line bg-gradient-to-b from-ink-850 to-ink-900",
  preparando: "border-amber-line bg-ink-900",
  listo: "border-green-line bg-ink-900",
};

const TONE_NUM_SYM: Record<ColTone, string> = {
  nuevo: "text-blue/50",
  preparando: "text-amber/50",
  listo: "text-green/55",
};

const TONE_NUM_BODY: Record<ColTone, string> = {
  nuevo: "text-ink-50",
  preparando: "text-ink-50",
  listo: "text-green",
};

const TONE_CTA: Record<ColTone, string> = {
  nuevo: "bg-blue text-ink-950",
  preparando: "bg-amber text-ink-950",
  listo: "bg-green text-ink-950",
};

function Column({
  tone,
  title,
  sub,
  count,
  emptyText,
  orders,
  buttonLabel,
  pendingIds,
  onAdvance,
  onCancel,
  lastCol,
}: {
  tone: ColTone;
  title: string;
  sub: string;
  count: number;
  emptyText: string;
  orders: Order[];
  buttonLabel: string;
  pendingIds: Set<string>;
  onAdvance: (o: Order) => void;
  onCancel: (o: Order) => void;
  lastCol?: boolean;
}) {
  return (
    <section
      className={`flex flex-col min-w-0 bg-ink-950 ${lastCol ? "" : "md:border-r border-ink-800"}`}
    >
      {/* Column head */}
      <header className="relative px-5 pt-4 pb-3.5 border-b border-ink-800 bg-ink-925 flex flex-col gap-1.5">
        <span
          aria-hidden
          className={`absolute top-0 inset-x-0 h-[2px] ${TONE_TOP_ACCENT[tone]}`}
        />
        <div className="flex justify-between items-center">
          <span
            className={`flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] ${TONE_EYEBROW[tone]}`}
          >
            <span className={`w-[7px] h-[7px] rounded-full ${TONE_DOT[tone]}`} />
            {title}
          </span>
          <span className="font-mono text-[11px] text-ink-300 px-2 py-[3px] bg-ink-800 rounded-md tabular">
            {count}
          </span>
        </div>
        <span className="font-serif-italic text-[18px] leading-tight text-ink-100">
          {sub}
        </span>
      </header>

      {/* Column list */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-3.5 flex flex-col gap-2.5">
        {orders.length === 0 ? (
          <div className="text-center py-10 px-3 font-serif-italic text-sm text-ink-500">
            {emptyText}
          </div>
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              tone={tone}
              buttonLabel={buttonLabel}
              isPending={pendingIds.has(o.id)}
              onAdvance={() => onAdvance(o)}
              onCancel={() => onCancel(o)}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ───────────────────────────── OrderCard ─────────────────────────────

function OrderCard({
  order,
  tone,
  buttonLabel,
  isPending,
  onAdvance,
  onCancel,
}: {
  order: Order;
  tone: ColTone;
  buttonLabel: string;
  isPending: boolean;
  onAdvance: () => void;
  onCancel: () => void;
}) {
  const qtyTotal = order.items.reduce((s, it) => s + it.qty, 0);
  return (
    <article
      className={`relative rounded-xl border p-3.5 pt-3 pb-3 flex flex-col gap-2.5 transition-colors ${TONE_CARD_BORDER[tone]} ${isPending ? "opacity-60" : ""}`}
    >
      {/* Top: #N + time + small cancel */}
      <div className="flex items-baseline justify-between gap-2.5">
        <div
          className="font-serif tabular leading-[0.85] text-[38px]"
          style={{ letterSpacing: "-0.03em" }}
        >
          <span className={TONE_NUM_SYM[tone]}>#</span>
          <span className={TONE_NUM_BODY[tone]}>{order.displayNumber}</span>
        </div>
        <div className="flex items-start gap-1.5">
          <div className="flex flex-col items-end gap-[3px]">
            <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-ink-400">
              {tone === "listo" ? "Listo" : "Pedido"}
            </span>
            <span
              className={`font-mono text-[12px] tabular ${tone === "preparando" ? "text-amber" : "text-ink-100"}`}
            >
              {formatHm(order.createdAt)}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="w-6 h-6 rounded-md border border-ink-700 text-ink-500 hover:text-danger hover:border-danger-line transition-colors disabled:opacity-40 flex items-center justify-center"
            aria-label="Cancelar pedido"
            title="Cancelar pedido"
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Items */}
      <ul className="flex flex-col gap-1 py-2 border-y border-ink-800">
        {order.items.map((it, i) => (
          <li
            key={`${it.drinkId}-${i}`}
            className="grid grid-cols-[28px_1fr] gap-2 items-center text-[13px] font-medium text-ink-100"
          >
            <span className="font-mono font-semibold text-[13px] text-ink-50 tabular">
              {it.qty}×
            </span>
            <span className="truncate">{it.name}</span>
          </li>
        ))}
      </ul>

      {/* Meta row */}
      <div className="flex justify-between items-center font-mono text-[11px] text-ink-300 tabular">
        <span>
          {qtyTotal} {qtyTotal === 1 ? "trago" : "tragos"} · {order.items.length}{" "}
          {order.items.length === 1 ? "ítem" : "ítems"}
        </span>
        <span className="text-ink-50 font-semibold">
          ${order.total.toLocaleString("es-AR")}
        </span>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onAdvance}
        disabled={isPending}
        className={`h-[42px] rounded-[10px] font-semibold text-[12px] uppercase tracking-[0.14em] flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 ${TONE_CTA[tone]}`}
      >
        {buttonLabel} <span className="text-[16px]">→</span>
      </button>
    </article>
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
      ? "text-blue"
      : tone === "amber"
        ? "text-amber"
        : tone === "green"
          ? "text-green"
          : "text-ink-50";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-ink-400">
        {label}
      </span>
      <span
        className={`text-[16px] tabular ${color} ${mono ? "font-mono" : "font-medium"}`}
      >
        {value}
      </span>
    </div>
  );
}

function Sep() {
  return <span className="w-px h-6 bg-ink-800" />;
}

