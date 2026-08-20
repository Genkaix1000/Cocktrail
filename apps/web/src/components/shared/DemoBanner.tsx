"use client";

import { LayoutDashboard, Receipt, RotateCcw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/services/api-client";
import { authService } from "@/services/auth.service";
import { isDemoStatic, readGateExp } from "@/demo/store";

function formatLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export function DemoBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [leftMs, setLeftMs] = useState<number | null>(null);

  const section = pathname?.startsWith("/caja") ? "caja" : "admin";

  useEffect(() => {
    const tick = () => {
      const exp = readGateExp();
      setLeftMs(exp == null ? null : Math.max(0, exp - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!isDemoStatic()) return null;

  async function go(role: "admin" | "caja") {
    if (busy) return;
    setBusy(true);
    try {
      // Cambia rol sin tocar el gate TTL.
      await authService.login(role, "x");
      router.push(role === "admin" ? "/admin" : "/caja");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch("/api/demo/reset", { method: "POST" });
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  const low = leftMs != null && leftMs < 60 * 60 * 1000;

  return (
    <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-between gap-2 bg-[var(--accent-primary)] px-3 py-2 text-[12px] font-medium text-[var(--text-on-accent)]">
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className="shrink-0 font-semibold">Demo miBoliche</span>
        {leftMs != null && (
          <span
            className={`tabular shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
              low ? "bg-amber-400/90 text-black" : "bg-black/20"
            }`}
            title="Tiempo restante de la clave de acceso"
          >
            Clave {formatLeft(leftMs)}
          </span>
        )}
        <span className="hidden sm:inline text-white/70 truncate">· sin DB · plan 2 cajas</span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          disabled={busy || section === "admin"}
          onClick={() => void go("admin")}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-100 ${
            section === "admin"
              ? "bg-white text-[var(--accent-primary)]"
              : "bg-white/15 hover:bg-white/25"
          }`}
        >
          <LayoutDashboard size={12} />
          Admin
        </button>
        <button
          type="button"
          disabled={busy || section === "caja"}
          onClick={() => void go("caja")}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-100 ${
            section === "caja"
              ? "bg-white text-[var(--accent-primary)]"
              : "bg-white/15 hover:bg-white/25"
          }`}
        >
          <Receipt size={12} />
          Caja
        </button>
        <button
          type="button"
          onClick={() => void reset()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1.5 hover:bg-white/25 disabled:opacity-50"
          title="Resetea pedidos y noche demo"
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>
    </div>
  );
}
