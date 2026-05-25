import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CreditCard,
  History,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { seedHistoryDemo } from "@/server/seed-history";
import { listClosedEvents } from "@/server/store";
import { formatHm } from "@/lib/utils";
import type { EventSummary } from "@/types/domain";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function formatDateLong(ts: number): { weekday: string; day: number; month: string } {
  const d = new Date(ts);
  return {
    weekday: WEEKDAYS[d.getDay()] ?? "",
    day: d.getDate(),
    month: MONTHS_SHORT[d.getMonth()] ?? "",
  };
}

function startOfWeek(d: Date): number {
  // Lunes como inicio de semana.
  const day = d.getDay(); // 0 = domingo
  const offset = day === 0 ? 6 : day - 1;
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offset);
  return start.getTime();
}

function startOfMonth(d: Date): number {
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return start.getTime();
}

function durationHs(s: EventSummary): string {
  if (!s.closedAt) return "—";
  const ms = s.closedAt - s.startedAt;
  const h = Math.floor(ms / (60 * 60 * 1000));
  const m = Math.round((ms % (60 * 60 * 1000)) / 60000);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export default async function HistorialPage() {
  // Fallback de seed: si el process arrancó antes de que existiera el seed
  // (HMR / dev server viejo) el historial puede estar vacío aunque
  // instrumentation.ts ya esté actualizado. seedHistoryDemo es idempotente
  // — solo agrega data si el array está vacío.
  seedHistoryDemo();
  const events = listClosedEvents();
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  const weekEvents = events.filter((e) => (e.closedAt ?? 0) >= weekStart);
  const monthEvents = events.filter((e) => (e.closedAt ?? 0) >= monthStart);

  const sum = (arr: EventSummary[]) =>
    arr.reduce((s, e) => s + e.totals.total, 0);

  const weekTotal = sum(weekEvents);
  const monthTotal = sum(monthEvents);
  const allTotal = sum(events);
  const avgNight =
    events.length > 0 ? Math.round(allTotal / events.length) : 0;

  return (
    <main className="min-h-screen bg-ink-950 text-ink-50">
      {/* Top bar */}
      <header className="h-[60px] px-6 flex justify-between items-center border-b border-ink-800 bg-ink-925 shrink-0">
        <div className="flex items-center gap-3.5 min-w-0">
          <BrandLogo size="md" />
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400 truncate">
            Historial · {events.length}{" "}
            {events.length === 1 ? "noche archivada" : "noches archivadas"}
          </span>
        </div>

        <Link
          href="/admin"
          className="h-9 px-3.5 rounded-lg bg-ink-850 border border-ink-700 text-ink-200 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] hover:text-ink-50 hover:border-ink-600 transition-colors"
        >
          <ArrowLeft size={13} /> Volver al panel
        </Link>
      </header>

      <div className="max-w-6xl mx-auto p-6 flex flex-col gap-6">
        {/* Hero */}
        <section className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400">
            <History size={12} /> Resumen
          </span>
          <h1 className="font-serif-italic text-[34px] leading-none text-ink-50">
            Noches anteriores
          </h1>
          <p className="text-[13px] text-ink-300 mt-1.5">
            Cada noche cerrada se archiva acá con sus totales, pedidos y ventas
            en efectivo. La vista del demo vive en memoria; en producción se
            persiste en base de datos.
          </p>
        </section>

        {/* Aggregations */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <KPI
            label="Esta semana"
            value={weekTotal}
            sub={`${weekEvents.length} ${weekEvents.length === 1 ? "noche" : "noches"}`}
            tone="blue"
          />
          <KPI
            label="Este mes"
            value={monthTotal}
            sub={`${monthEvents.length} ${monthEvents.length === 1 ? "noche" : "noches"}`}
            tone="green"
          />
          <KPI
            label="Total archivado"
            value={allTotal}
            sub={`${events.length} ${events.length === 1 ? "noche" : "noches"} totales`}
            tone="ink"
          />
          <KPI
            label="Promedio por noche"
            value={avgNight}
            sub={
              events.length > 0
                ? "Sobre todo el historial"
                : "Sin datos todavía"
            }
            tone="ink"
          />
        </section>

        {/* List */}
        <section className="flex flex-col gap-3.5">
          <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400">
            Detalle por noche
          </h2>

          {events.length === 0 ? (
            <div className="bg-ink-900 border border-dashed border-ink-700 rounded-2xl p-10 text-center">
              <CalendarDays
                size={28}
                className="mx-auto text-ink-500 mb-3"
              />
              <p className="font-serif-italic text-[20px] text-ink-200">
                Sin noches cerradas todavía.
              </p>
              <p className="text-[13px] text-ink-400 mt-2">
                Cuando cierres tu primera noche desde el panel, va a aparecer
                acá.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {events.map((e) => (
                <NightRow key={e.id} summary={e} now={now.getTime()} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

// ─────────────────────────── KPI card ───────────────────────────

function KPI({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "blue" | "green" | "ink";
}) {
  const color =
    tone === "blue"
      ? "text-blue"
      : tone === "green"
        ? "text-green"
        : "text-ink-50";
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 flex flex-col gap-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400">
        {label}
      </span>
      <span
        className={`font-mono tabular text-[28px] leading-none ${color}`}
      >
        ${value.toLocaleString("es-AR")}
      </span>
      <span className="text-[11px] text-ink-400">{sub}</span>
    </div>
  );
}

// ─────────────────────────── Night row ──────────────────────────

function NightRow({
  summary,
  now,
}: {
  summary: EventSummary;
  now: number;
}) {
  const closedAt = summary.closedAt ?? summary.startedAt;
  const date = formatDateLong(closedAt);
  const daysAgo = Math.max(0, Math.floor((now - closedAt) / DAY_MS));
  const ago =
    daysAgo === 0
      ? "Hoy"
      : daysAgo === 1
        ? "Ayer"
        : `Hace ${daysAgo} días`;

  const topDrinks = summary.totals.drinksSold.slice(0, 3);

  return (
    <li className="bg-ink-900 border border-ink-800 rounded-2xl p-5 grid grid-cols-1 lg:grid-cols-[200px_1fr_200px] gap-5 lg:items-center">
      {/* Date + duration */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400">
          {ago}
        </span>
        <span className="font-serif-italic text-[22px] leading-none text-ink-50">
          {date.weekday} {date.day} {date.month}
        </span>
        <span className="text-[11px] text-ink-400 font-mono tabular">
          {formatHm(summary.startedAt)} → {formatHm(closedAt)} hs ·{" "}
          {durationHs(summary)}
        </span>
      </div>

      {/* Totals + breakdown */}
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex items-baseline gap-5 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-ink-400">
              Total
            </span>
            <span className="font-mono tabular text-[24px] leading-none text-ink-50">
              ${summary.totals.total.toLocaleString("es-AR")}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.22em] text-blue">
              <CreditCard size={10} /> Transferencia
            </span>
            <span className="font-mono tabular text-[14px] text-ink-100">
              ${summary.totals.transferenciaTotal.toLocaleString("es-AR")}
              <span className="text-ink-400 ml-1.5">
                ({summary.totals.transferenciaCount})
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.22em] text-green">
              <Banknote size={10} /> Efectivo
            </span>
            <span className="font-mono tabular text-[14px] text-ink-100">
              ${summary.totals.efectivoTotal.toLocaleString("es-AR")}
              <span className="text-ink-400 ml-1.5">
                ({summary.totals.efectivoCount})
              </span>
            </span>
          </div>
        </div>

        {topDrinks.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-medium uppercase tracking-[0.22em] text-ink-500">
              Top tragos
            </span>
            <div className="flex gap-3 flex-wrap">
              {topDrinks.map((d) => (
                <span
                  key={d.drinkId}
                  className="text-[12px] text-ink-200"
                >
                  <span className="font-mono tabular text-blue mr-1">
                    ×{d.qty}
                  </span>
                  {d.name}
                </span>
              ))}
              {summary.totals.drinksSold.length > 3 && (
                <span className="text-[12px] text-ink-500">
                  + {summary.totals.drinksSold.length - 3} más
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stats column */}
      <div className="flex lg:flex-col gap-4 lg:gap-1 lg:items-end">
        <Stat
          icon={<TrendingUp size={11} />}
          label="Pedidos"
          value={summary.orderCounter}
        />
        <Stat
          icon={<Banknote size={11} />}
          label="Ventas barra"
          value={summary.cashSales.length}
        />
      </div>
    </li>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col gap-0.5 lg:items-end">
      <span className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.22em] text-ink-400">
        {icon} {label}
      </span>
      <span className="font-mono tabular text-[16px] text-ink-100">
        {value}
      </span>
    </div>
  );
}
