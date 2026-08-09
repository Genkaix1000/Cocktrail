"use client";

import { ExternalLink, X } from "lucide-react";

const RELEASE_OPTIONS_URL =
  "https://www.mercadopago.com.ar/settings/release-options";

/** Tabla orientativa MLA — no contractual. Confirmar en el panel del seller. */
const ROWS: { medio: string; plazo: string; comision: string }[] = [
  { medio: "Dinero en cuenta Mercado Pago", plazo: "Inmediato", comision: "~0,80% + IVA" },
  { medio: "Tarjeta de débito", plazo: "Inmediato", comision: "~1,35% + IVA" },
  { medio: "Tarjeta de débito", plazo: "~2 días", comision: "~0,85% + IVA" },
  { medio: "Tarjeta de crédito / prepaga", plazo: "Inmediato", comision: "~6,29% + IVA" },
  { medio: "Tarjeta de crédito / prepaga", plazo: "~10 días", comision: "~4,39% + IVA" },
  { medio: "Tarjeta de crédito / prepaga", plazo: "~18 días", comision: "~3,39% + IVA" },
  { medio: "Tarjeta de crédito / prepaga", plazo: "~35 días", comision: "~1,49% + IVA" },
  { medio: "Tarjeta de crédito / prepaga", plazo: "~70 días", comision: "Desde 0% / mínimo según cuenta" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  linked: boolean;
};

/**
 * F5B — popup educativo de plazos/comisiones (disparado por ? en la card MP).
 */
export default function ComisionesPlazosPanel({ open, onClose, linked }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px] cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="comisiones-plazos-title"
        className="relative z-10 w-full max-w-lg max-h-[min(85vh,640px)] overflow-y-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="comisiones-plazos-title"
              className="text-[16px] font-semibold text-[var(--text-primary)]"
            >
              Plazos y comisiones
            </h2>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1 leading-relaxed">
              Referencia orientativa MLA. La elección real se hace en tu cuenta de Mercado Pago.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar plazos y comisiones"
            className="h-8 w-8 rounded-full border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {linked ? (
          <a
            href={RELEASE_OPTIONS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-full text-[13px] font-semibold bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:brightness-105 transition-all active:scale-[0.98] cursor-pointer"
          >
            Configurar en Mercado Pago
            <ExternalLink size={14} strokeWidth={2.2} aria-hidden />
          </a>
        ) : (
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] px-3.5 py-3">
            Vinculá tu cuenta de Mercado Pago para configurar plazos y comisiones en el panel del
            seller.
          </p>
        )}

        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="w-full text-left text-[12px]">
            <caption className="sr-only">
              Tabla orientativa de plazos y comisiones Mercado Pago Argentina
            </caption>
            <thead>
              <tr className="bg-[var(--bg-panel)] text-[var(--text-secondary)]">
                <th scope="col" className="px-3 py-2 font-semibold">
                  Medio
                </th>
                <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                  Plazo
                </th>
                <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                  Comisión
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-primary)]">
              {ROWS.map((row) => (
                <tr key={`${row.medio}-${row.plazo}`}>
                  <td className="px-3 py-2">{row.medio}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.plazo}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-mono tabular">{row.comision}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
          No contractual. Confirmá en MP. El neto real de cada cobro lo registra Cocktrail desde la
          API (no desde esta tabla).
        </p>
      </div>
    </div>
  );
}
