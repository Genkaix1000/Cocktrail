"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { systemService, type SystemHealth } from "@/services/system.service";

const POLL_INTERVAL_MS = 60_000;

/**
 * Banner rojo persistente cuando el runner de migraciones dejó la base
 * degradada (fail-open: el backend arranca igual con schema viejo — este
 * banner es la contrapartida no negociable de esa decisión). Si el backend
 * está caído no renderiza nada: eso lo cubren otros mecanismos.
 */
export function MigrationsBanner() {
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      systemService
        .getHealth()
        .then((h) => {
          if (!cancelled) setHealth(h);
        })
        .catch(() => {
          if (!cancelled) setHealth(null);
        });
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!health || health.status !== "degraded") return null;

  const { failed, pending, drift } = health.migrations;

  const message = failed
    ? `Actualización de base de datos incompleta: falló «${failed.version}»${
        pending.length > 0 ? ` (${pending.length} pendientes)` : ""
      }. El sistema opera con el esquema anterior — no cierres la noche sin avisar a soporte.`
    : `El contenido de ${drift.length} migración(es) ya aplicadas cambió respecto de lo registrado. Verificá supabase/migrations antes de la próxima actualización.`;

  return (
    <div
      role="alert"
      className="flex items-center gap-2.5 px-5 py-2.5 bg-red-500/10 border-b border-red-500/30 text-red-300 text-[13px] print:hidden"
    >
      <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
