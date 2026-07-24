"use client";

import { Lock, LogIn, Moon, Shield, Banknote, Sun } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { useTheme } from "@/components/ThemeProvider";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api-client";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[var(--bg-app)]">
          <p className="text-[var(--text-secondary)] text-sm animate-pulse">Cargando…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function roleCardClass(active: boolean) {
  return active
    ? "bg-[var(--accent-surface)] border-[var(--accent-primary)] text-[var(--text-primary)]"
    : "bg-[var(--bg-panel)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]";
}

function roleIconClass(active: boolean) {
  return active
    ? "bg-[var(--accent-primary)] border-transparent text-[var(--text-on-accent)]"
    : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-tertiary)]";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const { isDark, toggleDark } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSelectGenericRole = (role: "admin" | "caja") => {
    setUsername(role);
    setPassword("");
    setError(null);
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
      const data = await authService.login(username, password);
      const dest = redirect ?? (data.role === "admin" ? "/admin" : "/caja");
      router.push(dest);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Error de red");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-app)]">
      <div className="flex flex-col flex-1 min-h-0 p-3 md:p-4 gap-3 md:gap-4">
        <header className="h-14 md:h-16 px-4 md:px-5 shrink-0 flex items-center justify-between bg-[var(--bg-panel)] md:rounded-[20px] shadow-card">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo size="md" />
            <span className="hidden sm:inline text-[13px] font-medium text-[var(--text-secondary)] truncate">
              Terminal de Acceso
            </span>
          </div>
          <button
            type="button"
            onClick={toggleDark}
            className="w-10 h-10 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] flex items-center justify-center hover:text-[var(--text-primary)] hover:bg-[var(--bg-app)] transition-all cursor-pointer active:scale-95"
            title={isDark ? "Cambiar a modo día" : "Cambiar a modo noche"}
            aria-label={isDark ? "Cambiar a modo día" : "Cambiar a modo noche"}
          >
            {isDark ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
          </button>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto bosko-scroll flex items-center justify-center bg-[var(--bg-panel)] md:rounded-[24px] shadow-card p-4 md:p-8">
          <div className="w-full max-w-4xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 md:p-8 shadow-card flex flex-col md:flex-row gap-8 items-stretch">
            {/* Accesos rápidos */}
            <div className="flex-1 flex flex-col gap-6 justify-center pb-6 md:pb-0 border-b md:border-b-0 md:border-r border-[var(--border-subtle)] md:pr-8">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-2">
                  Terminales genéricas
                </p>
                <h1 className="text-[28px] md:text-[32px] font-bold text-[var(--text-primary)] leading-none tracking-tight">
                  Accesos rápidos
                </h1>
                <p className="text-[13px] text-[var(--text-secondary)] mt-2 leading-relaxed">
                  Seleccioná un perfil genérico para auto-completar el usuario e ingresar su clave.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => handleSelectGenericRole("admin")}
                  className={`w-full p-4 rounded-2xl border flex items-center gap-3.5 transition-all duration-200 cursor-pointer text-left active:scale-[0.98] ${roleCardClass(username === "admin")}`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${roleIconClass(username === "admin")}`}
                  >
                    <Shield size={16} strokeWidth={1.8} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-[15px] text-[var(--text-primary)]">
                      Administrador
                    </span>
                    <span className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                      Control total y estadísticas
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectGenericRole("caja")}
                  className={`w-full p-4 rounded-2xl border flex items-center gap-3.5 transition-all duration-200 cursor-pointer text-left active:scale-[0.98] ${roleCardClass(username === "caja")}`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${roleIconClass(username === "caja")}`}
                  >
                    <Banknote size={16} strokeWidth={1.8} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-[15px] text-[var(--text-primary)]">
                      Caja registradora
                    </span>
                    <span className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                      Cobros y tickets
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* Formulario */}
            <div className="flex-1 flex flex-col justify-center md:pl-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-5">
                Formulario de ingreso
              </p>

              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                {error && (
                  <div className="flex items-center gap-2 text-sm text-[var(--danger-base)] bg-[var(--danger-soft)] border border-[var(--danger-line)] rounded-xl px-4 py-3">
                    <Lock size={14} className="shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                    Usuario
                  </span>
                  <input
                    id="username-input"
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] rounded-xl px-4 py-3.5 text-[var(--text-primary)] outline-none transition-colors text-[15px] placeholder:text-[var(--text-tertiary)]"
                    placeholder="ej. admin, caja, cajera_julia"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                    Contraseña
                  </span>
                  <input
                    id="password-input"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] rounded-xl px-4 py-3.5 text-[var(--text-primary)] outline-none transition-colors text-[15px] placeholder:text-[var(--text-tertiary)]"
                    placeholder="Ingresá tu clave o PIN"
                  />
                </label>

                <button
                  type="submit"
                  disabled={submitting || !username || !password}
                  className="mt-1 h-12 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold rounded-xl text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <LogIn size={16} strokeWidth={2.2} />
                  {submitting ? "Iniciando…" : "Iniciar sesión"}
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
