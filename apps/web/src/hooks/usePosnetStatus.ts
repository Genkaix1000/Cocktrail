"use client";

import { useCallback, useEffect, useState } from "react";

import { mercadopagoService, type PosnetDeviceStatus } from "@/services/mercadopago.service";

/**
 * Estado del Posnet (Mercado Pago Point): polling de conexión (cada 30s) y
 * test manual, análogo a usePrinterStatus. El modo "PDV" es el único que
 * permite cobrar por API — cualquier otro valor (ej. "STANDALONE") significa
 * que el dispositivo quedó en modo manual y hay que corregirlo desde la
 * cuenta de Mercado Pago antes de intentar cobrar.
 */
export function usePosnetStatus() {
  const [posnetStatus, setPosnetStatus] = useState<PosnetDeviceStatus | null>(null);
  const [posnetTestMessage, setPosnetTestMessage] = useState<string | null>(null);
  const [testingPosnet, setTestingPosnet] = useState(false);

  const refreshPosnetStatus = useCallback(async () => {
    try {
      const status = await mercadopagoService.getDeviceStatus();
      setPosnetStatus(status);
    } catch {
      setPosnetStatus({ connected: false, message: "No se pudo consultar el estado del Posnet." });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPosnetStatus();
    const interval = setInterval(refreshPosnetStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshPosnetStatus]);

  /**
   * Test funcional real: manda $1 al Posnet físico y espera (hasta 15s) a que
   * el dispositivo lo reciba, luego lo cancela solo. Distinto de
   * refreshPosnetStatus (que solo consulta metadata de vinculación/modo
   * contra MP) — este detecta el caso real del canal de push colgado, que
   * puede pasar aunque el device figure "conectado y en modo PDV".
   */
  const testPosnet = useCallback(async () => {
    setTestingPosnet(true);
    setPosnetTestMessage(null);

    const status = await mercadopagoService.getDeviceStatus().catch(() => null);
    if (status) setPosnetStatus(status);

    if (!status?.connected) {
      setPosnetTestMessage(status?.message ?? "No se pudo consultar el estado del Posnet.");
      setTestingPosnet(false);
      return;
    }
    if (status.device && status.device.operatingMode !== "PDV") {
      setPosnetTestMessage(
        `El Posnet está en modo "${status.device.operatingMode}" (manual) — cambialo a modo automático (PDV) desde la cuenta de Mercado Pago para poder cobrar por la app.`
      );
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

  const posnetModeWarning =
    posnetStatus?.connected && posnetStatus.device && posnetStatus.device.operatingMode !== "PDV";

  return {
    posnetStatus,
    refreshPosnetStatus,
    testPosnet,
    posnetTestMessage,
    testingPosnet,
    posnetModeWarning,
  };
}
