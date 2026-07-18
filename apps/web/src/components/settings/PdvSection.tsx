"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Store } from "lucide-react";
import { ApiError } from "@/services/api-client";
import {
  pdvService,
  type CajaRow,
  type DeviceRow,
  type StoreStatus,
} from "@/services/pdv.service";
import { useTheme } from "@/components/ThemeProvider";
import SafeDeleteModal from "@/components/shared/SafeDeleteModal";
import Toast from "@/components/shared/Toast";
import PdvTable from "./PdvTable";
import PdvFormModal, { type PdvForm } from "./PdvFormModal";

const SUPPORTED_BAR_CODE = process.env.NEXT_PUBLIC_BAR_CODE || "BARRA-01";

const emptyForm = (): PdvForm => ({
  name: "Barra VIP",
  barCode: SUPPORTED_BAR_CODE,
});

export default function PdvSection() {
  const { theme } = useTheme();
  const [cajas, setCajas] = useState<CajaRow[]>([]);
  const [store, setStore] = useState<StoreStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PdvForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<CajaRow | null>(null);
  const [linkingCajaId, setLinkingCajaId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadError(false);
    try {
      const [cajasData, storeData] = await Promise.all([
        pdvService.listCajas(),
        pdvService.getStoreStatus(),
      ]);
      setCajas(cajasData);
      setStore(storeData);
    } catch (err) {
      console.error("Error loading PDVs:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const openCreate = useCallback(() => {
    setForm(emptyForm());
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setForm(null);
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
      // Refrescar estado de sucursal (puede haberse creado on-the-fly).
      const storeData = await pdvService.getStoreStatus().catch(() => null);
      if (storeData) setStore(storeData);
      closeModal();
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
  }, [form, saving, closeModal]);

  const handleDelete = useCallback(async (caja: CajaRow) => {
    try {
      await pdvService.deleteCaja(caja.id);
      setCajas((prev) => prev.filter((c) => c.id !== caja.id));
      setDeleteConfirm(null);
      setSaved(true);
      const storeData = await pdvService.getStoreStatus().catch(() => null);
      if (storeData) setStore(storeData);
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
        const result = await pdvService.linkDevice({
          cajaId,
          deviceId,
          deviceUsername: username || undefined,
        });
        const device = result && "deviceId" in result ? result : null;
        setCajas((prev) =>
          prev.map((c) => {
            if (c.id === cajaId) return { ...c, device };
            if (device && c.device?.deviceId === device.deviceId) return { ...c, device: null };
            return c;
          }),
        );
        setSaved(true);
      } catch (err) {
        console.error("Error linking device:", err);
        setError(
          err instanceof ApiError
            ? err.message
            : "No se pudo vincular el Posnet. Verificá el ID e intentá de nuevo.",
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
      // Fase 5: desvincular deja el Posnet en el registro (caja_id NULL).
      await pdvService.linkDevice({ cajaId: device.cajaId, deviceId: null });
      setCajas((prev) =>
        prev.map((c) => (c.id === device.cajaId ? { ...c, device: null } : c)),
      );
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    );
  }

  const isBosko = theme === "bosko";
  const canCreate = cajas.length < 1;

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
            Administrá la caja QR y el Posnet de Barra VIP.
          </p>
        </div>

        <button
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

      {/* Sucursal */}
      <div
        className={`rounded-xl border px-4 py-3.5 ${
          store?.linked
            ? "bg-emerald-500/8 border-emerald-500/25"
            : "bg-ink-900 border-ink-800"
        }`}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">
          Sucursal Mercado Pago
        </p>
        {store?.linked ? (
          <p className="text-sm text-ink-100">
            Vinculada
            {store.name ? ` — ${store.name}` : ""}
            {store.storeId ? (
              <span className="text-ink-400 font-mono text-[12px]">
                {" "}
                (store_id: {store.storeId})
              </span>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-ink-400">
            Pendiente — se crea automáticamente al provisionar el primer PDV (o vinculá Mercado Pago
            desde Pagos).
          </p>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className={`flex-1 w-full min-w-0 ${modalOpen ? "" : "max-w-5xl"}`}>
          <PdvTable
            cajas={cajas}
            loadError={loadError}
            linkingCajaId={linkingCajaId}
            onRetry={loadData}
            onDeleteClick={setDeleteConfirm}
            onLinkDevice={handleLinkDevice}
            onUnlinkDevice={handleUnlinkDevice}
          />
        </div>

        {modalOpen && form && (
          <PdvFormModal
            form={form}
            saving={saving}
            supportedBarCode={SUPPORTED_BAR_CODE}
            onChange={(patch) => setForm({ ...form, ...patch })}
            onCancel={closeModal}
            onSave={handleCreate}
          />
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
    </div>
  );
}
