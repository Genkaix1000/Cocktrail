"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { mercadopagoService, type MpHealth, type MpHealthCheck } from "@/services/mercadopago.service";
import { formatHm } from "@/lib/utils";

const CHECK_LABELS: Record<keyof MpHealth["checks"], string> = {
  singleSeller: "Cuenta de Mercado Pago única",
  deviceOwnership: "El lector pertenece a la cuenta activa",
  deviceMode: "Modo del lector (PDV)",
  cajaProvisioned: "Caja provisionada en la cuenta activa",
};

const CHECK_ORDER: (keyof MpHealth["checks"])[] = [
  "singleSeller",
  "deviceOwnership",
  "deviceMode",
  "cajaProvisioned",
];

function formatCheckedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatHm(d.getTime());
}

/** Punto de estado: verde (ok) / rojo (falla) / gris (desconocido — nunca rojo). */
function StatusDot({ ok }: { ok: boolean | null }) {
  return (
    <span
      aria-hidden="true"
      className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${
        ok === true
          ? "bg-[var(--success-base)]"
          : ok === false
            ? "bg-[var(--danger-base)]"
            : "bg-[var(--text-tertiary)]"
      }`}
    />
  );
}

function estadoDe(ok: boolean | null): string {
  return ok === true ? "OK" : ok === false ? "Falla" : "Desconocido";
}

function HealthRow({ label, check }: { label: string; check: MpHealthCheck }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <StatusDot ok={check.ok} />
      <div className="min-w-0 space-y-0.5">
        <p className="text-[13px] font-medium text-[var(--text-primary)]">
          {label}
          <span
            className={`ml-2 text-[10px] font-semibold uppercase tracking-wider ${
              check.ok === true
                ? "text-[var(--success-base)]"
                : check.ok === false
                  ? "text-[var(--danger-base)]"
                  : "text-[var(--text-tertiary)]"
            }`}
          >
            {estadoDe(check.ok)}
          </span>
        </p>
        <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{check.detail}</p>
        {check.ok === false && check.action && (
          <p className="text-[12px] text-[var(--amber-base)] leading-relaxed">→ {check.action}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Panel de salud de la vinculación con Mercado Pago (bloque G): los 4 chequeos
 * + la fila F1 del fallback de emergencia + el flag de env-device. Un
 * "desconocido" nunca se pinta rojo (cero falsos positivos que paren la caja).
 */
export default function MpHealthPanel() {
  const [health, setHealth] = useState<MpHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    setError(null);
    try {
      setHealth(await mercadopagoService.getMpHealth(refresh));
    } catch (err) {
      console.error("Error loading MP health:", err);
      setError("No se pudo consultar la salud de la vinculación. Reintentá en unos segundos.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false).finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // refresh=1 fuerza el re-chequeo contra MP (salta el cache server de 30s).
    await load(true);
    setRefreshing(false);
  }, [load]);

  return (
    <section
      aria-label="Salud de la vinculación con Mercado Pago"
      className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-4 shadow-card"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center border border-[var(--border-subtle)] text-[var(--accent-primary)] shrink-0">
            <Activity size={16} strokeWidth={1.8} />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
              Salud de la vinculación
            </h3>
            <p className="text-[12px] text-[var(--text-tertiary)]">
              Chequeos contra Mercado Pago
              {health ? ` — última lectura ${formatCheckedAt(health.checkedAt)}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="h-9 px-4 rounded-full bg-[var(--bg-panel)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[12px] font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-wait cursor-pointer"
        >
          {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refrescar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : error ? (
        <div className="rounded-xl bg-[var(--bg-panel)] px-4 py-4 text-center space-y-2">
          <p className="text-[12px] text-[var(--text-secondary)]">{error}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="text-[13px] font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      ) : health ? (
        <div className="space-y-3">
          {health.blocking && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-xl bg-[var(--danger-soft)] px-3.5 py-2.5 text-[12px] font-medium text-[var(--danger-base)]"
            >
              <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
              <span>El cobro con Posnet está bloqueado: la plata entraría a otra cuenta.</span>
            </div>
          )}

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] divide-y divide-[var(--border-subtle)] overflow-hidden">
            {CHECK_ORDER.map((key) => (
              <HealthRow key={key} label={CHECK_LABELS[key]} check={health.checks[key]} />
            ))}

            {/* Fila F1 — fallback de emergencia (MP_ACCESS_TOKEN + MP_POS_DEVICE_ID) */}
            <div className="flex items-start gap-3 px-4 py-3">
              <StatusDot
                ok={
                  health.fallback.status === "usable"
                    ? true
                    : health.fallback.status === "unusable"
                      ? false
                      : null
                }
              />
              <div className="min-w-0 space-y-0.5">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">
                  Fallback de emergencia (F1)
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {health.fallback.status === "usable"
                      ? "Usable"
                      : health.fallback.status === "unusable"
                        ? "No usable"
                        : "Desconocido"}
                  </span>
                </p>
                {health.fallback.reason && (
                  <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                    {health.fallback.reason}
                  </p>
                )}
                {health.fallback.lastDegradedAt && (
                  <p className="text-[12px] text-[var(--amber-base)] leading-relaxed">
                    Un cobro degradó al fallback de emergencia
                    {health.fallback.lastDegradedReason ? `: ${health.fallback.lastDegradedReason}` : "."}
                  </p>
                )}
              </div>
            </div>

            {/* Cobros saliendo por el device de la env (D2) — advertencia, nunca rojo */}
            <div className="flex items-start gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${
                  health.usingEnvDevice ? "bg-[var(--amber-base)]" : "bg-[var(--success-base)]"
                }`}
              />
              <div className="min-w-0 space-y-0.5">
                <p className="text-[13px] font-medium text-[var(--text-primary)]">
                  Posnet de emergencia en uso
                </p>
                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                  {health.usingEnvDevice
                    ? "Algún cobro de esta sesión salió por el Posnet de la variable de entorno, no por el vinculado a la caja."
                    : "Los cobros salen por el Posnet vinculado a la caja."}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
