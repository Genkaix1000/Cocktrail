"use client";

import { Lock, LogIn, Shield, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { useTheme } from "@/components/ThemeProvider";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api-client";
import { OSHeadbar } from "@/components/shared/OSHeadbar";

export default function LoginPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Captcha states
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");

  const handleSelectGenericRole = (role: "admin" | "caja" | "barman") => {
    const genericUsername = role === "barman" ? "barra" : role;
    setUsername(genericUsername);
    setPassword("");
    setError(null);
    setCaptchaRequired(false);
    setCaptchaQuestion("");
    setCaptchaAnswer("");

    // Focus password field
    setTimeout(() => {
      document.getElementById("password-input")?.focus();
    }, 50);
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const data = await authService.login(username, password, captchaRequired ? captchaAnswer : undefined);
      // Redirect based on the authenticated role
      const dest = data.role === "admin" ? "/admin" : data.role === "caja" ? "/caja" : "/barra";
      router.push(dest);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const errorData = err.data as { captchaRequired?: boolean; captchaQuestion?: string } | undefined;
        if (errorData?.captchaRequired) {
          setCaptchaRequired(true);
          setCaptchaQuestion(errorData.captchaQuestion || "");
          setCaptchaAnswer("");
        }
      } else {
        setError("Error de red");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-ink-950">
      <header className="h-[60px] px-6 border-b border-ink-800 bg-ink-925 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <BrandLogo size="md" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-400">
            Terminal de Acceso
          </span>
        </div>
        <div className="flex items-center gap-4">
          <OSHeadbar activeScreen="Login" />
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
        <div className="dark w-full max-w-4xl bg-ink-900 border border-ink-800 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col md:flex-row gap-8 items-stretch transition-all duration-300" data-theme={theme}>
        
        {/* Left column: Quick Logins */}
        <div className="flex-1 flex flex-col gap-6 justify-center pb-6 md:pb-0 border-b md:border-b-0 md:border-r border-ink-800 md:pr-8">
          <div className="flex items-center gap-3.5">
            <BrandLogo size="md" />
            <span className="text-xs font-black uppercase tracking-[0.22em] text-ink-100">
              Terminales Genéricas
            </span>
          </div>

          <div>
            <h2 className="font-serif-italic text-3xl text-ink-50">
              Accesos Rápidos
            </h2>
            <p className="text-xs text-ink-300 mt-1.5 leading-relaxed">
              Seleccioná un perfil genérico para auto-completar el usuario e ingresar su clave.
            </p>
          </div>

          <div className="flex flex-col gap-3.5">
            {/* Admin Selector */}
            <button
              type="button"
              onClick={() => handleSelectGenericRole("admin")}
              className={`w-full p-4 rounded-2xl border flex items-center gap-3.5 transition-all duration-200 cursor-pointer text-left active:scale-[0.98] ${
                username === "admin"
                  ? "bg-sky-500/10 border-sky-500 text-ink-50"
                  : "bg-ink-950/45 border-ink-800 text-ink-300 hover:bg-ink-850 hover:border-ink-700"
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
                username === "admin" ? "bg-sky-500/25 border-sky-400 text-ink-50" : "bg-ink-800 border-ink-750"
              }`}>
                <Shield size={16} />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base text-ink-50">Administrador (Admin)</span>
                <span className="text-xs text-ink-200 font-medium mt-1">Control Total y Estadísticas</span>
              </div>
            </button>

            {/* Caja Selector */}
            <button
              type="button"
              onClick={() => handleSelectGenericRole("caja")}
              className={`w-full p-4 rounded-2xl border flex items-center gap-3.5 transition-all duration-200 cursor-pointer text-left active:scale-[0.98] ${
                username === "caja"
                  ? "bg-purple-500/10 border-purple-500 text-ink-50"
                  : "bg-ink-950/45 border-ink-800 text-ink-300 hover:bg-ink-850 hover:border-ink-700"
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
                username === "caja" ? "bg-purple-500/25 border-purple-400 text-ink-50" : "bg-ink-800 border-ink-750"
              }`}>
                <Wallet size={16} />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base text-ink-50">Caja Registradora Genérica</span>
                <span className="text-xs text-ink-200 font-medium mt-1">Registros de Cobros y Tickets</span>
              </div>
            </button>
          </div>
        </div>

        {/* Right column: Form */}
        <div className="flex-1 flex flex-col justify-center md:pl-4">
          <div className="flex items-center gap-3.5 mb-6">
            <span className="text-xs font-black uppercase tracking-[0.22em] text-ink-100">
              Formulario de Ingreso
            </span>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4.5">
            {error && (
              <div className="flex items-center gap-2 text-sm text-danger bg-danger-soft border border-danger-line rounded-xl px-4 py-3">
                <Lock size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Username field */}
            <label className="flex flex-col gap-2">
              <span className="text-sm font-black uppercase tracking-[0.18em] text-ink-50">
                Usuario
              </span>
              <input
                id="username-input"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-ink-850 border border-ink-750 focus:border-blue rounded-2xl px-5 py-4 text-ink-50 outline-none transition-colors text-base placeholder-ink-600 focus:bg-ink-800"
                placeholder="ej. admin, caja, cajera_julia"
              />
            </label>

            {/* Password field */}
            <label className="flex flex-col gap-2">
              <span className="text-sm font-black uppercase tracking-[0.18em] text-ink-50">
                Contraseña
              </span>
              <input
                id="password-input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-ink-850 border border-ink-750 focus:border-blue rounded-2xl px-5 py-4 text-ink-50 outline-none transition-colors text-base placeholder-ink-600 focus:bg-ink-800"
                placeholder="Ingresá tu clave o PIN"
              />
            </label>

            {/* Captcha challenge */}
            {captchaRequired && (
              <label className="flex flex-col gap-2 border border-amber-500/20 bg-amber-500/5 rounded-2xl p-4">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-amber-400">
                  Control de Seguridad: {captchaQuestion}
                </span>
                <input
                  type="text"
                  required
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  className="bg-ink-850 border border-amber-500/30 focus:border-amber-400 rounded-xl px-4 py-3 text-ink-50 outline-none transition-colors text-base font-mono text-center font-bold"
                  placeholder="Respuesta"
                />
              </label>
            )}

            <button
              type="submit"
              disabled={submitting || !username || !password || (captchaRequired && !captchaAnswer)}
              className="mt-2 h-14 bg-blue text-ink-950 font-black rounded-xl text-sm uppercase tracking-[0.14em] flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <LogIn size={16} strokeWidth={2.5} />
              {submitting ? "Iniciando…" : "Iniciar sesión"}
            </button>
          </form>
        </div>
      </div>
    </main>
  </div>
  );
}
