"use client";

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  X,
  QrCode,
  Clock,
  Calendar,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { formatHm } from "@/lib/utils";
import { formatDuration } from "@/lib/analytics";
import type { EventSummary, EventTotals } from "@cocktrail/shared";

type Props = {
  totals: EventTotals;
  pendingDeliveries: number;
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
      angle: Math.random() * Math.PI * 0.7 + Math.PI * 0.15, // Shoot upwards in an arc
      speed: Math.random() * 12 + 10,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      opacity: 1,
      gravity: 0.22,
      decay: Math.random() * 0.012 + 0.008,
      rotation: Math.random() * 360,
      rotationSpeed: Math.random() * 8 - 4
    });
  }

  function update() {
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;

    particles.forEach(p => {
      if (p.opacity > 0) {
        active = true;
        p.x += Math.cos(p.angle) * p.speed;
        p.y -= Math.sin(p.angle) * p.speed;
        p.speed *= 0.96; // drag/resistance
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

export default function CloseNightModal({
  totals,
  pendingDeliveries,
  startedAt,
  summary,
  isTest,
  onConfirm,
  onClose,
}: Props) {
  // El resumen manda: al cerrar, el backend devuelve la noche con su marca.
  const esPrueba = summary?.isTest ?? isTest ?? false;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Success animations states
  const [wiggle, setWiggle] = useState(false);
  const [confettiTriggered, setConfettiTriggered] = useState(false);

  // El cierre real puede tardar (red/DB) y el modal podría desmontarse antes
  // de que la promesa resuelva (ej. el usuario navega) — evita setState sobre
  // un componente ya desmontado.
  const isMounted = useRef(true);

  // El canvas del confetti cuelga de document.body con z-index 9999: si el
  // modal se desmonta antes de que termine la animación, hay que barrerlo o
  // queda flotando sobre lo que venga después (Historial, otros modales).
  const stopConfetti = useRef<(() => void) | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      stopConfetti.current?.();
      stopConfetti.current = null;
    };
  }, []);

  // Dispara la animación de éxito una sola vez por apertura, cuando `summary`
  // pasa a estar disponible. El padre ahora monta este componente de cero en
  // cada apertura (montaje condicional), así que no hace falta resetear nada
  // al cerrar — un mount nuevo ya arranca con `confettiTriggered=false`.
  const hasSummary = summary !== null;
  if (hasSummary && !confettiTriggered) {
    setConfettiTriggered(true);
    setWiggle(true);
  }

  // Efecto puro: reacciona al flag `wiggle` para disparar el confetti
  // (Canvas API) y apagar la animación — separado de la derivación de
  // estado de arriba, que no toca APIs externas.
  useEffect(() => {
    if (!wiggle) return;
    const wTimer = setTimeout(() => setWiggle(false), 700);
    // Sin confetti en una noche de prueba: no hay nada que festejar, no se facturó nada.
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
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

      <div className={`bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full max-w-md rounded-2xl p-6 shadow-card animate-in zoom-in-95 duration-200 transition-all ${wiggle ? "animate-wiggle" : ""}`}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                isSummary
                  ? "bg-green-soft border-green-line"
                  : "bg-amber-soft border-amber-line"
              }`}
            >
              {isSummary ? (
                <CheckCircle2 size={20} className="text-green" />
              ) : (
                <AlertTriangle size={20} className="text-amber" />
              )}
            </div>
            <div>
              <h2 className="text-[20px] font-bold text-[var(--text-primary)] leading-none">
                {isSummary ? "Noche cerrada" : "Cerrar noche"}
              </h2>
              <p className="text-[12px] text-[var(--text-secondary)] mt-1.5">
                {esPrueba
                  ? isSummary
                    ? "Noche de prueba — no se guardó nada"
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
            className="p-2 bg-[var(--bg-panel)] rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 cursor-pointer"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {isSummary ? (
          <SummaryView
            summary={summary!}
            onClose={onClose}
            startedAt={startedAt}
            esPrueba={esPrueba}
          />
        ) : (
          <ConfirmView
            totals={totals}
            pendingDeliveries={pendingDeliveries}
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
  pendingDeliveries,
  startedAt,
  submitting,
  error,
  esPrueba,
  onCancel,
  onConfirm,
}: {
  totals: EventTotals;
  pendingDeliveries: number;
  startedAt: number;
  submitting: boolean;
  error: string | null;
  esPrueba: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  // `Date.now()` es impuro (cambia en cada llamada): lo fijamos una sola vez
  // al montar el diálogo de confirmación para que la duración y la fecha
  // mostradas no varíen en renders sucesivos (p. ej. al tipear la contraseña).
  const [now] = useState(() => Date.now());
  const duration = formatDuration(now - startedAt);
  const todaySpanish = new Date(now).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const capitalizedToday = todaySpanish.charAt(0).toUpperCase() + todaySpanish.slice(1);

  return (
    <>
      <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
        {esPrueba ? "Vas a cerrar la noche de prueba iniciada a las " : "Vas a archivar el evento iniciado a las "}
        <span className="text-[var(--text-primary)] font-mono tabular font-bold">
          {formatHm(startedAt)}
        </span>
        {esPrueba
          ? " hs. No se guardó nada: al cerrarla se descartan los pedidos y los totales."
          : " hs. Esta acción es definitiva."}
      </p>

      {/* Details Box */}
      <div className="flex flex-col gap-2 mb-4 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-3.5 text-xs text-[var(--text-secondary)]">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-mono"><Calendar size={12} className="text-[var(--text-secondary)]" /> Fecha</span>
          <span className="font-semibold text-[var(--text-primary)]">{capitalizedToday}</span>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 mt-1">
          <span className="flex items-center gap-1.5 font-semibold text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-mono"><Clock size={12} className="text-[var(--text-secondary)]" /> Inicio de Servicio</span>
          <span className="font-mono text-[var(--text-primary)] tabular font-bold">{formatHm(startedAt)} hs</span>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 mt-1">
          <span className="flex items-center gap-1.5 font-semibold text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-mono"><Clock size={12} className="text-[var(--text-secondary)]" /> Duración</span>
          <span className="font-mono text-[var(--text-primary)] tabular font-bold">{duration}</span>
        </div>
      </div>

      <TotalsBlock totals={totals} />

      {pendingDeliveries > 0 && (
        <div className="mt-4 flex items-start gap-2 text-sm text-amber bg-amber-soft border border-amber-line rounded-xl px-3 py-2.5">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Tenés <strong>{pendingDeliveries}</strong> pedido
            {pendingDeliveries === 1 ? "" : "s"} sin entregar. Se archivarán
            igual.
          </span>
        </div>
      )}

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)] font-mono">
          Tu contraseña / PIN
        </span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-[var(--bg-input)] border border-[var(--border-subtle)] focus:border-[var(--danger-base)] rounded-xl px-4 py-3 text-[var(--text-primary)] outline-none transition-colors text-sm"
          placeholder="Ingresá tu contraseña para confirmar"
        />
      </label>

      {error && (
        <div className="mt-4 text-sm text-danger bg-danger-soft border border-danger-line rounded-xl px-3 py-2.5">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 h-12 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-strong)] text-[var(--text-primary)] font-semibold text-xs hover:bg-[var(--bg-app)] active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onConfirm(password)}
          disabled={submitting || !password.trim()}
          className="flex-1 h-12 rounded-xl bg-[var(--danger-base)] text-white font-semibold text-xs flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
    </>
  );
}

// ─────────────────────────── SummaryView (Receipt Style) ───────────────────────────

function SummaryView({
  summary,
  onClose,
  startedAt,
  esPrueba,
}: {
  summary: EventSummary;
  onClose: () => void;
  startedAt: number;
  esPrueba: boolean;
}) {
  const duration =
    summary.closedAt && summary.startedAt
      ? formatDuration(summary.closedAt - summary.startedAt)
      : "—";

  const closedDate = summary.closedAt ? new Date(summary.closedAt) : new Date();
  const todaySpanish = closedDate.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const capitalizedToday = todaySpanish.charAt(0).toUpperCase() + todaySpanish.slice(1);

  return (
    <div className="flex flex-col">
      <div
        className={`flex flex-col items-center text-center mb-5 mt-1 border rounded-2xl py-4 px-2 select-none ${
          esPrueba
            ? "bg-[var(--warning-soft,rgba(245,158,11,0.12))] border-[var(--warning-line,rgba(245,158,11,0.35))]"
            : "bg-[var(--success-soft)] border-[var(--success-line)]"
        }`}
      >
        {esPrueba ? (
          <AlertTriangle size={36} className="text-amber mb-2" />
        ) : (
          <CheckCircle2 size={36} className="text-[var(--success-base)] mb-2" />
        )}
        <h3
          className={`text-sm font-semibold tracking-wide ${
            esPrueba ? "text-amber" : "text-[var(--success-base)]"
          }`}
        >
          {esPrueba ? "Noche de prueba cerrada" : "Cierre de Noche Exitoso"}
        </h3>
        <p className="text-[11px] text-[var(--text-secondary)] mt-1">
          {esPrueba
            ? "Estos números no se guardaron: no hay arqueo ni historial"
            : "Comprobante Electrónico de Arqueo"}
        </p>
      </div>

      {/* Perforated Receipt container */}
      <div className="relative bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl p-5 shadow-card overflow-hidden flex flex-col gap-4">
        {/* Decorative perforated top notches */}
        <div className="absolute top-0 inset-x-0 h-1.5 flex justify-between px-5 select-none opacity-25" aria-hidden>
          {Array.from({ length: 11 }).map((_, i) => (
            <span key={i} className="w-2 h-2 bg-[var(--bg-surface)] rounded-full -translate-y-1/2 border border-[var(--border-subtle)]" />
          ))}
        </div>

        {/* Header receipt info */}
        <div className="flex flex-col gap-1.5 border-b border-[var(--border-subtle)] pb-3 text-[11px] text-[var(--text-secondary)]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[var(--text-tertiary)] uppercase font-semibold text-[10px] tracking-wider">Fecha</span>
            <span className="font-semibold text-[var(--text-primary)]">{capitalizedToday}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[var(--text-tertiary)] uppercase font-semibold text-[10px] tracking-wider">Inicio</span>
            <span className="font-mono text-[var(--text-primary)] font-semibold">{formatHm(summary.startedAt || startedAt)} hs</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[var(--text-tertiary)] uppercase font-semibold text-[10px] tracking-wider">Duración</span>
            <span className="font-mono text-[var(--text-primary)] font-semibold">{duration}</span>
          </div>
        </div>

        <TotalsBlock totals={summary.totals} />
        
        {/* Decorative perforated bottom notches */}
        <div className="absolute bottom-0 inset-x-0 h-1.5 flex justify-between px-5 select-none opacity-25" aria-hidden>
          {Array.from({ length: 11 }).map((_, i) => (
            <span key={i} className="w-2 h-2 bg-[var(--bg-surface)] rounded-full translate-y-1/2 border border-[var(--border-subtle)]" />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full h-12 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--text-on-accent)] font-semibold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
      >
        <CheckCircle2 size={15} strokeWidth={3} />
        Cerrar y continuar
      </button>
    </div>
  );
}

// ─────────────────────────── TotalsBlock ───────────────────────────

function TotalsBlock({ totals }: { totals: EventTotals }) {
  const efectivo = totals.efectivoTotal || 0;
  const qr = totals.qrTotal || 0;
  const tarjeta = totals.debitoTotal || 0;
  const grandTotal = efectivo + qr + tarjeta;
  
  const totalSales = grandTotal || 1;
  const pctEfectivo = (efectivo / totalSales) * 100;
  const pctQr = (qr / totalSales) * 100;
  const pctDebito = (tarjeta / totalSales) * 100;

  return (
    <div className="flex flex-col gap-4 select-none">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl divide-y divide-[var(--border-subtle)] overflow-hidden shadow-sm">
        <Row
          icon={<Banknote size={13} className="text-green-450 text-green-400" />}
          label="Efectivo"
          count={totals.efectivoCount}
          value={efectivo}
        />
        <Row
          icon={<QrCode size={13} className="text-cyan-400" />}
          label="Dinero por QR"
          count={totals.qrCount}
          value={qr}
        />
        <Row
          icon={<CreditCard size={13} className="text-amber-400" />}
          label="Dinero por Tarjetas"
          count={totals.debitoCount}
          value={tarjeta}
        />
        <div className="flex items-center justify-between px-4 py-3 bg-[var(--accent-surface)] border-t border-[var(--border-subtle)]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-text)]">
            Total noche
          </span>
          <span className="font-mono text-xl text-[var(--text-primary)] font-bold tabular">
            ${grandTotal.toLocaleString("es-AR")}
          </span>
        </div>
      </div>

      {/* Segmented Distribution Chart */}
      <div className="flex flex-col gap-1.5 px-1 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-mono">
          Distribución de Ventas
        </span>
        <div className="flex h-3 w-full rounded-full overflow-hidden bg-[var(--bg-panel)] border border-[var(--border-subtle)] gap-[2px] p-[2px]">
          {pctEfectivo > 0 && (
            <div 
              className="bg-green-500" 
              style={{ width: `${pctEfectivo}%`, borderRadius: pctQr === 0 && pctDebito === 0 ? "9999px" : undefined }} 
              title={`Efectivo: ${pctEfectivo.toFixed(1)}%`} 
            />
          )}
          {pctQr > 0 && (
            <div 
              className="bg-cyan-500" 
              style={{ width: `${pctQr}%`, borderRadius: pctEfectivo === 0 && pctDebito === 0 ? "9999px" : undefined }} 
              title={`QR: ${pctQr.toFixed(1)}%`} 
            />
          )}
          {pctDebito > 0 && (
            <div 
              className="bg-amber-500" 
              style={{ width: `${pctDebito}%`, borderRadius: pctEfectivo === 0 && pctQr === 0 ? "9999px" : undefined }} 
              title={`Tarjeta: ${pctDebito.toFixed(1)}%`} 
            />
          )}
        </div>
        <div className="flex gap-4 justify-center text-[8.5px] font-bold font-mono mt-1 text-[var(--text-secondary)]">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Efectivo ({pctEfectivo.toFixed(0)}%)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
            <span>QR ({pctQr.toFixed(0)}%)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Tarjeta ({pctDebito.toFixed(0)}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  count,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--bg-panel)] transition-colors">
      <div className="flex items-center gap-2 text-[var(--text-primary)]">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
          {label}
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono font-semibold">({count})</span>
      </div>
      <span className="font-mono text-xs text-[var(--text-primary)] font-semibold tabular">
        ${value.toLocaleString("es-AR")}
      </span>
    </div>
  );
}
