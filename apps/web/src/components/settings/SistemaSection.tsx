"use client";

import { useEffect, useState } from "react";
import { Cloud, GitBranch, RefreshCw, Server, Smartphone, Wifi } from "lucide-react";
import { SectionHelpButton } from "@/components/help/SectionHelpButton";
import { systemService, type AppVersionInfo } from "@/services/system.service";

/** Staging / servicio Render directo (además del dominio miboliche.online). */
const RENDER_CAJA_URL = "https://bosko-7xsy.onrender.com";

type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/** True solo dentro del WebView de miBoliche Caja (puente nativo). */
function isCajaApkShell(): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (window as Window & { MiBolichePrinter?: { print?: unknown } }).MiBolichePrinter;
  return typeof bridge?.print === "function";
}

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 48) return remM ? `${h}h ${remM}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d}d ${remH}h` : `${d}d`;
}

function providerLabel(provider: AppVersionInfo["deploy"]["provider"]): string {
  if (provider === "koyeb") return "Koyeb";
  if (provider === "render") return "Render";
  if (provider === "local") return "Local";
  return "Desconocido";
}

function VersionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-[12px] text-[var(--text-tertiary)] shrink-0">{label}</dt>
      <dd className="text-[12px] font-medium text-[var(--text-primary)] text-right tabular truncate min-w-0">
        {value}
      </dd>
    </div>
  );
}

/**
 * Sección "Sistema" de Configuración en /admin — app de caja para la tablet
 * (WebView + impresión USB/BLE nativa) + versión / deploy.
 */
