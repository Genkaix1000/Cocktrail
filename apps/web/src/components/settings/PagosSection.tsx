"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Calendar, Check, ChevronDown, CreditCard, Link2, Loader2, LogOut, Mail, Monitor, Plus, QrCode, ShieldCheck, Smartphone, Store, Trash2, UserRound, Wifi } from "lucide-react";
import { mercadopagoService, type MpSellerStatus } from "@/services/mercadopago.service";
import { configService } from "@/services/config.service";
import { pdvService, type DeviceRow } from "@/services/pdv.service";
import { apiFetch } from "@/services/api-client";
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

type PosnetEntry = DeviceRow;

type StoreSummary = {
  store: { linked: boolean; storeId: string | null; name: string | null; sellerUserId: string | null };
  bars: number;
  posnets: number;
};

type BarSession = {
  id: string;
  barId: string;
  userId: string;
  username: string;
  role: string;
  connectedAt: string;
};

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

  // Summary
  const [summary, setSummary] = useState<StoreSummary | null>(null);

  // Posnet management — loaded from API
  const [posnets, setPosnets] = useState<PosnetEntry[]>([]);
  const [newDeviceSuffix, setNewDeviceSuffix] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [addingPosnet, setAddingPosnet] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [linkedPosnet, setLinkedPosnet] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<BarSession[]>([]);

  // PDV creation
  const [cajas, setCajas] = useState<{ id: string; barId: string; qrImage?: string | null; device?: { deviceId: string; deviceUsername?: string | null } | null }[]>([]);
  const [creatingPdv, setCreatingPdv] = useState(false);

  const isBosko = theme === "bosko";

  const qrRefreshAttemptedRef = useRef(false);

  const refreshSellerStatus = useCallback(() => {
    mercadopagoService.getSellerStatus()
      .then(setSellerStatus)
      .catch(() => setSellerStatus(null));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [summaryData, sessionsData, devicesData, cajasData] = await Promise.all([
        apiFetch<StoreSummary>("/api/mercadopago/provisioning/summary"),
        apiFetch<BarSession[]>("/api/bar-sessions"),
        pdvService.listDevices(),
        pdvService.listCajas(),
      ]);
      setSummary(summaryData);
      setSessions(sessionsData);
      setPosnets(devicesData);
      setCajas(cajasData);
      // Restaurar vinculación
      const activeCaja = cajasData[0];
      if (activeCaja?.device) {
        setLinkedPosnet(activeCaja.device.deviceId);
      }
      // Auto-recuperar QR si la caja existe pero no tiene qrImage
      const cajaSinQr = cajasData.find(c => !c.qrImage);
      if (cajaSinQr && !qrRefreshAttemptedRef.current) {
        qrRefreshAttemptedRef.current = true;
        try {
          await apiFetch(`/api/mercadopago/provisioning/pos/${cajaSinQr.id}/refresh-qr`, { method: "POST" });
          const updated = await pdvService.listCajas();
          setCajas(updated);
        } catch {
          // fallback: se muestra "Sin QR" + link manual
        }
      }
    } catch { /* non-critical */ }
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

  const handleAddPosnet = async () => {
    const fullDeviceId = `PAX_A910__SMARTPOS${newDeviceSuffix.trim()}`;
    if (!newDeviceSuffix.trim() || !newAlias.trim()) return;
    setAddingPosnet(true);
    try {
      const device = await pdvService.registerDevice({ deviceId: fullDeviceId, deviceUsername: newAlias.trim() });
      setPosnets(prev => [...prev, device]);
      setNewDeviceSuffix("");
      setNewAlias("");
    } catch (err) {
      setError("No se pudo registrar el Posnet.");
    } finally {
      setAddingPosnet(false);
    }
  };

  const handleDeletePosnet = async (id: string) => {
    try {
      await pdvService.unlinkDevice(id);
      setPosnets(prev => prev.filter(p => p.id !== id));
      if (linkedPosnet === posnets.find(p => p.id === id)?.deviceId) {
        setLinkedPosnet(null);
      }
    } catch {
      setError("No se pudo eliminar el Posnet.");
    }
  };

  const handleTestCharge = async (deviceId: string) => {
    setTestingId(deviceId);
    setTestResult(null);
    try {
      const res = await mercadopagoService.testDeviceCharge();
      setTestResult(res.reachedDevice ? "Recibido" : "Sin respuesta");
    } catch {
      setTestResult("Error");
    } finally {
      setTestingId(null);
    }
  };

  const handleLinkPosnet = async (deviceId: string | null) => {
    setDropdownOpen(false);
    try {
      const cajas = await pdvService.listCajas();
      const activeCaja = cajas[0];
      if (!activeCaja) {
        setLinkedPosnet(null);
        return;
      }
      await pdvService.linkDevice({ cajaId: activeCaja.id, deviceId });
      setLinkedPosnet(deviceId);
      loadData();
    } catch {
      setError("No se pudo vincular el Posnet.");
    }
  };

  const handleForceLogout = async (barId: string) => {
    try {
      await apiFetch("/api/bar-sessions/force-logout", { method: "POST", body: { barId } });
      await loadData();
    } catch (err) {
      setError("No se pudo cerrar la sesión.");
    }
  };

  const handleCreatePdv = async () => {
    setCreatingPdv(true);
    try {
      await pdvService.createCaja({ barId: "BARRA-01", name: "Barra VIP" });
      await loadData();
    } catch (err) {
      setError("No se pudo crear el punto de venta para Barra VIP.");
    } finally {
      setCreatingPdv(false);
    }
  };

  const isLinked = sellerStatus?.linked && sellerStatus.status === "active";
  const selectedPosnet = posnets.find(p => p.deviceId === linkedPosnet);
  const activeCaja = cajas[0];
  const qrUrl = activeCaja?.qrImage || null;
  const barSession = sessions.find(s => activeCaja && s.barId === activeCaja.barId);

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
          Integración con Mercado Pago — vinculación, puntos de venta y terminales.
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
                  {summary?.store.name ?? "Bosko"}
                </p>
                <p className="text-[11px] text-ink-500 font-mono">
                  {summary?.store.linked ? `store_id: ${summary.store.storeId}` : "No vinculada"}
                </p>
            </div>
          </div>
        </div>

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

      {/* Card 2 — Puntos de Venta */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-ink-800 text-ink-400 shrink-0">
              <Smartphone size={16} />
            </div>
            <div>
            <h3 className="text-[16px] font-bold tracking-tight text-ink-100">Caja</h3>
            <p className="text-[12px] text-ink-400/80">
              {cajas.length > 0 ? "Barra VIP — QR y Posnet vinculado" : "Creá el primer punto de venta"}
            </p>
            </div>
          </div>
          {cajas.length === 0 && (
            <button
              type="button"
              onClick={handleCreatePdv}
              disabled={creatingPdv}
              className={`h-9 px-4 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                isBosko
                  ? "bg-accent text-ink-950 hover:brightness-110"
                  : "bg-blue text-white hover:brightness-110"
              } disabled:opacity-50`}
            >
              {creatingPdv ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Plus size={12} />
              )}
              {creatingPdv ? "Creando..." : "Crear PDV"}
            </button>
          )}
        </div>

        {cajas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-800 bg-ink-950/20 p-6 text-center">
            <p className="text-[12px] text-ink-600">
              No hay punto de venta. Creá el primero para Barra VIP y vinculá un Posnet.
            </p>
          </div>
        ) : (
          <>
          {/* PDV Header */}
          <div className="flex items-center gap-4 px-5 py-4 bg-ink-900/50">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-accent/15 text-accent shrink-0">
              <Store size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-ink-50">BARRA VIP</p>
              <p className="text-[11px] text-ink-500 font-mono">COCKTRAIL-BAR-01</p>
            </div>
            <span className="text-[11px] text-green font-medium bg-green/10 px-3 py-1 rounded-full shrink-0">Activa</span>
          </div>

          {/* Session */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-ink-800/50 bg-ink-950/20">
            {barSession ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-green/10 text-green shrink-0">
                    <Wifi size={12} />
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-ink-200">{barSession.username}</p>
                    <p className="text-[10px] text-ink-500">Conectado {formatRelative(barSession.connectedAt)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleForceLogout(barSession.barId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-[11px] font-medium transition-colors"
                >
                  <LogOut size={11} />
                  Cerrar sesión
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3 w-full">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-ink-800 text-ink-500 shrink-0">
                  <UserRound size={12} />
                </div>
                <span className="text-[12px] text-ink-600">Sin usuario conectado</span>
              </div>
            )}
          </div>

          {/* Action buttons row */}
          <div className="flex items-center gap-3 px-5 py-4 border-t border-ink-800/50">
            <button
              type="button"
              onClick={() => qrUrl && window.open(qrUrl, "_blank")}
              disabled={!qrUrl}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all text-[12px] font-medium ${
                qrUrl
                  ? "bg-ink-850 border-ink-700 text-ink-300 hover:text-ink-100 hover:border-ink-600 hover:bg-ink-800"
                  : "bg-ink-850 border-ink-800 text-ink-600 cursor-not-allowed"
              }`}
              title={!qrUrl ? "QR no disponible — el POS no tiene imagen de QR" : "Ver QR estático del PDV"}
            >
              <QrCode size={15} />
              {qrUrl ? "QR" : "Sin QR"}
            </button>
            {!qrUrl && activeCaja && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await apiFetch(`/api/mercadopago/provisioning/pos/${activeCaja.id}/refresh-qr`, { method: "POST" });
                    await loadData();
                  } catch {
                    setError("No se pudo recuperar el QR.");
                  }
                }}
                className="text-[11px] text-accent hover:underline"
              >
                Recuperar QR
              </button>
            )}

            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 rounded-lg border transition-all text-[12px] font-medium ${
                  selectedPosnet
                    ? "bg-green/10 border-green/30 text-green"
                    : "bg-ink-850 border-ink-700 text-ink-400 hover:text-ink-200 hover:border-ink-600"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Monitor size={15} />
                  <span>{selectedPosnet ? `Posnet: ${selectedPosnet.deviceUsername}` : "Sin Posnet vinculado"}</span>
                </div>
                <ChevronDown size={13} className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-ink-700 bg-ink-900 shadow-xl z-20 overflow-hidden">
                  {posnets.length === 0 ? (
                    <div className="px-4 py-3 text-[12px] text-ink-600 text-center">
                      No hay Posnets registrados
                    </div>
                  ) : (
                    posnets.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleLinkPosnet(p.deviceId)}
                        className={`w-full flex items-center justify-between px-4 py-3 text-[12px] text-left hover:bg-ink-850 transition-colors ${
                          linkedPosnet === p.deviceId ? "bg-accent/10 text-accent" : "text-ink-300"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Monitor size={13} />
                          <span>{p.deviceUsername}</span>
                        </div>
                        <span className="text-[10px] text-ink-600 font-mono">{p.deviceId.slice(0, 20)}…</span>
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => handleLinkPosnet(null)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-[12px] text-ink-500 hover:bg-ink-850 transition-colors border-t border-ink-800"
                  >
                    <span>Sin Posnet</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          </>
        )}
      </div>

      {/* Card 3 — Posnets */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-ink-800 text-ink-400 shrink-0">
            <Monitor size={16} />
          </div>
          <div>
            <h3 className="text-[16px] font-bold tracking-tight text-ink-100">Posnets</h3>
            <p className="text-[12px] text-ink-400/80">Terminales Point — agregar, testear, vincular</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center flex-1 h-10 bg-ink-850 border border-ink-700 rounded-lg overflow-hidden focus-within:border-accent transition-all">
            <span className="shrink-0 pl-3.5 pr-1 text-sm text-ink-600 font-mono select-none">PAX_A910__SMARTPOS</span>
            <input
              type="text"
              value={newDeviceSuffix}
              onChange={(e) => setNewDeviceSuffix(e.target.value)}
              placeholder="1494025317"
              className="flex-1 h-full bg-transparent px-1 text-sm text-ink-50 font-mono placeholder:text-ink-600 focus:outline-none"
            />
          </div>
          <input
            type="text"
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            placeholder="Alias (ej. Caja 1)"
            className="w-36 h-10 px-3.5 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none focus:border-accent transition-all"
          />
          <button
            type="button"
            onClick={handleAddPosnet}
            disabled={addingPosnet || !newDeviceSuffix.trim() || !newAlias.trim()}
            className="h-10 px-4 rounded-lg bg-ink-800 border border-ink-700 text-ink-200 hover:text-ink-50 hover:bg-ink-750 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            Agregar
          </button>
        </div>

        {posnets.length > 0 ? (
          <div className="rounded-lg border border-ink-800 divide-y divide-ink-800/50 overflow-hidden">
            {posnets.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 bg-ink-950/30">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center bg-ink-800 text-ink-400 shrink-0">
                    <Monitor size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] text-ink-300 font-mono truncate">{p.deviceId}</p>
                    <p className="text-[11px] text-ink-500">Alias: {p.deviceUsername}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTestCharge(p.deviceId)}
                    disabled={testingId === p.deviceId}
                    className="h-8 px-3 rounded-lg bg-ink-850 border border-ink-700 text-ink-400 hover:text-ink-200 text-[11px] font-medium transition-colors disabled:opacity-50"
                  >
                    {testingId === p.deviceId ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      "Test $15"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePosnet(p.id)}
                    className="h-8 w-8 rounded-lg bg-ink-850 border border-ink-700 text-ink-500 hover:text-red-400 hover:border-red-500/30 flex items-center justify-center transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-ink-800 bg-ink-950/20 p-6 text-center">
            <p className="text-[12px] text-ink-600">No hay Posnets registrados.</p>
          </div>
        )}
      </div>

      {/* Card 4 — Vinculación OAuth (abajo, se toca poco) */}
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
