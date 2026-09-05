"use client";

import { Printer } from "lucide-react";

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
 * Chip de impresora para el topbar de admin (misma lógica que el sidebar de caja).
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
  const connected = Boolean(printerStatus?.connected);
  const label = connected
    ? "Probar impresora"
    : printerPaired
      ? reconnecting
        ? "Reconectando impresora"
        : "Conectar impresora"
      : "Vincular impresora";

  const tone = connected
    ? "bg-[var(--success-soft)] border-[var(--success-line)] text-[var(--success-base)]"
    : printerPaired
      ? "bg-[var(--amber-soft)] border-[var(--amber-line)] text-[var(--amber-base)]"
      : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-tertiary)]";

  return (
    <button
      type="button"
      onClick={() => {
        if (connected) onTestPrint();
        else if (printerPaired) onConnect();
        else onPair();
      }}
      disabled={reconnecting}
      title={printerTestMessage ?? label}
      aria-label={label}
      className={`relative w-10 h-10 rounded-xl border flex items-center justify-center hover:opacity-90 transition-all cursor-pointer active:scale-95 disabled:opacity-60 ${tone}`}
    >
      <Printer size={16} strokeWidth={1.8} />
      {printerTestMessage && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--danger-base)]" />
      )}
    </button>
  );
}
