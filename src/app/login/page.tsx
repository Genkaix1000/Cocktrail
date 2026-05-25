"use client";

import { Lock, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";

type LoginResponse = { username: string; role: "admin" | "barman" | "caja" };

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "No se pudo iniciar sesión");
        return;
      }
      const data = (await res.json()) as LoginResponse;
      router.push(data.role === "barman" ? "/barra" : "/admin");
      router.refresh();
    } catch {
      setError("Error de red");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink-950 text-ink-50 flex items-center justify-center p-5">
      <div className="w-full max-w-sm bg-ink-900 border border-ink-800 rounded-[22px] p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <BrandLogo size="md" />
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400">
            Panel staff
          </span>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">
              Usuario
            </span>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-ink-850 border border-ink-750 rounded-xl px-4 py-3 text-ink-50 outline-none focus:border-blue-line transition-colors"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-400">
              Contraseña
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-ink-850 border border-ink-750 rounded-xl px-4 py-3 text-ink-50 outline-none focus:border-blue-line transition-colors"
            />
          </label>

          {error && (
            <div className="flex items-center gap-2 text-sm text-danger bg-danger-soft border border-danger-line rounded-xl px-3 py-2.5">
              <Lock size={14} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="mt-2 h-12 bg-blue text-ink-950 font-semibold rounded-xl text-sm uppercase tracking-[0.14em] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LogIn size={16} strokeWidth={2.5} />
            {submitting ? "Iniciando…" : "Iniciar sesión"}
          </button>
        </form>

        <p className="mt-6 text-[11px] text-ink-400 text-center">
          ¿Sos cliente? Escaneá el QR del boliche para pedir.
        </p>
      </div>
    </main>
  );
}
