"use client";

import { FlaskConical } from "lucide-react";

/**
 * Aviso permanente de noche de prueba (B1-B3). No se puede cerrar ni ocultar:
 * desaparece solo cuando la noche se cierra. El riesgo que cubre es el peor de
 * la feature — vender de verdad creyendo que se está probando, o al revés.
 */
export function TestNightBanner() {
  return (
    <div
      role="alert"
      data-tour="test-night-banner"
      className="flex items-start gap-2.5 px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/40 text-amber-500 text-[13px] print:hidden"
    >
      <FlaskConical size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        <strong>Noche de prueba.</strong> Nada de lo que pase acá se guarda: los pedidos, los
        tickets y los totales viven solo en la memoria del servidor y se pierden si el servidor
        se reinicia. Solo se puede cobrar en efectivo — Mercado Pago está bloqueado.
      </span>
    </div>
  );
}

export default TestNightBanner;
