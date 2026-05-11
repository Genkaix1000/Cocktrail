"use client";

import { Lock, LogIn, Martini } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type LoginResponse = { username: string; role: "admin" | "barman" };

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
      router.push(data.role === "admin" ? "/admin" : "/barra");
      router.refresh();
    } catch {
      setError("Error de red");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#020617] text-white flex items-center justify-center p-5">
      <div className="w-full max-w-sm bg-[#0f172a] border border-[#1e293b] rounded-3xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-[#38bdf8] to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-[#38bdf8]/20">
            <Martini size={20} className="text-[#020617] fill-[#020617]" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight leading-none">
              Cocktrail
            </h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">
              Panel staff
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Usuario
            </span>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-[#020617] border border-[#1e293b] rounded-xl px-4 py-3 text-white outline-none focus:border-[#38bdf8]/60 transition-colors"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Contraseña
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-[#020617] border border-[#1e293b] rounded-xl px-4 py-3 text-white outline-none focus:border-[#38bdf8]/60 transition-colors"
            />
          </label>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
              <Lock size={14} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="mt-2 h-12 bg-[#38bdf8] text-[#020617] font-black rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-[#7dd3fc] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LogIn size={16} strokeWidth={3} />
            {submitting ? "Iniciando…" : "Iniciar sesión"}
          </button>
        </form>

        <p className="mt-6 text-[11px] text-slate-500 text-center">
          ¿Sos cliente? Escaneá el QR del boliche para pedir.
        </p>
      </div>
    </main>
  );
}
