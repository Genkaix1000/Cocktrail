"use client";

import { useState, useRef, useEffect } from "react";
import { Printer, X, RefreshCw } from "lucide-react";

type PrinterStatus = { connected: boolean; message?: string } | null;

type Props = {
  printerStatus: PrinterStatus;
  printerPaired: boolean;
  reconnecting: boolean;
  printerTestMessage: string | null;
  onTestPrint: () => void;
  onConnect: () => void;
  onPair: () => void;
};

/**
 * Chip y popover de impresora para el topbar de admin con la misma funcionalidad completa de Caja.
 */
export function PrinterTopbarButton({
  printerStatus,
  printerPaired,
  reconnecting,
  printerTestMessage,
  onTestPrint,
  onConnect,
  onPair,
}: Props) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const connected = Boolean(printerStatus?.connected);

  // Cerrar al hacer click afuera
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const tone = connected
    ? "bg-[var(--success-soft)] border-[var(--success-line)] text-[var(--success-base)]"
    : printerPaired
      ? "bg-[var(--amber-soft)] border-[var(--amber-line)] text-[var(--amber-base)]"
      : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-tertiary)]";

  const statusLabel = connected
    ? "Impresora OK"
    : reconnecting
      ? "Reconectando…"
      : printerPaired
        ? "Impresora vinculada"
        : "Sin impresora";

  const label = connected
    ? "Probar impresora"
    : printerPaired
      ? reconnecting
        ? "Reconectando impresora"
        : "Conectar impresora"
      : "Vincular impresora";

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={printerTestMessage ?? label}
        aria-label={label}
        aria-expanded={open}
        className={`relative w-10 h-10 rounded-xl border flex items-center justify-center hover:opacity-90 transition-all cursor-pointer active:scale-95 ${tone} ${
          open ? "ring-2 ring-[var(--accent-primary)]/40" : ""
        }`}
      >
        <Printer size={16} strokeWidth={1.8} />
        {printerTestMessage ? (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--danger-base)]" />
        ) : connected ? (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--success-base)]" />
        ) : null}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-[100] w-72 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-card p-4 flex flex-col gap-3 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${tone}`}>
                <Printer size={14} />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[12px] font-bold text-[var(--text-primary)]">
                  {statusLabel}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {connected
                    ? "Lista para emitir tickets"
                    : printerPaired
                      ? "Bluetooth desconectado"
                      : "No configurada"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] transition-colors cursor-pointer"
              aria-label="Cerrar panel de impresora"
            >
              <X size={14} />
            </button>
          </div>

          {printerTestMessage && (
            <div className="p-2.5 rounded-xl bg-[var(--danger-soft)] border border-[var(--danger-line)] text-[11px] text-[var(--danger-base)] leading-snug">
              {printerTestMessage}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {connected ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onTestPrint();
                  }}
                  className="w-full h-9 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold text-[12px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer size={13} />
                  Ticket de prueba
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onPair();
                  }}
                  className="w-full text-center text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline cursor-pointer py-1"
                >
                  Vincular otra impresora
                </button>
              </>
            ) : printerPaired ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onConnect();
                  }}
                  disabled={reconnecting}
                  className="w-full h-9 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold text-[12px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {reconnecting ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      Reconectando…
                    </>
                  ) : (
                    "Conectar"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onPair();
                  }}
                  className="w-full text-center text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline cursor-pointer py-1"
                >
                  Vincular otra impresora
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onPair();
                }}
                className="w-full h-9 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold text-[12px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer size={13} />
                Vincular impresora
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
