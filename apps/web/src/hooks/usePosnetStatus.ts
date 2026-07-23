"use client";

import { useCallback, useEffect, useState } from "react";

import { mercadopagoService, type MpHealth } from "@/services/mercadopago.service";

/**
 * Severidad del cartel del Posnet en /caja:
 * - "blocked": el cobro está bloqueado server-side (la plata iría a otra cuenta).
 * - "warning": el cobro puede fallar o degradarse (STANDALONE, caja huérfana,
 *   fallback de env) pero NO se frena — el valor está en el mensaje.
 * - "unknown": no se pudo determinar (sin caja, sin Posnet, MP caído). Nunca rojo.
 */
export type PosnetLevel = "ok" | "warning" | "blocked" | "unknown";

function withAction(check: { detail: string; action?: string }): string {
  return check.action ? `${check.detail} ${check.action}` : check.detail;
}

/** Deriva el cartel a partir de la salud: habla del device de LA CAJA, no del de la env. */
export function derivePosnetStatus(health: MpHealth | null): {
  level: PosnetLevel;
  message: string;
} {
  if (!health) {
    return { level: "unknown", message: "No se pudo consultar el estado del Posnet." };
  }
  const { singleSeller, deviceOwnership, deviceMode, cajaProvisioned } = health.checks;

  if (health.blocking) {
    return { level: "blocked", message: withAction(deviceOwnership) };
  }
  // Advertencias, en orden de gravedad: modo manual > caja huérfana > cuenta > env.
  if (deviceMode.ok === false) {
    return { level: "warning", message: withAction(deviceMode) };
  }
  if (cajaProvisioned.ok === false) {
    return { level: "warning", message: withAction(cajaProvisioned) };
  }
  if (singleSeller.ok === false) {
    return { level: "warning", message: withAction(singleSeller) };
  }
  if (health.usingEnvDevice) {
    return {
      level: "warning",
      message:
        "Los cobros están saliendo por el Posnet de emergencia (variable de entorno), " +
        "no por el vinculado a esta caja. Revisá la vinculación en /admin → PDV y Posnets.",
    };
  }
  if (deviceOwnership.ok && deviceMode.ok && cajaProvisioned.ok) {
    return { level: "ok", message: "Posnet de la caja listo para cobrar (modo PDV)." };
  }
  // Algún chequeo quedó en desconocido: el detalle de pertenencia es el que
  // explica el contexto (sin caja / sin Posnet vinculado / MP no respondió).
  return { level: "unknown", message: deviceOwnership.detail };
}

/**
 * Estado del Posnet de LA CAJA (gestion-posnets T24): polling de
 * GET /api/mercadopago/health cada 30s (mismo TTL que el cache server-side) y
 * test funcional manual. Distingue advertencia (STANDALONE, huérfana,
 * env-fallback) de bloqueo (el device pertenece a otra cuenta).
 */
export function usePosnetStatus() {
  const [posnetHealth, setPosnetHealth] = useState<MpHealth | null>(null);
  const [posnetTestMessage, setPosnetTestMessage] = useState<string | null>(null);
  const [testingPosnet, setTestingPosnet] = useState(false);

  const refreshPosnetStatus = useCallback(async () => {
    try {
      setPosnetHealth(await mercadopagoService.getMpHealth());
    } catch {
      // Sin backend no hay salud que mostrar: el cartel queda en "unknown".
      setPosnetHealth(null);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPosnetStatus();
    const interval = setInterval(refreshPosnetStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshPosnetStatus]);

  /**
   * Test funcional real: manda $1 al Posnet de la caja (el device lo resuelve
   * el server) y espera a que lo reciba. Antes re-chequea la salud con
   * `refresh=1`: un bloqueo o un modo manual se explican sin gastar el test.
   */
  const testPosnet = useCallback(async () => {
    setTestingPosnet(true);
    setPosnetTestMessage(null);

    const health = await mercadopagoService.getMpHealth(true).catch(() => null);
    setPosnetHealth(health);

    const derived = derivePosnetStatus(health);
    if (derived.level === "blocked" || (health && health.checks.deviceMode.ok === false)) {
      setPosnetTestMessage(derived.message);
      setTestingPosnet(false);
      return;
    }

    try {
      const result = await mercadopagoService.testDeviceCharge();
      setPosnetTestMessage(result.message);
    } catch (err) {
      setPosnetTestMessage(err instanceof Error ? err.message : "Error al probar el Posnet.");
    } finally {
      setTestingPosnet(false);
    }
  }, []);

  const { level: posnetLevel, message: posnetMessage } = derivePosnetStatus(posnetHealth);

  return {
    posnetHealth,
    posnetLevel,
    posnetMessage,
    refreshPosnetStatus,
    testPosnet,
    posnetTestMessage,
    testingPosnet,
  };
}
