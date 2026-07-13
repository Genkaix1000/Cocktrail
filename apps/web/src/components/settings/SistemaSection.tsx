"use client";

import { useState } from "react";
import { AlertTriangle, CloudDownload, Loader2, X } from "lucide-react";
import { systemService, type RestoreResult, type SyncTableResult } from "@/services/system.service";
import { ApiError } from "@/services/api-client";
import Toast from "@/components/shared/Toast";

const TABLE_LABELS: Record<keyof RestoreResult, string> = {
  nightEvents: "Noches",
  orders: "Pedidos",
  tickets: "Tickets",
  auditLogs: "Auditoría",
};

function TableResultRow({ label, result }: { label: string; result: SyncTableResult }) {
  const hasError = result.failed > 0 || !!result.error;
  return (
    <div className={`flex flex-col gap-0.5 py-2 px-3 rounded-lg border ${hasError ? "bg-danger-soft border-danger-line" : "bg-green-soft border-green-line"}`}>
      <div className="flex items-center justify-between text-xs font-bold">
        <span className={hasError ? "text-danger" : "text-green"}>{label}</span>
        <span className={`font-mono ${hasError ? "text-danger" : "text-green"}`}>
          {result.ok} ok{result.failed > 0 ? ` / ${result.failed} fallaron` : ""}
        </span>
      </div>
      {result.error && (
        <span className="text-[11px] text-ink-300 leading-snug">{result.error}</span>
      )}
    </div>
  );
}

/**
 * Sección "Sistema" de Configuración en /admin — restore de emergencia desde Supabase
 * Cloud (noches/pedidos/tickets/auditoría). Motivado por un incidente real: la
 * carta local se vació en silencio por un bug de sync, sin ninguna forma de
 * recuperarla desde /admin. Ver docs/specs/restaurar-backup-desde-cloud.md.
 */
export default function SistemaSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [toast, setToast] = useState<{ variant: "success" | "error"; message: string } | null>(null);

  const handleOpenModal = () => {
    setPassword("");
    setModalError(null);
    setModalOpen(true);
  };

  const handleConfirm = async () => {
    if (submitting || !password.trim()) return;
    setSubmitting(true);
    setModalError(null);
    try {
      const restoreResult = await systemService.restore(password);
      setResult(restoreResult);
      setModalOpen(false);
      const anyFailed = Object.values(restoreResult).some((r) => r.failed > 0 || r.error);
      setToast({
        variant: anyFailed ? "error" : "success",
        message: anyFailed
          ? "El restore terminó con algunas tablas con error — revisá el detalle abajo."
          : "Restore completado sin errores.",
      });
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : "No se pudo restaurar. Reintentá en unos segundos.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
            <CloudDownload size={16} />
          </div>
          <span>Sistema</span>
        </h1>
        <p className="text-[13px] text-ink-400/80 mt-1">
          Trae de la nube todo el historial (noches, pedidos, tickets y auditoría) y lo
          suma a lo que ya tenés acá. No borra nada local.
        </p>
      </div>

      <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-ink-50">Restaurar desde backup</h2>
          <p className="text-xs text-ink-400 mt-1 leading-relaxed">
            Usalo si la carta, el historial de noches, o cualquier otro dato local aparece
            vacío o incompleto por algún problema de la base de datos.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenModal}
          className="h-11 px-5 rounded-xl bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 font-bold text-xs uppercase tracking-[0.1em] flex items-center gap-2 transition-all cursor-pointer active:scale-95"
        >
          <CloudDownload size={15} />
          Restaurar desde backup
        </button>

        {result && (
          <div className="flex flex-col gap-2 pt-2 border-t border-ink-800">
            {(Object.keys(TABLE_LABELS) as (keyof RestoreResult)[]).map((key) => (
              <TableResultRow key={key} label={TABLE_LABELS[key]} result={result[key]} />
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-ink-900 border border-white/10 w-full max-w-sm rounded-[24px] p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <CloudDownload size={18} className="text-accent" />
                <h3 className="font-black text-ink-50">Restaurar desde backup</h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                aria-label="Cerrar"
                className="p-2.5 bg-white/5 rounded-full active:scale-90 transition-transform cursor-pointer disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-start gap-2 text-sm text-amber bg-amber-soft border border-amber-line rounded-xl px-3 py-2.5 mb-4">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                Si un dato existe en local y en la nube con contenido distinto, gana la
                versión de la nube. No se borra nada local que la nube no tenga.
              </span>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400 font-mono">
                Tu contraseña / PIN
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-ink-850 border border-ink-750 focus:border-accent rounded-xl px-4 py-3 text-ink-50 outline-none transition-colors text-sm"
                placeholder="Ingresá tu contraseña para confirmar"
              />
            </label>

            {modalError && (
              <div className="mt-4 text-sm text-danger bg-danger-soft border border-danger-line rounded-xl px-3 py-2.5">
                {modalError}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="flex-1 h-12 rounded-xl bg-ink-800 text-ink-100 font-bold text-xs uppercase tracking-[0.14em] hover:bg-ink-750 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting || !password.trim()}
                className="flex-1 h-12 rounded-xl bg-accent text-ink-950 font-bold text-xs uppercase tracking-[0.14em] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Restaurando…
                  </>
                ) : (
                  "Confirmar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm pointer-events-none">
          <Toast variant={toast.variant} message={toast.message} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
}
