"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CloudDownload, Download, Loader2, Printer, X } from "lucide-react";
import { systemService, type RestoreResult, type SyncTableResult } from "@/services/system.service";
import { ApiError } from "@/services/api-client";
import Toast from "@/components/shared/Toast";

// Mismo orden que el restore del backend (nights → MP → orders → tickets → audit).
const TABLE_LABELS: Record<keyof RestoreResult, string> = {
  nightEvents: "Noches",
  mpCajas: "Cajas MP",
  mpDevices: "Posnets",
  mpOrders: "Cobros MP",
  orders: "Pedidos",
  tickets: "Tickets",
  auditLogs: "Auditoría",
};

const CAJA_APK_HREF = "/miboliche-caja.apk";

const cardShell =
  "bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-card";

/** Lucide no trae marcas: el robot de Android va inline. */
function AndroidGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.53 9.32l1.6-2.77a.44.44 0 10-.76-.44l-1.63 2.81A9.2 9.2 0 0012 7.9c-1.7 0-3.3.4-4.74 1.02L5.63 6.11a.44.44 0 10-.76.44l1.6 2.77A7.1 7.1 0 002.6 15.1h18.8a7.1 7.1 0 00-3.87-5.78zM7.9 12.98a.86.86 0 110-1.72.86.86 0 010 1.72zm8.2 0a.86.86 0 110-1.72.86.86 0 010 1.72z" />
    </svg>
  );
}

function TableResultRow({ label, result }: { label: string; result: SyncTableResult }) {
  const hasError = result.failed > 0 || !!result.error;
  return (
    <div
      className={`flex flex-col gap-0.5 py-2.5 px-3.5 rounded-xl border ${
        hasError
          ? "bg-[var(--danger-soft)] border-[var(--danger-line)]"
          : "bg-[var(--success-soft)] border-[var(--success-line)]"
      }`}
    >
      <div className="flex items-center justify-between text-[12px] font-semibold">
        <span className={hasError ? "text-[var(--danger-base)]" : "text-[var(--success-base)]"}>
          {label}
        </span>
        <span
          className={`font-mono tabular ${
            hasError ? "text-[var(--danger-base)]" : "text-[var(--success-base)]"
          }`}
        >
          {result.ok} ok{result.failed > 0 ? ` / ${result.failed} fallaron` : ""}
        </span>
      </div>
      {result.error && (
        <span className="text-[11px] text-[var(--text-tertiary)] leading-snug">{result.error}</span>
      )}
    </div>
  );
}

const STEPS = [
  "Tocá «Descargar app» y confirmá la instalación.",
  "Si el celular avisa que la descarga es de otro origen, aceptá igual: la app la genera este sistema.",
  "Abrí miBoliche Caja desde el escritorio de la tablet.",
  "Enchufá la impresora y tocá «Permitir» cuando aparezca el aviso.",
];

/**
 * Sección "Sistema" de Configuración en /admin — app de caja para la tablet
 * (WebView + impresión USB nativa) y restore de emergencia desde Supabase Cloud.
 */
