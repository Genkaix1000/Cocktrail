"use client";

import { Check, Eye, EyeOff, Loader2, Lock, LogIn, Moon, Shield, Banknote, Sun } from "lucide-react";
import Script from "next/script";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { useTheme } from "@/components/ThemeProvider";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api-client";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          appearance?: "always" | "execute" | "interaction-only";
          size?: "normal" | "compact" | "flexible";
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY;

function waitForTurnstile(timeoutMs = 10_000): Promise<NonNullable<Window["turnstile"]>> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Turnstile no cargó. Reintentá."));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

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

type SubmitPhase = "idle" | "loading" | "success";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const { isDark, toggleDark } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const tokenRef = useRef<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenWaiters = useRef<Array<(token: string) => void>>([]);

  // Prefetch Turnstile al montar: al apretar login el token ya está (o casi).
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;

    void (async () => {
      try {
        const turnstile = await waitForTurnstile();
        if (cancelled) return;
        const container = document.getElementById("turnstile-container");
        if (!container) return;
        container.replaceChildren();
        widgetIdRef.current = turnstile.render(container, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: "interaction-only",
          callback: (token) => {
            tokenRef.current = token;
            const waiters = tokenWaiters.current.splice(0);
            for (const resolve of waiters) resolve(token);
          },
          "expired-callback": () => {
            tokenRef.current = null;
          },
          "error-callback": () => {
            tokenRef.current = null;
          },
        });
      } catch {
        // Se reintenta en submit si hace falta.
      }
    })();

    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          // ignore
        }
      }
      widgetIdRef.current = null;
      tokenRef.current = null;
      tokenWaiters.current = [];
    };
  }, []);

  async function getTurnstileToken(): Promise<string | undefined> {
    if (!TURNSTILE_SITE_KEY) return undefined;
    if (tokenRef.current) return tokenRef.current;

    const turnstile = await waitForTurnstile();
    if (widgetIdRef.current) {
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Verificación de seguridad lenta")), 12_000);
        tokenWaiters.current.push((token) => {
          clearTimeout(timer);
          resolve(token);
        });
        try {
          turnstile.reset(widgetIdRef.current!);
        } catch {
          clearTimeout(timer);
          reject(new Error("Falló la verificación de seguridad"));
        }
      });
    }

    const container = document.getElementById("turnstile-container");
    if (!container) throw new Error("Contenedor Turnstile no encontrado");
    container.replaceChildren();

    return new Promise<string>((resolve, reject) => {
      widgetIdRef.current = turnstile.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        appearance: "interaction-only",
        callback: (token) => {
          tokenRef.current = token;
          resolve(token);
        },
        "error-callback": () => reject(new Error("Falló la verificación de seguridad")),
        "expired-callback": () => reject(new Error("Verificación expirada, reintentá")),
      });
    });
  }

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
    if (phase !== "idle") return;
    setPhase("loading");
    setError(null);

    try {
      const cfTurnstileToken = await getTurnstileToken();
      const data = await authService.login(username, password, cfTurnstileToken);
      const dest = redirect ?? (data.role === "admin" ? "/admin" : "/caja");
      setPhase("success");
      // Feedback visual breve antes de entrar.
      await new Promise((r) => setTimeout(r, 420));
      router.push(dest);
      router.refresh();
    } catch (err) {
      tokenRef.current = null;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch {
          // ignore
        }
      }
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Error de red");
      }
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-app)]">
      {TURNSTILE_SITE_KEY ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
        />
      ) : null}
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
                  disabled={busy}
                  className={`w-full p-4 rounded-2xl border flex items-center gap-3.5 transition-all duration-200 cursor-pointer text-left active:scale-[0.98] disabled:opacity-50 ${roleCardClass(username === "admin")}`}
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
                  disabled={busy}
                  className={`w-full p-4 rounded-2xl border flex items-center gap-3.5 transition-all duration-200 cursor-pointer text-left active:scale-[0.98] disabled:opacity-50 ${roleCardClass(username === "caja")}`}
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
                    disabled={busy}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] rounded-xl px-4 py-3.5 text-[var(--text-primary)] outline-none transition-colors text-[15px] placeholder:text-[var(--text-tertiary)] disabled:opacity-60"
                    placeholder="ej. admin, caja, cajera_julia"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                    Contraseña
                  </span>
                  <div className="relative">
                    <input
                      id="password-input"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      disabled={busy}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] rounded-xl px-4 py-3.5 pr-12 text-[var(--text-primary)] outline-none transition-colors text-[15px] placeholder:text-[var(--text-tertiary)] disabled:opacity-60"
                      placeholder="Ingresá tu clave o PIN"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      disabled={busy}
                      aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      aria-pressed={showPassword}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {showPassword ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                    </button>
                  </div>
                </label>

                <div id="turnstile-container" />

                <button
                  type="submit"
                  disabled={busy || !username || !password}
                  aria-busy={phase === "loading"}
                  className={`mt-1 h-12 font-semibold rounded-xl text-[14px] flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed cursor-pointer overflow-hidden relative ${
                    phase === "success"
                      ? "bg-[var(--accent-primary)] text-[var(--text-on-accent)] scale-[1.02]"
                      : "bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] active:scale-[0.98] disabled:opacity-40"
                  }`}
                >
                  {phase === "loading" ? (
                    <>
                      <Loader2 size={16} strokeWidth={2.2} className="animate-spin" />
                      Iniciando…
                    </>
                  ) : phase === "success" ? (
                    <>
                      <Check size={18} strokeWidth={2.4} className="animate-in zoom-in duration-200" />
                      ¡Listo!
                    </>
                  ) : (
                    <>
                      <LogIn size={16} strokeWidth={2.2} />
                      Iniciar sesión
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
