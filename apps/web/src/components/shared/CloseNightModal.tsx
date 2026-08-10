"use client";

import { AlertTriangle, CheckCircle2, Loader2, X, Clock } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { formatHm } from "@/lib/utils";
import { formatDuration } from "@/lib/analytics";
import type { EventSummary, EventTotals } from "@cocktrail/shared";

type Props = {
  totals: EventTotals;
  startedAt: number;
  summary: EventSummary | null;
  /** Noche de prueba: no se archiva nada, así que el copy no puede hablar de arqueo. */
  isTest?: boolean;
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
};

// ── Native Canvas Confetti Emitter ──
/**
 * Devuelve una función para abortar: el canvas vive en `document.body` con
 * z-index 9999, así que si el modal se cierra antes de que termine la
 * animación hay que sacarlo a mano o queda flotando sobre el resto del panel.
 */
function triggerConfetti(): () => void {
  if (typeof window === "undefined") return () => {};
  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "9999";
  document.body.appendChild(canvas);

  let rafId: number | null = null;
  const removeCanvas = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    canvas.remove();
  };

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    removeCanvas();
    return () => {};
  }

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ["#10b981", "#06b6d4", "#fbbf24", "#ec4899", "#3b82f6"];
  type Particle = {
    x: number;
    y: number;
    angle: number;
    speed: number;
    size: number;
    color: string;
    opacity: number;
    gravity: number;
    decay: number;
    rotation: number;
    rotationSpeed: number;
  };
  const particles: Particle[] = [];

  for (let i = 0; i < 90; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height + 20,
      angle: Math.random() * Math.PI * 0.7 + Math.PI * 0.15,
      speed: Math.random() * 12 + 10,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 1,
      gravity: 0.22,
      decay: Math.random() * 0.012 + 0.008,
      rotation: Math.random() * 360,
      rotationSpeed: Math.random() * 8 - 4,
    });
  }

  function update() {
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;

    particles.forEach((p) => {
      if (p.opacity > 0) {
        active = true;
        p.x += Math.cos(p.angle) * p.speed;
        p.y -= Math.sin(p.angle) * p.speed;
        p.speed *= 0.96;
        p.y += p.gravity;
        p.gravity += 0.04;
        p.opacity -= p.decay;
        p.rotation += p.rotationSpeed;

        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate((p.rotation * Math.PI) / 180);
        ctx!.fillStyle = p.color;
        ctx!.globalAlpha = Math.max(0, p.opacity);
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx!.restore();
      }
    });

    if (active) {
      rafId = requestAnimationFrame(update);
    } else {
      removeCanvas();
    }
  }

  update();

  return removeCanvas;
}

function money(n: number) {
  return `$${n.toLocaleString("es-AR")}`;
}

