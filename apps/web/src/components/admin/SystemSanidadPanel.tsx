"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { systemService, type SystemHealth } from "@/services/system.service";
import { mercadopagoService, type MpSellerStatus } from "@/services/mercadopago.service";
import { plural } from "@/lib/utils";

const POLL_MS = 60_000;

type Props = {
  /** Navega a la tab Pagos (AdminClient). */
  onGoToPagos?: () => void;
};

/**
 * Sector de sanidad del Dashboard: discreto si todo OK; visible si hay
 * críticos (MP sin vincular, drift de migraciones, fallos de schema).
 */
export default function SystemSanidadPanel({ onGoToPagos }: Props) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [seller, setSeller] = useState<MpSellerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [h, s] = await Promise.all([
      systemService.getHealth().catch(() => null),
      mercadopagoService.getSellerStatus().catch(() => null),
    ]);
    setHealth(h);
    setSeller(s);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      refresh()
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refresh]);

  const mpLinked = Boolean(seller?.linked && seller.status === "active");
  const drift = health?.migrations.drift ?? [];
  const failed = health?.migrations.failed ?? null;
  const pending = health?.migrations.pending ?? [];
  const hasSchemaIssue = Boolean(failed || pending.length > 0);
  const hasIssues = !mpLinked || drift.length > 0 || hasSchemaIssue;

  const handleAcceptDrift = async () => {
    setAccepting(true);
    setAcceptError(null);
    try {
      await systemService.acceptMigrationDrift();
      await refresh();
    } catch {
      setAcceptError("No se pudo aceptar el drift. Revisá DATABASE_URL / Postgres.");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[var(--text-tertiary)] py-1">
        <Loader2 size={12} className="animate-spin" aria-hidden />
        <span>Revisando sanidad…</span>
      </div>
    );
  }

  if (!hasIssues) {
    return (
      <div
        className="flex items-center gap-2 text-[12px] text-[var(--text-tertiary)] py-1 select-none"
        role="status"
      >
        <CheckCircle2 size={14} className="text-[var(--success-base)]/70 shrink-0" aria-hidden />
        <span>Todo funciona correctamente · Mercado Pago vinculado · schema OK</span>
      </div>
    );
  }

  return (
    <section
      aria-label="Sanidad del sistema"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 space-y-2.5"
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider select-none">
        <ShieldCheck size={14} aria-hidden />
        Sanidad
      </div>

      {!mpLinked && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <AlertTriangle size={14} className="text-[var(--danger-base)] shrink-0 mt-0.5" aria-hidden />
            <p className="text-[13px] text-[var(--text-primary)] leading-snug">
              <span className="font-semibold text-[var(--danger-base)]">Crítico · </span>
              No hay cuenta de Mercado Pago vinculada. Sin ella no se puede cobrar con QR ni Posnet.
            </p>
          </div>
          {onGoToPagos && (
            <button
              type="button"
              onClick={onGoToPagos}
              className="h-8 px-3 rounded-full text-[12px] font-semibold bg-[var(--danger-base)]/15 text-[var(--danger-base)] border border-[var(--danger-base)]/30 hover:bg-[var(--danger-base)]/25 transition-colors shrink-0 cursor-pointer"
            >
              Ir a Pagos
            </button>
          )}
        </div>
      )}

      {drift.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <AlertTriangle size={14} className="text-[var(--amber-base)] shrink-0 mt-0.5" aria-hidden />
            <p className="text-[13px] text-[var(--text-primary)] leading-snug">
              <span className="font-semibold text-[var(--amber-base)]">Atención · </span>
              El contenido de {plural(drift.length, "migración ya aplicada", "migraciones ya aplicadas")}{" "}
              cambió respecto de lo registrado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleAcceptDrift()}
            disabled={accepting}
            className="h-8 px-3 rounded-full text-[12px] font-semibold bg-[var(--amber-base)]/15 text-[var(--amber-base)] border border-[var(--amber-base)]/30 hover:bg-[var(--amber-base)]/25 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
          >
            {accepting ? "Aceptando…" : "Aceptar cambios"}
          </button>
        </div>
      )}

      {hasSchemaIssue && (
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-[var(--danger-base)] shrink-0 mt-0.5" aria-hidden />
          <p className="text-[13px] text-[var(--text-primary)] leading-snug">
            <span className="font-semibold text-[var(--danger-base)]">Crítico · </span>
            {failed
              ? `Actualización de base incompleta: falló «${failed.version}»${
                  pending.length > 0 ? ` (${plural(pending.length, "pendiente", "pendientes")})` : ""
                }.`
              : `${plural(pending.length, "migración pendiente", "migraciones pendientes")}.`}{" "}
            Reiniciá el API o corré <code className="text-[11px]">pnpm db:migrate</code>.
          </p>
        </div>
      )}

      {acceptError && (
        <p className="text-[12px] text-[var(--danger-base)]">{acceptError}</p>
      )}
    </section>
  );
}
