"use client";

import {
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogIn,
  Moon,
  Receipt,
  Sun,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import LoadingScreen from "@/components/shared/LoadingScreen";
import { useTheme } from "@/components/ThemeProvider";
import { apiFetch } from "@/services/api-client";
import { authService } from "@/services/auth.service";
import { isDemoStatic, readGateExp } from "@/demo/store";
import ProdLogin from "./login-prod";

function MiBolicheLockup({ className = "", height = 44 }: { className?: string; height?: number }) {
  const { isDark } = useTheme();
  const src = "/miboliche-horizontal.svg";
  const brandColor = isDark ? "var(--text-primary)" : "var(--accent-primary)";
  return (
    <div className={`relative inline-block max-w-full ${className}`} style={{ height }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="miBoliche"
        className="opacity-0 block h-full w-auto max-w-full"
        style={{ height }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundColor: brandColor,
          WebkitMaskImage: `url(${src})`,
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskPosition: "left center",
          WebkitMaskSize: "contain",
          maskImage: `url(${src})`,
          maskRepeat: "no-repeat",
          maskPosition: "left center",
          maskSize: "contain",
        }}
      />
    </div>
  );
}

function DemoLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { isDark, toggleDark } = useTheme();
  const [key, setKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (readGateExp()) setUnlocked(true);
    const k = search.get("k");
    if (k) setKey(k);
  }, [search]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: { key } });
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clave inválida");
    } finally {
      setBusy(false);
    }
  }

  async function enter(role: "admin" | "caja") {
    setBusy(true);
    setError(null);
    try {
      await authService.login(role, "x");
      router.push(role === "admin" ? "/admin" : "/caja");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-app)]">
      <div className="flex flex-col flex-1 min-h-0 p-3 md:p-4 gap-3 md:gap-4">
        <header className="h-14 md:h-16 px-4 md:px-5 shrink-0 flex items-center justify-between bg-[var(--bg-panel)] md:rounded-[20px] shadow-card">
          <div className="flex items-center gap-3 min-w-0">
            <MiBolicheLockup />
            <span className="hidden sm:inline text-[13px] font-medium text-[var(--text-secondary)] truncate">
              Demo · acceso temporal
            </span>
          </div>
          <button
            type="button"
            onClick={toggleDark}
            className="w-10 h-10 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] flex items-center justify-center hover:text-[var(--text-primary)] transition-all cursor-pointer"
            aria-label={isDark ? "Modo día" : "Modo noche"}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center bg-[var(--bg-panel)] md:rounded-[24px] shadow-card p-4 md:p-8">
          <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-6 md:p-8 shadow-card">
            <div className="mb-6">
              <MiBolicheLockup className="mb-3" height={48} />
              <h1 className="text-[22px] font-bold tracking-tight text-[var(--text-primary)]">
                {unlocked ? "Elegí sección" : "Entrar a la demo"}
              </h1>
              <p className="mt-1.5 text-[13px] text-[var(--text-secondary)] leading-relaxed">
                {unlocked
                  ? "Sin usuario ni contraseña de rol — solo elegí Admin o Caja."
                  : "Pegá la clave TTL o usá demo. Sin base de datos."}
              </p>
            </div>

            {!unlocked ? (
              <form onSubmit={(e) => void unlock(e)} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                    Clave de acceso
                  </span>
                  <input
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    autoFocus
                    required
                    placeholder="demo"
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-3 font-mono text-sm outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
                  />
                </label>
                {error && (
                  <p className="flex items-center gap-2 text-sm text-[var(--danger)]">
                    <KeyRound size={14} /> {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy || !key.trim()}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-on-accent)] disabled:opacity-40 hover:bg-[var(--accent-primary-hover)]"
                >
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <LogIn size={16} />}
                  Desbloquear
                </button>
              </form>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void enter("admin")}
                  className="flex h-14 items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 text-left hover:border-[var(--accent-primary)] transition-colors"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-surface)] text-[var(--accent-primary)]">
                    <LayoutDashboard size={18} />
                  </span>
                  <span>
                    <strong className="block text-[var(--text-primary)]">Admin</strong>
                    <span className="text-xs text-[var(--text-secondary)]">
                      Dashboard, carta, historial
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void enter("caja")}
                  className="flex h-14 items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 text-left hover:border-[var(--accent-primary)] transition-colors"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-surface)] text-[var(--accent-primary)]">
                    <Receipt size={18} />
                  </span>
                  <span>
                    <strong className="block text-[var(--text-primary)]">Caja</strong>
                    <span className="text-xs text-[var(--text-secondary)]">POS y ventas</span>
                  </span>
                </button>
                {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function LoginPage() {
  if (isDemoStatic()) {
    return (
      <Suspense fallback={<LoadingScreen label="Cargando…" />}>
        <DemoLoginForm />
      </Suspense>
    );
  }
  return <ProdLogin />;
}
