"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LogOut, Monitor, Plus, RotateCw, Store, Trash2, UserRound, Wifi } from "lucide-react";
import { ApiError } from "@/services/api-client";
import {
  pdvService,
  type CajaRow,
  type DeviceRow,
  type MpDevicesListing,
} from "@/services/pdv.service";
import { mercadopagoService } from "@/services/mercadopago.service";
import { barSessionsService, type BarSession } from "@/services/bar-sessions.service";
import { useTheme } from "@/components/ThemeProvider";
import SafeDeleteModal from "@/components/shared/SafeDeleteModal";
import Toast from "@/components/shared/Toast";
import MpHealthPanel from "./MpHealthPanel";
import PdvTable from "./PdvTable";
import PdvFormPanel, { type PdvForm } from "./PdvFormPanel";

const SUPPORTED_BAR_CODE = process.env.NEXT_PUBLIC_BAR_CODE || "BARRA-01";

const emptyForm = (): PdvForm => ({
  name: "Barra VIP",
  barCode: SUPPORTED_BAR_CODE,
});

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "hoy";
  if (days === 1) return "hace 1 día";
  return `hace ${days} días`;
}

/** Estado de ciclo de vida de un Posnet registrado (D1). */
function deviceEstado(device: DeviceRow): "activo" | "historico" | "sin-caja" {
  if (device.isActive) return "activo";
  if (device.cajaId) return "historico";
  return "sin-caja";
}

