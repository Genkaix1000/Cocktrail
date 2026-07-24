"use client";

import { AlertCircle, Check, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";

type ToastVariant = "success" | "error";

type Props = {
  variant?: ToastVariant;
  message: string;
  /** Encabezado corto opcional (ej. "Nuevo pedido"). */
  title?: string;
  /** Dato destacado opcional junto al título (ej. "#12"). */
  badge?: string;
  /** Tiempo en ms antes de auto-cerrarse. */
  duration?: number;
  /** Acción opcional (ej. Deshacer). Al click: onClick + onClose. */
  action?: { label: string; onClick: () => void };
  onClose: () => void;
};

const VARIANT_META: Record<ToastVariant, { icon: LucideIcon; iconBg: string; iconBorder: string; iconColor: string; accentBar: string }> = {
  success: {
    icon: Check,
    iconBg: "bg-green-soft",
    iconBorder: "border-green-line",
    iconColor: "text-green",
    accentBar: "bg-green",
  },
  error: {
    icon: AlertCircle,
    iconBg: "bg-danger-soft",
    iconBorder: "border-danger-line",
    iconColor: "text-danger",
    accentBar: "bg-danger",
  },
};

/**
 * Toast genérico (éxito/error) con auto-dismiss. El timer se guarda en un ref
 * para no reiniciarse si `onClose` cambia de identidad en cada render del
 * padre — mismo fix aplicado a ToastItem en Fase 3B (PendingOrdersList).
 */
export default function Toast({
  variant = "success",
  message,
  title,
  badge,
  duration = 4000,
  action,
  onClose,
}: Props) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  const meta = VARIANT_META[variant];
  const Icon = meta.icon;

  return (
    <div
      className="relative overflow-hidden w-full bg-ink-900/95 border border-ink-800 backdrop-blur-xl rounded-2xl p-3.5 shadow-2xl flex flex-col gap-1.5 pointer-events-auto animate-in slide-in-from-bottom-4"
      role="status"
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg ${meta.iconBg} border ${meta.iconBorder} flex items-center justify-center shrink-0`}>
            <Icon size={13} className={meta.iconColor} />
          </div>
          {(title || badge) && (
            <div className="min-w-0">
              {title && (
                <span className={`text-[9px] font-mono uppercase tracking-[0.15em] font-bold block ${meta.iconColor}`}>
                  {title}
                </span>
              )}
              {badge && (
                <span className="font-mono text-base font-black text-white tabular">{badge}</span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar notificación"
          className="w-6 h-6 flex items-center justify-center rounded-lg text-ink-500 hover:text-white hover:bg-ink-800 transition-colors cursor-pointer shrink-0"
        >
          <X size={12} />
        </button>
      </div>
      <p className={`text-xs font-semibold leading-snug line-clamp-2 ${title || badge ? "pl-9" : ""} ${variant === "error" ? "text-ink-100" : "text-ink-200"}`}>
        {message}
      </p>
      {action && (
        <div className={title || badge ? "pl-9" : ""}>
          <button
            type="button"
            onClick={() => {
              action.onClick();
              onClose();
            }}
            className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-accent/15 hover:bg-accent/25 text-accent border border-accent/20 hover:border-accent/40 transition-all cursor-pointer"
          >
            {action.label}
          </button>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ink-950">
        <div
          className={`h-full ${meta.accentBar}`}
          style={{ animation: `shrinkWidth ${duration}ms linear forwards` }}
        />
      </div>
    </div>
  );
}
