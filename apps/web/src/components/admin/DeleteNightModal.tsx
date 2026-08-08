"use client";

import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import {
  eventsService,
  type NightDeletionPreview,
} from "@/services/events.service";

type Props = {
  eventId: string;
  onClose: () => void;
  /** Se llama después de un borrado exitoso: el padre refresca el historial. */
  onDeleted: () => void;
};

function formatMonto(value: number): string {
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

/**
 * Confirmación de borrado de una noche. La fricción es deliberada (D2): hay
 * que tipear la fecha de la noche Y la contraseña, el mismo nivel que el
 * cierre de noche. El preview se pide al abrir para que nadie confirme sin
 * ver cuánta plata se lleva puesta.
 */
export default function DeleteNightModal({ eventId, onClose, onDeleted }: Props) {
  const [preview, setPreview] = useState<NightDeletionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fecha, setFecha] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    eventsService
      .getDeletionPreview(eventId)
      .then((data) => {
        if (cancelled) return;
        setPreview(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "No se pudo cargar el detalle de la noche.",
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, deleting]);

  const canConfirm =
    preview !== null && fecha.trim() !== "" && password.trim() !== "" && !deleting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canConfirm) return;
    setDeleting(true);
    setError(null);
    try {
      await eventsService.deleteNight(eventId, fecha.trim(), password);
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar la noche.");
      setDeleting(false);
    }
  }

  const hasMpCobros = (preview?.mpOrdersCobrados ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Eliminar noche"
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full max-w-md rounded-2xl p-6 shadow-card animate-in slide-in-from-bottom-10 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-[var(--danger-base)]" />
            </div>
            <div>
              <h2 className="text-[20px] font-bold text-[var(--text-primary)] leading-none">
                Eliminar noche
              </h2>
              <p className="text-[12px] text-[var(--text-secondary)] mt-1.5">
                Acción irreversible
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !deleting && onClose()}
            disabled={deleting}
            className="p-2 bg-[var(--bg-panel)] rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] py-6 justify-center">
            <Loader2 size={16} className="animate-spin" />
            Cargando el detalle de la noche…
          </div>
        )}

        {loadError && (
          <div className="text-sm text-[var(--danger-base)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-xl px-3 py-2.5">
            {loadError}
          </div>
        )}

        {preview && (
          <>
            <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
              Vas a borrar la noche y <strong className="text-[var(--text-primary)]">todo</strong>{" "}
              lo que cuelga de ella: pedidos, tickets y cobros. No se puede deshacer ni
              recuperar desde la app.
            </p>

            <dl className="flex flex-col gap-2 mb-4 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-3.5 text-xs">
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
                label="Cobros de Mercado Pago"
                value={`${preview.mpOrdersCobrados} · ${formatMonto(preview.mpMontoCobrado)}`}
              />
            </dl>

            {hasMpCobros && (
              <div className="mb-4 flex items-start gap-2 text-[13px] text-[var(--danger-base)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-xl px-3 py-2.5">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Esta noche tiene <strong>{preview.mpOrdersCobrados}</strong> cobro
                  {preview.mpOrdersCobrados === 1 ? "" : "s"} real
                  {preview.mpOrdersCobrados === 1 ? "" : "es"} de Mercado Pago por{" "}
                  <strong>{formatMonto(preview.mpMontoCobrado)}</strong>. Se borran también:
                  después de esto no queda registro de esos cobros en el sistema.
                  {preview.mpSinEventId > 0 && (
                    <>
                      {" "}
                      <span className="block mt-1.5">
                        {preview.mpSinEventId} de esos cobros son viejos y no tienen la noche
                        anotada: se detectaron por la venta asociada.
                      </span>
                    </>
                  )}
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="delete-night-fecha"
                  className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-secondary)]"
                >
                  Escribí la fecha de la noche{" "}
                  <span className="font-mono select-all bg-[var(--bg-panel)] text-[var(--text-primary)] px-1 py-0.5 rounded border border-[var(--border-subtle)]">
                    {preview.fechaAr}
                  </span>
                </label>
                <input
                  id="delete-night-fecha"
                  type="text"
                  required
                  autoFocus
                  autoComplete="off"
                  inputMode="numeric"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  placeholder="AAAA-MM-DD"
                  className="bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--danger-base)] transition-colors text-sm font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="delete-night-password"
                  className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-secondary)]"
                >
                  Tu contraseña / PIN
                </label>
                <input
                  id="delete-night-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresá tu contraseña para confirmar"
                  className="bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-[var(--text-primary)] outline-none focus:border-[var(--danger-base)] transition-colors text-sm"
                />
              </div>

              {error && (
                <div className="text-sm text-[var(--danger-base)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-xl px-3 py-2.5">
                  {error}
                </div>
              )}

              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={deleting}
                  className="flex-1 h-12 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-strong)] text-[var(--text-primary)] font-semibold text-xs hover:bg-[var(--bg-app)] active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!canConfirm}
                  className="flex-1 h-12 rounded-xl bg-[var(--danger-base)] text-white font-semibold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {deleting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Borrando…
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      Borrar la noche
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
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
      <dt className="font-semibold text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-mono">
        {label}
      </dt>
      <dd
        className={`font-mono tabular font-bold text-right ${
          danger ? "text-[var(--danger-base)]" : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