function formatDateEs(ts: number) {
  const s = new Date(ts).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function CloseNightModal({
  totals,
  startedAt,
  summary,
  isTest,
  onConfirm,
  onClose,
}: Props) {
  const esPrueba = summary?.isTest ?? isTest ?? false;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wiggle, setWiggle] = useState(false);
  const [confettiTriggered, setConfettiTriggered] = useState(false);

  const isMounted = useRef(true);
  const stopConfetti = useRef<(() => void) | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      stopConfetti.current?.();
      stopConfetti.current = null;
    };
  }, []);

  const hasSummary = summary !== null;
  if (hasSummary && !confettiTriggered) {
    setConfettiTriggered(true);
    setWiggle(true);
  }

  useEffect(() => {
    if (!wiggle) return;
    const wTimer = setTimeout(() => setWiggle(false), 700);
    const cTimer = esPrueba
      ? null
      : setTimeout(() => {
          stopConfetti.current = triggerConfetti();
        }, 150);
    return () => {
      clearTimeout(wTimer);
      if (cTimer) clearTimeout(cTimer);
    };
  }, [wiggle, esPrueba]);

  const isSummary = hasSummary;

  async function handleConfirm(password: string) {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(password);
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : "Error al cerrar");
    } finally {
      if (isMounted.current) setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: scale(1) rotate(0deg); }
          20% { transform: scale(1.02) rotate(-1.5deg); }
          40% { transform: scale(1.02) rotate(1.2deg); }
          60% { transform: scale(1.01) rotate(-0.6deg); }
          80% { transform: scale(1.005) rotate(0.4deg); }
        }
        .animate-wiggle {
          animation: wiggle 0.65s cubic-bezier(.36,.07,.19,.97) both;
        }
      `}</style>

      <div
        className={`bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full max-w-xl max-h-[min(100dvh-1.5rem,640px)] rounded-2xl shadow-card animate-in zoom-in-95 duration-200 transition-all flex flex-col overflow-hidden ${wiggle ? "animate-wiggle" : ""}`}
      >
        <div className="flex justify-between items-center gap-3 px-5 pt-4 pb-3 shrink-0 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                isSummary
                  ? esPrueba
                    ? "bg-amber-soft border-amber-line"
                    : "bg-green-soft border-green-line"
                  : "bg-amber-soft border-amber-line"
              }`}
            >
              {isSummary ? (
                esPrueba ? (
                  <AlertTriangle size={18} className="text-amber" />
                ) : (
                  <CheckCircle2 size={18} className="text-green" />
                )
              ) : (
                <AlertTriangle size={18} className="text-amber" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-[var(--text-primary)] leading-none truncate">
                {isSummary
                  ? esPrueba
                    ? "Noche de prueba cerrada"
                    : "Noche cerrada"
                  : "Cerrar noche"}
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">
                {esPrueba
                  ? isSummary
                    ? "No se guardó nada · sin arqueo ni historial"
                    : "Noche de prueba — se descarta todo"
                  : isSummary
                    ? "Resumen archivado"
                    : "Acción irreversible"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="p-2 bg-[var(--bg-panel)] rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer shrink-0"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {isSummary ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
              <SummaryView
                summary={summary!}
                startedAt={startedAt}
                esPrueba={esPrueba}
              />
            </div>
            <div className="shrink-0 px-5 pb-4 pt-1 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={onClose}
                className="w-full h-11 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
              >
                <CheckCircle2 size={15} strokeWidth={3} />
                Cerrar y continuar
              </button>
            </div>
          </>
        ) : (
          <ConfirmView
            totals={totals}
            startedAt={startedAt}
            submitting={submitting}
            error={error}
            esPrueba={esPrueba}
            onCancel={onClose}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── ConfirmView ───────────────────────────

function ConfirmView({
  totals,
  startedAt,
  submitting,
  error,
  esPrueba,
  onCancel,
  onConfirm,
}: {
  totals: EventTotals;
  startedAt: number;
  submitting: boolean;
  error: string | null;
  esPrueba: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [now] = useState(() => Date.now());
  const duration = formatDuration(now - startedAt);

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-3">
        <p className="text-[12px] text-[var(--text-secondary)] leading-snug">
          {esPrueba ? (
            <>
              Cierre de prueba iniciada a las{" "}
              <span className="text-[var(--text-primary)] font-mono tabular font-semibold">
                {formatHm(startedAt)}
              </span>
              . Se descartan pedidos y totales.
            </>
          ) : (
            <>
              Vas a archivar el evento iniciado a las{" "}
              <span className="text-[var(--text-primary)] font-mono tabular font-semibold">
                {formatHm(startedAt)}
              </span>
              . Esta acción es definitiva.
            </>
          )}
        </p>

        <MetaStrip
          dateLabel={formatDateEs(now)}
          startLabel={`${formatHm(startedAt)} hs`}
          durationLabel={duration}
        />

        <NightSummary totals={totals} />
      </div>

      <div className="shrink-0 px-5 pb-4 pt-3 border-t border-[var(--border-subtle)] flex flex-col gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)] font-mono">
            Tu contraseña / PIN
          </span>
          <input
            data-tour="night-close-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--danger-base)] rounded-xl px-3.5 py-2.5 text-[var(--text-primary)] outline-none transition-colors text-sm"
            placeholder="Ingresá tu contraseña para confirmar"
          />
        </label>

        {error && (
          <div className="text-sm text-danger bg-danger-soft border border-danger-line rounded-xl px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 h-11 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-strong)] text-[var(--text-primary)] font-semibold text-xs hover:bg-[var(--bg-app)] active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-tour="night-close-submit"
            onClick={() => onConfirm(password)}
            disabled={submitting || !password.trim()}
            className="flex-1 h-11 rounded-xl bg-[var(--danger-base)] text-white font-semibold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Cerrando…
              </>
            ) : (
              "Confirmar cierre"
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────── SummaryView ───────────────────────────

function SummaryView({
  summary,
  startedAt,
  esPrueba,
}: {
  summary: EventSummary;
  startedAt: number;
  esPrueba: boolean;
}) {
  const duration =
    summary.closedAt && summary.startedAt
      ? formatDuration(summary.closedAt - summary.startedAt)
      : "—";
  const closedTs = summary.closedAt ?? Date.now();

  return (
    <div className="flex flex-col gap-3">
      {!esPrueba && (
        <p className="text-[12px] text-[var(--success-base)] font-medium leading-none">
          Cierre de Noche Exitoso
        </p>
      )}
      <MetaStrip
        dateLabel={formatDateEs(closedTs)}
        startLabel={`${formatHm(summary.startedAt || startedAt)} hs`}
        durationLabel={duration}
      />
      <NightSummary totals={summary.totals} />
    </div>
  );
}

function MetaStrip({
  dateLabel,
  startLabel,
  durationLabel,
}: {
  dateLabel: string;
  startLabel: string;
  durationLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl px-3 py-2">
      <span className="font-semibold text-[var(--text-primary)]">{dateLabel}</span>
      <span className="text-[var(--border-strong)]" aria-hidden>
        ·
      </span>
      <span className="inline-flex items-center gap-1 font-mono tabular">
        <Clock size={11} className="text-[var(--text-tertiary)]" />
        {startLabel}
      </span>
      <span className="text-[var(--border-strong)]" aria-hidden>
        ·
      </span>
      <span className="font-mono tabular font-semibold text-[var(--text-primary)]">
        {durationLabel}
      </span>
    </div>
  );
}

// ─────────────────────────── NightSummary (hero + mix) ───────────────────────────

type Channel = {
  key: string;
  label: string;
  value: number;
  count: number;
  color: string;
};

function channelMix(totals: EventTotals): { channels: Channel[]; bruto: number; ops: number } {
  const efectivo = totals.efectivoTotal || 0;
  const qr = totals.mpQrPaid ?? totals.qrTotal ?? 0;
  const tarjeta = totals.mpDebitoPaid ?? totals.debitoTotal ?? 0;
  const channels: Channel[] = [
    {
      key: "efectivo",
      label: "Efectivo",
      value: efectivo,
      count: totals.efectivoCount,
      color: "var(--success-base, #10b981)",
    },
    {
      key: "qr",
      label: "QR",
      value: qr,
      count: totals.qrCount,
      color: "var(--accent-bright, #06b6d4)",
    },
    {
      key: "debito",
      label: "Tarjeta",
      value: tarjeta,
      count: totals.debitoCount,
      color: "var(--accent-primary, #3b82f6)",
    },
  ];
  const bruto = efectivo + qr + tarjeta;
  const ops = totals.efectivoCount + totals.qrCount + totals.debitoCount;
  return { channels, bruto, ops };
}

function NightSummary({ totals }: { totals: EventTotals }) {
  const { channels, bruto, ops } = useMemo(() => channelMix(totals), [totals]);
  const hero = totals.netTotal ?? bruto;
  const heroLabel = totals.netTotal != null ? "Ingreso neto" : "Facturado";
  const units = totals.drinksSold.reduce((s, d) => s + d.qty, 0);

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-3.5 flex flex-col gap-3">
      <div className="flex items-stretch gap-4">
        <MiniDonut channels={channels} total={bruto} centerLabel={heroLabel} centerValue={hero} />
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          {channels.map((c) => {
            const pct = bruto > 0 ? Math.round((c.value / bruto) * 100) : 0;
            return (
              <div key={c.key} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] min-w-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: c.color }}
                  />
                  <span className="truncate">{c.label}</span>
                  <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                    ({c.count})
                  </span>
                </span>
                <span className="font-mono tabular font-semibold text-[var(--text-primary)] shrink-0">
                  {money(c.value)}
                  <span className="text-[10px] text-[var(--text-tertiary)] font-medium ml-1.5">
                    {pct}%
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-[var(--bg-surface)] gap-px">
        {channels.map((c) =>
          c.value > 0 && bruto > 0 ? (
            <div
              key={c.key}
              style={{ width: `${(c.value / bruto) * 100}%`, background: c.color }}
              title={`${c.label}: ${money(c.value)}`}
            />
          ) : null,
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] border-t border-[var(--border-subtle)] pt-2.5">
        <span className="text-[var(--text-secondary)]">
          Facturado{" "}
          <span className="font-mono tabular font-semibold text-[var(--text-primary)]">
            {money(bruto)}
          </span>
          {totals.mpFeeTotal != null && (
            <>
              {" · "}Comisiones{" "}
              <span className="font-mono tabular text-[var(--text-secondary)]">
                −{money(totals.mpFeeTotal)}
              </span>
              {totals.mpFeesPending ? ` (${totals.mpFeesPending} pend.)` : ""}
            </>
          )}
        </span>
        <span className="font-mono tabular text-[var(--text-tertiary)]">
          {ops} ops
          {units > 0 ? ` · ${units} tragos` : ""}
        </span>
      </div>
    </div>
  );
}

function MiniDonut({
  channels,
  total,
  centerLabel,
  centerValue,
}: {
  channels: Channel[];
  total: number;
  centerLabel: string;
  centerValue: number;
}) {
  const size = 112;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  let offset = 0;
  const segments = channels
    .filter((c) => c.value > 0 && total > 0)
    .map((c) => {
      const len = (c.value / total) * circumference;
      const seg = { ...c, len, offset };
      offset += len;
      return seg;
    });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`${centerLabel} ${money(centerValue)}`}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={strokeWidth}
        />
        {segments.map((seg) => (
          <circle
            key={seg.key}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${mounted ? seg.len : 0} ${circumference}`}
            strokeDashoffset={-seg.offset}
            strokeLinecap="butt"
            className="transition-all duration-700 ease-out"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
        <span className="text-[9px] uppercase tracking-[0.12em] font-semibold text-[var(--text-tertiary)] leading-none">
          {centerLabel}
        </span>
        <span className="font-mono text-[15px] font-bold leading-tight tabular text-[var(--text-primary)] mt-1">
          {money(centerValue)}
        </span>
      </div>
    </div>
  );
}
