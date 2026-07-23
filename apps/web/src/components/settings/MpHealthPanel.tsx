"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { mercadopagoService, type MpHealth, type MpHealthCheck } from "@/services/mercadopago.service";

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
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

/** Punto de estado: verde (ok) / rojo (falla) / gris (desconocido — nunca rojo). */
function StatusDot({ ok }: { ok: boolean | null }) {
  return (
    <span
      aria-hidden="true"
      className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${
        ok === true ? "bg-green" : ok === false ? "bg-danger" : "bg-ink-600"
      }`}
    />
  );
}

function estadoDe(ok: boolean | null): string {
  return ok === true ? "OK" : ok === false ? "Falla" : "Desconocido";
}

function HealthRow({ label, check }: { label: string; check: MpHealthCheck }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-ink-950/30">
      <StatusDot ok={check.ok} />
      <div className="min-w-0 space-y-0.5">
        <p className="text-[12px] font-medium text-ink-200">
          {label}
          <span
            className={`ml-2 text-[10px] font-bold uppercase tracking-wider ${
              check.ok === true ? "text-green" : check.ok === false ? "text-danger" : "text-ink-500"
            }`}
          >
            {estadoDe(check.ok)}
          </span>
        </p>
        <p className="text-[11px] text-ink-500 leading-relaxed">{check.detail}</p>
        {check.ok === false && check.action && (
          <p className="text-[11px] text-amber leading-relaxed">→ {check.action}</p>
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
      className="bg-ink-900 border border-ink-800 rounded-xl p-6 space-y-4"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-ink-800 text-ink-400 shrink-0">
            <Activity size={16} />
          </div>
          <div>
            <h3 className="text-[16px] font-bold tracking-tight text-ink-100">Salud de la vinculación</h3>
            <p className="text-[12px] text-ink-400/80">
              Chequeos contra Mercado Pago
              {health ? ` — última lectura ${formatCheckedAt(health.checkedAt)}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="h-9 px-3.5 rounded-lg bg-ink-850 border border-ink-700 text-ink-300 hover:text-ink-50 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refrescar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 size={20} className="animate-spin text-ink-400" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-ink-800 bg-ink-950/20 px-4 py-4 text-center space-y-2">
          <p className="text-[12px] text-ink-400">{error}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="text-[12px] font-bold uppercase tracking-wider text-accent hover:underline cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      ) : health ? (
        <div className="space-y-3">
          {health.blocking && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-lg border border-danger-line bg-danger-soft px-3.5 py-2.5 text-[12px] font-medium text-danger"
            >
              <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
              <span>El cobro con Posnet está bloqueado: la plata entraría a otra cuenta.</span>
            </div>
          )}

          <div className="rounded-lg border border-ink-800 divide-y divide-ink-800/50 overflow-hidden">
            {CHECK_ORDER.map((key) => (
              <HealthRow key={key} label={CHECK_LABELS[key]} check={health.checks[key]} />
            ))}

            {/* Fila F1 — fallback de emergencia (MP_ACCESS_TOKEN + MP_POS_DEVICE_ID) */}
            <div className="flex items-start gap-3 px-4 py-3 bg-ink-950/30">
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
                <p className="text-[12px] font-medium text-ink-200">
                  Fallback de emergencia (F1)
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    {health.fallback.status === "usable"
                      ? "Usable"
                      : health.fallback.status === "unusable"
                        ? "No usable"
                        : "Desconocido"}
                  </span>
                </p>
                {health.fallback.reason && (
                  <p className="text-[11px] text-ink-500 leading-relaxed">{health.fallback.reason}</p>
                )}
                {health.fallback.lastDegradedAt && (
                  <p className="text-[11px] text-amber leading-relaxed">
                    Un cobro degradó al fallback de emergencia
                    {health.fallback.lastDegradedReason ? `: ${health.fallback.lastDegradedReason}` : "."}
                  </p>
                )}
              </div>
            </div>

            {/* Cobros saliendo por el device de la env (D2) — advertencia, nunca rojo */}
            <div className="flex items-start gap-3 px-4 py-3 bg-ink-950/30">
              <span
                aria-hidden="true"
                className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${
                  health.usingEnvDevice ? "bg-amber" : "bg-green"
                }`}
              />
              <div className="min-w-0 space-y-0.5">
                <p className="text-[12px] font-medium text-ink-200">Posnet de emergencia en uso</p>
                <p className="text-[11px] text-ink-500 leading-relaxed">
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
