"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  History,
  TrendingUp,
  CalendarDays,
  Download,
  Trash2,
  ShieldAlert,
  Loader2,
} from "lucide-react";

import MetricCard from "@/components/shared/MetricCard";
import NightRecords from "@/components/analytics/NightRecords";
import NightComparator from "@/components/analytics/NightComparator";
import Toast from "@/components/shared/Toast";
import SafeDeleteModal from "@/components/shared/SafeDeleteModal";
import { SectionHelpButton } from "@/components/help/SectionHelpButton";

import { groupNightsByDay, formatNightDateLong } from "@/lib/analytics";
import { exportHistorialPdf } from "@/lib/pdfExport";
import { useTheme } from "@/components/ThemeProvider";
import { formatShortDate, formatHm, plural } from "@/lib/utils";

import { eventsService, type NightDeletionPreview } from "@/services/events.service";
import type { AdminAnalytics } from "@/hooks/useAdminAnalytics";
import type { UnifiedNightDay } from "@/lib/analytics";
import type { EventSummary, Role } from "@cocktrail/shared";

type Props = {
  analytics: AdminAnalytics;
  historyEvents: EventSummary[];
  historyLoaded: boolean;
  isTabTransitioning: boolean;
  isBosko: boolean;
  /** Solo `admin` ve la acción de eliminar noches (D1). */
  role: Role;
  /** Refresca el historial después de un borrado. */
  onNightDeleted: () => void;
  // Puente Historial → Logs: AdminClient decide qué hacer con el timestamp
  // (setea filtros/activeTab de la vista Logs, que sigue inline). Esta
  // sección no conoce nada de LogsSection, solo invoca el callback.
  onRedirectToLogs: (ts: number) => void;
};

const cardShell =
  "bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-card";

const DELETE_UNDO_MS = 5000;

