"use client";

import { CreditCard, Monitor, QrCode, Store, Wifi } from "lucide-react";

const card =
  "bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-card";

/**
 * Pagos hardcodeado para demo miBoliche (plan base = 2 cajas).
 * Sin llamadas a MP / provisioning — evita crashes por store null.
 */
export default function PagosSectionDemo() {
  return (
    <div className="max-w-5xl mx-auto w-full space-y-4 pb-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] md:text-[32px] font-bold leading-none text-[var(--text-primary)]">
          Pagos
        </h1>
        <p className="text-[13px] text-[var(--text-secondary)]">
          Vista demo del plan base: 2 cajas (QR dinámico + Posnet). Sin Mercado Pago real.
        </p>
      </header>

      {/* Seller mock */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-white"
        style={{
          background: "linear-gradient(135deg, #009EE3 0%, #0066A1 55%, #1a1830 100%)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/60 font-semibold">
              Mercado Pago · demo
            </p>
            <p className="text-[18px] font-bold mt-1">miBoliche Demo</p>
            <p className="text-[12px] text-white/70 mt-1">
              Vinculación simulada · cobros QR y Posnet solo visuales
            </p>
          </div>
          <span className="shrink-0 h-8 px-3 rounded-full bg-white/15 text-[11px] font-semibold flex items-center">
            Vinculada
          </span>
        </div>
      </div>

      {/* Sucursal + sesión */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className={`${card} p-4 space-y-2`}>
          <div className="flex items-center gap-2">
            <Store size={15} className="text-[var(--accent-primary)]" />
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Sucursal</h3>
          </div>
          <p className="text-[14px] font-medium text-[var(--text-primary)]">miBoliche Demo</p>
          <p className="text-[12px] text-[var(--text-secondary)]">
            Plan base · 2 cajas · 1 Posnet
          </p>
          <div className="flex gap-3 text-[12px] text-[var(--text-tertiary)] pt-1">
            <span className="inline-flex items-center gap-1">
              <QrCode size={12} />
              <span className="tabular font-semibold text-[var(--text-primary)]">2</span> barras
            </span>
            <span className="inline-flex items-center gap-1">
              <Monitor size={12} />
              <span className="tabular font-semibold text-[var(--text-primary)]">1</span> Posnet
            </span>
          </div>
        </div>

        <div className={`${card} p-4 space-y-2`}>
          <div className="flex items-center gap-2">
            <Wifi size={15} className="text-[var(--accent-primary)]" />
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Sesión de caja</h3>
          </div>
          <p className="text-[12px] text-[var(--text-tertiary)]">
            Entrá a Caja desde el banner y elegí QR o Posnet. Acá se vería quién está conectado.
          </p>
        </div>
      </div>

      {/* 2 cajas del plan */}
      <div>
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">
          Cajas del plan
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <article className={`${card} p-4 flex flex-col gap-3`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-[var(--accent-surface)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                  <QrCode size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                    Caja QR dinámico
                  </h3>
                  <p className="text-[11px] text-[var(--text-tertiary)] font-mono">QR-01</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--success-base)] bg-[var(--success-soft)] px-2 py-0.5 rounded-full">
                Activa
              </span>
            </div>
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
              Cobros por QR dinámico en pantalla. Sin lector físico. Ideal para barra rápida.
            </p>
            <ul className="text-[12px] text-[var(--text-tertiary)] space-y-1">
              <li>· Store / POS provisionados (demo)</li>
              <li>· Sin Posnet vinculado</li>
              <li>· Efectivo + QR</li>
            </ul>
          </article>

          <article className={`${card} p-4 flex flex-col gap-3`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-[var(--accent-surface)] text-[var(--accent-primary)] flex items-center justify-center shrink-0">
                  <CreditCard size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                    Caja Posnet
                  </h3>
                  <p className="text-[11px] text-[var(--text-tertiary)] font-mono">POS-01</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--success-base)] bg-[var(--success-soft)] px-2 py-0.5 rounded-full">
                Activa
              </span>
            </div>
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
              Misma barra con lector Point Smart en modo PDV. Cobros con tarjeta + QR + efectivo.
            </p>
            <ul className="text-[12px] text-[var(--text-tertiary)] space-y-1">
              <li>· Posnet PAX · modo PDV</li>
              <li>· Device demo-PAX-A910</li>
              <li>· Efectivo + QR + débito</li>
            </ul>
          </article>
        </div>
      </div>

      <p className="text-[11px] text-[var(--text-tertiary)] text-center pt-2">
        Controles reales (vincular MP, alta de Posnet, renombrar) deshabilitados en esta demo.
      </p>
    </div>
  );
}