export default function SistemaSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [toast, setToast] = useState<{ variant: "success" | "error"; message: string } | null>(null);
  // La dirección real del server es el origen desde el que se sirve esta página.
  const [serverAddress, setServerAddress] = useState<string | null>(null);

  useEffect(() => {
    setServerAddress(window.location.origin);
  }, []);

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
      setModalError(
        err instanceof ApiError ? err.message : "No se pudo restaurar. Reintentá en unos segundos.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl flex flex-col gap-8">
      <div>
        <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight select-none">
          Sistema
        </h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1.5">
          La app de caja para la tablet y la recuperación de datos
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* App de caja — fondo sobrio, mismo idioma que la night card */}
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-white flex flex-col shadow-card"
          style={{
            background: "linear-gradient(160deg, #16321F 0%, #131719 55%, #1A1D21 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='120' height='80' viewBox='0 0 120 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 Q30 10 60 40 T120 40' fill='none' stroke='%2334D399' stroke-width='1.1' opacity='0.3'/%3E%3Cpath d='M0 55 Q30 25 60 55 T120 55' fill='none' stroke='%2334D399' stroke-width='0.9' opacity='0.18'/%3E%3C/svg%3E\")",
              backgroundSize: "100% 100%",
            }}
            aria-hidden
          />

          <div className="relative flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center border border-white/20 bg-white/10 shrink-0">
              <AndroidGlyph size={17} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold">App de caja</h3>
              <p className="text-[12px] text-white/55">Para la tablet que cobra e imprime</p>
            </div>
          </div>

          <p className="relative text-[13px] text-white/70 leading-relaxed mt-4">
            Se abre a pantalla completa, sin navegador, y usa la impresora enchufada a la tablet.
            Encuentra sola la computadora del local.
          </p>

          <a
            href={CAJA_APK_HREF}
            download="miboliche-caja.apk"
            className="relative mt-4 h-10 w-full rounded-full bg-white text-[#16321F] hover:brightness-95 flex items-center justify-center gap-2 text-[13px] font-semibold transition-all cursor-pointer active:scale-[0.98]"
          >
            <Download size={15} strokeWidth={2} />
            Descargar app
          </a>

          <ol className="relative mt-4 space-y-2">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-2.5 text-[12px] text-white/70 leading-relaxed">
                <span className="shrink-0 w-[18px] h-[18px] mt-[1px] rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[10px] font-semibold text-white/80 tabular">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <div className="relative mt-auto pt-4">
            <div className="rounded-xl bg-black/25 border border-white/10 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                Si la app pide la dirección
              </p>
              <p className="text-[14px] font-mono text-white mt-1 break-all select-all">
                {serverAddress ?? "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Restore */}
        <div className={`${cardShell} p-5 flex flex-col`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center border border-[var(--border-subtle)] text-[var(--accent-primary)] shrink-0">
              <CloudDownload size={16} strokeWidth={1.8} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
                Restaurar desde backup
              </h3>
              <p className="text-[12px] text-[var(--text-tertiary)]">Trae el historial de la nube</p>
            </div>
          </div>

          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mt-4">
            Usalo si la carta, el historial de noches o cualquier otro dato aparece vacío o
            incompleto. Suma lo que falta: no borra nada de lo que ya tenés.
          </p>

          <button
            type="button"
            onClick={handleOpenModal}
            className="mt-4 h-10 px-5 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] flex items-center justify-center gap-2 text-[13px] font-semibold transition-all cursor-pointer active:scale-[0.98]"
          >
            <CloudDownload size={15} strokeWidth={2} />
            Restaurar desde backup
          </button>

          {result && (
            <div className="flex flex-col gap-2 mt-5 pt-4 border-t border-[var(--border-subtle)]">
              <p className="text-[12px] text-[var(--text-tertiary)] mb-1">
                Volvé a vincular la cuenta de MP por OAuth desde la tarjeta de Pagos si restauraste cajas o terminales.
              </p>
              {(Object.keys(TABLE_LABELS) as (keyof RestoreResult)[]).map((key) => (
                <TableResultRow key={key} label={TABLE_LABELS[key]} result={result[key]} />
              ))}
            </div>
          )}

          <div className="mt-auto pt-5">
            <div className="flex items-start gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-3">
              <Printer
                size={14}
                strokeWidth={1.8}
                className="text-[var(--text-tertiary)] shrink-0 mt-0.5"
              />
              <p className="text-[12px] text-[var(--text-tertiary)] leading-relaxed">
                La impresora se vincula en la tablet, no acá: el servidor solo arma el ticket.
              </p>
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div
            className={`${cardShell} w-full max-w-sm p-6 animate-in zoom-in-95 duration-200`}
          >
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <CloudDownload size={18} className="text-[var(--accent-primary)]" />
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
                  Restaurar desde backup
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                aria-label="Cerrar"
                className="p-2 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] active:scale-90 transition-all cursor-pointer disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-start gap-2.5 text-[12px] text-[var(--amber-base)] bg-[var(--amber-soft)] border border-[var(--amber-line)] rounded-xl px-3.5 py-2.5 mb-4 leading-relaxed">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>
                Si un dato existe acá y en la nube con contenido distinto, gana la versión de la
                nube. No se borra nada local que la nube no tenga.
              </span>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Tu contraseña / PIN
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 px-4 bg-[var(--bg-panel)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] rounded-xl text-[14px] text-[var(--text-primary)] outline-none transition-colors"
                placeholder="Ingresá tu contraseña para confirmar"
              />
            </label>

            {modalError && (
              <div className="mt-4 text-[12px] text-[var(--danger-base)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-xl px-3.5 py-2.5">
                {modalError}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="flex-1 h-11 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)] text-[13px] font-semibold hover:bg-[var(--bg-surface)] active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting || !password.trim()}
                className="flex-1 h-11 rounded-full bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
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
