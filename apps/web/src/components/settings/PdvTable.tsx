"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  ExternalLink,
  Link2,
  Loader2,
  QrCode,
  RotateCw,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import type { CajaRow, DeviceRow } from "@/services/pdv.service";
import BoskoSelect from "@/components/shared/BoskoSelect";

type Props = {
  cajas: CajaRow[];
  loadError: boolean;
  linkingCajaId: string | null;
  /** Posnets ya registrados — opciones del selector de vinculación (el id nunca se tipea). */
  availableDevices?: DeviceRow[];
  onRetry: () => void;
  onDeleteClick: (caja: CajaRow) => void;
  onLinkDevice: (cajaId: string, deviceId: string, username: string) => Promise<void>;
  onUnlinkDevice: (device: DeviceRow) => Promise<void>;
  onRecoverQr?: (caja: CajaRow) => void;
  /** Bloque H: abre la confirmación de re-provisioning (el QR va a cambiar). */
  onReprovisionClick?: (caja: CajaRow) => void;
};

const inputCls =
  "w-full h-8 px-2.5 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-all";

const pdvGrid =
  "minmax(140px, 1.2fr) minmax(110px, 1fr) minmax(180px, 1.4fr) 104px";

function shortDeviceId(id: string): string {
  if (id.length <= 22) return id;
  return `${id.slice(0, 12)}…${id.slice(-6)}`;
}

