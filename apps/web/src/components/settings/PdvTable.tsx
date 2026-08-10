"use client";

import { useEffect, useState } from "react";
import {
  Copy,
  Check,
  CreditCard,
  Download,
  Link2,
  Loader2,
  Printer,
  QrCode,
  RotateCw,
  Unlink,
  X,
} from "lucide-react";
import type { CajaRow, DeviceRow } from "@/services/pdv.service";
import BoskoSelect from "@/components/shared/BoskoSelect";
import { barDisplayLabel, barVisualIcon, barVisualKind } from "@/lib/bar-visual";

function printQrImage(src: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(
    `<!doctype html><title>QR</title><body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#fff"><img src="${src.replace(/"/g, "&quot;")}" style="max-width:90vw;max-height:90vh" /></body>`,
  );
  doc.close();
  const cleanup = () => iframe.remove();
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(cleanup, 800);
    }
  };
}

async function downloadQrImage(src: string, filename: string) {
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || "image/png" });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // CORS / WebView: la imagen sigue visible; long-press para guardar.
  }
}

function QrPreviewModal({
  src,
  label,
  onClose,
}: {
  src: string;
  label: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const filename = `qr-${label.replace(/\s+/g, "-").toLowerCase()}.png`;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(src);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-preview-title"
        className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full max-w-sm rounded-[22px] p-5 shadow-2xl animate-in slide-in-from-bottom-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id="qr-preview-title" className="text-[15px] font-semibold text-[var(--text-primary)] truncate">
            QR · {label}
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] inline-flex items-center justify-center cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="rounded-2xl bg-white p-4 flex items-center justify-center border border-[var(--border-subtle)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`Código QR de ${label}`} className="w-full max-w-[260px] h-auto" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => void downloadQrImage(src, filename)}
            className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download size={14} />
            Guardar
          </button>
          <button
            type="button"
            onClick={() => printQrImage(src)}
            className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Printer size={14} />
            Imprimir
          </button>
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="h-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "OK" : "URL"}
          </button>
        </div>
      </div>
    </div>
  );
}

type Props = {
  cajas: CajaRow[];
  loadError: boolean;
  linkingCajaId: string | null;
  togglingBarId?: string | null;
  availableDevices?: DeviceRow[];
  onRetry: () => void;
  onLinkDevice: (cajaId: string, deviceId: string, username: string) => Promise<void>;
  onUnlinkDevice: (device: DeviceRow) => Promise<void>;
  onToggleEnabled?: (caja: CajaRow, enabled: boolean) => Promise<void>;
  onRecoverQr?: (caja: CajaRow) => void;
  onReprovisionClick?: (caja: CajaRow) => void;
};

const inputCls =
  "w-full h-9 px-3 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all";

function shortDeviceId(id: string): string {
  if (id.length <= 18) return id;
  return `${id.slice(0, 10)}…${id.slice(-5)}`;
}

