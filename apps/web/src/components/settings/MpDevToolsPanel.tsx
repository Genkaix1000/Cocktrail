"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCopy,
  Loader2,
  RefreshCw,
  Terminal,
  Wifi,
  XCircle,
} from "lucide-react";
import {
  mercadopagoService,
  type MpHealth,
  type MpHealthCheck,
  type MpRecentOrderRow,
  type MpSellerStatus,
  type MpWebhookEventRow,
  type PosnetDeviceStatus,
} from "@/services/mercadopago.service";

const CHECK_LABELS: Record<keyof MpHealth["checks"], string> = {
  singleSeller: "Cuenta de Mercado Pago",
  deviceOwnership: "Posnet en la cuenta activa",
  deviceMode: "Modo del lector (PDV)",
  cajaProvisioned: "Caja provisionada",
};

const CHECK_ORDER: (keyof MpHealth["checks"])[] = [
  "singleSeller",
  "cajaProvisioned",
  "deviceOwnership",
  "deviceMode",
];

function checkIcon(ok: boolean | null) {
  if (ok === true) return <CheckCircle2 size={13} className="text-[var(--success-base)] shrink-0" aria-hidden />;
  if (ok === false) return <XCircle size={13} className="text-[var(--danger-base)] shrink-0" aria-hidden />;
  return <CircleHelp size={13} className="text-[var(--text-tertiary)] shrink-0" aria-hidden />;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "medium" });
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] px-2.5 py-2 text-[11px] leading-snug text-[var(--text-secondary)] whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function RowExpand({
  summary,
  detail,
}: {
  summary: ReactNode;
  detail: unknown;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)]/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left cursor-pointer"
        aria-expanded={open}
      >
        <div className="min-w-0 text-[12px] text-[var(--text-primary)]">{summary}</div>
        <ChevronDown
          size={13}
          className={`text-[var(--text-tertiary)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="px-2.5 pb-2">
          <JsonBlock value={detail} />
        </div>
      )}
    </li>
  );
}

/** Página chica: el panel es diagnóstico, no un historial. */
const PAGE_SIZE = 5;
const MAX_ROWS = 25;

export default function MpDevToolsPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [health, setHealth] = useState<MpHealth | null>(null);
  const [seller, setSeller] = useState<MpSellerStatus | null>(null);
  const [webhookAvailable, setWebhookAvailable] = useState(true);
  const [webhookSecretConfigured, setWebhookSecretConfigured] = useState<boolean | null>(null);
  const [events, setEvents] = useState<MpWebhookEventRow[]>([]);
  const [orders, setOrders] = useState<MpRecentOrderRow[]>([]);
  const [ordersLimit, setOrdersLimit] = useState(PAGE_SIZE);
  const [eventsLimit, setEventsLimit] = useState(PAGE_SIZE);
  const [deviceStatus, setDeviceStatus] = useState<PosnetDeviceStatus | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadAll = useCallback(async (refreshHealth: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const [h, s, wh, ord] = await Promise.all([
        mercadopagoService.getMpHealth(refreshHealth),
        mercadopagoService.getSellerStatus(),
        mercadopagoService.listWebhookEvents(PAGE_SIZE),
        mercadopagoService.listRecentOrders(PAGE_SIZE),
      ]);
      setHealth(h);
      setSeller(s);
      setWebhookAvailable(wh.available);
      setWebhookSecretConfigured(wh.webhookSecretConfigured);
      setEvents(wh.events);
      setOrders(ord.orders);
      setOrdersLimit(PAGE_SIZE);
      setEventsLimit(PAGE_SIZE);
      setLoadedOnce(true);
    } catch {
      setError("No se pudo cargar el diagnóstico MP.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMoreOrders = useCallback(async () => {
    const next = Math.min(ordersLimit + PAGE_SIZE, MAX_ROWS);
    if (next === ordersLimit) return;
    setLoadingMoreOrders(true);
    setError(null);
    try {
      const ord = await mercadopagoService.listRecentOrders(next);
      setOrders(ord.orders);
      setOrdersLimit(next);
    } catch {
      setError("No se pudieron cargar más órdenes.");
    } finally {
      setLoadingMoreOrders(false);
    }
  }, [ordersLimit]);

  const loadMoreEvents = useCallback(async () => {
    const next = Math.min(eventsLimit + PAGE_SIZE, MAX_ROWS);
    if (next === eventsLimit) return;
    setLoadingMoreEvents(true);
    setError(null);
    try {
      const wh = await mercadopagoService.listWebhookEvents(next);
      setWebhookAvailable(wh.available);
      setWebhookSecretConfigured(wh.webhookSecretConfigured);
      setEvents(wh.events);
      setEventsLimit(next);
    } catch {
      setError("No se pudieron cargar más webhooks.");
    } finally {
      setLoadingMoreEvents(false);
    }
  }, [eventsLimit]);

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !loadedOnce) await loadAll(false);
  };

  const canLoadMoreOrders = orders.length >= ordersLimit && ordersLimit < MAX_ROWS;
  const canLoadMoreEvents = events.length >= eventsLimit && eventsLimit < MAX_ROWS;

  const handleCopy = async () => {
    const payload = {
      checkedAt: new Date().toISOString(),
      seller,
      health,
      webhookSecretConfigured,
      webhookAvailable,
      deviceStatus,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("No se pudo copiar al portapapeles.");
    }
  };

  const handleDeviceProbe = async () => {
    setDeviceLoading(true);
    setError(null);
    try {
      setDeviceStatus(await mercadopagoService.getDeviceStatus());
    } catch {
      setError("No se pudo consultar el estado del Posnet.");
    } finally {
      setDeviceLoading(false);
    }
  };

  return (
    <section
      aria-label="Herramientas de desarrollador Mercado Pago"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void handleToggle()}
          className="flex items-center gap-2 min-w-0 text-left cursor-pointer"
          aria-expanded={open}
        >
          <Terminal size={14} className="text-[var(--text-tertiary)] shrink-0" aria-hidden />
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            Herramientas de desarrollador
          </span>
          <span className="text-[12px] text-[var(--text-tertiary)] truncate hidden sm:inline">
            sanidad, token, webhooks y órdenes
          </span>
          <ChevronDown
            size={14}
            className={`text-[var(--text-tertiary)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {open && (
          <button
            type="button"
            onClick={() => void loadAll(true)}
            disabled={loading}
            aria-label="Refrescar diagnóstico"
            className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-4 border-t border-[var(--border-subtle)] pt-3">
          {error && (
            <p className="text-[12px] text-[var(--danger-base)]" role="alert">
              {error}
            </p>
          )}

          {loading && !loadedOnce ? (
            <p className="flex items-center gap-2 text-[12px] text-[var(--text-tertiary)]" role="status">
              <Loader2 size={12} className="animate-spin" aria-hidden />
              Cargando diagnóstico…
            </p>
          ) : (
            <>
              {/* Acciones */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="h-8 px-3 rounded-full border border-[var(--border-strong)] text-[12px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ClipboardCopy size={12} aria-hidden />
                  {copied ? "Copiado" : "Copiar diagnóstico"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeviceProbe()}
                  disabled={deviceLoading}
                  className="h-8 px-3 rounded-full border border-[var(--border-strong)] text-[12px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {deviceLoading ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                  ) : (
                    <Wifi size={12} aria-hidden />
                  )}
                  Probar alcance Posnet
                </button>
              </div>

              {deviceStatus && (
                <p className="text-[12px] text-[var(--text-secondary)]">
                  Posnet:{" "}
                  <span
                    className={
                      deviceStatus.connected
                        ? "text-[var(--success-base)] font-semibold"
                        : "text-[var(--amber-base)] font-semibold"
                    }
                  >
                    {deviceStatus.connected ? "conectado" : "sin señal"}
                  </span>
                  {" — "}
                  {deviceStatus.message}
                  {deviceStatus.device
                    ? ` · ${deviceStatus.device.model} · ${deviceStatus.device.operatingMode}`
                    : ""}
                </p>
              )}

              {/* Seller / token meta */}
              <div className="space-y-1.5">
                <h4 className="text-[12px] font-semibold text-[var(--text-primary)]">Cuenta / token</h4>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-tertiary)]">userId</dt>
                    <dd className="tabular text-[var(--text-primary)] truncate">{seller?.userId ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-tertiary)]">status</dt>
                    <dd className="text-[var(--text-primary)]">{seller?.status ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-tertiary)]">expiresAt</dt>
                    <dd className="tabular text-[var(--text-primary)]">{formatWhen(seller?.expiresAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-tertiary)]">tokens</dt>
                    <dd className="text-[var(--text-primary)]">
                      AT {seller?.hasAccessToken ? "sí" : "no"} · RT {seller?.hasRefreshToken ? "sí" : "no"}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Sanidad completa */}
              <div className="space-y-1.5">
                <h4 className="text-[12px] font-semibold text-[var(--text-primary)]">Sanidad avanzada</h4>
                {health ? (
                  <>
                    <ul className="space-y-1.5">
                      {CHECK_ORDER.map((key) => {
                        const check: MpHealthCheck = health.checks[key];
                        return (
                          <li key={key} className="flex items-start gap-2 text-[12px]">
                            {checkIcon(check.ok)}
                            <div className="min-w-0">
                              <span className="font-semibold text-[var(--text-primary)]">
                                {CHECK_LABELS[key]}
                              </span>
                              <span className="text-[var(--text-secondary)]"> — {check.detail}</span>
                              {check.action && (
                                <span className="block text-[var(--amber-base)] mt-0.5">→ {check.action}</span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[12px] pt-1">
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--text-tertiary)]">blocking</dt>
                        <dd className="text-[var(--text-primary)]">{String(health.blocking)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--text-tertiary)]">hasLinkedDevice</dt>
                        <dd className="text-[var(--text-primary)]">{String(health.hasLinkedDevice)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--text-tertiary)]">usingEnvDevice</dt>
                        <dd className="text-[var(--text-primary)]">{String(health.usingEnvDevice)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--text-tertiary)]">checkedAt</dt>
                        <dd className="tabular text-[var(--text-primary)]">{formatWhen(health.checkedAt)}</dd>
                      </div>
                    </dl>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 space-y-1">
                      <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                        Fallback env · {health.fallback.status}
                      </p>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-snug">
                        {health.fallback.reason ?? "Sin detalle."}
                        {health.fallback.tokenUserId
                          ? ` · tokenUserId ${health.fallback.tokenUserId}`
                          : ""}
                        {health.fallback.deviceSeen != null
                          ? ` · deviceSeen ${String(health.fallback.deviceSeen)}`
                          : ""}
                        {health.fallback.operatingMode
                          ? ` · mode ${health.fallback.operatingMode}`
                          : ""}
                      </p>
                      {health.fallback.lastDegradedAt && (
                        <p className="text-[12px] text-[var(--amber-base)]">
                          Degradó {formatWhen(health.fallback.lastDegradedAt)}
                          {health.fallback.lastDegradedReason
                            ? `: ${health.fallback.lastDegradedReason}`
                            : ""}
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-[12px] text-[var(--text-tertiary)]">Sin datos de salud.</p>
                )}
              </div>

              {/* Webhooks */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[12px] font-semibold text-[var(--text-primary)]">
                    Últimos webhooks
                  </h4>
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    secret {webhookSecretConfigured == null ? "—" : webhookSecretConfigured ? "ok" : "falta"}
                    {events.length > 0 ? ` · ${events.length}` : ""}
                  </span>
                </div>
                {!webhookAvailable ? (
                  <p className="text-[12px] text-[var(--text-tertiary)]">
                    Tabla no disponible en este entorno (local-only).
                  </p>
                ) : events.length === 0 ? (
                  <p className="text-[12px] text-[var(--text-tertiary)]">Sin eventos recientes.</p>
                ) : (
                  <>
                    <ul className="space-y-1.5">
                      {events.map((ev) => (
                        <RowExpand
                          key={ev.id}
                          summary={
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-semibold">{ev.type ?? "—"}</span>
                              <span className="text-[var(--text-tertiary)] tabular">
                                {formatWhen(ev.receivedAt)}
                              </span>
                              <span className="text-[var(--text-secondary)]">
                                {ev.processedAt ? "procesado" : "pendiente"}
                                {ev.attempts > 0 ? ` · ${ev.attempts} intentos` : ""}
                              </span>
                              {ev.lastError && (
                                <span className="text-[var(--danger-base)] truncate max-w-full">
                                  {ev.lastError}
                                </span>
                              )}
                            </span>
                          }
                          detail={ev}
                        />
                      ))}
                    </ul>
                    {canLoadMoreEvents && (
                      <button
                        type="button"
                        onClick={() => void loadMoreEvents()}
                        disabled={loadingMoreEvents}
                        className="h-8 w-full rounded-full border border-[var(--border-strong)] text-[12px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {loadingMoreEvents ? (
                          <Loader2 size={12} className="animate-spin" aria-hidden />
                        ) : null}
                        Cargar {PAGE_SIZE} más
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Orders */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[12px] font-semibold text-[var(--text-primary)]">
                    Últimas órdenes MP
                  </h4>
                  {orders.length > 0 && (
                    <span className="text-[11px] text-[var(--text-tertiary)]">
                      mostrando {orders.length}
                    </span>
                  )}
                </div>
                {orders.length === 0 ? (
                  <p className="text-[12px] text-[var(--text-tertiary)]">Sin órdenes recientes.</p>
                ) : (
                  <>
                    <ul className="space-y-1.5">
                      {orders.map((o) => (
                        <RowExpand
                          key={o.id}
                          summary={
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-semibold uppercase">{o.type}</span>
                              <span className="tabular">${o.amount}</span>
                              <span className="text-[var(--text-secondary)]">{o.status}</span>
                              <span className="text-[var(--text-tertiary)] tabular">
                                {formatWhen(o.createdAt)}
                              </span>
                              {o.verificationError && (
                                <span className="text-[var(--danger-base)] truncate">
                                  {o.verificationError}
                                </span>
                              )}
                            </span>
                          }
                          detail={o}
                        />
                      ))}
                    </ul>
                    {canLoadMoreOrders && (
                      <button
                        type="button"
                        onClick={() => void loadMoreOrders()}
                        disabled={loadingMoreOrders}
                        className="h-8 w-full rounded-full border border-[var(--border-strong)] text-[12px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {loadingMoreOrders ? (
                          <Loader2 size={12} className="animate-spin" aria-hidden />
                        ) : null}
                        Cargar {PAGE_SIZE} más
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