export default function PdvTable({
  cajas,
  loadError,
  linkingCajaId,
  availableDevices = [],
  onRetry,
  onDeleteClick,
  onLinkDevice,
  onUnlinkDevice,
  onRecoverQr,
  onReprovisionClick,
}: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [linkFormCajaId, setLinkFormCajaId] = useState<string | null>(null);
  const [deviceIdDraft, setDeviceIdDraft] = useState("");
  const [usernameDraft, setUsernameDraft] = useState("");

  const linkableDevices = availableDevices.filter((d) => !d.isActive);

  async function copyQr(caja: CajaRow) {
    if (!caja.qrImage) return;
    try {
      await navigator.clipboard.writeText(caja.qrImage);
      setCopiedId(caja.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore clipboard failures
    }
  }

  async function submitLink(cajaId: string) {
    if (!deviceIdDraft) return;
    await onLinkDevice(cajaId, deviceIdDraft, usernameDraft.trim());
    setLinkFormCajaId(null);
    setDeviceIdDraft("");
    setUsernameDraft("");
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-card">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div
            className="grid gap-0 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[11px] font-bold uppercase tracking-[0.12em] select-none"
            style={{ gridTemplateColumns: pdvGrid }}
          >
            <div className="px-4 py-3 text-[var(--text-secondary)]">Barra</div>
            <div className="px-4 py-3 text-[var(--text-secondary)]">QR</div>
            <div className="px-4 py-3 text-[var(--text-secondary)]">Posnet</div>
            <div className="px-3 py-3 text-[var(--text-tertiary)] text-left">Acciones</div>
          </div>

          {loadError ? (
            <div className="px-5 py-10 text-center space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">No se pudieron cargar los PDVs.</p>
              <button
                type="button"
                onClick={onRetry}
                className="text-[13px] font-semibold text-[var(--accent-text)] hover:underline cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : cajas.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[var(--text-tertiary)]">
              Todavía no hay puntos de venta. Creá el PDV de Barra VIP para empezar.
            </div>
          ) : (
            cajas.map((caja) => {
              const linking = linkingCajaId === caja.id;
              const showLinkForm = linkFormCajaId === caja.id;

              return (
                <div
                  key={caja.id}
                  className="grid gap-0 border-b border-[var(--border-subtle)] last:border-b-0 items-center hover:bg-[var(--bg-panel)]/60 transition-colors"
                  style={{ gridTemplateColumns: pdvGrid }}
                >
                  <div className="px-4 py-4 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate flex items-center gap-2">
                      <span className="truncate">
                        {caja.externalPosId.includes("BAR01") ||
                        caja.externalPosId.includes("BAR-01") ||
                        caja.externalPosId.includes("BARRA-01")
                          ? "Barra VIP"
                          : caja.externalPosId}
                      </span>
                      {caja.isOrphan && (
                        <span
                          className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--amber-soft)] text-[var(--amber-base)]"
                          title="La caja fue provisionada con otra cuenta de Mercado Pago: los cobros QR no entran a la cuenta activa."
                        >
                          Huérfana
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] font-mono text-[var(--text-tertiary)] mt-0.5 truncate">
                      {caja.externalPosId}
                    </p>
                    {caja.isOrphan && onReprovisionClick && (
                      <button
                        type="button"
                        onClick={() => onReprovisionClick(caja)}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--amber-base)] hover:underline cursor-pointer"
                      >
                        <RotateCw size={11} />
                        Re-provisionar
                      </button>
                    )}
                  </div>

                  <div className="px-4 py-4 space-y-1.5 min-w-0">
                    {caja.qrImage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => copyQr(caja)}
                          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-primary)] hover:text-[var(--accent-text)] transition-colors cursor-pointer"
                        >
                          {copiedId === caja.id ? <Check size={13} /> : <Copy size={13} />}
                          {copiedId === caja.id ? "Copiado" : "Copiar URL"}
                        </button>
                        <a
                          href={caja.qrImage}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          <QrCode size={13} />
                          Ver QR
                          <ExternalLink size={11} />
                        </a>
                      </>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-[12px] text-[var(--text-tertiary)] block">Sin QR</span>
                        {onRecoverQr && (
                          <button
                            type="button"
                            onClick={() => onRecoverQr(caja)}
                            className="text-[11px] font-medium text-[var(--accent-text)] hover:underline cursor-pointer"
                          >
                            Recuperar QR
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-4 space-y-2 min-w-0">
                    {caja.device ? (
                      <div className="space-y-1">
                        <p
                          className="text-[12px] font-mono text-[var(--text-primary)] truncate"
                          title={caja.device.deviceId}
                        >
                          {shortDeviceId(caja.device.deviceId)}
                        </p>
                        {caja.device.deviceUsername && (
                          <p className="text-[11px] text-[var(--text-secondary)]">
                            Apodo: {caja.device.deviceUsername}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => onUnlinkDevice(caja.device!)}
                          disabled={linking}
                          className="inline-flex items-center gap-1 text-[11px] text-[var(--danger-base)]/80 hover:text-[var(--danger-base)] transition-colors cursor-pointer disabled:opacity-40"
                        >
                          <Unlink size={12} />
                          Desvincular
                        </button>
                      </div>
                    ) : showLinkForm ? (
                      <div className="space-y-2">
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
                          <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                            No hay Posnets registrados disponibles. Agregá uno desde la lista de
                            Mercado Pago (card Posnets).
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
                            className="h-7 px-3 rounded-full bg-[var(--accent-surface)] text-[var(--accent-text)] text-[11px] font-semibold flex items-center gap-1 disabled:opacity-40 cursor-pointer hover:brightness-95 transition-all"
                          >
                            {linking ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                            Vincular
                          </button>
                          <button
                            type="button"
                            aria-label="Cancelar vinculación"
                            onClick={() => {
                              setLinkFormCajaId(null);
                              setDeviceIdDraft("");
                              setUsernameDraft("");
                            }}
                            className="h-7 w-7 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] flex items-center justify-center cursor-pointer"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLinkFormCajaId(caja.id)}
                        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent-text)] transition-colors cursor-pointer"
                      >
                        <Link2 size={13} />
                        + Vincular
                      </button>
                    )}
                  </div>

                  <div className="px-3 py-4 flex items-center justify-start gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => onDeleteClick(caja)}
                      className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-secondary)] flex items-center justify-center hover:text-[var(--danger-base)] hover:border-[var(--danger-base)]/40 transition-all cursor-pointer"
                      title="Eliminar PDV"
                      aria-label="Eliminar PDV"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
