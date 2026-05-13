"use client";

import { Banknote, LogOut, Power, QrCode } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import CashSaleModal from "@/components/CashSaleModal";
import CloseNightModal from "@/components/CloseNightModal";
import { byCreatedAtDesc, STATUS_META } from "@/lib/orderStatus";
import { computeTotals } from "@/lib/totals";
import { useSSE } from "@/lib/useSSE";
import { formatHm } from "@/lib/utils";
import type {
  CashSale,
  EventSummary,
  NightEvent,
  Order,
  OrderStatus,
} from "@/types/domain";

type Props = {
  initialEvent: NightEvent;
  initialOrders: Order[];
  initialCashSales: CashSale[];
};

/**
 * Admin V2 — dashboard denso (handoff design).
 * Sin sparkline "ventas por hora" (descartado por el usuario).
 * Layout grid 4 columnas:
 *  - Row 1: 4 KPIs (Total, Transferencia, Efectivo, Tragos).
 *  - Row 2-3: Top tragos (col 1-2) + Pedidos digitales (col 3-4, alto x2).
 *  - Row 3 cont: Efectivo en barra (col 1-2).
 */
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
  const [cashOpen, setCashOpen] = useState(false);
  const [summary, setSummary] = useState<EventSummary | null>(null);

  const totals = useMemo(
    () => computeTotals(orders, cashSales),
    [orders, cashSales],
  );

  const pendingDeliveries = useMemo(
    () =>
      orders.filter((o) => o.status === "preparando" || o.status === "listo")
        .length,
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
      router.refresh();
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const maxDrinkQty = totals.drinksSold[0]?.qty ?? 0;
  const totalDrinkUnits = totals.drinksSold.reduce((s, d) => s + d.qty, 0);
  const totalOps = totals.transferenciaCount + totals.efectivoCount;
  const avgTicket = totalOps > 0 ? Math.round(totals.total / totalOps) : 0;
  const transferPct =
    totals.total > 0
      ? Math.round((totals.transferenciaTotal / totals.total) * 100)
      : 0;
  const cashPct =
    totals.total > 0 ? Math.max(0, 100 - transferPct) : 0;

  const startedAtStr = formatHm(event.startedAt);

  return (
    <main className="min-h-screen bg-ink-950 text-ink-50 flex flex-col">
      <CashSaleModal open={cashOpen} onClose={() => setCashOpen(false)} />
      <CloseNightModal
        open={modalOpen}
        totals={totals}
        pendingDeliveries={pendingDeliveries}
        startedAt={event.startedAt}
        summary={summary}
        onConfirm={handleCloseConfirm}
        onClose={handleModalClose}
      />

      {/* Top bar */}
      <header className="h-[60px] px-6 flex justify-between items-center border-b border-ink-800 bg-ink-925 shrink-0">
        <div className="flex items-baseline gap-3.5 min-w-0">
          <span className="font-serif-italic text-[22px] leading-none text-ink-50 shrink-0">
            Cocktrail
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400 truncate">
            Admin · {startedAtStr} hs · #{event.orderCounter} pedidos
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCashOpen(true)}
            className="h-9 px-3.5 rounded-lg bg-green-soft border border-green-line text-green flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] hover:brightness-110 transition-all"
          >
            <Banknote size={13} />
            <span className="hidden sm:inline">Venta efectivo</span>
          </button>
          <Link
            href="/admin/qr"
            className="w-9 h-9 rounded-lg bg-ink-850 border border-ink-700 text-ink-100 flex items-center justify-center hover:text-blue hover:border-blue-line transition-all"
            aria-label="Ver QR para imprimir"
            title="QR para imprimir"
          >
            <QrCode size={14} />
          </Link>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="h-9 px-3.5 rounded-lg bg-danger-soft border border-danger-line text-danger flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] hover:brightness-110 transition-all"
          >
            <Power size={13} />
            <span className="hidden sm:inline">Cerrar noche</span>
            <span className="inline sm:hidden">Cerrar</span>
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-9 h-9 rounded-lg bg-ink-850 border border-ink-700 text-ink-300 flex items-center justify-center hover:text-danger hover:border-danger-line transition-all"
            aria-label="Cerrar sesión"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Body grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-3.5 p-5 auto-rows-min lg:auto-rows-auto">
        {/* Row 1: 4 KPIs */}
        <Kpi
          label="Total noche"
          value={totals.total}
          isCurrency
          sub={
            totalOps > 0
              ? `${totalOps} operaciones · ticket $${avgTicket.toLocaleString("es-AR")}`
              : "Sin movimientos"
          }
          deltaTone="up"
          deltaText="EN VIVO"
        />
        <Kpi
          label="Transferencia"
          value={totals.transferenciaTotal}
          isCurrency
          sub={`${totals.transferenciaCount} ${totals.transferenciaCount === 1 ? "pedido" : "pedidos"} · Mercado Pago`}
          deltaTone="neutral"
          deltaText={`${transferPct}%`}
        />
        <Kpi
          label="Efectivo"
          value={totals.efectivoTotal}
          isCurrency
          sub={`${totals.efectivoCount} ${totals.efectivoCount === 1 ? "venta en barra" : "ventas en barra"}`}
          deltaTone="neutral"
          deltaText={`${cashPct}%`}
        />
        <Kpi
          label="Tragos servidos"
          value={totalDrinkUnits}
          sub={`${totals.drinksSold.length} ${totals.drinksSold.length === 1 ? "variedad" : "variedades"} distintas`}
          deltaTone="up"
          deltaText={totalDrinkUnits > 0 ? `+${totalDrinkUnits}` : "0"}
        />

        {/* Row 2: Top tragos (span 2) + Pedidos digitales (span 2, row span 2) */}
        <section className="lg:col-span-2 bg-ink-900 border border-ink-800 rounded-xl p-4 flex flex-col gap-3 min-w-0 min-h-0">
          <div className="flex justify-between items-baseline">
            <span className="flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-100">
              Tragos más vendidos
              <span className="text-[10px] font-mono text-ink-400 px-1.5 py-0.5 bg-ink-800 rounded tabular">
                {totals.drinksSold.length}
              </span>
            </span>
            <span className="text-[10px] font-medium text-ink-400 uppercase tracking-[0.06em]">
              {totalDrinkUnits} unidades
            </span>
          </div>
          {totals.drinksSold.length === 0 ? (
            <EmptyCard text="Aún no se vendieron tragos esta noche" />
          ) : (
            <div className="flex flex-col gap-2 flex-1 overflow-y-auto no-scrollbar min-h-0">
              {totals.drinksSold.slice(0, 8).map((d, i) => {
                const widthPct = maxDrinkQty
                  ? Math.max(8, (d.qty / maxDrinkQty) * 100)
                  : 0;
                const pct =
                  totalDrinkUnits > 0
                    ? Math.round((d.qty / totalDrinkUnits) * 100)
                    : 0;
                return (
                  <div
                    key={d.drinkId}
                    className="grid grid-cols-[22px_1fr_60px_60px_80px] items-center gap-3 py-2 border-t border-ink-850 first:border-t-0"
                  >
                    <span className="font-mono text-[11px] text-ink-500 tabular">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <span className="text-[14px] font-medium text-ink-50 leading-tight truncate">
                        {d.name}
                      </span>
                      <div className="h-1 rounded bg-ink-800 overflow-hidden">
                        <div
                          className="h-full bg-blue"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                    <span className="font-mono text-[12px] text-ink-300 text-left tabular">
                      × {d.qty}
                    </span>
                    <span className="font-mono text-[12px] text-ink-300 text-center tabular">
                      {pct}%
                    </span>
                    <span className="font-mono text-[13px] text-ink-100 text-right tabular">
                      ${d.subtotal.toLocaleString("es-AR")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-2 lg:row-span-2 bg-ink-900 border border-ink-800 rounded-xl p-4 flex flex-col gap-3 min-w-0 min-h-0">
          <div className="flex justify-between items-baseline">
            <span className="flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-100">
              Pedidos digitales
              <span className="text-[10px] font-mono text-ink-400 px-1.5 py-0.5 bg-ink-800 rounded tabular">
                {sortedOrders.length}
              </span>
            </span>
            <span className="text-[10px] font-medium text-ink-400 uppercase tracking-[0.06em]">
              Más reciente arriba
            </span>
          </div>
          {sortedOrders.length === 0 ? (
            <EmptyCard text="Sin pedidos digitales" />
          ) : (
            <div className="flex flex-col gap-0.5 flex-1 overflow-y-auto no-scrollbar min-h-0">
              {sortedOrders.map((o) => (
                <OrderRow key={o.id} order={o} />
              ))}
            </div>
          )}
        </section>

        {/* Row 3: Efectivo span 2 */}
        <section className="lg:col-span-2 bg-ink-900 border border-ink-800 rounded-xl p-4 flex flex-col gap-3 min-w-0">
          <div className="flex justify-between items-baseline">
            <span className="flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-100">
              Efectivo en barra
              <span className="text-[10px] font-mono text-ink-400 px-1.5 py-0.5 bg-ink-800 rounded tabular">
                {sortedCashSales.length}
              </span>
            </span>
            <span className="text-[10px] font-medium text-ink-400 uppercase tracking-[0.06em]">
              cargado por admin
            </span>
          </div>
          {sortedCashSales.length === 0 ? (
            <div className="text-center py-4 font-serif-italic text-[13px] text-ink-500">
              — Sin ventas en efectivo —
            </div>
          ) : (
            <div className="flex flex-col">
              {sortedCashSales.map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-[1fr_auto] gap-3 items-center py-2.5 border-b border-ink-850 last:border-b-0"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-[12px] font-medium text-ink-50 truncate">
                      {s.description}
                    </span>
                    <span className="text-[10px] text-ink-400 font-mono tabular">
                      {formatHm(s.createdAt)} hs · {s.addedBy}
                    </span>
                  </div>
                  <span className="font-mono text-[13px] text-green tabular">
                    +${s.amount.toLocaleString("es-AR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Footer live indicator */}
      <div className="px-5 pb-3 flex justify-between items-center text-[11px] text-ink-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green shadow-[0_0_0_3px_var(--green-soft)]" />
            En vivo
          </span>
          <span>Sesión iniciada {startedAtStr} hs</span>
        </div>
        <span>Última actualización · ahora</span>
      </div>
    </main>
  );
}

// ───────────────────────────── helpers ─────────────────────────────

function Kpi({
  label,
  value,
  sub,
  isCurrency,
  deltaTone,
  deltaText,
}: {
  label: string;
  value: number;
  sub: string;
  isCurrency?: boolean;
  deltaTone: "up" | "neutral";
  deltaText: string;
}) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 flex flex-col gap-2 min-w-0">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">
          {label}
        </span>
        <span
          className={`font-mono text-[10px] px-1.5 py-0.5 rounded tabular ${
            deltaTone === "up"
              ? "bg-green-soft text-green"
              : "bg-ink-800 text-ink-300"
          }`}
        >
          {deltaText}
        </span>
      </div>
      <div
        className="text-[28px] font-medium text-ink-50 leading-none tabular"
        style={{ letterSpacing: "-0.02em" }}
      >
        {isCurrency && (
          <span className="text-ink-400 text-[0.7em] mr-0.5">$</span>
        )}
        {value.toLocaleString("es-AR")}
      </div>
      <span className="text-[11px] text-ink-400">{sub}</span>
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  const stateClass = statusToBadge(order.status);
  const itemsCount = order.items.length;
  return (
    <div className="grid grid-cols-[44px_80px_1fr_60px_80px] gap-3 items-center px-2.5 py-2.5 rounded-lg hover:bg-ink-850 transition-colors">
      <span className="font-mono text-[14px] text-ink-50 tabular">
        #{order.displayNumber}
      </span>
      <span
        className={`text-[9px] font-medium uppercase tracking-[0.14em] px-1.5 py-1 rounded text-center ${stateClass}`}
      >
        {STATUS_META[order.status].short}
      </span>
      <span className="font-mono text-[11px] text-ink-300 tabular">
        {formatHm(order.createdAt)} hs
      </span>
      <span className="text-[11px] text-ink-400 text-right">
        {itemsCount} {itemsCount === 1 ? "ítem" : "ítems"}
      </span>
      <span className="font-mono text-[13px] text-ink-50 text-right tabular">
        ${order.total.toLocaleString("es-AR")}
      </span>
    </div>
  );
}

function statusToBadge(status: OrderStatus): string {
  switch (status) {
    case "pagado":
      return "bg-blue-soft text-blue";
    case "preparando":
      return "bg-amber-soft text-amber";
    case "listo":
      return "bg-green-soft text-green";
    case "entregado":
      return "bg-green-soft text-green";
    case "cancelado":
      return "bg-danger-soft text-danger";
    default:
      return "bg-ink-800 text-ink-300";
  }
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="bg-ink-925/50 border border-dashed border-ink-800 rounded-lg p-6 text-center text-xs text-ink-400">
      {text}
    </div>
  );
}
