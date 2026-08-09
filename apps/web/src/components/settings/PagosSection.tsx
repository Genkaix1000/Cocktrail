"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  Copy,
  CreditCard,
  HelpCircle,
  Link2,
  Loader2,
  LogOut,
  Mail,
  Monitor,
  QrCode,
  ShieldCheck,
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

const UNLINK_UNDO_MS = 5000;

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
  const [unlinkUndo, setUnlinkUndo] = useState(false);
  const pendingUnlinkRef = useRef<{
    previous: MpSellerStatus;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const [summary, setSummary] = useState<ProvisioningSummary | null>(null);
  const [sessions, setSessions] = useState<BarSession[]>([]);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [renameResult, setRenameResult] = useState<RenameStoreResult | null>(null);

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

  const commitUnlinkSeller = useCallback(async () => {
    setUnlinking(true);
    setError(null);
    try {
      const res = await mercadopagoService.unlinkSeller();
      setCloudCleanupPending(res.cloudCleaned === false);
      refreshSellerStatus();
      loadData();
    } catch {
      setError("No se pudo desvincular la cuenta de Mercado Pago. Reintentá en unos segundos.");
      refreshSellerStatus();
    } finally {
      setUnlinking(false);
    }
  }, [loadData, refreshSellerStatus]);

  /** Hold confirm → toast con Deshacer; el DELETE real corre al expirar la ventana. */
  const handleUnlinkSeller = useCallback(() => {
    if (!sellerStatus?.linked) return;
    if (pendingUnlinkRef.current) {
      clearTimeout(pendingUnlinkRef.current.timer);
      pendingUnlinkRef.current = null;
    }
    const previous = sellerStatus;
    setUnlinkConfirmOpen(false);
    setSellerStatus({
      linked: false,
      status: null,
      nickname: null,
      email: null,
      linkedAt: null,
      displayName: null,
    });
    setUnlinkUndo(true);
    setError(null);
    const timer = setTimeout(() => {
      pendingUnlinkRef.current = null;
      setUnlinkUndo(false);
      void commitUnlinkSeller();
    }, UNLINK_UNDO_MS);
    pendingUnlinkRef.current = { previous, timer };
  }, [sellerStatus, commitUnlinkSeller]);

  const handleUndoUnlink = useCallback(() => {
    const pending = pendingUnlinkRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingUnlinkRef.current = null;
    setSellerStatus(pending.previous);
    setUnlinkUndo(false);
  }, []);

  useEffect(() => {
    return () => {
      const pending = pendingUnlinkRef.current;
      if (!pending) return;
      // Cancelar: no desvincular a ciegas al desmontar (Strict Mode / cambio de tab).
      clearTimeout(pending.timer);
      pendingUnlinkRef.current = null;
    };
  }, []);

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
    <div className="max-w-5xl flex flex-col gap-8">
      <div>
        <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight select-none">
          Pagos
        </h1>
        <p className="text-[13px] text-[var(--text-secondary)] mt-1.5">
          Mercado Pago, sucursal y puntos de venta en un solo lugar
        </p>
      </div>

      {/* Sucursal + Sesión de caja — misma altura */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <div className="rounded-2xl p-5 space-y-4 shadow-card border border-transparent bg-[var(--accent-primary)] dark:bg-[var(--accent-featured)] text-[var(--text-on-accent)] flex flex-col h-full">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center border border-white/25 bg-white/10 shrink-0">
              <Store size={16} strokeWidth={1.8} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold">Sucursal</h3>
              <p className="text-[12px] text-white/55">Datos que viajan a Mercado Pago en el comprobante</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold truncate">
                {summary?.store.name ?? summary?.store.storeName ?? "Sucursal sin nombre"}
              </p>
              <p className="text-[11px] text-white/55 font-mono">
                {summary?.store.linked ? `store_id: ${summary.store.storeId}` : "No vinculada"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {summary?.store.linked ? (
                <span className="text-[11px] font-semibold text-white bg-white/15 px-2.5 py-1 rounded-full">
                  Vinculada
                </span>
              ) : (
                <span className="text-[11px] font-medium text-white/55">Sin vincular</span>
              )}
              {summary?.store.linked && (
                <button
                  type="button"
                  onClick={() => {
                    setRenameDraft(summary?.store.name ?? summary?.store.storeName ?? "");
                    setRenameOpen((v) => !v);
                  }}
                  className="h-8 px-3 rounded-full bg-white/10 border border-white/25 text-white/85 hover:text-white hover:bg-white/15 text-[12px] font-semibold transition-colors cursor-pointer"
                >
                  Renombrar
                </button>
              )}
            </div>
          </div>

          {renameOpen && (
            <div className="space-y-2.5 rounded-2xl bg-black/20 border border-white/10 p-4">
              <label htmlFor="store-rename" className="text-[13px] font-semibold block">
                Nombre de la sucursal
              </label>
              <p className="text-[12px] text-white/70 leading-relaxed">
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
                  className="flex-1 h-10 px-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/50 transition-all"
                />
                <button
                  type="button"
                  onClick={handleRenameStore}
                  disabled={savingRename || !renameDraft.trim() || renameDraft.trim().length > 60}
                  className="h-10 px-4 rounded-full bg-white text-[var(--accent-primary)] text-[13px] font-semibold flex items-center gap-1.5 hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
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
              className="flex items-start gap-2.5 rounded-xl bg-black/20 border border-amber-300/30 px-3.5 py-2.5 text-[12px] text-amber-100 leading-relaxed"
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

          <div className="mt-auto rounded-2xl bg-black/20 border border-white/10 grid grid-cols-2 divide-x divide-white/10 overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2.5">
              <QrCode size={14} strokeWidth={1.8} className="text-white/55 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Barras</p>
                <p className="text-[18px] font-bold tabular leading-tight">{summary?.bars ?? 0}</p>
              </div>
            </div>
            <div className="px-4 py-3 flex items-center gap-2.5">
              <Monitor size={14} strokeWidth={1.8} className="text-white/55 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">Posnets</p>
                <p className="text-[18px] font-bold tabular leading-tight">{summary?.posnets ?? 0}</p>
              </div>
            </div>
          </div>
        </div>

        <div className={`${cardShell} p-5 space-y-4 flex flex-col h-full`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center border border-[var(--border-subtle)] text-[var(--accent-primary)] shrink-0">
              <UserRound size={16} strokeWidth={1.8} />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">Sesión de caja</h3>
              <p className="text-[12px] text-[var(--text-tertiary)]">Quién está operando cada caja ahora</p>
            </div>
          </div>

          {sessions.length > 0 ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] divide-y divide-[var(--border-subtle)] overflow-hidden flex-1">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--success-soft)] text-[var(--success-base)] shrink-0">
                      <Wifi size={12} />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[var(--text-primary)]">{s.username}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        Conectado {formatRelative(s.connectedAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleForceLogout(s.barId)}
                    className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--danger-soft)] text-[var(--danger-base)] hover:brightness-95 text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    <LogOut size={11} />
                    Cerrar sesión
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-3 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] px-4 py-6 min-h-[120px]">
              <div className="w-9 h-9 rounded-full flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] shrink-0">
                <UserRound size={14} strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-[13px] font-medium text-[var(--text-secondary)]">Sin usuario conectado</p>
                <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                  Cuando alguien opere en caja, la sesión aparece acá.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {children}

      {/* Mercado Pago — al final de la página */}
      {isLinked ? (
        <div className={`${cardShell} p-5 space-y-4`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 bg-[var(--success-soft)] text-[var(--success-base)]">
                <ShieldCheck size={20} strokeWidth={1.8} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)]">Mercado Pago</p>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--success-soft)] text-[var(--success-base)]">
                    Vinculado
                  </span>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                  {sandbox ? "Sandbox" : "Producción"} · cobros habilitados
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span id="sandbox-toggle-label" className="text-[11px] text-[var(--text-tertiary)] font-medium uppercase tracking-wider">
                Sandbox
              </span>
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
                  sandbox ? "bg-[var(--accent-primary)]" : "bg-[var(--border-strong)]"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
                    sandbox ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
              <SandboxHelpTooltip sandbox={sandbox} />
            </div>
          </div>

          {sellerStatus && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] divide-y divide-[var(--border-subtle)] overflow-hidden">
              {sellerStatus.displayName && (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <UserRound size={15} className="text-[var(--text-tertiary)] shrink-0" strokeWidth={1.8} />
                  <span className="text-[13px] text-[var(--text-primary)]">{sellerStatus.displayName}</span>
                </div>
              )}
              {sellerStatus.email && (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <Mail size={15} className="text-[var(--text-tertiary)] shrink-0" strokeWidth={1.8} />
                  <span className="text-[13px] text-[var(--text-primary)]">{sellerStatus.email}</span>
                </div>
              )}
              {formatRelative(sellerStatus.linkedAt) && (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <Calendar size={15} className="text-[var(--text-tertiary)] shrink-0" strokeWidth={1.8} />
                  <span className="text-[13px] text-[var(--text-primary)]">
                    Vinculado {formatRelative(sellerStatus.linkedAt)}
                  </span>
                </div>
              )}
            </div>
          )}

          {cloudCleanupPending && (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-xl bg-[var(--amber-soft)] px-3.5 py-2.5 text-[12px] text-[var(--amber-base)]"
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
              onClick={() => setUnlinkConfirmOpen(true)}
              disabled={unlinking}
              className="h-10 px-5 rounded-full text-[13px] font-semibold transition-all flex items-center justify-center gap-2 select-none active:scale-[0.98] disabled:opacity-50 cursor-pointer bg-[var(--danger-soft)] text-[var(--danger-base)] hover:brightness-95"
            >
              {unlinking && <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />}
              {unlinking ? "Desvinculando…" : "Desvincular"}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="relative overflow-hidden rounded-2xl p-6 text-white shadow-card border border-[#009EE3]/20"
          style={{
            background: isExpired
              ? "linear-gradient(135deg, #7C2D12 0%, #451A03 50%, #001A33 100%)"
              : "linear-gradient(135deg, #003B64 0%, #002340 50%, #001124 100%)",
          }}
        >
          {/* Patrón de Rejilla / Grid SVG con azul Mercado Pago (#009EE3) */}
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 40 0 L 0 0 0 40' fill='none' stroke='%23009EE3' stroke-width='1' /%3E%3Ccircle cx='40' cy='0' r='1.5' fill='%23009EE3' /%3E%3C/svg%3E\")",
              backgroundSize: "32px 32px",
            }}
            aria-hidden
          />

          <div className="relative flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 bg-[#009EE3]/20 border border-[#009EE3]/40">
                <CreditCard size={20} strokeWidth={1.8} className="text-[#00A9E0]" />
              </div>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold leading-snug">Mercado Pago</p>
                <p className="text-[13px] text-white/70 mt-1 leading-snug max-w-md">
                  {isExpired
                    ? "Sesión expirada — volvé a vincular para seguir cobrando con Point y QR."
                    : "Vinculá tu cuenta para habilitar cobros con Posnet, QR y conciliación automática."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 relative">
              <span id="sandbox-toggle-label" className="text-[11px] text-white/50 font-medium uppercase tracking-wider">
                Sandbox
              </span>
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
                  sandbox ? "bg-[#009EE3]" : "bg-white/20"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
                    sandbox ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
              <SandboxHelpTooltip sandbox={sandbox} lightTheme={false} />
            </div>
          </div>

          {isExpired && sellerStatus && (
            <div className="relative mt-4 rounded-2xl border border-white/10 bg-black/20 divide-y divide-white/10 overflow-hidden">
              {sellerStatus.displayName && (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <UserRound size={15} className="text-white/45 shrink-0" />
                  <span className="text-[13px] text-white/85">{sellerStatus.displayName}</span>
                </div>
              )}
              {sellerStatus.email && (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                  <Mail size={15} className="text-white/45 shrink-0" />
                  <span className="text-[13px] text-white/85">{sellerStatus.email}</span>
                </div>
              )}
            </div>
          )}

          {cloudCleanupPending && (
            <div
              role="alert"
              className="relative mt-4 flex items-center gap-2.5 rounded-xl border border-amber-400/30 bg-amber-500/15 px-3.5 py-2.5 text-[12px] text-amber-100"
            >
              <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
              <span>
                La cuenta se desvinculó de esta PC, pero quedó limpieza pendiente en la nube — reintentá la desvinculación con conexión.
              </span>
            </div>
          )}

          <div className="relative mt-5 flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleLink}
              disabled={linking}
              className={`h-11 px-6 rounded-full text-[13px] font-semibold transition-all flex items-center justify-center gap-2 select-none active:scale-[0.98] disabled:opacity-50 cursor-pointer shadow-md ${
                isExpired
                  ? "bg-orange-500 text-white hover:brightness-110"
                  : "bg-[#009EE3] hover:bg-[#008BCC] text-white"
              }`}
            >
              {linking ? (
                <Loader2 size={15} strokeWidth={2.5} className="animate-spin" />
              ) : (
                <Link2 size={15} strokeWidth={2.5} />
              )}
              {linking ? "Redirigiendo…" : isExpired ? "Re-vincular" : "Vincular Mercado Pago"}
            </button>

            {sellerStatus?.linked && (
              <button
                type="button"
                onClick={() => setUnlinkConfirmOpen(true)}
                disabled={unlinking}
                className="h-11 px-5 rounded-full text-[13px] font-semibold transition-all flex items-center justify-center gap-2 select-none active:scale-[0.98] disabled:opacity-50 cursor-pointer bg-white/10 border border-white/15 text-white/80 hover:text-white hover:bg-white/15"
              >
                {unlinking && <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />}
                {unlinking ? "Desvinculando…" : "Desvincular"}
              </button>
            )}
          </div>
        </div>
      )}


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

      {unlinkUndo && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast
            variant="success"
            message="Cuenta de Mercado Pago desvinculada"
            duration={UNLINK_UNDO_MS}
            action={{ label: "Deshacer", onClick: handleUndoUnlink }}
            onClose={() => setUnlinkUndo(false)}
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

function SandboxHelpTooltip({ sandbox, lightTheme = true }: { sandbox: boolean; lightTheme?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const buttonRef = useCallback((node: HTMLButtonElement | null) => {
    if (node) {
      const rect = node.getBoundingClientRect();
      setCoords({
        top: rect.top - 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, []);

  const credentials = [
    { label: "Usuario", key: "user", val: "TESTUSER6590407514016219794" },
    { label: "Contraseña", key: "password", val: "eZzQdemJBx" },
    { label: "Código Verificación", key: "code", val: "724360" },
  ];

  const handleCopy = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({
      top: rect.top - 8,
      right: window.innerWidth - rect.right,
    });
    setOpen(!open);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        title="Información de Sandbox"
        className={`p-1 rounded-full transition-colors cursor-pointer ${
          lightTheme
            ? "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            : "text-white/60 hover:text-white hover:bg-white/10"
        }`}
      >
        <HelpCircle size={16} strokeWidth={2} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            style={{
              position: "fixed",
              top: coords.top,
              right: coords.right,
              transform: "translateY(-100%)",
            }}
            className="w-80 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl p-4 z-[9999] text-[var(--text-primary)] text-xs space-y-3"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
              <span className="font-semibold text-sm">Modo Sandbox</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  sandbox
                    ? "bg-[var(--accent-soft)] text-[var(--accent-primary)]"
                    : "bg-[var(--bg-panel)] text-[var(--text-tertiary)]"
                }`}
              >
                {sandbox ? "Activado" : "Desactivado"}
              </span>
            </div>

            <p className="text-[var(--text-secondary)] leading-relaxed">
              El modo Sandbox es un entorno de simulación para realizar pruebas de cobro sin procesar dinero real.
            </p>

            {sandbox && (
              <div className="space-y-2 pt-1">
                <p className="font-semibold text-[var(--text-primary)] text-[11px]">
                  Credenciales para cuenta de prueba:
                </p>
                <div className="space-y-1.5 bg-[var(--bg-panel)] p-2.5 rounded-xl border border-[var(--border-subtle)]">
                  {credentials.map((c) => (
                    <div key={c.key} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-[var(--text-tertiary)] block">{c.label}</span>
                        <span className="font-mono text-[11px] text-[var(--text-primary)] break-all">{c.val}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(c.key, c.val)}
                        title="Copiar"
                        className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] shrink-0 transition-colors cursor-pointer"
                      >
                        {copiedKey === c.key ? (
                          <Check size={14} className="text-[var(--success-base)]" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
