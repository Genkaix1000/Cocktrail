"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { mercadopagoService, type MpHealth, type MpHealthCheck } from "@/services/mercadopago.service";

import { MP_HEALTH_CHECK_LABELS as CHECK_LABELS, MP_HEALTH_CHECK_ORDER as CHECK_ORDER } from "./mpHealthChecks";

export type MpHealthScore = {
  percent: number;
  /** Checks con ok === false. */
  failures: { key: keyof MpHealth["checks"]; label: string; check: MpHealthCheck }[];
  warnings: string[];
  blocking: boolean;
};

/** Score solo con checks decididos (ok true/false). Unknown no baja el % (cero falsos positivos). */
export function scoreMpHealth(health: MpHealth): MpHealthScore {
  let decided = 0;
  let okCount = 0;
  const failures: MpHealthScore["failures"] = [];

  for (const key of CHECK_ORDER) {
    // Sin Posnet vinculado, ownership/mode no aplican al score operativo.
    if (!health.hasLinkedDevice && (key === "deviceOwnership" || key === "deviceMode")) {
      continue;
    }
    const check = health.checks[key];
    if (check.ok === null) continue;
    decided += 1;
    if (check.ok) okCount += 1;
    else failures.push({ key, label: CHECK_LABELS[key], check });
  }

  const warnings: string[] = [];
  if (health.usingEnvDevice) {
    warnings.push("Algún cobro salió por el Posnet de emergencia (env), no por el de la caja.");
  }
  if (health.fallback.lastDegradedAt) {
    warnings.push(
      health.fallback.lastDegradedReason
        ? `Degradó al fallback: ${health.fallback.lastDegradedReason}`
        : "Un cobro degradó al fallback de emergencia.",
    );
  }

  const percent = decided === 0 ? 100 : Math.round((okCount / decided) * 100);
  return { percent, failures, warnings, blocking: health.blocking };
}

/**
 * Sanidad MP compacta: una línea si todo OK; score + solo fallas si hay problemas.
 */
export default function MpHealthPanel() {
  const [health, setHealth] = useState<MpHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    setError(null);
    try {
      setHealth(await mercadopagoService.getMpHealth(refresh));
    } catch {
      setError("No se pudo consultar la salud de Mercado Pago.");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false).finally(() => setLoading(false));
  }, [load]);

  const score = useMemo(() => (health ? scoreMpHealth(health) : null), [health]);
  const hasIssues = Boolean(
    score && (score.failures.length > 0 || score.warnings.length > 0 || score.blocking),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[var(--text-tertiary)] py-1" role="status">
        <Loader2 size={12} className="animate-spin" aria-hidden />
        Revisando salud MP…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
        <p className="text-[12px] text-[var(--text-secondary)]">{error}</p>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          className="text-[12px] font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!score || !health) return null;

  if (!hasIssues) {
    return (
      <div
        className="flex items-center justify-between gap-3 text-[12px] text-[var(--text-tertiary)] py-1 select-none"
        role="status"
      >
        <span className="flex items-center gap-2 min-w-0">
          <CheckCircle2 size={14} className="text-[var(--success-base)]/70 shrink-0" aria-hidden />
          Salud MP {score.percent}% · todo bien
        </span>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          aria-label="Refrescar salud MP"
          className="p-1 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
        >
          {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="Salud de Mercado Pago"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 min-w-0 text-left cursor-pointer"
          aria-expanded={expanded}
        >
          <AlertTriangle
            size={14}
            className={
              score.blocking || score.failures.length > 0
                ? "text-[var(--danger-base)] shrink-0"
                : "text-[var(--amber-base)] shrink-0"
            }
            aria-hidden
          />
          <span className="text-[13px] font-semibold text-[var(--text-primary)] tabular">
            Salud MP {score.percent}%
          </span>
          <span className="text-[12px] text-[var(--text-secondary)] truncate">
            {score.blocking
              ? "· cobro Posnet bloqueado"
              : `· ${score.failures.length + score.warnings.length} aviso${
                  score.failures.length + score.warnings.length === 1 ? "" : "s"
                }`}
          </span>
          <ChevronDown
            size={14}
            className={`text-[var(--text-tertiary)] shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          aria-label="Refrescar salud MP"
          className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
        >
          {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>

      {expanded && (
        <ul className="space-y-2 pt-1 border-t border-[var(--border-subtle)]">
          {score.blocking && (
            <li className="text-[12px] text-[var(--danger-base)] font-medium">
              El cobro con Posnet está bloqueado: la plata entraría a otra cuenta.
            </li>
          )}
          {score.failures.map(({ key, label, check }) => (
            <li key={key} className="text-[12px] text-[var(--text-primary)] leading-snug">
              <span className="font-semibold text-[var(--danger-base)]">{label}</span>
              <span className="text-[var(--text-secondary)]"> — {check.detail}</span>
              {check.action && (
                <span className="block text-[var(--amber-base)] mt-0.5">→ {check.action}</span>
              )}
            </li>
          ))}
          {score.warnings.map((w) => (
            <li key={w} className="text-[12px] text-[var(--amber-base)] leading-snug">
              {w}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