export default function PdvTable({
  cajas,
  loadError,
  linkingCajaId,
  togglingBarId = null,
  availableDevices = [],
  onRetry,
  onLinkDevice,
  onUnlinkDevice,
  onToggleEnabled,
  onRecoverQr,
  onReprovisionClick,
}: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [linkFormCajaId, setLinkFormCajaId] = useState<string | null>(null);
  const [deviceIdDraft, setDeviceIdDraft] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");
  const [qrPreview, setQrPreview] = useState<{ src: string; label: string } | null>(null);

  const linkableDevices = availableDevices.filter((d) => !d.isActive);

  async function copyQr(caja: CajaRow) {
    if (!caja.qrImage) return;
    try {
      await navigator.clipboard.writeText(caja.qrImage);
      setCopiedId(caja.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  }

  async function submitLink(cajaId: string) {
    if (!deviceIdDraft) return;
    await onLinkDevice(cajaId, deviceIdDraft, usernameDraft.trim());
    setLinkFormCajaId(null);
    setDeviceIdDraft("");
    setUsernameDraft("");
  }

  function closeLinkForm() {
    setLinkFormCajaId(null);
    setDeviceIdDraft("");
    setUsernameDraft("");
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-6 py-12 text-center space-y-3">
        <p className="text-sm text-[var(--text-secondary)]">No se pudieron cargar los PDVs.</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-[13px] font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (cajas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] px-6 py-14 text-center">
        <p className="text-sm text-[var(--text-secondary)]">Todavía no hay puntos de venta.</p>
        <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
          Creá el PDV de Barra VIP para empezar.
        </p>
      </div>
    );
  }

  return (
    <>
    {qrPreview ? (
      <QrPreviewModal
        src={qrPreview.src}
        label={qrPreview.label}
        onClose={() => setQrPreview(null)}
      />
    ) : null}
    <ul className="flex flex-col gap-3 list-none m-0 p-0">
      {cajas.map((caja) => {
        const linking = linkingCajaId === caja.id;
        const showLinkForm = linkFormCajaId === caja.id;
        const hasPosnet = Boolean(caja.device);
        const posnetLabel =
          caja.device?.deviceUsername?.trim() ||
          (caja.device ? shortDeviceId(caja.device.deviceId) : null);
        const kind = barVisualKind(caja.barCode ?? caja.externalPosId);
        const Icon = barVisualIcon(kind);
        const enabled = caja.barEnabled !== false;
        const toggling = togglingBarId === caja.barId;
        const barLabel = barDisplayLabel(caja.barCode ?? caja.externalPosId, caja.storeName);

        return (
          <li
            key={caja.id}
            className={[
              "rounded-2xl border bg-[var(--bg-surface)] overflow-hidden transition-colors",
              enabled
                ? "border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                : "border-[var(--border-subtle)] opacity-60",
            ].join(" ")}
          >
            <div className="px-5 pt-5 pb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 flex-1 flex items-start gap-4">
                <div
                  className={[
                    "shrink-0 w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-2xl border flex items-center justify-center",
                    enabled
                      ? "border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-tertiary)]",
                  ].join(" ")}
                  aria-hidden
                >
                  <Icon size={36} strokeWidth={1.5} />
                </div>

                <div className="min-w-0 space-y-2 pt-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)] leading-none">
                      {barLabel}
                    </h3>
                    {hasPosnet ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--bg-panel)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                        <CreditCard size={11} strokeWidth={2} />
                        Posnet
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--accent-surface)] text-[var(--accent-text)]">
                        <QrCode size={11} strokeWidth={2} />
                        QR dinámico
                      </span>
                    )}
                    {!enabled && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--bg-panel)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
                        Deshabilitada
                      </span>
                    )}
                    {caja.isOrphan && (
                      <span
                        className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--amber-soft)] text-[var(--amber-base)]"
                        title="Provisionada con otra cuenta de Mercado Pago."
                      >
                        Huérfana
                      </span>
                    )}
                  </div>

                  <p className="text-[13px] text-[var(--text-secondary)] leading-snug">
                    {!enabled
                      ? "No aparece en el selector de cajas"
                      : hasPosnet && posnetLabel
                        ? `Terminal: ${posnetLabel}`
                        : "Cobros con código QR por transacción"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 self-start">
                {onToggleEnabled && (
                  <div className="flex items-center gap-2 mr-1">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                      {enabled ? "Activa" : "Off"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={
                        enabled
                          ? `Deshabilitar ${barLabel}`
                          : `Habilitar ${barLabel}`
                      }
                      disabled={toggling}
                      onClick={() => void onToggleEnabled(caja, !enabled)}
                      className={`relative w-10 h-5 rounded-full transition-all duration-300 cursor-pointer disabled:opacity-40 ${
                        enabled ? "bg-[var(--accent-primary)]" : "bg-[var(--border-strong)]"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
                          enabled ? "left-[22px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                )}

                {caja.qrImage ? (
                  <>
                    <button
                      type="button"
                      onClick={() => copyQr(caja)}
                      className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {copiedId === caja.id ? <Check size={13} /> : <Copy size={13} />}
                      {copiedId === caja.id ? "Copiado" : "Copiar URL"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrPreview({ src: caja.qrImage!, label: barLabel })}
                      className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <QrCode size={13} />
                      Ver QR
                    </button>
                  </>
                ) : onRecoverQr ? (
                  <button
                    type="button"
                    onClick={() => onRecoverQr(caja)}
                    className="h-9 px-3 rounded-xl border border-[var(--border-subtle)] text-[12px] font-medium text-[var(--accent-text)] hover:bg-[var(--accent-surface)] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    Recuperar QR
                  </button>
                ) : (
                  <span className="text-[12px] text-[var(--text-tertiary)] px-1">Sin QR</span>
                )}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)]/40 flex flex-wrap items-center gap-x-4 gap-y-2">
              {hasPosnet && caja.device ? (
                <button
                  type="button"
                  onClick={() => onUnlinkDevice(caja.device!)}
                  disabled={linking}
                  className="text-[12px] font-medium text-[var(--text-tertiary)] hover:text-[var(--danger-base)] inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <Unlink size={13} />
                  Desvincular Posnet
                </button>
              ) : !showLinkForm ? (
                <button
                  type="button"
                  onClick={() => setLinkFormCajaId(caja.id)}
                  className="text-[12px] font-medium text-[var(--text-tertiary)] hover:text-[var(--accent-text)] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Link2 size={13} />
                  Vincular Posnet
                </button>
              ) : null}

              {caja.isOrphan && onReprovisionClick && (
                <button
                  type="button"
                  data-tour="reprovisionar"
                  onClick={() => onReprovisionClick(caja)}
                  className="text-[12px] font-medium text-[var(--amber-base)] hover:underline inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCw size={13} />
                  Re-provisionar
                </button>
              )}

              {!showLinkForm && !hasPosnet && !caja.isOrphan && (
                <span className="text-[11px] text-[var(--text-tertiary)] ml-auto hidden sm:inline">
                  Opcional: sumá un lector para cobros con tarjeta
                </span>
              )}
            </div>

            {showLinkForm && (
              <div className="px-5 py-4 border-t border-[var(--border-subtle)] space-y-3 bg-[var(--bg-surface)]">
                <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                  Vincular Posnet a esta barra
                </p>
                {linkableDevices.length > 0 ? (
                  <BoskoSelect
                    value={deviceIdDraft}
                    onChange={setDeviceIdDraft}
                    aria-label="Posnet a vincular"
                    placeholder="Elegí un Posnet…"
                    options={linkableDevices.map((d) => ({
                      value: d.deviceId,
                      label: d.deviceUsername || shortDeviceId(d.deviceId),
                      hint: d.deviceId,
                    }))}
                  />
                ) : (
                  <p className="text-[12px] text-[var(--text-tertiary)] leading-relaxed">
                    No hay Posnets disponibles. Registrá uno desde la sección Posnets más abajo.
                  </p>
                )}
                <input
                  type="text"
                  value={usernameDraft}
                  onChange={(e) => setUsernameDraft(e.target.value)}
                  placeholder="Apodo (opcional)"
                  aria-label="Apodo del Posnet"
                  className={inputCls}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => submitLink(caja.id)}
                    disabled={linking || !deviceIdDraft}
                    className="h-9 px-4 rounded-xl bg-[var(--accent-surface)] text-[var(--accent-text)] text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer hover:brightness-95 transition-all"
                  >
                    {linking ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                    Vincular
                  </button>
                  <button
                    type="button"
                    aria-label="Cancelar vinculación"
                    onClick={closeLinkForm}
                    className="h-9 w-9 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] inline-flex items-center justify-center cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
    </>
  );
}
