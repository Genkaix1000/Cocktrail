"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CreditCard,
  HelpCircle,
  Link2,
  Loader2,
  LogOut,
  Monitor,
  QrCode,
  Store,
  UserRound,
  Wifi,
} from "lucide-react";
import { ApiError } from "@/services/api-client";
import { mercadopagoService, type MpSellerStatus } from "@/services/mercadopago.service";
import { configService } from "@/services/config.service";
import { pdvService, type ProvisioningSummary, type RenameStoreResult } from "@/services/pdv.service";
import { barSessionsService, type BarSession } from "@/services/bar-sessions.service";
import Toast from "@/components/shared/Toast";
import SafeDeleteModal from "@/components/shared/SafeDeleteModal";
import ComisionesPlazosPanel from "@/components/settings/ComisionesPlazosPanel";
import MpHealthPanel from "@/components/settings/MpHealthPanel";
import MpDevToolsPanel from "@/components/settings/MpDevToolsPanel";
import { SectionHelpButton } from "@/components/help/SectionHelpButton";

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "hoy";
  if (days === 1) return "hace 1 día";
  return `hace ${days} días`;
}

const cardShell =
  "bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-card";

export default function PagosSection({ children }: { children?: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkedNotice, setLinkedNotice] = useState(false);
  const [sellerStatus, setSellerStatus] = useState<MpSellerStatus | null>(null);
  const [sandbox, setSandbox] = useState(false);

  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [cloudCleanupPending, setCloudCleanupPending] = useState(false);
  const [unlinkDone, setUnlinkDone] = useState(false);

  const [summary, setSummary] = useState<ProvisioningSummary | null>(null);
  const [sessions, setSessions] = useState<BarSession[]>([]);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [renameResult, setRenameResult] = useState<RenameStoreResult | null>(null);
  const [comisionesOpen, setComisionesOpen] = useState(false);

  const refreshSellerStatus = useCallback(() => {
    mercadopagoService.getSellerStatus()
      .then(setSellerStatus)
      .catch(() => setSellerStatus(null));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [summaryData, sessionsData] = await Promise.all([
        pdvService.getSummary(),
        barSessionsService.listAll().catch(() => [] as BarSession[]),
      ]);
      setSummary(summaryData);
      setSessions(sessionsData);
    } catch (err) {
      console.error("Error loading MP summary:", err);
      setError("No se pudo cargar el estado de la sucursal. Reintentá en unos segundos.");
    }
  }, []);

  useEffect(() => {
    refreshSellerStatus();
    configService.get().then(c => setSandbox(c.mercadoPago.sandbox)).catch(() => {});
    loadData().finally(() => setLoading(false));
  }, [refreshSellerStatus, loadData]);

  const handleForceLogout = useCallback(async (barId: string) => {
    setError(null);
    try {
      await barSessionsService.forceLogout(barId);
      setSessions(await barSessionsService.listAll());
    } catch (err) {
      console.error("Error forcing logout:", err);
      setError("No se pudo cerrar la sesión de la caja.");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("linked");
    if (!linked) return;

    if (linked === "true") {
      setLinkedNotice(true);
      refreshSellerStatus();
    } else {
      const message = params.get("message");
      setError(message ? `No se pudo vincular Mercado Pago: ${message}` : "No se pudo vincular Mercado Pago.");
    }

    params.delete("linked");
    params.delete("message");
    params.delete("barId");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [refreshSellerStatus]);

  const handleLink = useCallback(async () => {
    setLinking(true);
    setError(null);
    try {
      const { url } = await mercadopagoService.getOAuthUrl();
      window.location.href = url;
    } catch (err) {
      console.error("Error starting MP OAuth:", err);
      setError("No se pudo iniciar la vinculación con Mercado Pago. Reintentá en unos segundos.");
      setLinking(false);
    }
  }, []);

  /** Hold confirm → DELETE al toque. El undo diferido se cancelaba al cambiar de tab. */
  const handleUnlinkSeller = useCallback(async () => {
    if (!sellerStatus?.linked || unlinking) return;
    setUnlinkConfirmOpen(false);
    setUnlinking(true);
    setError(null);
    try {
      const res = await mercadopagoService.unlinkSeller();
      setSellerStatus({
        linked: false,
        status: null,
        nickname: null,
        email: null,
        linkedAt: null,
        displayName: null,
        userId: null,
        expiresAt: null,
        hasAccessToken: false,
        hasRefreshToken: false,
      });
      setCloudCleanupPending(res.cloudCleaned === false);
      setUnlinkDone(true);
      refreshSellerStatus();
      loadData();
    } catch {
      setError("No se pudo desvincular la cuenta de Mercado Pago. Reintentá en unos segundos.");
      refreshSellerStatus();
    } finally {
      setUnlinking(false);
    }
  }, [sellerStatus, unlinking, loadData, refreshSellerStatus]);

  const handleRenameStore = async () => {
    const name = renameDraft.trim();
    if (!name || name.length > 60 || savingRename) return;
    setSavingRename(true);
    setError(null);
    try {
      const result = await pdvService.renameStore(name);
      setRenameResult(result);
      setRenameOpen(false);
      setRenameDraft("");
      await loadData();
    } catch (err) {
      console.error("Error renaming store:", err);
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo renombrar la sucursal. Reintentá en unos segundos.",
      );
    } finally {
      setSavingRename(false);
    }
  };

  const isLinked = sellerStatus?.linked && sellerStatus.status === "active";
  const isExpired = sellerStatus?.linked && sellerStatus.status === "expired";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  return (
    <div data-tour="pagos-section" className="w-full min-w-0 flex flex-col gap-5">
      <div data-tour="pagos-header" className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight select-none">
            Pagos
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">
            Cuenta MP, PDVs y Posnets
          </p>
        </div>
        <SectionHelpButton category="pagos" />
      </div>

      {/* 1. Mercado Pago */}
      {isLinked ? (
        <div data-tour="mp-card" className={`${cardShell} p-4 space-y-3`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-[var(--success-soft)] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mercadopago-icon.webp" alt="" width={24} height={24} className="w-6 h-6 object-contain" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[15px] font-semibold text-[#009EE3]">Mercado Pago</p>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--success-soft)] text-[var(--success-base)]">
                    Vinculado
                  </span>
                  <button
                    type="button"
                    onClick={() => setComisionesOpen(true)}
                    aria-label="Plazos y comisiones"
                    title="Plazos y comisiones"
                    className="p-1 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <HelpCircle size={15} strokeWidth={2} />
                  </button>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 truncate">
                  {[sellerStatus?.displayName, sellerStatus?.email].filter(Boolean).join(" · ") ||
                    "Cobros habilitados"}
                  {formatRelative(sellerStatus?.linkedAt ?? null)
                    ? ` · ${formatRelative(sellerStatus!.linkedAt)}`
                    : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUnlinkConfirmOpen(true)}
                disabled={unlinking}
                className="h-8 px-3 rounded-full text-[12px] font-semibold transition-all flex items-center justify-center gap-1.5 select-none active:scale-[0.98] disabled:opacity-50 cursor-pointer bg-[var(--danger-soft)] text-[var(--danger-base)] hover:brightness-95"
              >
                {unlinking && <Loader2 size={12} strokeWidth={2.5} className="animate-spin" />}
                {unlinking ? "…" : "Desvincular"}
              </button>
            </div>
          </div>

          {cloudCleanupPending && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-xl bg-[var(--amber-soft)] px-3 py-2 text-[12px] text-[var(--amber-base)]"
            >
              <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
              <span>
                Limpieza pendiente en la nube — reintentá la desvinculación con conexión.
              </span>
            </div>
          )}
        </div>
      ) : (
        <div
          data-tour="mp-card"
          className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card border border-[#009EE3]/20"
          style={{
            background: isExpired
              ? "linear-gradient(135deg, #7C2D12 0%, #451A03 50%, #001A33 100%)"
              : "linear-gradient(135deg, #003B64 0%, #002340 50%, #001124 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23009EE3' stroke-width='1' /%3E%3Ccircle cx='40' cy='0' r='1.5' fill='%23009EE3' /%3E%3C/svg%3E\")",
              backgroundSize: "32px 32px",
            }}
            aria-hidden
          />

          <div className="relative flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-[#009EE3]/20 border border-[#009EE3]/40">
                <CreditCard size={18} strokeWidth={1.8} className="text-[#00A9E0]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[15px] font-semibold leading-snug">Mercado Pago</p>
                  <button
                    type="button"
                    onClick={() => setComisionesOpen(true)}
                    aria-label="Plazos y comisiones"
                    title="Plazos y comisiones"
                    className="p-1 rounded-full text-white/55 hover:text-white hover:bg-white/10 cursor-pointer"
                  >
                    <HelpCircle size={15} strokeWidth={2} />
                  </button>
                </div>
                <p className="text-[12px] text-white/70 mt-1 leading-snug max-w-md">
                  {isExpired
                    ? "Sesión expirada — volvé a vincular para seguir cobrando."
                    : "Vinculá tu cuenta para cobros con Posnet, QR y conciliación."}
                </p>
              </div>
            </div>
          </div>

          {isExpired && sellerStatus && (sellerStatus.displayName || sellerStatus.email) && (
            <p className="relative mt-3 text-[12px] text-white/70 truncate">
              {[sellerStatus.displayName, sellerStatus.email].filter(Boolean).join(" · ")}
            </p>
          )}

          {cloudCleanupPending && (
            <div
              role="alert"
              className="relative mt-3 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-[12px] text-amber-100"
            >
              <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
              <span>Limpieza pendiente en la nube — reintentá con conexión.</span>
            </div>
          )}

          <div className="relative mt-4 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              data-tour="vinculame"
              onClick={handleLink}
              disabled={linking}
              className={`h-10 px-5 rounded-full text-[13px] font-semibold transition-all flex items-center justify-center gap-2 select-none active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-md ${
                isExpired
                  ? "bg-orange-500 text-white hover:brightness-110"
                  : "bg-[#009EE3] hover:bg-[#008BCC] text-white"
              }`}
            >
              {linking ? (
                <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
              ) : (
                <Link2 size={14} strokeWidth={2.5} />
              )}
              {linking ? "Redirigiendo…" : isExpired ? "Re-vincular" : "Vincular Mercado Pago"}
            </button>

            {sellerStatus?.linked && (
              <button
                type="button"
                onClick={() => setUnlinkConfirmOpen(true)}
                disabled={unlinking}
                className="h-10 px-4 rounded-full text-[13px] font-semibold transition-all flex items-center justify-center gap-2 select-none active:scale-[0.98] disabled:opacity-50 cursor-pointer bg-white/10 border border-white/15 text-white/80 hover:text-white hover:bg-white/15"
              >
                {unlinking && <Loader2 size={13} strokeWidth={2.5} className="animate-spin" />}
                {unlinking ? "Desvinculando…" : "Desvincular"}
              </button>
            )}
          </div>
        </div>
      )}

      <div data-tour="pagos-salud">
        <MpHealthPanel />
      </div>

      {/* 3. Sucursal + Sesión (denso) */}
      <div data-tour="pagos-sucursal" className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        <div className={`${cardShell} p-3.5 space-y-2.5 flex flex-col`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Store size={15} strokeWidth={1.8} className="text-[var(--accent-primary)] shrink-0" />
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)] leading-tight">Sucursal</h3>
                <p className="text-[12px] text-[var(--text-secondary)] truncate">
                  {summary?.store.name ?? summary?.store.storeName ?? "Sin nombre"}
                  {summary?.store.linked ? "" : " · no vinculada"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 text-[12px] text-[var(--text-tertiary)]">
              <span className="inline-flex items-center gap-1" title="Barras">
                <QrCode size={12} aria-hidden />
                <span className="tabular font-semibold text-[var(--text-primary)]">{summary?.bars ?? 0}</span>
              </span>
              <span className="inline-flex items-center gap-1" title="Posnets">
                <Monitor size={12} aria-hidden />
                <span className="tabular font-semibold text-[var(--text-primary)]">{summary?.posnets ?? 0}</span>
              </span>
              {summary?.store.linked && (
                <button
                  type="button"
                  onClick={() => {
                    setRenameDraft(summary?.store.name ?? summary?.store.storeName ?? "");
                    setRenameOpen((v) => !v);
                  }}
                  className="h-7 px-2.5 rounded-full border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-[11px] font-semibold cursor-pointer"
                >
                  Renombrar
                </button>
              )}
            </div>
          </div>

          {renameOpen && (
            <div className="space-y-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] p-3">
              <label htmlFor="store-rename" className="text-[12px] font-semibold text-[var(--text-primary)] block">
                Nombre en el comprobante MP
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="store-rename"
                  type="text"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  maxLength={60}
                  placeholder="Nombre de la sucursal"
                  className="flex-1 h-9 px-3 bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                <button
                  type="button"
                  onClick={handleRenameStore}
                  disabled={savingRename || !renameDraft.trim() || renameDraft.trim().length > 60}
                  className="h-9 px-3 rounded-full bg-[var(--accent-primary)] text-[var(--text-on-accent)] text-[12px] font-semibold flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  {savingRename ? <Loader2 size={13} className="animate-spin" /> : null}
                  Guardar
                </button>
              </div>
            </div>
          )}

          {renameResult && renameResult.renamedInMp === false && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-xl bg-[var(--amber-soft)] px-3 py-2 text-[12px] text-[var(--amber-base)] leading-relaxed"
            >
              <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                MP no aceptó el cambio: alias local «{renameResult.name}»; en MP sigue «
                {renameResult.mpName ?? "el anterior"}».
              </span>
            </div>
          )}
        </div>

        <div className={`${cardShell} p-3.5 space-y-2.5 flex flex-col`}>
          <div className="flex items-center gap-2">
            <UserRound size={15} strokeWidth={1.8} className="text-[var(--accent-primary)] shrink-0" />
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Sesión de caja</h3>
          </div>

          {sessions.length > 0 ? (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] divide-y divide-[var(--border-subtle)] overflow-hidden">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wifi size={12} className="text-[var(--success-base)] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{s.username}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        {formatRelative(s.connectedAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleForceLogout(s.barId)}
                    className="flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--danger-soft)] text-[var(--danger-base)] text-[11px] font-semibold cursor-pointer"
                  >
                    <LogOut size={11} />
                    Cerrar
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-[var(--text-tertiary)] py-1">Nadie conectado en caja.</p>
          )}
        </div>
      </div>

      {/* 4. PDVs / Posnets */}
      {children}

      {/* Diagnóstico avanzado al final — no compite con el flujo de vinculación */}
      <MpDevToolsPanel />

      <ComisionesPlazosPanel
        open={comisionesOpen}
        onClose={() => setComisionesOpen(false)}
        linked={Boolean(isLinked)}
      />

      {unlinkConfirmOpen && (
        <SafeDeleteModal
          onClose={() => setUnlinkConfirmOpen(false)}
          onConfirm={handleUnlinkSeller}
          title="Desvincular Mercado Pago"
          typeLabel="la cuenta"
          confirmLabel="Desvincular"
          warning={
            <>
              ¿Estás seguro de que querés desvincular la cuenta de Mercado Pago
              {sellerStatus?.displayName ? (
                <>
                  {" "}
                  <strong className="text-[var(--danger-base)] font-semibold">{sellerStatus.displayName}</strong>
                </>
              ) : null}
              ? Tus barras y Posnets se conservan. Con la misma cuenta MP se restauran solos; con otra
              cuenta hay que re-asociar el PDV, y{" "}
              <strong className="text-[var(--danger-base)] font-semibold">el QR estático puede cambiar</strong>
              {" "}(si ya está impreso, reimprimilo).
            </>
          }
        />
      )}

      {unlinkDone && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast
            variant="success"
            message="Cuenta de Mercado Pago desvinculada"
            duration={3000}
            onClose={() => setUnlinkDone(false)}
          />
        </div>
      )}
      {linkedNotice && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast variant="success" message="Cuenta de Mercado Pago vinculada" duration={3000} onClose={() => setLinkedNotice(false)} />
        </div>
      )}
      {error && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast variant="error" message={error} onClose={() => setError(null)} />
        </div>
      )}
    </div>
  );
}
