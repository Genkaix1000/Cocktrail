"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { systemService, type MpFallbackHealth } from "@/services/system.service";
import { pdvService } from "@/services/pdv.service";

const POLL_INTERVAL_MS = 60_000;

/**
 * Banner amarillo persistente cuando el preflight F1 marcó el token de
 * emergencia de Mercado Pago como inutilizable. Es advertencia, no error:
 * el cobro normal sale por el seller OAuth — pero si esa vinculación falla,
 * la caja se queda sin red de contención para el Posnet.
 *
 * Solo aparece si hay algún Posnet registrado (sin Posnet el fallback no
 * protege nada). El health no trae ese dato, así que se consulta la lista
 * de devices aparte; si esa consulta falla, el banner se muestra igual
 * (ante la duda, no callar una advertencia).
 */
export function MpFallbackBanner() {
  const [fallback, setFallback] = useState<MpFallbackHealth | null>(null);
  // null = todavía no se sabe / la consulta falló → no ocultar por eso.
  const [hasPosnet, setHasPosnet] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      systemService
        .getHealth()
        .then((h) => {
          if (!cancelled) setFallback(h.mpFallback ?? null);
        })
        .catch(() => {
          if (!cancelled) setFallback(null);
        });
      pdvService
        .listDevices()
        .then((devices) => {
          if (!cancelled) setHasPosnet(devices.length > 0);
        })
        .catch(() => {
          if (!cancelled) setHasPosnet(null);
        });
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!fallback || fallback.status !== "unusable") return null;
  if (hasPosnet === false) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-2.5 px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-300 text-[13px] print:hidden"
    >
      <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
      <span>
        El token de emergencia de Mercado Pago no es utilizable
        {fallback.reason ? `: ${fallback.reason}` : ""}. Si la vinculación OAuth falla, la caja no va a
        poder cobrar con Posnet.
      </span>
    </div>
  );
}