function formatMonto(value: number): string {
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

// "Esta Semana" (semana calendario, lun-dom) y "Este Mes" (desde el día 1)
// son ventanas distintas que pueden solaparse solo parcialmente — al
// arrancar un mes, "esta semana" puede incluir días del mes anterior que
// "este mes" no cuenta. Mostrar el rango de fechas de cada card evita que
// esa diferencia se lea como una cuenta mal hecha.
function formatDateRange(start: number, end: number): string {
  return `${formatShortDate(start)}–${formatShortDate(end)}`;
}

/**
 * Vista "Historial de Noches" del panel admin. `historyEvents`/
 * `historyLoaded` viven en el shell (AdminClient) porque useAdminAnalytics
 * y DashboardSection también dependen de esos datos.
 * Simplificada (ver docs/specs/features/simplificar-historial-noches.md): la tabla
 * "Detalle por Noche" (filtro por mes, sort, paginación, popup) se
 * eliminó — `NightComparator` la reemplaza con un selector único de
 * detalle/comparación sobre `unifiedHistoryDays`.
 */
export default function HistorialSection({
  analytics,
  historyEvents,
  historyLoaded,
  isTabTransitioning,
  isBosko,
  role,
  onNightDeleted,
  onRedirectToLogs,
}: Props) {
  const { weeklyDelta, monthlyDelta, allTotal, nightRecords } = analytics;
  const { logoUrl, useLogoUrl, textLogoValue } = useTheme();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteNight, setDeleteNight] = useState<EventSummary | null>(null);
  const [deletePreview, setDeletePreview] = useState<NightDeletionPreview | null>(null);
  const [deleteLoadError, setDeleteLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteUndo, setDeleteUndo] = useState(false);
  const [hiddenNightIds, setHiddenNightIds] = useState<Set<string>>(() => new Set());

  const pendingDeleteRef = useRef<{
    id: string;
    fechaAr: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  useEffect(() => {
    if (!deleteNight) return;
    let cancelled = false;
    setDeletePreview(null);
    setDeleteLoadError(null);
    eventsService
      .getDeletionPreview(deleteNight.id)
      .then((data) => {
        if (!cancelled) setDeletePreview(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setDeleteLoadError(
            err instanceof Error ? err.message : "No se pudo cargar el detalle de la noche.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [deleteNight]);

  useEffect(() => {
    return () => {
      const pending = pendingDeleteRef.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingDeleteRef.current = null;
    };
  }, []);

  async function commitDelete(id: string, fechaAr: string) {
    try {
      await eventsService.deleteNight(id, fechaAr);
      onNightDeleted();
    } catch (err) {
      setHiddenNightIds((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
      setDeleteError(err instanceof Error ? err.message : "No se pudo borrar la noche.");
    }
  }

  /** Hold confirmado: esconde la noche, toast con Deshacer, DELETE diferido. */
  function scheduleDelete(night: EventSummary, fechaAr: string) {
    if (pendingDeleteRef.current) {
      void commitDelete(pendingDeleteRef.current.id, pendingDeleteRef.current.fechaAr);
      pendingDeleteRef.current = null;
    }
    setHiddenNightIds((ids) => new Set(ids).add(night.id));
    setDeleteNight(null);
    setDeleteError(null);
    setDeleteUndo(true);

    const timer = setTimeout(() => {
      pendingDeleteRef.current = null;
      setDeleteUndo(false);
      void commitDelete(night.id, fechaAr);
    }, DELETE_UNDO_MS);

    pendingDeleteRef.current = { id: night.id, fechaAr, timer };
  }

  function handleUndoDelete() {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setHiddenNightIds((ids) => {
      const next = new Set(ids);
      next.delete(pending.id);
      return next;
    });
    setDeleteUndo(false);
  }

  // `Date.now()` es impuro: se fija una sola vez al montar para calcular los
  // rangos de fecha de "Esta Semana"/"Este Mes" sin variar en renders
  // sucesivos (mismo patrón que ConfirmView en CloseNightModal.tsx).
  const [now] = useState(() => Date.now());
  const weekRange = formatDateRange(weeklyDelta.thisWeekStart, now);
  const monthRange = formatDateRange(monthlyDelta.thisMonthStart, now);

  const unifiedHistoryDays: UnifiedNightDay[] = useMemo(
    () => groupNightsByDay(historyEvents),
    [historyEvents],
  );

  return (
    <div className="space-y-8 w-full">
      {!historyLoaded || isTabTransitioning ? (
        <div className="space-y-6 animate-dashboard-in">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div className="space-y-2">
              <div className="h-8 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg w-52 animate-pulse" />
              <div className="h-4 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg w-72 animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-[var(--accent-primary)]/30 rounded-2xl p-5 animate-pulse h-[125px]" />
            {[1, 2].map((i) => (
              <div key={i} className={`${cardShell} p-5 animate-pulse h-[125px]`} />
            ))}
          </div>
          <div className={`${cardShell} p-5 animate-pulse h-[100px]`} />
          <div className={`${cardShell} p-5 animate-pulse h-[250px]`} />
        </div>
      ) : (
        <div key="historial" className="flex flex-col gap-8">
          <div data-tour="historial-header" className="flex flex-col md:flex-row justify-between md:items-end gap-4">
            <div>
              <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight select-none">
                Historial de Noches
              </h1>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1.5">
                Cada noche cerrada se archiva acá con sus totales, pedidos y ventas
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <SectionHelpButton category="historial" />
              {historyEvents.length > 0 && (
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={async () => {
                    setIsExporting(true);
                    try {
                      await exportHistorialPdf({ historyEvents, isBosko, logoUrl, useLogoUrl, textLogoValue });
                    } catch {
                      setExportError("No se pudo generar el PDF. Intentá de nuevo.");
                    } finally {
                      setIsExporting(false);
                    }
                  }}
                  className="h-10 px-4 rounded-full bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--bg-app)] text-[13px] font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-[0.98] shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={14} strokeWidth={1.8} />
                  <span>{isExporting ? "Generando…" : "Exportar PDF"}</span>
                </button>
              )}
            </div>
          </div>

          {exportError && (
            <Toast variant="error" message={exportError} onClose={() => setExportError(null)} />
          )}

          <div data-tour="historial-metrics" className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <MetricCard
              label="Esta Semana"
              value={weeklyDelta.thisWeek}
              isCurrency
              delta={weeklyDelta.delta}
              icon={CalendarDays}
              subtitle={weekRange}
              featured
            />
            <MetricCard
              label="Este Mes"
              value={monthlyDelta.thisMonth}
              isCurrency
              delta={monthlyDelta.delta}
              icon={TrendingUp}
              subtitle={monthRange}
            />
            <MetricCard
              label="Total Archivado"
              value={allTotal}
              isCurrency
              delta={{ label: plural(historyEvents.length, "noche", "noches"), direction: "up", value: 0, pct: 0 }}
              icon={History}
              subtitle="acumulado"
            />
          </div>

          <div data-tour="night-records">
            <NightRecords records={nightRecords} isBosko={isBosko} />
          </div>

          <div data-tour="night-comparator" className="w-full">
            <NightComparator
              nights={unifiedHistoryDays}
              isBosko={isBosko}
              onRedirectToLogs={onRedirectToLogs}
            />
          </div>

          {role === "admin" && historyEvents.length > 0 && (
            <DangerZone
              nights={historyEvents}
              hiddenIds={hiddenNightIds}
              onDelete={setDeleteNight}
            />
          )}
        </div>
      )}

      {deleteError && (
        <Toast variant="error" message={deleteError} onClose={() => setDeleteError(null)} />
      )}

      {deleteUndo && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast
            variant="success"
            message="Noche eliminada"
            duration={DELETE_UNDO_MS}
            action={{ label: "Deshacer", onClick: handleUndoDelete }}
            onClose={() => setDeleteUndo(false)}
          />
        </div>
      )}

      {deleteNight && (
        <SafeDeleteModal
          onClose={() => setDeleteNight(null)}
          onConfirm={() => {
            if (!deletePreview) return;
            scheduleDelete(deleteNight, deletePreview.fechaAr);
          }}
          disabled={!deletePreview || Boolean(deleteLoadError)}
          title="Eliminar noche"
          confirmLabel="Borrar la noche"
          warning={
            deleteLoadError ? (
              <span className="text-danger font-semibold">{deleteLoadError}</span>
            ) : deletePreview ? (
              <DeleteNightWarning preview={deletePreview} />
            ) : (
              <span className="flex items-center gap-2 text-ink-400">
                <Loader2 size={14} className="animate-spin" />
                Cargando el detalle de la noche…
              </span>
            )
          }
        />
      )}
    </div>
  );
}

/**
 * Borrado de noches (D1). Vive apartado y con estética de peligro a propósito:
 * el caso de uso real es "me olvidé de tildar prueba", no algo que se haga
 * seguido. Cada fila es una sesión cerrada — el borrado es de a una noche.
 * Confirmar es hold-to-confirm (SafeDeleteModal) + toast con Deshacer, el
 * mismo patrón que el cancel de tickets en caja.
 */
function DangerZone({
  nights,
  hiddenIds,
  onDelete,
}: {
  nights: EventSummary[];
  hiddenIds: Set<string>;
  onDelete: (night: EventSummary) => void;
}) {
  const closedNights = useMemo(
    () =>
      [...nights]
        .filter((n) => n.status === "cerrado" && !hiddenIds.has(n.id))
        .sort((a, b) => (b.closedAt ?? b.startedAt) - (a.closedAt ?? a.startedAt)),
    [nights, hiddenIds],
  );

  if (closedNights.length === 0) return null;

  return (
    <section
      data-tour="delete-night"
      className="bg-[var(--bg-surface)] border border-[var(--danger-line)] rounded-2xl shadow-card p-5"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-full border border-[var(--danger-line)] bg-[var(--danger-soft)] flex items-center justify-center text-[var(--danger-base)]">
          <ShieldAlert size={15} strokeWidth={1.8} />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Eliminar noches
          </h3>
          <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
            Borra la noche con sus pedidos, tickets y cobros. No se puede deshacer.
          </p>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
        {closedNights.map((night) => (
          <li
            key={night.id}
            className="flex items-center justify-between gap-3 py-2.5 min-w-0"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                {formatNightDateLong(night.closedAt ?? night.startedAt)}
              </p>
              <p className="text-[11px] font-mono text-[var(--text-tertiary)] tabular">
                {formatHm(night.startedAt)} hs
                {night.closedAt ? ` → ${formatHm(night.closedAt)} hs` : ""} ·{" "}
                {night.orderCounter} {night.orderCounter === 1 ? "pedido" : "pedidos"} · $
                {(night.totals.netTotal ?? night.totals.total).toLocaleString("es-AR")}
                {night.totals.netTotal != null && night.totals.netTotal !== night.totals.total
                  ? ` neto`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDelete(night)}
              aria-label={`Eliminar la noche del ${formatNightDateLong(
                night.closedAt ?? night.startedAt,
              )}`}
              className="h-9 px-3 shrink-0 rounded-full bg-[var(--danger-soft)] border border-[var(--danger-line)] text-[var(--danger-base)] text-[12px] font-semibold flex items-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Trash2 size={13} strokeWidth={1.8} />
              <span>Eliminar</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Resumen de lo que se pierde (D3) + advertencia de cobros MP (D5), que
 * muestra el SafeDeleteModal de borrado. El borrado nunca es silencioso.
 */
function DeleteNightWarning({ preview }: { preview: NightDeletionPreview }) {
  const hasMpCobros = preview.mpOrdersCobrados > 0;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed">
        Vas a borrar la noche y <strong className="text-danger font-semibold">todo</strong> lo que
        cuelga de ella: pedidos, tickets y cobros.
      </p>
      <dl className="flex flex-col gap-1.5">
        <Row label="Fecha" value={preview.fechaAr} />
        {preview.keyword && <Row label="Palabra clave" value={preview.keyword} />}
        <Row
          label="Pedidos"
          value={
            preview.pedidosCancelados > 0
              ? `${preview.pedidos} (${preview.pedidosCancelados} cancelados)`
              : String(preview.pedidos)
          }
        />
        <Row label="Tickets" value={String(preview.tickets)} />
        <Row label="Total facturado" value={formatMonto(preview.totalFacturado)} danger />
        <Row
          label="Cobros MP"
          value={`${preview.mpOrdersCobrados} · ${formatMonto(preview.mpMontoCobrado)}`}
        />
      </dl>
      {hasMpCobros && (
        <p className="text-xs leading-relaxed text-danger font-medium">
          Esta noche tiene <strong>{preview.mpOrdersCobrados}</strong> cobro
          {preview.mpOrdersCobrados === 1 ? "" : "s"} real
          {preview.mpOrdersCobrados === 1 ? "" : "es"} de Mercado Pago por{" "}
          <strong>{formatMonto(preview.mpMontoCobrado)}</strong>. Se borran también: después de
          esto no queda registro de esos cobros en el sistema.
          {preview.mpSinEventId > 0 &&
            ` ${preview.mpSinEventId} de esos cobros son viejos y no tienen la noche anotada: se detectaron por la venta asociada.`}
        </p>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="font-semibold text-[10px] uppercase tracking-wider text-ink-500 font-mono">
        {label}
      </dt>
      <dd
        className={`font-mono tabular font-bold text-right ${
          danger ? "text-danger" : "text-ink-50"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