export default function SistemaSection() {
  const [version, setVersion] = useState<AppVersionInfo | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [loadingVersion, setLoadingVersion] = useState(true);
  const [inApkShell, setInApkShell] = useState(false);
  const [serverOrigin, setServerOrigin] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const loadVersion = async () => {
    setLoadingVersion(true);
    setVersionError(null);
    try {
      setVersion(await systemService.getVersion());
    } catch {
      setVersionError("No se pudo leer la versión del servidor.");
      setVersion(null);
    } finally {
      setLoadingVersion(false);
    }
  };

  useEffect(() => {
    void loadVersion();
    setInApkShell(isCajaApkShell());
    setServerOrigin(window.location.origin);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      try {
        localStorage.setItem("pwa_installed", "true");
      } catch {
        /* private mode */
      }
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    setInstalling(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
    } finally {
      setInstalling(false);
    }
  }

  // Filtrar de las novedades cualquier mención a ghost mode o superadmin
  const safeHighlights = (version?.releaseNotes?.highlights ?? []).filter((h) => {
    const lower = h.toLowerCase();
    return !lower.includes("ghost") && !lower.includes("superadmin");
  });

  return (
    <div data-tour="sistema-section" className="w-full min-w-0 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] leading-tight select-none">
            Sistema
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1.5">
            App de caja, versión del producto y configuración del backend
          </p>
        </div>
        <SectionHelpButton category="sistema" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch w-full">
        {/* App de caja — fondo sobrio, mismo idioma que la night card */}
        <div
          data-tour="pwa-install"
          className="relative overflow-hidden rounded-2xl p-5 md:p-6 text-white flex flex-col justify-between shadow-card border border-white/10"
          style={{
            background: "linear-gradient(160deg, #16321F 0%, #131719 55%, #1A1D21 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='120' height='80' viewBox='0 0 120 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 Q30 10 60 40 T120 40' fill='none' stroke='%2334D399' stroke-width='1.1' opacity='0.3'/%3E%3Cpath d='M0 55 Q30 25 60 55 T120 55' fill='none' stroke='%2334D399' stroke-width='0.9' opacity='0.18'/%3E%3C/svg%3E\")",
              backgroundSize: "100% 100%",
            }}
            aria-hidden
          />

          <div>
            <div className="relative flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-white/20 bg-white/10 shrink-0">
                <Smartphone size={18} strokeWidth={2} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[16px] font-semibold">Instalar app de caja</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Tablet POS
                  </span>
                </div>
                <p className="text-[12px] text-white/60 mt-0.5">Para la tablet que cobra e imprime</p>
              </div>
            </div>

            <p className="relative text-[13px] text-white/70 leading-relaxed mt-4">
              Se instala desde Chrome, abre a pantalla completa y usa el mismo Bluetooth que la
              web. Se actualiza sola cuando publiquemos una nueva versión.
            </p>
          </div>

          <div className="relative mt-6 pt-4 border-t border-white/10 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => void installApp()}
              disabled={!installPrompt || installing || installed}
              className="h-10 w-full rounded-xl bg-white text-[#16321F] hover:bg-emerald-50 flex items-center justify-center gap-2 text-[13px] font-semibold transition-all cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              <Smartphone size={15} strokeWidth={2} />
              {installed ? "App instalada" : installing ? "Abriendo instalador…" : "Instalar app"}
            </button>

            {!installed && !installPrompt && (
              <p className="text-[11.5px] text-white/50 leading-relaxed text-center">
                Abrí esta página en Chrome Android y elegí <strong className="text-white/70">⋮ → Instalar app</strong>.
              </p>
            )}
          </div>
        </div>

        {/* Versión / deploy con badges colapsables */}
        <div
          data-tour="sistema-version"
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 md:p-6 flex flex-col justify-between shadow-card"
        >
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--accent-primary)] shrink-0">
                  <Server size={18} strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">Versión</h3>
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                    Build que está corriendo este servidor
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadVersion()}
                disabled={loadingVersion}
                aria-label="Actualizar versión"
                className="p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-panel)] cursor-pointer disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={15} className={loadingVersion ? "animate-spin" : ""} />
              </button>
            </div>

            {versionError && (
              <p className="mt-4 text-[12px] text-[var(--danger-base)] bg-[var(--danger-soft)] p-2.5 rounded-xl border border-[var(--danger-line)]" role="alert">
                {versionError}
              </p>
            )}

            {loadingVersion && !version ? (
              <p className="mt-6 text-[12px] text-[var(--text-tertiary)]">Cargando…</p>
            ) : version ? (
              <>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center h-8 px-3 rounded-xl bg-[var(--accent-surface)] text-[var(--accent-text)] border border-[var(--accent-line)] text-[13px] font-bold tabular">
                    v{version.version}
                  </span>
                  <span className="inline-flex items-center h-8 px-3 rounded-xl bg-[var(--amber-soft)] text-[var(--amber-base)] border border-[var(--amber-line)] text-[11.5px] font-semibold uppercase tracking-wider">
                    {version.channel}
                  </span>
                  <span className="inline-flex items-center h-8 px-3 rounded-xl bg-[var(--bg-panel)] text-[var(--text-secondary)] border border-[var(--border-subtle)] text-[12px] font-medium">
                    {version.label}
                  </span>
                </div>

                {/* Novedades sin mención a ghost mode */}
                {safeHighlights.length > 0 && (
                  <div className="mt-4 pt-3.5 border-t border-[var(--border-subtle)]">
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                      <h4 className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                        Novedades de esta versión
                      </h4>
                      {version.releaseNotes?.date && (
                        <span className="text-[11px] text-[var(--text-tertiary)] tabular shrink-0 font-mono">
                          {version.releaseNotes.date}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1.5">
                      {safeHighlights.map((item) => (
                        <li
                          key={item}
                          className="flex gap-2 text-[12px] text-[var(--text-secondary)] leading-snug"
                        >
                          <span
                            className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] shrink-0"
                            aria-hidden
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Detalles colapsables de entorno / deploy */}
          {version && (
            <div className="mt-5 pt-3 border-t border-[var(--border-subtle)]">
              <details className="group">
                <summary className="text-[12.5px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer list-none flex items-center justify-between py-1 select-none">
                  <span className="group-open:hidden">Ver detalles de entorno y despliegue</span>
                  <span className="hidden group-open:inline">Ocultar detalles de despliegue</span>
                  <span className="text-[var(--text-tertiary)] text-[11px] font-mono group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <dl className="mt-3 divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)] pt-1">
                  <VersionRow label="Entorno" value={version.environment} />
                  <VersionRow label="Hosting" value={providerLabel(version.deploy.provider)} />
                  {version.deploy.service && (
                    <VersionRow label="Servicio" value={version.deploy.service} />
                  )}
                  {version.deploy.branch && (
                    <VersionRow label="Rama" value={version.deploy.branch} />
                  )}
                  {version.deploy.commitShort && (
                    <VersionRow label="Commit" value={version.deploy.commitShort} />
                  )}
                  <VersionRow label="Uptime" value={formatUptime(version.runtime.uptimeSec)} />
                  <VersionRow label="Node" value={version.runtime.node} />
                  <VersionRow
                    label="Migraciones"
                    value={
                      version.migrations.pendingCount > 0
                        ? `${version.migrations.state} · ${version.migrations.pendingCount} pend.`
                        : version.migrations.state
                    }
                  />
                  {version.deploy.externalUrl && (
                    <div className="flex items-baseline justify-between gap-3 py-1.5">
                      <dt className="text-[12px] text-[var(--text-tertiary)] shrink-0">URL pública</dt>
                      <dd className="text-[12px] font-mono text-[var(--text-primary)] text-right truncate min-w-0">
                        {version.deploy.externalUrl}
                      </dd>
                    </div>
                  )}
                </dl>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* Servidor full-width */}
      <div
        data-tour="sistema-servidor"
        className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 md:p-6 shadow-card"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--accent-primary)] shrink-0">
            <Wifi size={18} strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">Servidor</h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--success-soft)] text-[var(--success-base)]">
                En línea
              </span>
            </div>
            <p className="text-[12px] text-[var(--text-tertiary)] truncate mt-0.5">
              Conectado a {serverOrigin || "…"}
              {inApkShell ? " · app Android" : ""}
            </p>
          </div>
        </div>

        <p className="mt-3.5 text-[13px] text-[var(--text-secondary)] leading-relaxed">
          Elegí a qué backend apunta la caja: dominio, Render directo, o PC en la WiFi (solo app
          Android).
        </p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => {
              if (inApkShell) {
                window.location.href = "miboliche://cloud";
              } else {
                window.location.href = "https://miboliche.online";
              }
            }}
            className="h-11 px-4 rounded-xl bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:brightness-95 flex items-center justify-center gap-2 text-[13px] font-semibold cursor-pointer active:scale-[0.98] transition-all shadow-sm"
          >
            <Cloud size={15} strokeWidth={2} aria-hidden />
            Usar nube (miboliche.online)
          </button>
          <button
            type="button"
            onClick={() => {
              if (inApkShell) {
                window.location.href =
                  "miboliche://connect?server=" + encodeURIComponent(RENDER_CAJA_URL);
              } else {
                window.location.href = RENDER_CAJA_URL;
              }
            }}
            className="h-11 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center justify-center gap-2 text-[13px] font-semibold cursor-pointer active:scale-[0.98] transition-all"
            title={RENDER_CAJA_URL}
          >
            <Server size={15} strokeWidth={2} aria-hidden />
            Usar Render (bosko-7xsy)
          </button>
          <button
            type="button"
            onClick={() => {
              if (inApkShell) {
                window.location.href = "miboliche://discover";
              } else {
                window.alert(
                  "Buscar en WiFi solo funciona dentro de la app Android (APK). En Chrome abrí la IP local a mano (https://192.168.x.x:…).",
                );
              }
            }}
            className="h-11 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center justify-center gap-2 text-[13px] font-semibold cursor-pointer active:scale-[0.98] transition-all"
          >
            <Wifi size={15} strokeWidth={2} aria-hidden />
            Buscar en WiFi local
          </button>
        </div>
      </div>
    </div>
  );
}
