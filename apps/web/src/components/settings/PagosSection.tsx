"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { configService, type SafeConfig } from "@/services/config.service";

export default function PagosSection() {
  const [config, setConfig] = useState<SafeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [publicKey, setPublicKey] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [sandbox, setSandbox] = useState(true);

  useEffect(() => {
    configService.get().then((c) => {
      setConfig(c);
      setPublicKey(c.mercadoPago.publicKey);
      setSandbox(c.mercadoPago.sandbox);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await configService.update({
        mercadoPago: { publicKey, accessToken, sandbox },
      });
      setConfig(updated);
      setAccessToken(""); // Limpiar input del token por seguridad
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Error saving payment config:", err);
    } finally {
      setSaving(false);
    }
  }, [publicKey, accessToken, sandbox]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink-50">Pagos</h1>
        <p className="text-[12px] text-ink-400 mt-1">
          Configurá la integración con Mercado Pago para cobrar los pedidos digitalmente.
        </p>
      </div>

      {/* Status */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${
        config?.mercadoPago.publicKey
          ? "bg-green-soft border-green-line"
          : "bg-ink-900 border-ink-800"
      }`}>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          config?.mercadoPago.publicKey
            ? "bg-green/10 text-green"
            : "bg-ink-800 text-ink-500"
        }`}>
          {config?.mercadoPago.publicKey ? <ShieldCheck size={20} /> : <CreditCard size={20} />}
        </div>
        <div>
          <p className={`text-[13px] font-semibold ${
            config?.mercadoPago.publicKey ? "text-green" : "text-ink-300"
          }`}>
            {config?.mercadoPago.publicKey ? "Mercado Pago Vinculado" : "Sin Vincular"}
          </p>
          <p className="text-[10px] text-ink-500">
            {config?.mercadoPago.publicKey
              ? `Entorno: ${config.mercadoPago.sandbox ? "Sandbox (pruebas)" : "Producción"}`
              : "Ingresá tus credenciales para habilitar cobros"
            }
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 space-y-5">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-300">
          Credenciales
        </h3>

        {/* Public Key */}
        <div>
          <label htmlFor="mpPublicKey" className="text-[11px] font-medium text-ink-400 block mb-1.5">
            Public Key
          </label>
          <input
            id="mpPublicKey"
            type="text"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            className="w-full h-10 px-3.5 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 font-mono placeholder:text-ink-500 focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/30 transition-all"
            placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </div>

        {/* Access Token */}
        <div>
          <label htmlFor="mpAccessToken" className="text-[11px] font-medium text-ink-400 block mb-1.5">
            Access Token
            {config?.mercadoPago.accessTokenMasked && (
              <span className="ml-2 text-ink-600 font-mono">
                (actual: {config.mercadoPago.accessTokenMasked})
              </span>
            )}
          </label>
          <div className="relative">
            <input
              id="mpAccessToken"
              type={showToken ? "text" : "password"}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="w-full h-10 px-3.5 pr-12 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 font-mono placeholder:text-ink-500 focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue/30 transition-all"
              placeholder="Dejar vacío para mantener el actual"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300 transition-colors"
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Sandbox toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-[13px] font-medium text-ink-200">Modo Sandbox</p>
            <p className="text-[10px] text-ink-500">
              Activá esto para usar credenciales de prueba
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSandbox(!sandbox)}
            className={`
              relative w-12 h-6 rounded-full transition-all duration-300
              ${sandbox ? "bg-blue" : "bg-ink-700"}
            `}
          >
            <div className={`
              absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300
              ${sandbox ? "left-[26px]" : "left-0.5"}
            `} />
          </button>
        </div>

        {/* Info */}
        <div className="p-3 rounded-lg bg-ink-850/50 border border-ink-800">
          <p className="text-[10px] text-ink-500 leading-relaxed">
            💡 Las credenciales de Mercado Pago se obtienen desde{" "}
            <span className="text-blue font-medium">mercadopago.com.ar/developers</span>.
            El Access Token se guarda encriptado en el servidor y nunca se expone al frontend.
            Para producción, desactivá el Modo Sandbox y usá credenciales reales.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-9 px-5 rounded-lg bg-blue text-ink-950 text-[12px] font-bold uppercase tracking-[0.08em] hover:brightness-110 transition-all disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar configuración de pagos"}
        </button>
      </div>

      {/* Save feedback */}
      {saved && (
        <div className="fixed bottom-6 right-6 bg-green-soft border border-green-line text-green px-4 py-2.5 rounded-xl text-[12px] font-medium flex items-center gap-2 shadow-2xl animate-in slide-in-from-bottom-4 z-50">
          <Check size={16} />
          Cambios guardados
        </div>
      )}
    </div>
  );
}
