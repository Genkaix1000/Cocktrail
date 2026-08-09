"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { systemService, type SystemHealth } from "@/services/system.service";
import { plural } from "@/lib/utils";

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

  // Drift solo se muestra en SystemSanidadPanel (Dashboard) con botón de fix.
  // Este banner queda para fallos/pendientes de schema — no negociable.
  if (!health || health.status !== "degraded") return null;

  const { failed, pending } = health.migrations;
  if (!failed && pending.length === 0) return null;

  const message = failed
    ? `Actualización de base de datos incompleta: falló «${failed.version}»${
        pending.length > 0 ? ` (${plural(pending.length, "pendiente", "pendientes")})` : ""
      }. El sistema opera con el esquema anterior — no cierres la noche sin avisar a soporte.`
    : `${plural(pending.length, "migración pendiente", "migraciones pendientes")}. Reiniciá el API o corré pnpm db:migrate.`;

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
