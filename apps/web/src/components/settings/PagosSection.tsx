"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Calendar, Check, CreditCard, Eye, EyeOff, Link2, Loader2, Mail, ShieldCheck, UserRound } from "lucide-react";
import { configService, type SafeConfig } from "@/services/config.service";
import { mercadopagoService, type MpSellerStatus } from "@/services/mercadopago.service";
import { useTheme } from "@/components/ThemeProvider";
import Toast from "@/components/shared/Toast";

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
  const [config, setConfig] = useState<SafeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkedNotice, setLinkedNotice] = useState(false);
  const [sellerStatus, setSellerStatus] = useState<MpSellerStatus | null>(null);

  const [publicKey, setPublicKey] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [sandbox, setSandbox] = useState(true);

  const isBosko = theme === "bosko";

  useEffect(() => {
    configService.get().then((c) => {
      setConfig(c);
      setPublicKey(c.mercadoPago.publicKey);
      setSandbox(c.mercadoPago.sandbox);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const refreshSellerStatus = useCallback(() => {
    mercadopagoService.getSellerStatus()
      .then(setSellerStatus)
      .catch(() => setSellerStatus(null));
  }, []);

  useEffect(() => {
    refreshSellerStatus();
  }, [refreshSellerStatus]);

  // Al volver del callback (Edge Function) MP redirige con ?linked=true|false[&message=...].
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

    // Limpiar los params para no repetir el toast al recargar.
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

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await configService.update({
        mercadoPago: { publicKey, accessToken, sandbox },
      });
      setConfig(updated);
      setAccessToken(""); // Limpiar input del token por seguridad
      setSaved(true);
    } catch (err) {
      console.error("Error saving payment config:", err);
      setError("No se pudo guardar la configuración de pagos. Reintentá en unos segundos.");
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
        <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
            <CreditCard size={16} />
          </div>
          <span>Pagos</span>
        </h1>
        <p className="text-[13px] text-ink-400/80 mt-1">
          Configurá la integración con Mercado Pago para cobrar los pedidos digitalmente.
        </p>
      </div>

      {/* Estado + Vinculación por OAuth */}
      <div className={`rounded-xl border p-5 space-y-4 transition-all duration-200 ${
        config?.mercadoPago.publicKey
          ? "bg-green-soft border-green-line/30"
          : "bg-ink-900 border-ink-800"
      }`}>
        {/* Header de estado */}
        <div className="flex items-center gap-4">
          <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 transition-all ${
            config?.mercadoPago.publicKey
              ? "bg-green/15 text-green"
              : "bg-ink-800 text-ink-500"
          }`}>
            {config?.mercadoPago.publicKey ? <ShieldCheck size={22} /> : <CreditCard size={22} />}
          </div>
          <div>
            <p className={`text-[14px] font-bold ${
              config?.mercadoPago.publicKey ? "text-green" : "text-ink-300"
            }`}>
              {config?.mercadoPago.publicKey ? "Mercado Pago Vinculado" : "Sin Vincular"}
            </p>
            <p className="text-[12px] text-ink-400/80 mt-0.5">
              {config?.mercadoPago.publicKey
                ? `Entorno: ${config.mercadoPago.sandbox ? "Sandbox (pruebas)" : "Producción"}`
                : "Vinculá tu cuenta para habilitar cobros"
              }
            </p>
          </div>
        </div>

        {/* Datos estructurados de la cuenta vinculada */}
        {sellerStatus?.linked && (
          <div className={`rounded-lg border divide-y overflow-hidden ${
            sellerStatus.status === "expired"
              ? "bg-orange-500/10 border-orange-500/30 divide-orange-500/20"
              : "bg-ink-950/25 border-green-line/20 divide-green-line/10"
          }`}>
            {sellerStatus.status === "expired" && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                <AlertTriangle size={15} className="text-orange-400 shrink-0" />
                <span className="text-[12px] font-bold text-orange-300">
                  Sesión expirada — volvé a vincular
                </span>
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
                <span className="text-[12px] text-ink-200">
                  Vinculado {formatRelative(sellerStatus.linkedAt)}
                </span>
              </div>
            )}
          </div>
        )}

        {(() => {
          const expired = sellerStatus?.linked && sellerStatus.status === "expired";
          const label = linking ? "Redirigiendo a Mercado Pago..." : "Vincular";
          const Icon = linking ? Loader2 : Link2;
          const colorClass = expired
            ? "bg-orange-500 text-white hover:brightness-110"
            : isBosko
              ? "bg-accent text-ink-950 hover:brightness-110"
              : "bg-blue text-white hover:brightness-110";
          return (
            <button
              type="button"
              onClick={handleLink}
              disabled={linking}
              className={`h-11 px-6 rounded-xl text-xs font-bold uppercase tracking-[0.12em] transition-all duration-300 flex items-center justify-center gap-2 select-none active:scale-[0.98] disabled:opacity-50 ${colorClass}`}
            >
              <Icon size={14} strokeWidth={2.5} className={linking ? "animate-spin" : ""} />
              {label}
            </button>
          );
        })()}
      </div>

      {/* Form */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 space-y-6">
        <h3 className="text-[18px] font-bold tracking-tight text-ink-100">
          Credenciales
        </h3>

        {/* Public Key */}
        <div className="space-y-1.5">
          <label htmlFor="mpPublicKey" className="text-[14px] font-semibold text-ink-100 block">
            Public Key
          </label>
          <input
            id="mpPublicKey"
            type="text"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            className="w-full h-10 px-3.5 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 font-mono placeholder:text-ink-500 focus:outline-none focus:border-accent transition-all duration-200"
            placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </div>

        {/* Access Token */}
        <div className="space-y-1.5">
          <label htmlFor="mpAccessToken" className="text-[14px] font-semibold text-ink-100 block">
            Access Token
            {config?.mercadoPago.accessTokenMasked && (
              <span className="ml-2 text-ink-600 font-mono text-[13px]">
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
              className="w-full h-10 px-3.5 pr-12 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 font-mono placeholder:text-ink-500 focus:outline-none focus:border-accent transition-all duration-200"
              placeholder="Dejar vacío para mantener el actual"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              aria-label={showToken ? "Ocultar token" : "Mostrar token"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300 transition-colors"
            >
              {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Sandbox toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-[14px] font-semibold text-ink-100">Modo Sandbox</p>
            <p className="text-[12px] text-ink-400/80">
              Activá esto para usar credenciales de prueba
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSandbox(!sandbox)}
            className={`
              relative w-12 h-6 rounded-full transition-all duration-300 cursor-pointer
              ${sandbox ? (isBosko ? "bg-accent" : "bg-blue") : "bg-ink-700"}
            `}
          >
            <div className={`
              absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300
              ${sandbox ? "left-[26px]" : "left-0.5"}
            `} />
          </button>
        </div>

        {/* Info */}
        <div className="p-4 rounded-lg bg-ink-850/50 border border-ink-800">
          <p className="text-[12px] text-ink-400/80 leading-relaxed">
            💡 Las credenciales de Mercado Pago se obtienen desde{" "}
            <span className="text-accent font-semibold">mercadopago.com.ar/developers</span>.
            El Access Token se guarda encriptado en el servidor y nunca se expone al frontend.
            Para producción, desactivá el Modo Sandbox y usá credenciales reales.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-11 px-6 rounded-xl bg-ink-800 border border-ink-700 text-ink-100 hover:text-ink-50 hover:bg-ink-750 text-xs font-bold uppercase tracking-[0.12em] transition-all duration-300 flex items-center justify-center gap-2 select-none active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Check size={14} strokeWidth={2.5} />
              Guardar configuración de pagos
            </>
          )}
        </button>
      </div>

      {/* Save feedback */}
      {saved && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-xs">
          <Toast variant="success" message="Cambios guardados" duration={2500} onClose={() => setSaved(false)} />
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
