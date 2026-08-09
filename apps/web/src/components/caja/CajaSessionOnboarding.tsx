"use client";

import { LockKeyhole, LogOut, RefreshCw } from "lucide-react";
import { BrandLogo } from "@/components/shared/BrandLogo";
import type { BarSessionOption } from "@/services/bar-sessions.service";
import { barVisualIcon, barVisualKind } from "@/lib/bar-visual";
import { formatHm } from "@/lib/utils";

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
  return `Desde ${formatHm(date.getTime())} hs`;
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
      <header className="h-16 sm:h-20 px-5 sm:px-8 border-b border-ink-800/80 flex items-center justify-between">
        <BrandLogo size="md" />
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-xs text-ink-500">{username}</span>
          <button
            type="button"
            onClick={onLogout}
            className="h-10 px-3.5 rounded-xl border border-ink-750 bg-ink-900 text-ink-300 hover:text-ink-50 hover:border-ink-600 transition-colors flex items-center gap-2 text-xs font-bold"
          >
            <LogOut size={15} />
            Salir
          </button>
        </div>
      </header>

      <section className="w-full max-w-3xl mx-auto px-5 py-12 sm:px-8 sm:py-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-ink-50">
              Elegí una caja
            </h1>
            <p className="mt-2 text-sm text-ink-400 max-w-md leading-relaxed">
              Quedás conectado hasta que salgas o te desconecten.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Actualizar cajas"
            className="h-10 w-10 shrink-0 rounded-xl border border-ink-800 text-ink-400 hover:text-ink-50 hover:border-ink-600 disabled:opacity-50 transition-colors flex items-center justify-center"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            {error}
          </div>
        )}

        {boxes.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-ink-800 px-6 py-16 text-center">
            <p className="font-bold text-ink-200">No hay cajas disponibles</p>
            <p className="mt-2 text-sm text-ink-500 max-w-sm mx-auto leading-relaxed">
              Pedile a un admin que habilite una barra en Puntos de Venta.
            </p>
          </div>
        ) : (
          <ul className="mt-8 flex flex-col gap-3 list-none m-0 p-0">
            {boxes.map((box) => {
              const occupied = box.status === "occupied";
              const joining = joiningBarId === box.barId;
              const kind = barVisualKind(box.code ?? box.name);
              const Icon = barVisualIcon(kind);

              return (
                <li key={box.barId}>
                  <button
                    type="button"
                    disabled={occupied || joiningBarId !== null}
                    onClick={() => onJoin(box.barId)}
                    className={[
                      "w-full rounded-2xl border p-4 sm:p-5 text-left transition-all",
                      "flex items-center gap-4 sm:gap-5",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      occupied
                        ? "cursor-not-allowed border-ink-800/80 bg-ink-925/50 text-ink-500"
                        : "border-ink-750 bg-ink-900 hover:border-accent/50 hover:bg-ink-850 active:scale-[0.995]",
                      joining ? "border-accent/60 ring-1 ring-accent/30" : "",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border flex items-center justify-center",
                        occupied
                          ? "border-ink-800 bg-ink-900 text-ink-600"
                          : "border-ink-700 bg-ink-850 text-ink-100",
                      ].join(" ")}
                      aria-hidden
                    >
                      {occupied ? (
                        <LockKeyhole size={32} strokeWidth={1.5} />
                      ) : (
                        <Icon size={36} strokeWidth={1.4} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <h2
                          className={[
                            "text-lg sm:text-xl font-black tracking-tight truncate",
                            occupied ? "text-ink-400" : "text-ink-50",
                          ].join(" ")}
                        >
                          {box.name}
                        </h2>
                        <span
                          className={[
                            "shrink-0 text-[11px] font-bold uppercase tracking-wide",
                            occupied ? "text-ink-500" : "text-accent",
                          ].join(" ")}
                        >
                          {joining ? "Conectando…" : occupied ? "Ocupada" : "Entrar"}
                        </span>
                      </div>

                      {occupied && box.session ? (
                        <p className="mt-1 text-xs text-ink-500">
                          <span className="font-semibold text-ink-400">{box.session.username}</span>
                          {" · "}
                          {connectedSince(box.session.connectedAt)}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-ink-500">
                          {box.code ? box.code : "Lista para conectar"}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
