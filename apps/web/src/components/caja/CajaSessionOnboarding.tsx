"use client";

import {
  LockKeyhole,
  LogOut,
  Monitor,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { BrandLogo } from "@/components/shared/BrandLogo";
import type { BarSessionOption } from "@/services/bar-sessions.service";
import { formatHm, plural } from "@/lib/utils";

type Props = {
  username: string;
  boxes: BarSessionOption[];
  joiningBarId: string | null;
  refreshing: boolean;
  error: string | null;
  onJoin: (barId: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
};

function connectedSince(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sesión activa";
  return `En uso desde ${formatHm(date.getTime())} hs`;
}

export default function CajaSessionOnboarding({
  username,
  boxes,
  joiningBarId,
  refreshing,
  error,
  onJoin,
  onRefresh,
  onLogout,
}: Props) {
  return (
    <main className="min-h-[100dvh] bg-ink-950 text-ink-50">
      <header className="h-20 px-5 sm:px-8 border-b border-ink-800 bg-ink-925 flex items-center justify-between">
        <BrandLogo size="md" />
        <button
          type="button"
          onClick={onLogout}
          className="h-10 px-3.5 rounded-xl border border-ink-750 bg-ink-900 text-ink-300 hover:text-ink-50 hover:border-ink-600 transition-colors flex items-center gap-2 text-xs font-bold"
        >
          <LogOut size={15} />
          Cerrar sesión
        </button>
      </header>

      <section className="w-full max-w-5xl mx-auto px-5 py-10 sm:px-8 sm:py-16">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-bold text-ink-400 mb-4">
            <UserRound size={15} className="text-accent" />
            Sesión de {username}
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-ink-50">
            Elegí una caja
          </h1>
          <p className="mt-3 text-sm sm:text-base text-ink-400 max-w-xl leading-relaxed">
            Tu usuario quedará conectado a esa caja hasta que cierres sesión.
            Las cajas ocupadas se liberan cuando el otro cajero sale.
          </p>
        </div>

        <div className="mt-9 flex items-center justify-between gap-4">
          <p className="text-xs font-bold text-ink-500">
            {plural(boxes.length, "caja configurada", "cajas configuradas")}
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="h-9 px-3 rounded-lg text-xs font-bold text-ink-400 hover:text-ink-50 hover:bg-ink-900 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            {error}
          </div>
        )}

        {boxes.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-ink-800 bg-ink-925 p-8 text-center">
            <Monitor size={26} className="mx-auto text-ink-500" />
            <h2 className="mt-4 font-black text-ink-100">No hay cajas configuradas</h2>
            <p className="mt-2 text-sm text-ink-400">
              Un administrador debe crear una caja antes de que puedas ingresar.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {boxes.map((box) => {
              const occupied = box.status === "occupied";
              const joining = joiningBarId === box.barId;

              return (
                <button
                  key={box.barId}
                  type="button"
                  disabled={occupied || joiningBarId !== null}
                  onClick={() => onJoin(box.barId)}
                  className={[
                    "min-h-36 rounded-2xl border p-5 text-left transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    occupied
                      ? "cursor-not-allowed border-ink-800 bg-ink-925/70 text-ink-500"
                      : "border-ink-750 bg-ink-900 hover:border-accent/60 hover:bg-ink-850 active:scale-[0.99]",
                    joining ? "border-accent/60" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className={[
                        "w-11 h-11 rounded-xl border flex items-center justify-center",
                        occupied
                          ? "border-ink-800 bg-ink-900 text-ink-600"
                          : "border-accent/25 bg-accent/10 text-accent",
                      ].join(" ")}
                    >
                      {occupied ? <LockKeyhole size={20} /> : <Monitor size={20} />}
                    </div>
                    <span
                      className={[
                        "text-[11px] font-black",
                        occupied ? "text-ink-500" : "text-accent",
                      ].join(" ")}
                    >
                      {joining ? "Conectando..." : occupied ? "Sesión en uso" : "Disponible"}
                    </span>
                  </div>

                  <h2
                    className={[
                      "mt-5 text-xl font-black tracking-tight",
                      occupied ? "text-ink-400" : "text-ink-50",
                    ].join(" ")}
                  >
                    {box.name}
                  </h2>

                  {occupied && box.session ? (
                    <div className="mt-2 text-xs text-ink-500">
                      <p className="font-bold text-ink-400">{box.session.username}</p>
                      <p className="mt-0.5">{connectedSince(box.session.connectedAt)}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-ink-400">
                      {box.code ? `Código ${box.code}` : "Lista para conectar"}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
