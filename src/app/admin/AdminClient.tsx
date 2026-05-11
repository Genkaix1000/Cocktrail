"use client";

import {
  Banknote,
  CreditCard,
  Inbox,
  LogOut,
  Martini,
  Power,
  QrCode,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import CloseNightModal from "@/components/CloseNightModal";
import { byCreatedAtDesc, STATUS_META } from "@/lib/orderStatus";
import { computeTotals } from "@/lib/totals";
import { useSSE } from "@/lib/useSSE";
import type {
  CashSale,
  EventSummary,
  NightEvent,
  Order,
} from "@/types/domain";

type Props = {
  initialEvent: NightEvent;
  initialOrders: Order[];
  initialCashSales: CashSale[];
};

export default function AdminClient({
  initialEvent,
  initialOrders,
  initialCashSales,
}: Props) {
  const router = useRouter();
  const [event, setEvent] = useState(initialEvent);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [cashSales, setCashSales] = useState<CashSale[]>(initialCashSales);
  const [modalOpen, setModalOpen] = useState(false);
  const [summary, setSummary] = useState<EventSummary | null>(null);

  const totals = useMemo(
    () => computeTotals(orders, cashSales),
    [orders, cashSales],
  );

  const pendingDeliveries = useMemo(
    () =>
      orders.filter(
        (o) => o.status === "preparando" || o.status === "listo",
      ).length,
    [orders],
  );

  const sortedOrders = useMemo(
    () =>
      orders.filter((o) => o.status !== "cancelado").sort(byCreatedAtDesc),
    [orders],
  );

  const sortedCashSales = useMemo(
    () => [...cashSales].sort(byCreatedAtDesc),
    [cashSales],
  );

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return;
      const state = (await res.json()) as {
        event: NightEvent;
        orders: Order[];
        cashSales: CashSale[];
      };
      setEvent(state.event);
      setOrders(state.orders ?? []);
      setCashSales(state.cashSales ?? []);
    } catch {}
  }, []);

  useSSE(
    {
      "order.created": ({ order }) => {
        setOrders((prev) =>
          prev.some((o) => o.id === order.id) ? prev : [...prev, order],
        );
      },
      "order.updated": ({ order }) => {
        setOrders((prev) => {
          const idx = prev.findIndex((o) => o.id === order.id);
          if (idx === -1) return [...prev, order];
          const next = [...prev];
          next[idx] = order;
          return next;
        });
      },
      "cash_sale.added": ({ cashSale }) => {
        setCashSales((prev) =>
          prev.some((s) => s.id === cashSale.id) ? prev : [...prev, cashSale],
        );
      },
      "event.closed": ({ summary: s }) => {
        setSummary(s);
        setModalOpen(true);
        refetch();
      },
    },
    { onOpen: refetch },
  );

  async function handleCloseConfirm() {
    const res = await fetch("/api/event/close", { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "No se pudo cerrar la noche");
    }
    const data = (await res.json()) as EventSummary;
    setSummary(data);
    // El SSE event.closed también va a llegar y refetchear el state.
  }

  function handleModalClose() {
    setModalOpen(false);
    // Si veníamos del summary, limpiar para el próximo cierre.
    if (summary) {
      setSummary(null);
      // Re-fetch del estado del nuevo evento que abrió el server.
      router.refresh();
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const maxDrinkQty = totals.drinksSold[0]?.qty ?? 0;
  const hasMovements = sortedOrders.length > 0 || sortedCashSales.length > 0;

  return (
    <main className="min-h-screen bg-[#020617] text-white">
      <CloseNightModal
        open={modalOpen}
        totals={totals}
        pendingDeliveries={pendingDeliveries}
        startedAt={event.startedAt}
        summary={summary}
        onConfirm={handleCloseConfirm}
        onClose={handleModalClose}
      />

      <header className="sticky top-0 z-30 bg-[#020617]/90 backdrop-blur-xl border-b border-white/5 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-gradient-to-br from-[#38bdf8] to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-[#38bdf8]/20">
            <Martini size={20} className="text-[#020617] fill-[#020617]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-black tracking-tight text-white leading-none truncate">
              Cocktrail · Admin
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1 truncate">
              Sesión: Admin · Noche iniciada{" "}
              <span className="font-mono text-slate-300">
                {new Date(event.startedAt).toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>{" "}
              · #{event.orderCounter} pedidos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/admin/qr"
            className="w-10 h-10 rounded-xl bg-[#0f172a] border border-[#1e293b] flex items-center justify-center text-slate-400 hover:text-[#38bdf8] hover:border-[#38bdf8]/30 transition-all active:scale-95"
            aria-label="Ver QR para imprimir"
            title="QR para imprimir"
          >
            <QrCode size={16} />
          </Link>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 h-10 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider"
          >
            <Power size={16} />
            <span className="hidden sm:inline">Cerrar noche</span>
            <span className="inline sm:hidden">Cerrar</span>
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

      <div className="max-w-6xl mx-auto p-6 flex flex-col gap-6">
        {/* Cards de totales */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TotalCard
            label="Transferencia"
            icon={<CreditCard size={16} />}
            count={totals.transferenciaCount}
            value={totals.transferenciaTotal}
            tone="blue"
          />
          <TotalCard
            label="Efectivo"
            icon={<Banknote size={16} />}
            count={totals.efectivoCount}
            value={totals.efectivoTotal}
            tone="emerald"
          />
          <TotalCard
            label="Total noche"
            icon={<TrendingUp size={16} />}
            count={totals.transferenciaCount + totals.efectivoCount}
            value={totals.total}
            tone="white"
            big
          />
        </section>

        {/* Drinks vendidos */}
        <section>
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
            Tragos vendidos
          </h2>
          {totals.drinksSold.length === 0 ? (
            <EmptyState text="Aún no se vendieron tragos esta noche" />
          ) : (
            <div className="bg-[#0f172a] border border-[#1e293b] rounded-2xl divide-y divide-[#1e293b]/60">
              {totals.drinksSold.map((d) => {
                const widthPct = maxDrinkQty
                  ? Math.max(8, (d.qty / maxDrinkQty) * 100)
                  : 0;
                return (
                  <div
                    key={d.drinkId}
                    className="relative flex items-center justify-between px-4 py-3 overflow-hidden"
                  >
                    <div
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-[#38bdf8]/10 pointer-events-none"
                      style={{ width: `${widthPct}%` }}
                    />
                    <div className="relative flex items-center gap-3 text-sm">
                      <span className="font-mono font-bold text-[#38bdf8] w-10">
                        ×{d.qty}
                      </span>
                      <span className="text-white font-medium">{d.name}</span>
                    </div>
                    <span className="relative font-mono text-sm text-slate-300">
                      ${d.subtotal.toLocaleString("es-AR")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 2 columnas: orders y cash sales */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
              <CreditCard size={12} />
              Pedidos digitales
              <span className="text-slate-600">({sortedOrders.length})</span>
            </h2>
            {sortedOrders.length === 0 ? (
              <EmptyState text="Sin pedidos digitales" />
            ) : (
              <ul className="bg-[#0f172a] border border-[#1e293b] rounded-2xl divide-y divide-[#1e293b]/60 max-h-80 overflow-y-auto">
                {sortedOrders.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono font-black text-[#38bdf8]">
                        #{o.displayNumber}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span
                          className={`text-[10px] uppercase tracking-widest font-bold ${STATUS_META[o.status].tone}`}
                        >
                          {STATUS_META[o.status].short}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(o.createdAt).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          · {o.items.length} item
                          {o.items.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-sm font-bold text-white">
                      ${o.total.toLocaleString("es-AR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
              <Banknote size={12} />
              Efectivo en barra
              <span className="text-slate-600">({sortedCashSales.length})</span>
            </h2>
            {sortedCashSales.length === 0 ? (
              <EmptyState text="Sin ventas en efectivo" />
            ) : (
              <ul className="bg-[#0f172a] border border-[#1e293b] rounded-2xl divide-y divide-[#1e293b]/60 max-h-80 overflow-y-auto">
                {sortedCashSales.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between px-4 py-3 text-sm"
                  >
                    <div className="flex flex-col min-w-0 mr-2">
                      <span className="text-white truncate">
                        {s.description}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(s.createdAt).toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {s.addedBy}
                      </span>
                    </div>
                    <span className="font-mono text-sm font-bold text-emerald-300">
                      ${s.amount.toLocaleString("es-AR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {!hasMovements && (
          <div className="text-center text-slate-500 text-sm flex items-center justify-center gap-2 py-4">
            <Sparkles size={14} />
            Aún no hay movimientos esta noche. Cuando alguien escanee el QR,
            aparecerá acá en vivo.
          </div>
        )}
      </div>
    </main>
  );
}

// ─────────────────────────── helpers ───────────────────────────

function TotalCard({
  label,
  icon,
  count,
  value,
  tone,
  big = false,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  value: number;
  tone: "blue" | "emerald" | "white";
  big?: boolean;
}) {
  const ring =
    tone === "blue"
      ? "border-[#38bdf8]/30 bg-gradient-to-br from-[#38bdf8]/10 to-transparent"
      : tone === "emerald"
        ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent"
        : "border-white/15 bg-gradient-to-br from-white/[0.04] to-transparent";
  const iconColor =
    tone === "blue"
      ? "text-[#38bdf8]"
      : tone === "emerald"
        ? "text-emerald-400"
        : "text-white";
  return (
    <div className={`rounded-2xl border p-5 ${ring}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={iconColor}>{icon}</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
          {label}
        </span>
      </div>
      <div
        className={`font-black tracking-tight text-white ${big ? "text-4xl" : "text-3xl"}`}
      >
        ${value.toLocaleString("es-AR")}
      </div>
      <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-2">
        {count} {count === 1 ? "operación" : "operaciones"}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-[#0f172a]/40 border border-dashed border-[#1e293b] rounded-2xl p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
      <Inbox size={14} />
      {text}
    </div>
  );
}