export default function PdvSection() {
  const { theme } = useTheme();
  const [cajas, setCajas] = useState<CajaRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [sessions, setSessions] = useState<BarSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<PdvForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CajaRow | null>(null);
  const [linkingCajaId, setLinkingCajaId] = useState<string | null>(null);

  // Listado CRUDO de la cuenta MP (T21): fuente del alta — el id no se tipea más.
  const [mpListing, setMpListing] = useState<MpDevicesListing | null>(null);
  const [mpListingError, setMpListingError] = useState(false);

  // Alta de Posnet: se elige de la lista de MP
  const [newDeviceId, setNewDeviceId] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [addingPosnet, setAddingPosnet] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ deviceId: string; label: string } | null>(null);

  // Acciones por fila de la lista única
  const [modePendingId, setModePendingId] = useState<string | null>(null);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  // Re-provisioning (bloque H): confirmación previa — el QR cambia.
  const [reprovisionConfirm, setReprovisionConfirm] = useState<CajaRow | null>(null);

  const createBtnRef = useRef<HTMLButtonElement>(null);
  const qrRefreshAttemptedRef = useRef(false);

  const loadData = useCallback(async () => {
    setLoadError(false);
    try {
      const [cajasData, devicesData, sessionsData] = await Promise.all([
        pdvService.listCajas(),
        pdvService.listDevices(),
        barSessionsService.listAll(),
      ]);
      setCajas(cajasData);
      setDevices(devicesData);
      setSessions(sessionsData);

      // Auto-recuperar el QR si la caja existe pero quedó sin imagen.
      const cajaSinQr = cajasData.find((c) => !c.qrImage);
      if (cajaSinQr && !qrRefreshAttemptedRef.current) {
        qrRefreshAttemptedRef.current = true;
        try {
          await pdvService.refreshQr(cajaSinQr.id);
          setCajas(await pdvService.listCajas());
        } catch {
          // Queda "Sin QR" + el botón manual "Recuperar QR" de la tabla.
        }
      }
    } catch (err) {
      console.error("Error loading PDVs:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // El listado de MP se carga aparte: si MP no responde, el resto de la tab vive.
  const loadMpListing = useCallback(async () => {
    setMpListingError(false);
    try {
      setMpListing(await pdvService.listMpDevices());
    } catch (err) {
      console.error("Error loading MP devices listing:", err);
      setMpListing(null);
      setMpListingError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    loadMpListing();
  }, [loadData, loadMpListing]);

  const openCreate = useCallback(() => {
    setForm(emptyForm());
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setForm(null);
    // Panel lateral accesible: al cerrar, el foco vuelve al disparador.
    createBtnRef.current?.focus();
  }, []);

  const handleCreate = useCallback(async () => {
    if (!form || saving) return;
    setSaving(true);
    setError(null);
    try {
      const caja = await pdvService.createCaja({
        barId: form.barCode,
        name: form.name.trim(),
      });
      setCajas((prev) => [...prev, { ...caja, device: null }]);
      closePanel();
      setSaved(true);
    } catch (err) {
      console.error("Error creating PDV:", err);
      const msg =
        err instanceof ApiError
          ? err.message
          : "No se pudo crear el PDV. Reintentá en unos segundos.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [form, saving, closePanel]);

  const handleDelete = useCallback(async (caja: CajaRow) => {
    try {
      await pdvService.deleteCaja(caja.id);
      setCajas((prev) => prev.filter((c) => c.id !== caja.id));
      setDeleteConfirm(null);
      setSaved(true);
    } catch (err) {
      console.error("Error deleting PDV:", err);
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo eliminar el PDV. Reintentá en unos segundos.",
      );
    }
  }, []);

  const handleLinkDevice = useCallback(
    async (cajaId: string, deviceId: string, username: string) => {
      setLinkingCajaId(cajaId);
      setError(null);
      try {
        await pdvService.linkDevice({
          cajaId,
          deviceId,
          deviceUsername: username || undefined,
        });
        // El vínculo puede haber sido un swap/reactivación: recargar deja el
        // ciclo de vida (activo/histórico) como lo dejó el backend.
        const [cajasData, devicesData] = await Promise.all([
          pdvService.listCajas(),
          pdvService.listDevices(),
        ]);
        setCajas(cajasData);
        setDevices(devicesData);
        setSaved(true);
      } catch (err) {
        console.error("Error linking device:", err);
        setError(
          err instanceof ApiError
            ? err.message
            : "No se pudo vincular el Posnet. Reintentá en unos segundos.",
        );
        throw err;
      } finally {
        setLinkingCajaId(null);
      }
    },
    [],
  );

  const handleUnlinkDevice = useCallback(async (device: DeviceRow) => {
    if (!device.cajaId) return;
    setLinkingCajaId(device.cajaId);
    setError(null);
    try {
      // Desvincular desactiva el vínculo: el Posnet queda como histórico de su caja.
      await pdvService.linkDevice({ cajaId: device.cajaId, deviceId: null });
      const [cajasData, devicesData] = await Promise.all([
        pdvService.listCajas(),
        pdvService.listDevices(),
      ]);
      setCajas(cajasData);
      setDevices(devicesData);
      setSaved(true);
    } catch (err) {
      console.error("Error unlinking device:", err);
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo desvincular el Posnet.",
      );
    } finally {
      setLinkingCajaId(null);
    }
  }, []);

  const handleRecoverQr = useCallback(async (caja: CajaRow) => {
    setError(null);
    try {
      await pdvService.refreshQr(caja.id);
      setCajas(await pdvService.listCajas());
      setSaved(true);
    } catch (err) {
      console.error("Error recovering QR:", err);
      setError("No se pudo recuperar el QR. Reintentá en unos segundos.");
    }
  }, []);

  const handleAddPosnet = useCallback(async () => {
    const alias = newAlias.trim();
    if (!newDeviceId || !alias) return;
    setAddingPosnet(true);
    setError(null);
    try {
      const device = await pdvService.registerDevice({
        deviceId: newDeviceId,
        deviceUsername: alias,
      });
      setDevices((prev) => [...prev, device]);
      // El device recién registrado deja de ser candidato en el selector.
      setMpListing((prev) =>
        prev
          ? {
              ...prev,
              devices: prev.devices.map((d) =>
                d.id === newDeviceId ? { ...d, registeredLocally: true } : d,
              ),
            }
          : prev,
      );
      setNewDeviceId("");
      setNewAlias("");
      setSaved(true);
    } catch (err) {
      console.error("Error registering posnet:", err);
      setError(
        err instanceof ApiError ? err.message : "No se pudo registrar el Posnet.",
      );
    } finally {
      setAddingPosnet(false);
    }
  }, [newDeviceId, newAlias]);

  const handleDeletePosnet = useCallback(async (device: DeviceRow) => {
    setError(null);
    try {
      await pdvService.unlinkDevice(device.id);
      setDevices((prev) => prev.filter((p) => p.id !== device.id));
      setCajas((prev) =>
        prev.map((c) =>
          c.device?.deviceId === device.deviceId ? { ...c, device: null } : c,
        ),
      );
      setMpListing((prev) =>
        prev
          ? {
              ...prev,
              devices: prev.devices.map((d) =>
                d.id === device.deviceId ? { ...d, registeredLocally: false } : d,
              ),
            }
          : prev,
      );
    } catch (err) {
      console.error("Error deleting posnet:", err);
      setError(
        err instanceof ApiError ? err.message : "No se pudo eliminar el Posnet.",
      );
    }
  }, []);

  const handleTestCharge = useCallback(async (deviceId: string) => {
    setTestingId(deviceId);
    setTestResult(null);
    try {
      // El test viaja con el deviceId de la fila: se prueba ESTE aparato,
      // no el que tenga configurado el backend.
      const res = await mercadopagoService.testDeviceChargeFor(deviceId);
      setTestResult({ deviceId, label: res.reachedDevice ? "Recibido" : "Sin respuesta" });
    } catch (err) {
      console.error("Error testing posnet:", err);
      setTestResult({ deviceId, label: "Error" });
      setError("El test contra el Posnet falló. Verificá que esté encendido y con red.");
    } finally {
      setTestingId(null);
    }
  }, []);

  /** Bloque C: manda el modo PDV REAL al aparato vía MP y refleja el resultado. */
  const handleSetPdvMode = useCallback(async (device: DeviceRow) => {
    setModePendingId(device.deviceId);
    setError(null);
    try {
      const result = await pdvService.setDeviceMode(device.deviceId, "PDV");
      setDevices((prev) =>
        prev.map((d) =>
          d.deviceId === device.deviceId ? { ...d, operatingMode: result.operatingMode } : d,
        ),
      );
      setMpListing((prev) =>
        prev
          ? {
              ...prev,
              devices: prev.devices.map((d) =>
                d.id === device.deviceId ? { ...d, operatingMode: result.operatingMode } : d,
              ),
            }
          : prev,
      );
      setSaved(true);
    } catch (err) {
      console.error("Error setting PDV mode:", err);
      setError(
        err instanceof ApiError ? err.message : "No se pudo cambiar el modo del Posnet.",
      );
    } finally {
      setModePendingId(null);
    }
  }, []);

  /** Decisión 1: reactivar un histórico re-vincula a SU caja — el backend hace el swap. */
  const handleReactivate = useCallback(async (device: DeviceRow) => {
    if (!device.cajaId) return;
    setReactivatingId(device.deviceId);
    setError(null);
    try {
      await pdvService.linkDevice({ cajaId: device.cajaId, deviceId: device.deviceId });
      const [cajasData, devicesData] = await Promise.all([
        pdvService.listCajas(),
        pdvService.listDevices(),
      ]);
      setCajas(cajasData);
      setDevices(devicesData);
      setSaved(true);
    } catch (err) {
      console.error("Error reactivating posnet:", err);
      setError(
        err instanceof ApiError ? err.message : "No se pudo reactivar el Posnet.",
      );
    } finally {
      setReactivatingId(null);
    }
  }, []);

  /** Bloque H: corre DESPUÉS de la confirmación explícita (el QR cambia). */
  const handleReprovision = useCallback(async (caja: CajaRow) => {
    setReprovisionConfirm(null);
    setError(null);
    try {
      await pdvService.reprovisionCaja(caja.id);
      setCajas(await pdvService.listCajas());
      setSaved(true);
    } catch (err) {
      console.error("Error reprovisioning caja:", err);
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo re-provisionar la caja. Reintentá en unos segundos.",
      );
    }
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    );
  }

  const isBosko = theme === "bosko";
  const canCreate = cajas.length < 1;
  const cajaByBarId = new Map(cajas.map((c) => [c.barId, c]));
  const cajaNameById = new Map(cajas.map((c) => [c.id, "Barra VIP"]));

  // Candidatos del alta: lo que MP reporta y todavía no está registrado acá.
  const mpCandidates = mpListing?.devices.filter((d) => !d.registeredLocally) ?? [];
  // Decisión 2: distinguir "no reclamaste el lector" de "token de otra app/cuenta".
  const tokenAjeno =
    mpListing !== null &&
    mpListing.token.source === "env" &&
    mpListing.sellerUserId !== null &&
    mpListing.token.userId !== mpListing.sellerUserId;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
              <Store size={16} />
            </div>
            <span>Puntos de Venta</span>
            <span
              className={`ml-1 px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                isBosko
                  ? "bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/25"
                  : "bg-blue/15 text-blue border border-blue/25"
              }`}
            >
              {cajas.length} PDV {cajas.length === 1 ? "activo" : "activos"}
            </span>
          </h1>
          <p className="text-[13px] text-ink-400/80 mt-1">
            Administrá la caja QR, los Posnets y la sesión de caja de Barra VIP.
          </p>
        </div>

        <button
          ref={createBtnRef}
          type="button"
          onClick={openCreate}
          disabled={!canCreate}
          title={
            canCreate
              ? "Crear PDV para Barra VIP"
              : "Solo Barra VIP disponible — multi-barra no implementado"
          }
          className="h-10 px-4 rounded-xl bg-ink-800 border border-ink-700 text-ink-100 hover:text-ink-50 text-[12px] font-bold uppercase tracking-[0.08em] flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-[0.97] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          <Plus size={14} strokeWidth={2.5} />
          {canCreate ? "+ Nueva barra" : "Solo Barra VIP"}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className={`flex-1 w-full min-w-0 ${panelOpen ? "" : "max-w-5xl"}`}>
          <PdvTable
            cajas={cajas}
            loadError={loadError}
            linkingCajaId={linkingCajaId}
            availableDevices={devices}
            onRetry={loadData}
            onDeleteClick={setDeleteConfirm}
            onLinkDevice={handleLinkDevice}
            onUnlinkDevice={handleUnlinkDevice}
            onRecoverQr={handleRecoverQr}
            onReprovisionClick={setReprovisionConfirm}
          />
        </div>

        {panelOpen && form && (
          <PdvFormPanel
            form={form}
            saving={saving}
            supportedBarCode={SUPPORTED_BAR_CODE}
            onChange={(patch) => setForm({ ...form, ...patch })}
            onCancel={closePanel}
            onSave={handleCreate}
          />
        )}
      </div>

      {/* Posnets — lista única (activo / histórico / sin caja) + alta desde MP */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-ink-800 text-ink-400 shrink-0">
            <Monitor size={16} />
          </div>
          <div>
            <h3 className="text-[16px] font-bold tracking-tight text-ink-100">Posnets</h3>
            <p className="text-[12px] text-ink-400/80">
              Terminales Point de tu cuenta de Mercado Pago — agregar, testear, vincular
            </p>
          </div>
        </div>

        {/* Alta: se elige de la lista real de MP — el id no se escribe nunca */}
        {mpListingError ? (
          <div className="rounded-lg border border-ink-800 bg-ink-950/20 px-4 py-4 text-center space-y-2">
            <p className="text-[12px] text-ink-400">
              No se pudo consultar el listado de lectores de Mercado Pago.
            </p>
            <button
              type="button"
              onClick={loadMpListing}
              className="text-[12px] font-bold uppercase tracking-wider text-accent hover:underline cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        ) : mpListing === null ? (
          <div className="flex items-center justify-center h-16">
            <Loader2 size={18} className="animate-spin text-ink-400" />
          </div>
        ) : mpListing.devices.length === 0 ? (
          /* Pantalla guía (decisión 2): nunca se presenta como error del sistema. */
          <div className="rounded-lg border border-ink-800 bg-ink-950/20 p-5 space-y-3">
            <p className="text-[13px] font-bold text-ink-200">
              Tu cuenta de Mercado Pago no reporta ningún lector Point
            </p>
            {tokenAjeno ? (
              <p className="text-[12px] text-ink-400 leading-relaxed">
                El token activo pertenece a otra aplicación o cuenta de Mercado Pago
                {mpListing.token.userId ? ` (cuenta ${mpListing.token.userId})` : ""} y la cuenta
                vinculada es {mpListing.sellerUserId} — con ese token no se pueden ver sus
                lectores. Revisá la vinculación en la tab Pagos.
              </p>
            ) : (
              <p className="text-[12px] text-ink-400 leading-relaxed">
                Todavía no reclamaste el lector en tu cuenta de Mercado Pago. Se hace desde la
                app de Mercado Pago (con la cuenta del boliche): cuando lo reclames, va a
                aparecer acá solo.
              </p>
            )}
            <button
              type="button"
              onClick={loadMpListing}
              className="text-[12px] font-bold uppercase tracking-wider text-accent hover:underline cursor-pointer"
            >
              Actualizar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <select
              value={newDeviceId}
              onChange={(e) => setNewDeviceId(e.target.value)}
              aria-label="Posnet reportado por Mercado Pago"
              className="flex-1 h-10 px-3 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 focus:outline-none focus:border-accent transition-all"
            >
              <option value="">
                {mpCandidates.length > 0
                  ? "Elegí un lector de tu cuenta…"
                  : "Todos los lectores de la cuenta ya están registrados"}
              </option>
              {mpListing.devices.map((d) => (
                <option key={d.id} value={d.id} disabled={d.registeredLocally}>
                  {d.model} — {d.operatingMode ?? "modo desconocido"}
                  {d.registeredLocally ? " — ya registrado" : ""} — {d.id}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder="Alias (ej. Caja 1)"
              aria-label="Alias del Posnet"
              className="w-36 h-10 px-3.5 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none focus:border-accent transition-all"
            />
            <button
              type="button"
              onClick={handleAddPosnet}
              disabled={addingPosnet || !newDeviceId || !newAlias.trim()}
              className="h-10 px-4 rounded-lg bg-ink-800 border border-ink-700 text-ink-200 hover:text-ink-50 hover:bg-ink-750 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={14} />
              Agregar
            </button>
          </div>
        )}

        {devices.length > 0 ? (
          <div className="rounded-lg border border-ink-800 divide-y divide-ink-800/50 overflow-hidden">
            {devices.map((p) => {
              const estado = deviceEstado(p);
              return (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 bg-ink-950/30 gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md flex items-center justify-center bg-ink-800 text-ink-400 shrink-0">
                      <Monitor size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] text-ink-300 font-mono truncate">{p.deviceId}</p>
                      <p className="text-[11px] text-ink-500">
                        Alias: {p.deviceUsername ?? "—"}
                        {" · Modo: "}
                        {p.operatingMode ?? "desconocido"}
                        {estado !== "sin-caja" && p.cajaId
                          ? ` · ${cajaNameById.get(p.cajaId) ?? "Caja"}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        estado === "activo"
                          ? "bg-green/10 text-green"
                          : estado === "historico"
                            ? "bg-ink-800 text-ink-400"
                            : "bg-amber-soft text-amber"
                      }`}
                    >
                      {estado === "activo" ? "Activo" : estado === "historico" ? "Histórico" : "Sin caja"}
                    </span>
                    {testResult?.deviceId === p.deviceId && (
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          testResult.label === "Recibido"
                            ? "bg-green/10 text-green"
                            : "bg-red-500/10 text-red-400"
                        }`}
                      >
                        {testResult.label}
                      </span>
                    )}
                    {p.operatingMode !== "PDV" && (
                      <button
                        type="button"
                        onClick={() => handleSetPdvMode(p)}
                        disabled={modePendingId === p.deviceId}
                        className="h-8 px-3 rounded-lg bg-amber-soft border border-amber-line text-amber hover:brightness-110 text-[11px] font-medium transition-colors disabled:opacity-50"
                      >
                        {modePendingId === p.deviceId ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          "Poner en modo PDV"
                        )}
                      </button>
                    )}
                    {estado === "historico" && (
                      <button
                        type="button"
                        onClick={() => handleReactivate(p)}
                        disabled={reactivatingId === p.deviceId}
                        className="h-8 px-3 rounded-lg bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25 text-[11px] font-medium transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        {reactivatingId === p.deviceId ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <>
                            <RotateCw size={11} />
                            Reactivar
                          </>
                        )}
                      </button>
                    )}
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
                      onClick={() => handleDeletePosnet(p)}
                      aria-label={`Eliminar Posnet ${p.deviceUsername ?? p.deviceId}`}
                      className="h-8 w-8 rounded-lg bg-ink-850 border border-ink-700 text-ink-500 hover:text-red-400 hover:border-red-500/30 flex items-center justify-center transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-ink-800 bg-ink-950/20 p-6 text-center">
            <p className="text-[12px] text-ink-600">No hay Posnets registrados.</p>
          </div>
        )}
      </div>

      {/* Salud de la vinculación (bloque G) */}
      <MpHealthPanel />

      {/* Sesiones de caja — contexto operativo del PDV (migrada de Pagos) */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-ink-800 text-ink-400 shrink-0">
            <UserRound size={16} />
          </div>
          <div>
            <h3 className="text-[16px] font-bold tracking-tight text-ink-100">Sesión de caja</h3>
            <p className="text-[12px] text-ink-400/80">Quién está operando cada caja ahora</p>
          </div>
        </div>

        {sessions.length > 0 ? (
          <div className="rounded-lg border border-ink-800 divide-y divide-ink-800/50 overflow-hidden">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 bg-ink-950/30">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-green/10 text-green shrink-0">
                    <Wifi size={12} />
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-ink-200">{s.username}</p>
                    <p className="text-[10px] text-ink-500">
                      Conectado {formatRelative(s.connectedAt)}
                      {cajaByBarId.has(s.barId) ? " — Barra VIP" : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleForceLogout(s.barId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-[11px] font-medium transition-colors"
                >
                  <LogOut size={11} />
                  Cerrar sesión
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-950/20 px-4 py-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-ink-800 text-ink-500 shrink-0">
              <UserRound size={12} />
            </div>
            <span className="text-[12px] text-ink-600">Sin usuario conectado</span>
          </div>
        )}
      </div>

      {saved && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast
            variant="success"
            message="Cambios guardados"
            duration={2500}
            onClose={() => setSaved(false)}
          />
        </div>
      )}
      {error && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast variant="error" message={error} onClose={() => setError(null)} />
        </div>
      )}

      {deleteConfirm && (
        <SafeDeleteModal
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => handleDelete(deleteConfirm)}
          title="Eliminar PDV"
          expectedText={deleteConfirm.externalPosId}
          typeLabel="el PDV"
        />
      )}

      {/* Bloque H: confirmación PREVIA al re-provisioning — el QR cambia */}
      {reprovisionConfirm && (
        <SafeDeleteModal
          onClose={() => setReprovisionConfirm(null)}
          onConfirm={() => handleReprovision(reprovisionConfirm)}
          title="Re-provisionar caja"
          expectedText="REPROVISIONAR"
          typeLabel="la caja"
          confirmLabel="Re-provisionar"
          warning={
            <>
              Vas a re-provisionar la caja en la cuenta activa de Mercado Pago.{" "}
              <strong className="text-danger font-semibold">El QR estático va a cambiar</strong>:
              si ya está impreso en las mesas, vas a tener que reimprimirlo. Los Posnets
              históricos de la caja se conservan.
            </>
          }
        />
      )}
    </div>
  );
}
