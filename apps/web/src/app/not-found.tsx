"use client";

import { Compass, LogIn } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/shared/BrandLogo";

/** Rutas basura (ej. URL de QR de MP guardada por el WebView) caen acá. */
export default function NotFound() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-app)]">
      <div className="flex flex-col flex-1 min-h-0 p-3 md:p-4 gap-3 md:gap-4">
        <header className="h-14 md:h-16 px-4 md:px-5 shrink-0 flex items-center bg-[var(--bg-panel)] md:rounded-[20px] shadow-card">
          <BrandLogo size="md" />
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto bosko-scroll flex items-center justify-center bg-[var(--bg-panel)] md:rounded-[24px] shadow-card p-4 md:p-8">
          <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-8 shadow-card flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-[var(--accent-surface)] text-[var(--accent-text)] flex items-center justify-center">
              <Compass size={28} strokeWidth={1.8} />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Error 404
              </p>
              <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-tight">
                Esta página no existe
              </h1>
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                La dirección a la que intentaste entrar no corresponde a ninguna pantalla de Cocktrail.
              </p>
            </div>

            <Link
              href="/login"
              className="w-full h-12 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold rounded-xl text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
            >
              <LogIn size={16} strokeWidth={2.2} />
              Volver al inicio de sesión
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
