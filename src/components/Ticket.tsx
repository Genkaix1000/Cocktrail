"use client";

import { ChevronLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatHm } from "@/lib/utils";
import type { Order, OrderStatus } from "@/types/domain";

type Props = { order: Order };

/**
 * Ticket V1 (Pedido editorial) — handoff design.
 * Tres pasos: pagado → preparando → listo. Glow verde cuando está listo.
 * Mantiene CTA "Hacer otro pedido" cuando llega a estado terminal.
 */
export default function Ticket({ order }: Props) {
  // Inicializa con la hora actual; la diferencia de SSR/CSR se suprime con
  // suppressHydrationWarning más abajo (es un reloj — la siguiente tick reconcilia).
  const [time, setTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isReady = order.status === "listo";
  const isDone = order.status === "entregado" || order.status === "cancelado";
  const isCancelled = order.status === "cancelado";

  // Steps del progreso (orden visual = orden de la máquina de estados).
  const STEPS: { id: OrderStatus; label: string; sub: string }[] = [
    { id: "pagado", label: "Pago verificado", sub: "Listo para entrar a cola" },
    { id: "preparando", label: "En preparación", sub: "El barman lo está armando" },
    { id: "listo", label: "Listo para retirar", sub: "Acercate a la barra" },
  ];

  const stepIdx = STEPS.findIndex((s) => s.id === order.status);
  // Si está entregado, todos los pasos quedan "done"; si está cancelado, marcamos hasta donde llegó.
  const effectiveIdx =
    order.status === "entregado"
      ? STEPS.length
      : isCancelled
        ? Math.max(0, stepIdx)
        : stepIdx;

  // ETA mock: a 3 min cuando está en preparando. Cuando está listo, "ahora".
  const eta =
    order.status === "preparando"
      ? "~3 min restantes"
      : order.status === "listo"
        ? "¡Ahora!"
        : order.status === "pagado"
          ? "En cola"
          : "—";

  const hashColor = isReady
    ? "text-green"
    : isCancelled
      ? "text-danger"
      : "text-blue";

  return (
    <main
      className={`min-h-screen flex flex-col relative ${
        isReady
          ? "bg-ink-950 shadow-[inset_0_0_120px_oklch(0.78_0.16_155_/_0.25)]"
          : "bg-ink-950"
      }`}
    >
      <div className="w-full max-w-md mx-auto flex-1 flex flex-col pb-10">
        {/* Top bar · back + verification chip */}
        <div className="px-[22px] pt-[18px] flex justify-between items-center">
          <Link
            href="/carta"
            className="w-9 h-9 rounded-[10px] bg-ink-850 border border-ink-700 text-ink-200 flex items-center justify-center hover:text-ink-50 hover:border-ink-600 transition-colors"
            aria-label="Volver a la carta"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-green">
            <span className="w-1.5 h-1.5 rounded-full bg-green" />
            Pago verificado · Mercado Pago
          </span>
          <span className="w-9" aria-hidden />
        </div>

        {/* Eyebrow + title */}
        <div className="pt-[26px] px-[22px] text-[11px] font-medium uppercase tracking-[0.22em] text-ink-400">
          Tu pedido · #{order.displayNumber}
        </div>
        <h1 className="font-serif-italic text-[38px] leading-none px-[22px] text-ink-50">
          {isReady
            ? "Está listo."
            : order.status === "preparando"
              ? "Casi listo."
              : order.status === "entregado"
                ? "Entregado."
                : isCancelled
                  ? "Cancelado."
                  : "En camino."}
        </h1>

        {/* Big number frame */}
        <div className="pt-6 px-[22px]">
          <div
            className={`relative overflow-hidden rounded-[22px] border bg-gradient-to-b from-ink-850 to-ink-900 px-5 pt-7 pb-6 ${
              isReady
                ? "border-green-line shadow-[0_0_40px_oklch(0.78_0.16_155_/_0.25)]"
                : "border-ink-700"
            }`}
          >
            {/* Top glow gradient */}
            <div
              aria-hidden
              className={`absolute inset-x-0 top-0 h-[55%] pointer-events-none ${
                isReady
                  ? "bg-[radial-gradient(60%_60%_at_50%_0%,var(--green-soft),transparent_70%)]"
                  : "bg-[radial-gradient(60%_60%_at_50%_0%,var(--blue-soft),transparent_70%)]"
              }`}
            />

            <div className="relative">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400 text-center mb-3">
                Tu número de retiro
              </div>
              <div
                className={`font-serif-italic font-normal text-center tabular leading-[0.85] text-[140px] ${hashColor}`}
                style={{ letterSpacing: "-0.04em" }}
              >
                <span className={isReady ? "text-green/60" : "text-blue/70"}>
                  #
                </span>
                {order.displayNumber}
              </div>

              {/* meta row */}
              <div className="mt-[18px] pt-4 border-t border-ink-800 grid grid-cols-3 items-center">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-ink-400">
                    Hora
                  </span>
                  <span className="font-serif-italic text-[18px] text-ink-50 tabular">
                    {formatHm(order.createdAt)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 items-center">
                  <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-ink-400">
                    Reloj
                  </span>
                  <span
                    className="font-mono text-[16px] text-ink-50 tabular"
                    suppressHydrationWarning
                  >
                    {time.toLocaleTimeString("es-AR", {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-ink-400">
                    Total
                  </span>
                  <span className="font-serif-italic text-[18px] text-ink-50 tabular">
                    ${order.total.toLocaleString("es-AR")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress · 3 steps */}
        {!isCancelled && (
          <div className="px-[22px] pt-[22px]">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400">
                Seguimiento
              </span>
              <span
                className={`font-serif-italic text-sm ${isReady ? "text-green" : "text-blue"}`}
              >
                {eta}
              </span>
            </div>

            <div className="flex flex-col">
              {STEPS.map((s, i) => {
                const isLast = i === STEPS.length - 1;
                const isDoneStep = i < effectiveIdx;
                const isActive = i === effectiveIdx && !isDone;

                return (
                  <div key={s.id} className="flex items-start gap-3.5">
                    <div className="w-[22px] flex flex-col items-center shrink-0">
                      <div
                        className={`relative w-3.5 h-3.5 rounded-full border-[1.5px] z-10 ${
                          isDoneStep
                            ? "bg-blue border-blue"
                            : isActive
                              ? "bg-blue border-blue ring-4 ring-blue-soft"
                              : "bg-ink-900 border-ink-600"
                        }`}
                      >
                        {isActive && (
                          <span
                            aria-hidden
                            className="absolute inset-[-7px] rounded-full border border-blue"
                            style={{
                              animation:
                                "ct-pulse 1.8s ease-in-out infinite",
                            }}
                          />
                        )}
                      </div>
                      {!isLast && (
                        <div
                          className={`flex-1 w-0.5 min-h-8 mt-1 ${
                            isDoneStep ? "bg-blue" : "bg-ink-700"
                          }`}
                        />
                      )}
                    </div>
                    <div className="flex-1 pb-[18px]">
                      <div
                        className={`font-serif text-base leading-tight ${
                          isDoneStep || isActive
                            ? "text-ink-50"
                            : "text-ink-200"
                        } ${isActive ? "italic" : ""}`}
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        {s.label}
                      </div>
                      <div className="text-[11px] text-ink-400 mt-1 leading-tight">
                        {isActive ? "En curso…" : s.sub}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Detalle items */}
        <div className="mx-[22px] mt-3 mb-4 p-[18px] bg-ink-900 border border-ink-800 rounded-[14px]">
          <div className="flex justify-between items-baseline mb-3.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-400">
              Detalle
            </span>
            <span className="font-serif-italic text-base text-ink-50 tabular">
              ${order.total.toLocaleString("es-AR")}
            </span>
          </div>
          <ul className="flex flex-col">
            {order.items.map((it, i) => (
              <li
                key={`${it.drinkId}-${i}`}
                className="flex justify-between items-baseline py-1.5 text-[13px] text-ink-100"
              >
                <span>
                  <span className="text-blue font-medium font-mono mr-2 tabular">
                    {it.qty}×
                  </span>
                  {it.name}
                </span>
                <span className="font-mono text-ink-300 tabular">
                  ${it.subtotal.toLocaleString("es-AR")}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Hint */}
        {!isDone && (
          <p className="px-[22px] pb-4 text-center text-[12px] text-ink-400 leading-relaxed">
            Mostrá esta pantalla al barman cuando
            <br />
            tu número aparezca en{" "}
            <span className="font-serif-italic text-green text-[14px]">
              verde
            </span>
            .
          </p>
        )}

        {/* CTA "Hacer otro pedido" cuando termina */}
        {isDone && (
          <Link
            href="/carta"
            className="mt-2 mx-auto flex items-center justify-center gap-2 w-full max-w-xs px-6 py-3 rounded-2xl bg-blue text-ink-950 font-semibold text-sm uppercase tracking-[0.14em] hover:brightness-110 active:scale-95 transition-all"
          >
            <Plus size={18} strokeWidth={3} />
            Hacer otro pedido
          </Link>
        )}
      </div>
    </main>
  );
}
