"use client";

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Power,
  X,
  QrCode,
  Clock,
  Calendar,
} from "lucide-react";
import { useState, useEffect } from "react";
import { formatHm } from "@/lib/utils";
import type { EventSummary, EventTotals } from "@cocktrail/shared";

type Props = {
  open: boolean;
  totals: EventTotals;
  pendingDeliveries: number;
  startedAt: number;
  summary: EventSummary | null;
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
  cashierName?: string;
  onCloseAndShutdown?: () => void;
};

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// ── Native Canvas Confetti Emitter ──
function triggerConfetti() {
  if (typeof window === "undefined") return;
  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "9999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ["#10b981", "#06b6d4", "#fbbf24", "#ec4899", "#3b82f6"];
  const particles: any[] = [];

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
      requestAnimationFrame(update);
    } else {
      if (canvas.parentNode) {
        document.body.removeChild(canvas);
      }
    }
  }

  update();
}

export default function CloseNightModal({
  open,
  totals,
  pendingDeliveries,
  startedAt,
  summary,
  onConfirm,
  onClose,
  cashierName,
  onCloseAndShutdown,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fictional loading states
  const [fakeLoading, setFakeLoading] = useState(false);
  const [fakeLoadingStep, setFakeLoadingStep] = useState(0);

  // Success animations states
  const [wiggle, setWiggle] = useState(false);
  const [confettiTriggered, setConfettiTriggered] = useState(false);

  // Trigger animations on summary load
  useEffect(() => {
    if (summary && open && !confettiTriggered) {
      setConfettiTriggered(true);
      setWiggle(true);
      const wTimer = setTimeout(() => setWiggle(false), 700);
      const cTimer = setTimeout(() => triggerConfetti(), 150);
      return () => {
        clearTimeout(wTimer);
        clearTimeout(cTimer);
      };
    } else if (!open || !summary) {
      setConfettiTriggered(false);
      setFakeLoading(false);
      setSubmitting(false);
    }
  }, [summary, open, confettiTriggered]);

  if (!open) return null;

  const isSummary = summary !== null;
  const isVip = cashierName === "cajavip";

  async function handleConfirm(password: string) {
    if (submitting || fakeLoading) return;
    setFakeLoading(true);
    setFakeLoadingStep(0);
    setError(null);

    // Sequence of fictional loading steps (3.2 seconds total)
    const t1 = setTimeout(() => setFakeLoadingStep(1), 850);
    const t2 = setTimeout(() => setFakeLoadingStep(2), 1700);
    const t3 = setTimeout(() => setFakeLoadingStep(3), 2550);

    const t4 = setTimeout(async () => {
      setSubmitting(true);
      try {
        await onConfirm(password);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cerrar");
        setFakeLoading(false);
      } finally {
        setSubmitting(false);
      }
    }, 3200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
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

      <div className={`bg-ink-900 border border-ink-800 w-full max-w-md rounded-[22px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 transition-all ${wiggle ? "animate-wiggle" : ""}`}>
        
        {/* Header (Hidden during fake loading view) */}
        {!fakeLoading && (
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
                <h2 className="font-serif-italic text-[22px] text-ink-50 leading-none">
                  {isSummary 
                    ? (isVip ? "Cierre VIP archivado" : "Noche cerrada") 
                    : (isVip ? "Cerrar caja VIP" : "Cerrar noche")}
                </h2>
                <p className="text-[10px] text-ink-400 uppercase tracking-[0.18em] font-medium mt-1.5">
                  {isSummary 
                    ? "Resumen archivado" 
                    : (isVip ? "Acción irreversible - Barra VIP" : "Acción irreversible")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="p-2 bg-ink-800 rounded-full text-ink-300 hover:text-ink-50 disabled:opacity-40 cursor-pointer"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Content selection */}
        {fakeLoading ? (
          <FakeLoadingView step={fakeLoadingStep} />
        ) : isSummary ? (
          <SummaryView 
            summary={summary!} 
            onClose={onClose} 
            startedAt={startedAt} 
            onCloseAndShutdown={onCloseAndShutdown} 
          />
        ) : (
          <ConfirmView
            totals={totals}
            pendingDeliveries={pendingDeliveries}
            startedAt={startedAt}
            submitting={submitting}
            error={error}
            isVip={isVip}
            onCancel={onClose}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── FakeLoadingView ───────────────────────────

function FakeLoadingView({ step }: { step: number }) {
  const messages = [
    "Validando clave de seguridad...",
    "Consolidando arqueo de caja (Efectivo, QR, Tarjeta)...",
    "Archivando evento en base de datos...",
    "Finalizando cierre..."
  ];

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-6 select-none">
      <div className="relative flex items-center justify-center w-16 h-16">
        <Loader2 size={40} className="text-accent animate-spin" />
        <div className="absolute inset-0 rounded-full border-4 border-accent/15 border-t-accent animate-ping opacity-30" />
      </div>
      <div className="flex flex-col gap-2 max-w-xs">
        <p className="text-sm font-bold text-ink-50 animate-pulse transition-all duration-200">
          {messages[step] || "Procesando..."}
        </p>
        <p className="text-[10px] text-ink-400 uppercase tracking-widest font-mono">
          Por favor, no apagues la terminal
        </p>
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
  isVip,
  onCancel,
  onConfirm,
}: {
  totals: EventTotals;
  pendingDeliveries: number;
  startedAt: number;
  submitting: boolean;
  error: string | null;
  isVip: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const duration = formatDuration(Date.now() - startedAt);
  const todaySpanish = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const capitalizedToday = todaySpanish.charAt(0).toUpperCase() + todaySpanish.slice(1);

  return (
    <>
      <p className="text-sm text-ink-300 mb-4 leading-relaxed">
        {isVip 
          ? "Vas a archivar el evento y cerrar los números de la caja VIP. El servicio se inició a las "
          : "Vas a archivar el evento iniciado a las "}
        <span className="text-ink-50 font-mono tabular font-bold">
          {formatHm(startedAt)}
        </span>
        {isVip ? " hs en la barra VIP. Esta acción es definitiva." : " hs. Esta acción es definitiva."}
      </p>

      {/* Details Box */}
      <div className="flex flex-col gap-2 mb-4 bg-ink-850/50 border border-ink-800/40 rounded-2xl p-3.5 text-xs text-ink-300">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-wider text-ink-500 font-mono"><Calendar size={12} className="text-ink-400" /> Fecha</span>
          <span className="font-bold text-ink-100">{capitalizedToday}</span>
        </div>
        <div className="flex items-center justify-between border-t border-ink-800/30 pt-2 mt-1">
          <span className="flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-wider text-ink-500 font-mono"><Clock size={12} className="text-ink-400" /> Inicio de Servicio</span>
          <span className="font-mono text-ink-50 tabular font-bold">{formatHm(startedAt)} hs</span>
        </div>
        <div className="flex items-center justify-between border-t border-ink-800/30 pt-2 mt-1">
          <span className="flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-wider text-ink-500 font-mono"><Clock size={12} className="text-ink-400" /> Duración</span>
          <span className="font-mono text-ink-50 tabular font-bold">{duration}</span>
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
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-400 font-mono">
          Tu contraseña / PIN
        </span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-ink-850 border border-ink-750 focus:border-danger rounded-xl px-4 py-3 text-ink-50 outline-none transition-colors text-sm"
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
          className="flex-1 h-12 rounded-xl bg-ink-800 text-ink-100 font-bold text-xs uppercase tracking-[0.14em] hover:bg-ink-750 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onConfirm(password)}
          disabled={submitting || !password.trim()}
          className="flex-1 h-12 rounded-xl bg-danger text-ink-50 font-bold text-xs uppercase tracking-[0.14em] flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
  onCloseAndShutdown,
}: {
  summary: EventSummary;
  onClose: () => void;
  startedAt: number;
  onCloseAndShutdown?: () => void;
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
      <div className="flex flex-col items-center text-center mb-5 mt-1 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl py-4 px-2 select-none">
        <CheckCircle2 size={36} className="text-emerald-400 mb-2 animate-pulse" />
        <h3 className="text-sm font-black uppercase tracking-wider text-emerald-400">
          Cierre de Noche Exitoso
        </h3>
        <p className="text-[9px] text-ink-400 uppercase tracking-widest font-mono mt-1">
          Comprobante Electrónico de Arqueo
        </p>
      </div>

      {/* Perforated Receipt container */}
      <div className="relative bg-ink-950/80 border border-ink-850 rounded-2xl p-5 shadow-lg overflow-hidden flex flex-col gap-4">
        {/* Decorative perforated top notches */}
        <div className="absolute top-0 inset-x-0 h-1.5 flex justify-between px-5 select-none opacity-25" aria-hidden>
          {Array.from({ length: 11 }).map((_, i) => (
            <span key={i} className="w-2 h-2 bg-ink-900 rounded-full -translate-y-1/2 border border-ink-800" />
          ))}
        </div>

        {/* Header receipt info */}
        <div className="flex flex-col gap-1.5 border-b border-ink-800 pb-3 text-[11px] text-ink-300">
          <div className="flex items-center justify-between">
            <span className="font-mono text-ink-500 uppercase font-semibold text-[8.5px] tracking-wider">Fecha</span>
            <span className="font-bold text-ink-100">{capitalizedToday}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-ink-500 uppercase font-semibold text-[8.5px] tracking-wider">Inicio</span>
            <span className="font-mono text-ink-100 font-bold">{formatHm(summary.startedAt || startedAt)} hs</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-ink-500 uppercase font-semibold text-[8.5px] tracking-wider">Duración</span>
            <span className="font-mono text-ink-100 font-bold">{duration}</span>
          </div>
        </div>

        <TotalsBlock totals={summary.totals} />
        
        {/* Decorative perforated bottom notches */}
        <div className="absolute bottom-0 inset-x-0 h-1.5 flex justify-between px-5 select-none opacity-25" aria-hidden>
          {Array.from({ length: 11 }).map((_, i) => (
            <span key={i} className="w-2 h-2 bg-ink-900 rounded-full translate-y-1/2 border border-ink-800" />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-6 w-full h-13 rounded-xl bg-gradient-to-r from-green-600 to-green-500 text-white font-black text-xs uppercase tracking-[0.16em] flex items-center justify-center gap-2 hover:from-green-550 hover:to-green-450 active:scale-95 transition-all shadow-[0_4px_15px_rgba(74,222,128,0.25)] cursor-pointer"
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
      <div className="bg-ink-850/60 border border-ink-800 rounded-xl divide-y divide-ink-800/60 overflow-hidden shadow-sm">
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
        <div className="flex items-center justify-between px-4 py-3 bg-accent-soft/10 border-t border-ink-800">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-accent font-mono">
            Total noche
          </span>
          <span className="font-mono text-xl text-ink-50 font-black tabular">
            ${grandTotal.toLocaleString("es-AR")}
          </span>
        </div>
      </div>

      {/* Segmented Distribution Chart */}
      <div className="flex flex-col gap-1.5 px-1 pb-1">
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-ink-500 font-mono">
          Distribución de Ventas
        </span>
        <div className="flex h-3 w-full rounded-full overflow-hidden bg-ink-950 border border-ink-850 gap-[2px] p-[2px]">
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
        <div className="flex gap-4 justify-center text-[8.5px] font-bold font-mono mt-1 text-ink-400">
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
    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-ink-850/30 transition-colors">
      <div className="flex items-center gap-2 text-ink-200">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
          {label}
        </span>
        <span className="text-[9px] text-ink-500 font-mono font-bold">({count})</span>
      </div>
      <span className="font-mono text-xs text-ink-100 font-bold tabular">
        ${value.toLocaleString("es-AR")}
      </span>
    </div>
  );
}
