"use client";

import {
  Banknote,
  CheckCircle2,
  ChefHat,
  Inbox,
  LogOut,
  Martini,
  PackageCheck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import CashSaleModal from "@/components/CashSaleModal";
import { byCreatedAtAsc } from "@/lib/orderStatus";
import { useSSE } from "@/lib/useSSE";
import type { Order, OrderStatus, Role } from "@/types/domain";

type Props = {
  initialOrders: Order[];
  role: Role;
};

export default function BarraClient({ initialOrders, role }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [cashOpen, setCashOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

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
        setOrders((prev) => {
          const isDone =
            order.status === "entregado" || order.status === "cancelado";
          if (isDone) return prev.filter((o) => o.id !== order.id);
          const idx = prev.findIndex((o) => o.id === order.id);
          if (idx === -1) return [...prev, order].sort(byCreatedAtAsc);
          const next = [...prev];
          next[idx] = order;
          return next;
        });
      },
      "event.closed": () => setOrders([]),
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
    <main className="min-h-screen bg-[#020617] text-white flex flex-col">
      <CashSaleModal open={cashOpen} onClose={() => setCashOpen(false)} />

      <header className="sticky top-0 z-30 bg-[#020617]/90 backdrop-blur-xl border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#38bdf8] to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-[#38bdf8]/20">
            <Martini size={20} className="text-[#020617] fill-[#020617]" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white leading-none">
              Cocktrail · Barra
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">
              Sesión: {role === "admin" ? "Admin" : "Barman"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCashOpen(true)}
            className="flex items-center gap-2 px-4 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider"
          >
            <Banknote size={16} />
            <span className="hidden sm:inline">Venta efectivo</span>
            <span className="inline sm:hidden">$</span>
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-10 h-10 rounded-xl bg-[#0f172a] border border-[#1e293b] flex items-center justify-center text-slate-400 hover:text-red-300 hover:border-red-500/30 transition-all active:scale-95"
            aria-label="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-6">
        <Column
          title="Nuevos"
          subtitle="Recién pagados"
          tone="blue"
          icon={<Inbox size={16} />}
          orders={pagados}
          renderAction={(o) => (
            <ActionButton
              tone="blue"
              label="Tomar"
              disabled={pendingIds.has(o.id)}
              onClick={() => advance(o, "preparando")}
            />
          )}
          onCancel={cancelOrder}
          pendingIds={pendingIds}
        />
        <Column
          title="Preparando"
          subtitle="En proceso"
          tone="amber"
          icon={<ChefHat size={16} />}
          orders={preparando}
          renderAction={(o) => (
            <ActionButton
              tone="amber"
              label="Marcar listo"
              disabled={pendingIds.has(o.id)}
              onClick={() => advance(o, "listo")}
            />
          )}
          onCancel={cancelOrder}
          pendingIds={pendingIds}
        />
        <Column
          title="Listos"
          subtitle="Para entregar"
          tone="emerald"
          icon={<PackageCheck size={16} />}
          orders={listos}
          renderAction={(o) => (
            <ActionButton
              tone="emerald"
              label="Entregar"
              icon={<CheckCircle2 size={14} strokeWidth={3} />}
              disabled={pendingIds.has(o.id)}
              onClick={() => advance(o, "entregado")}
            />
          )}
          onCancel={cancelOrder}
          pendingIds={pendingIds}
        />
      </div>
    </main>
  );
}

// ───────────────────────────── Column ─────────────────────────────

type Tone = "blue" | "amber" | "emerald";

const TONE_STYLES: Record<
  Tone,
  { border: string; chip: string; subtle: string }
> = {
  blue: {
    border: "border-[#38bdf8]/30",
    chip: "bg-[#38bdf8]/10 text-[#38bdf8] border-[#38bdf8]/30",
    subtle: "text-[#38bdf8]",
  },
  amber: {
    border: "border-amber-500/30",
    chip: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    subtle: "text-amber-300",
  },
  emerald: {
    border: "border-emerald-500/30",
    chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    subtle: "text-emerald-300",
  },
};

function Column({
  title,
  subtitle,
  tone,
  icon,
  orders,
  renderAction,
  onCancel,
  pendingIds,
}: {
  title: string;
  subtitle: string;
  tone: Tone;
  icon: React.ReactNode;
  orders: Order[];
  renderAction: (o: Order) => React.ReactNode;
  onCancel: (o: Order) => void;
  pendingIds: Set<string>;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <section className="flex flex-col gap-3 min-w-0">
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${styles.chip}`}
      >
        {icon}
        <span className="text-[11px] font-black uppercase tracking-widest">
          {title}
        </span>
        <span className="ml-auto text-[10px] font-mono font-bold">
          {orders.length}
        </span>
      </div>
      <p className="text-[10px] text-slate-500 uppercase tracking-widest px-2">
        {subtitle}
      </p>

      <div className="flex flex-col gap-3">
        {orders.length === 0 ? (
          <div className="bg-[#0f172a]/40 border border-dashed border-[#1e293b] rounded-2xl p-6 text-center text-xs text-slate-500">
            Sin pedidos
          </div>
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              tone={tone}
              action={renderAction(o)}
              onCancel={() => onCancel(o)}
              isPending={pendingIds.has(o.id)}
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
  action,
  onCancel,
  isPending,
}: {
  order: Order;
  tone: Tone;
  action: React.ReactNode;
  onCancel: () => void;
  isPending: boolean;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <article
      className={`relative bg-[#0f172a] border rounded-2xl p-5 shadow-lg transition-all ${styles.border} ${isPending ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={onCancel}
        disabled={isPending}
        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-[#020617]/80 border border-[#1e293b] flex items-center justify-center text-slate-500 hover:text-red-400 hover:border-red-500/30 active:scale-95 transition-all disabled:opacity-40"
        aria-label="Cancelar pedido"
      >
        <X size={14} />
      </button>

      <div className="flex items-baseline gap-2 mb-4">
        <span
          className={`text-4xl font-black tracking-tighter ${styles.subtle}`}
        >
          #{order.displayNumber}
        </span>
        <span className="text-[10px] text-slate-500 font-mono">
          {new Date(order.createdAt).toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <ul className="flex flex-col gap-1.5 mb-4">
        {order.items.map((it, i) => (
          <li
            key={`${it.drinkId}-${i}`}
            className="flex justify-between items-center text-sm"
          >
            <span className="text-slate-200">
              <span className="text-[#38bdf8] font-mono font-bold mr-2">
                {it.qty}×
              </span>
              {it.name}
            </span>
            <span className="font-mono text-xs text-slate-500">
              ${it.subtotal.toLocaleString("es-AR")}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between pt-3 border-t border-[#1e293b]/60 mb-4">
        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
          Total
        </span>
        <span className="text-lg font-black text-white">
          ${order.total.toLocaleString("es-AR")}
        </span>
      </div>

      {action}
    </article>
  );
}

// ───────────────────────────── ActionButton ─────────────────────────────

function ActionButton({
  tone,
  label,
  icon,
  disabled,
  onClick,
}: {
  tone: Tone;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  const bg =
    tone === "blue"
      ? "bg-[#38bdf8] text-[#020617] hover:bg-[#7dd3fc]"
      : tone === "amber"
        ? "bg-amber-400 text-amber-950 hover:bg-amber-300"
        : "bg-emerald-500 text-emerald-950 hover:bg-emerald-400";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full h-11 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${bg}`}
    >
      {icon}
      {label}
    </button>
  );
}
