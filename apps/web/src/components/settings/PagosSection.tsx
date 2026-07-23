"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Calendar, CreditCard, Link2, Loader2, Mail, Monitor, QrCode, ShieldCheck, Store, UserRound } from "lucide-react";
import { ApiError } from "@/services/api-client";
import { mercadopagoService, type MpSellerStatus } from "@/services/mercadopago.service";
import { configService } from "@/services/config.service";
import { pdvService, type ProvisioningSummary, type RenameStoreResult } from "@/services/pdv.service";
import { useTheme } from "@/components/ThemeProvider";
import Toast from "@/components/shared/Toast";
import SafeDeleteModal from "@/components/shared/SafeDeleteModal";

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "hoy";
  if (days === 1) return "hace 1 día";
  return `hace ${days} días`;
}

export default function PagosSection() {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkedNotice, setLinkedNotice] = useState(false);
  const [sellerStatus, setSellerStatus] = useState<MpSellerStatus | null>(null);
  const [sandbox, setSandbox] = useState(false);

  // Desvincular (D9) — confirmación en dos pasos + aviso de limpieza Cloud pendiente
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [cloudCleanupPending, setCloudCleanupPending] = useState(false);

  // Summary de sucursal (los PDVs y Posnets viven en su propia tab: "PDV y Posnets")
  const [summary, setSummary] = useState<ProvisioningSummary | null>(null);

  // Rename de sucursal (criterio E): el nombre viaja a MP (rama A de T1).
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [renameResult, setRenameResult] = useState<RenameStoreResult | null>(null);

  const isBosko = theme === "bosko";

  const refreshSellerStatus = useCallback(() => {
    mercadopagoService.getSellerStatus()
      .then(setSellerStatus)
      .catch(() => setSellerStatus(null));
  }, []);

  const loadData = useCallback(async () => {
    try {
      setSummary(await pdvService.getSummary());
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

  const handleUnlinkSeller = async () => {
    setUnlinkConfirmOpen(false);
    setUnlinking(true);
    setError(null);
    try {
      const res = await mercadopagoService.unlinkSeller();
      // cloudCleaned:false = el seller local se limpió pero Cloud no (sin conexión).
      setCloudCleanupPending(res.cloudCleaned === false);
      refreshSellerStatus();
      loadData();
    } catch {
      setError("No se pudo desvincular la cuenta de Mercado Pago. Reintentá en unos segundos.");
    } finally {
      setUnlinking(false);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
            <CreditCard size={16} />
          </div>
          <span>Pagos</span>
        </h1>
        <p className="text-[13px] text-ink-400/80 mt-1">
          Integración con Mercado Pago — vinculación de cuenta y sucursal. Los PDVs y Posnets se
          administran en la tab "PDV y Posnets".
        </p>
      </div>

      {/* Card 1 — Sucursal */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-ink-800 text-ink-400 shrink-0">
            <Store size={16} />
          </div>
          <div>
            <h3 className="text-[16px] font-bold tracking-tight text-ink-100">Sucursal</h3>
            <p className="text-[12px] text-ink-400/80">Datos de la sucursal vinculada a Mercado Pago</p>
          </div>
        </div>

        <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-accent/15 text-accent shrink-0">
                <Store size={20} />
              </div>
              <div>
                <p className="text-[15px] font-bold text-ink-50">
                  {summary?.store.name ?? summary?.store.storeName ?? "Sucursal sin nombre"}
                </p>
                <p className="text-[11px] text-ink-500 font-mono">
                  {summary?.store.linked ? `store_id: ${summary.store.storeId}` : "No vinculada"}
                </p>
            </div>
          </div>
          {summary?.store.linked && (
            <button
              type="button"
              onClick={() => {
                setRenameDraft(summary?.store.name ?? summary?.store.storeName ?? "");
                setRenameOpen((v) => !v);
              }}
              className="shrink-0 h-8 px-3 rounded-lg bg-ink-850 border border-ink-700 text-ink-300 hover:text-ink-50 text-[11px] font-bold uppercase tracking-wider transition-colors"
            >
              Renombrar
            </button>
          )}
        </div>

        {renameOpen && (
          <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-4 space-y-3">
            <label htmlFor="store-rename" className="text-[11px] font-bold uppercase tracking-wider text-ink-400 block">
              Nombre de la sucursal
            </label>
            <p className="text-[11px] text-ink-500 leading-relaxed">
              El nombre viaja a Mercado Pago: es el que ve el cliente en el comprobante del cobro.
            </p>
            <div className="flex items-center gap-2">
              <input
                id="store-rename"
                type="text"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                maxLength={60}
                placeholder="Nombre de la sucursal"
                className="flex-1 h-9 px-3 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none focus:border-accent transition-all"
              />
              <button
                type="button"
                onClick={handleRenameStore}
                disabled={savingRename || !renameDraft.trim() || renameDraft.trim().length > 60}
                className="h-9 px-4 rounded-lg bg-accent/15 border border-accent/30 text-accent text-[12px] font-bold uppercase tracking-wider flex items-center gap-1.5 hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {savingRename ? <Loader2 size={14} className="animate-spin" /> : null}
                Guardar
              </button>
            </div>
          </div>
        )}

        {renameResult && renameResult.renamedInMp === false && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[12px] text-amber-200/90 leading-relaxed"
          >
            <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Mercado Pago no aceptó el cambio de nombre: se guardó el alias local{" "}
              <strong className="font-semibold">«{renameResult.name}»</strong>, pero el nombre en
              Mercado Pago sigue siendo{" "}
              <strong className="font-semibold">«{renameResult.mpName ?? "el anterior"}»</strong>.
            </span>
          </div>
        )}

          {/* Stats */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-ink-800/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-ink-800 text-ink-400">
                <QrCode size={13} />
              </div>
              <div>
                <p className="text-[13px] font-bold text-ink-100">{summary?.bars ?? 0}</p>
                <p className="text-[10px] text-ink-500">{summary?.bars === 1 ? "barra" : "barras"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-ink-800 text-ink-400">
                <Monitor size={13} />
              </div>
              <div>
                <p className="text-[13px] font-bold text-ink-100">{summary?.posnets ?? 0}</p>
                <p className="text-[10px] text-ink-500">{summary?.posnets === 1 ? "Posnet" : "Posnets"}</p>
            </div>
            {summary?.store.linked && (
              <span className="text-[11px] text-green font-medium bg-green/10 px-3 py-1 rounded-full">Vinculada</span>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Card 2 — Vinculación OAuth */}
      <div className={`rounded-xl border p-5 space-y-4 transition-all duration-200 ${
        isLinked ? "bg-green-soft border-green-line/30" : "bg-ink-900 border-ink-800"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 transition-all ${
              isLinked ? "bg-green/15 text-green" : "bg-ink-800 text-ink-500"
            }`}>
              {isLinked ? <ShieldCheck size={22} /> : <CreditCard size={22} />}
            </div>
            <div>
              <p className={`text-[14px] font-bold ${isLinked ? "text-green" : "text-ink-300"}`}>
                Mercado Pago
              </p>
              <p className="text-[12px] text-ink-400/80 mt-0.5">
                {isLinked
                  ? `Vinculado — ${sandbox ? "Sandbox" : "Producción"}`
                  : "Vinculá tu cuenta para habilitar cobros"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span id="sandbox-toggle-label" className="text-[11px] text-ink-500 font-medium uppercase tracking-wider">Sandbox</span>
            <button
              type="button"
              aria-labelledby="sandbox-toggle-label"
              aria-pressed={sandbox}
              onClick={async () => {
                const next = !sandbox;
                setSandbox(next);
                configService.update({ mercadoPago: { sandbox: next } }).catch(() => {});
              }}
              className={`relative w-10 h-5 rounded-full transition-all duration-300 cursor-pointer ${
                sandbox ? (isBosko ? "bg-accent" : "bg-blue") : "bg-ink-700"
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
                sandbox ? "left-[22px]" : "left-0.5"
              }`} />
            </button>
          </div>
        </div>

        {sellerStatus?.linked && (
          <div className={`rounded-lg border divide-y overflow-hidden ${
            sellerStatus.status === "expired"
              ? "bg-orange-500/10 border-orange-500/30 divide-orange-500/20"
              : "bg-ink-950/25 border-green-line/20 divide-green-line/10"
          }`}>
            {sellerStatus.status === "expired" && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                <AlertTriangle size={15} className="text-orange-400 shrink-0" />
                <span className="text-[12px] font-bold text-orange-300">Sesión expirada — volvé a vincular</span>
              </div>
            )}
            {sellerStatus.displayName && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                <UserRound size={15} className="text-ink-500 shrink-0" />
                <span className="text-[12px] text-ink-200">{sellerStatus.displayName}</span>
              </div>
            )}
            {sellerStatus.email && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                <Mail size={15} className="text-ink-500 shrink-0" />
                <span className="text-[12px] text-ink-200">{sellerStatus.email}</span>
              </div>
            )}
            {formatRelative(sellerStatus.linkedAt) && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                <Calendar size={15} className="text-ink-500 shrink-0" />
                <span className="text-[12px] text-ink-200">Vinculado {formatRelative(sellerStatus.linkedAt)}</span>
              </div>
            )}
          </div>
        )}

        {cloudCleanupPending && (
          <div
            role="alert"
            className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[12px] text-amber-300"
          >
            <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
            <span>
              La cuenta se desvinculó de esta PC, pero quedó limpieza pendiente en la nube — reintentá la desvinculación con conexión.
            </span>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleLink}
            disabled={linking}
            className={`flex-1 h-11 px-6 rounded-xl text-xs font-bold uppercase tracking-[0.12em] transition-all duration-300 flex items-center justify-center gap-2 select-none active:scale-[0.98] disabled:opacity-50 ${
              sellerStatus?.linked && sellerStatus.status === "expired"
                ? "bg-orange-500 text-white hover:brightness-110"
                : isBosko
                  ? "bg-accent text-ink-950 hover:brightness-110"
                  : "bg-blue text-white hover:brightness-110"
            }`}
          >
            {linking ? <Loader2 size={14} strokeWidth={2.5} className="animate-spin" /> : <Link2 size={14} strokeWidth={2.5} />}
            {linking ? "Redirigiendo..." : sellerStatus?.linked && sellerStatus.status === "expired" ? "Re-vincular" : "Vincular"}
          </button>

          {sellerStatus?.linked && (
            <button
              type="button"
              onClick={() => setUnlinkConfirmOpen(true)}
              disabled={unlinking}
              className="h-11 px-5 rounded-xl text-xs font-bold uppercase tracking-[0.12em] transition-all duration-300 flex items-center justify-center gap-2 select-none active:scale-[0.98] disabled:opacity-50 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
            >
              {unlinking && <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />}
              {unlinking ? "Desvinculando..." : "Desvincular"}
            </button>
          )}
        </div>
      </div>

      {/* Confirmación de desvinculación (D9 + aviso R22) */}
      {unlinkConfirmOpen && (
        <SafeDeleteModal
          onClose={() => setUnlinkConfirmOpen(false)}
          onConfirm={handleUnlinkSeller}
          title="Desvincular Mercado Pago"
          expectedText="DESVINCULAR"
          typeLabel="la cuenta"
          confirmLabel="Desvincular"
          warning={
            <>
              Vas a desvincular la cuenta de Mercado Pago
              {sellerStatus?.displayName ? <> <strong className="text-danger font-semibold">{sellerStatus.displayName}</strong></> : null}.
              Las cajas provisionadas con esa cuenta van a quedar huérfanas, y al re-provisionar con otra
              cuenta <strong className="text-danger font-semibold">el QR estático cambia</strong>: si el QR
              ya está impreso, vas a tener que reimprimirlo.
            </>
          }
        />
      )}

      {/* Toasts */}
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
