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

  // Candidatos a vincular: los registrados que no están activos en ninguna caja.
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
    <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
      <div className="grid grid-cols-[1.1fr_1fr_1.3fr_72px] gap-0 border-b border-ink-800 bg-ink-950 text-[13px] font-bold select-none">
        <div className="px-5 py-3 text-ink-200">Barra</div>
        <div className="px-5 py-3 text-ink-200">QR</div>
        <div className="px-5 py-3 text-ink-200">Posnet</div>
        <div className="px-3 py-3 text-ink-500 text-center">Acciones</div>
      </div>

      {loadError ? (
        <div className="px-5 py-10 text-center space-y-3">
          <p className="text-sm text-ink-400">No se pudieron cargar los PDVs.</p>
          <button
            type="button"
            onClick={onRetry}
            className="text-[12px] font-bold uppercase tracking-wider text-accent hover:underline cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      ) : cajas.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-ink-500">
          Todavía no hay puntos de venta. Creá el PDV de Barra VIP para empezar.
        </div>
      ) : (
        cajas.map((caja) => {
          const linking = linkingCajaId === caja.id;
          const showLinkForm = linkFormCajaId === caja.id;

          return (
            <div
              key={caja.id}
              className="grid grid-cols-[1.1fr_1fr_1.3fr_72px] gap-0 border-b border-ink-800/80 last:border-b-0 items-start"
            >
              {/* Barra */}
              <div className="px-5 py-4 min-w-0">
                <p className="text-sm font-semibold text-ink-50 truncate flex items-center gap-2">
                  <span className="truncate">
                    {caja.externalPosId.includes("BAR01") || caja.externalPosId.includes("BAR-01") || caja.externalPosId.includes("BARRA-01")
                      ? "Barra VIP"
                      : caja.externalPosId}
                  </span>
                  {caja.isOrphan && (
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-soft border border-amber-line text-amber"
                      title="La caja fue provisionada con otra cuenta de Mercado Pago: los cobros QR no entran a la cuenta activa."
                    >
                      Huérfana
                    </span>
                  )}
                </p>
                <p className="text-[11px] font-mono text-ink-500 mt-0.5 truncate">
                  {caja.externalPosId}
                </p>
                {caja.isOrphan && onReprovisionClick && (
                  <button
                    type="button"
                    onClick={() => onReprovisionClick(caja)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber hover:underline cursor-pointer"
                  >
                    <RotateCw size={11} />
                    Re-provisionar
                  </button>
                )}
              </div>

              {/* QR */}
              <div className="px-5 py-4 space-y-1.5">
                {caja.qrImage ? (
                  <>
                    <button
                      type="button"
                      onClick={() => copyQr(caja)}
                      className="inline-flex items-center gap-1.5 text-[12px] text-ink-200 hover:text-accent transition-colors cursor-pointer"
                    >
                      {copiedId === caja.id ? <Check size={13} /> : <Copy size={13} />}
                      {copiedId === caja.id ? "Copiado" : "Copiar URL"}
                    </button>
                    <a
                      href={caja.qrImage}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-200 transition-colors"
                    >
                      <QrCode size={13} />
                      Ver QR
                      <ExternalLink size={11} />
                    </a>
                  </>
                ) : (
                  <div className="space-y-1">
                    <span className="text-[12px] text-ink-500 block">Sin QR</span>
                    {onRecoverQr && (
                      <button
                        type="button"
                        onClick={() => onRecoverQr(caja)}
                        className="text-[11px] text-accent hover:underline cursor-pointer"
                      >
                        Recuperar QR
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Posnet */}
              <div className="px-5 py-4 space-y-2 min-w-0">
                {caja.device ? (
                  <div className="space-y-1">
                    <p className="text-[12px] font-mono text-ink-100 truncate" title={caja.device.deviceId}>
                      {shortDeviceId(caja.device.deviceId)}
                    </p>
                    {caja.device.deviceUsername && (
                      <p className="text-[11px] text-ink-400">
                        Apodo: {caja.device.deviceUsername}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => onUnlinkDevice(caja.device!)}
                      disabled={linking}
                      className="inline-flex items-center gap-1 text-[11px] text-danger/80 hover:text-danger transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <Unlink size={12} />
                      Desvincular
                    </button>
                  </div>
                ) : showLinkForm ? (
                  <div className="space-y-2">
                    {/* El id nunca se escribe a mano: se elige entre los registrados. */}
                    {linkableDevices.length > 0 ? (
                      <select
                        value={deviceIdDraft}
                        onChange={(e) => setDeviceIdDraft(e.target.value)}
                        aria-label="Posnet a vincular"
                        className="w-full h-8 px-2 bg-ink-850 border border-ink-700 rounded-md text-[12px] text-ink-50 focus:outline-none focus:border-blue"
                      >
                        <option value="">Elegí un Posnet…</option>
                        {linkableDevices.map((d) => (
                          <option key={d.id} value={d.deviceId}>
                            {d.deviceUsername ? `${d.deviceUsername} — ${d.deviceId}` : d.deviceId}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-[11px] text-ink-500 leading-relaxed">
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
                      className="w-full h-8 px-2 bg-ink-850 border border-ink-700 rounded-md text-[12px] text-ink-50 focus:outline-none focus:border-blue"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => submitLink(caja.id)}
                        disabled={linking || !deviceIdDraft}
                        className="h-7 px-2.5 rounded-md bg-accent/15 border border-accent/30 text-accent text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 disabled:opacity-40 cursor-pointer"
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
                        className="h-7 w-7 rounded-md text-ink-500 hover:text-ink-200 hover:bg-ink-850 flex items-center justify-center cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setLinkFormCajaId(caja.id)}
                    className="inline-flex items-center gap-1.5 text-[12px] text-ink-300 hover:text-accent transition-colors cursor-pointer"
                  >
                    <Link2 size={13} />
                    + Vincular
                  </button>
                )}
              </div>

              {/* Acciones */}
              <div className="px-3 py-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => onDeleteClick(caja)}
                  className="p-2 rounded-lg text-ink-500 hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer"
                  title="Eliminar PDV"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
