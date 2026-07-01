"use client";

import type { FormEvent } from "react";
import type { Order } from "@cocktrail/shared";

type Props = {
  devOrders: Order[];
  devPanelOpen: boolean;
  onToggle: () => void;
  manualCode: string;
  onManualCodeChange: (value: string) => void;
  onManualSubmit: (e: FormEvent<HTMLFormElement>) => void;
};

/**
 * Panel de simulación de escaneo, solo visible en desarrollo
 * (`process.env.NODE_ENV === "development"`, chequeado por el shell antes de
 * renderizar este componente). Sin test de caracterización — no corre en
 * producción (spec auditoria-web, tarea 10).
 */
export default function DevPanel({
  devOrders,
  devPanelOpen,
  onToggle,
  manualCode,
  onManualCodeChange,
  onManualSubmit,
}: Props) {
  return (
    <div className="fixed bottom-0 right-0 left-0 bg-ink-950/95 border-t border-ink-800 z-50 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 text-xs font-mono font-semibold text-warning hover:text-warning/80 active:scale-95 transition-all cursor-pointer"
        >
          <span>🛠️ Dev Scanner Simulator</span>
          <span className="text-[10px] opacity-75">{devPanelOpen ? "▲ Ocultar" : "▼ Mostrar"}</span>
        </button>
        <div className="text-[10px] font-mono text-ink-500">
          Modo desarrollo habilitado
        </div>
      </div>

      {devPanelOpen && (
        <div className="max-w-7xl mx-auto px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-ink-900 pt-4 bg-ink-925 animate-in slide-in-from-bottom-5">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-ink-400 uppercase tracking-wider font-mono">
              1. Simulación por Eventos de Hardware (useScannerInput)
            </span>
            <div className="flex flex-wrap gap-2">
              {devOrders.length === 0 ? (
                <span className="text-xs text-ink-500 font-serif-italic">No hay pedidos activos pagados para simular canje</span>
              ) : (
                devOrders.slice(0, 3).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      const chars = o.ticketCode || "";
                      let delay = 0;
                      for (let i = 0; i < chars.length; i++) {
                        setTimeout(() => {
                          const e = new KeyboardEvent("keydown", {
                            key: chars[i],
                          });
                          window.dispatchEvent(e);
                        }, delay);
                        delay += 10;
                      }
                      setTimeout(() => {
                        const e = new KeyboardEvent("keydown", {
                          key: "Enter",
                        });
                        window.dispatchEvent(e);
                      }, delay + 10);
                    }}
                    className="px-2.5 py-1 bg-ink-900 border border-ink-800 text-[10px] font-mono rounded hover:bg-ink-800 text-ink-200 cursor-pointer"
                  >
                    ⚡ Simular Gun Scan #{o.displayNumber}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-ink-400 uppercase tracking-wider font-mono">
              2. Entrada Manual de Código de Ticket (Fallback)
            </span>
            <form onSubmit={onManualSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="ABCD1234-a1b2c3d4"
                value={manualCode}
                onChange={(e) => onManualCodeChange(e.target.value)}
                className="flex-1 h-9 px-3 bg-ink-900 border border-ink-700 rounded-lg text-xs font-mono text-ink-50 placeholder-ink-500 focus:outline-none focus:border-ink-500"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-4 h-9 bg-ink-50 text-ink-950 font-semibold rounded-lg text-xs hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
              >
                Procesar Canje
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
