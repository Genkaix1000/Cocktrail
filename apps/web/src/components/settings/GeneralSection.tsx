"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Sun, TreePine, Image as ImageIcon, Type, Sparkles, Plus, Settings } from "lucide-react";
import { configService } from "@/services/config.service";
import { useTheme } from "@/components/ThemeProvider";

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
};

const lerpColor = (a: [number, number, number], b: [number, number, number], t: number): string => {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
};

export default function GeneralSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { theme: currentAppliedTheme, isDark } = useTheme();

  // Initial loaded configuration state to compare changes
  const [initialConfig, setInitialConfig] = useState<any>(null);

  // Active theme selector state
  const [activeTheme, setActiveTheme] = useState<"normal" | "bosko" | "custom">("normal");

  // Custom colors state
  const [customColors, setCustomColors] = useState({
    backgroundColor: "#07090f",
    surfaceColor: "#0d1119",
    accentColor: "#d4a76a",
  });

  // Branding states
  const [clubId, setClubId] = useState("cocktrail_club_01");
  const [clubName, setClubName] = useState("Bosko Club");
  const [useLogoUrl, setUseLogoUrl] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [logoSize, setLogoSize] = useState(40);
  const [textLogoValue, setTextLogoValue] = useState("Cocktrail");
  const [textLogoSize, setTextLogoSize] = useState(26);

  useEffect(() => {
    configService.get().then((c) => {
      setInitialConfig(c);
      setClubId(c.clubId || "cocktrail_club_01");
      setClubName(c.clubName || "Bosko Club");
      setUseLogoUrl(Boolean(c.useLogoUrl));
      setLogoUrl(c.logoUrl || "");
      setLogoSize(c.logoSize ?? 40);
      setTextLogoValue(c.textLogoValue || "Cocktrail");
      setTextLogoSize(c.textLogoSize ?? 26);
      setActiveTheme(c.theme || "normal");

      if (c.customTheme) {
        setCustomColors({
          backgroundColor: c.customTheme.backgroundColor || "#07090f",
          surfaceColor: c.customTheme.surfaceColor || "#0d1119",
          accentColor: c.customTheme.accentColor || "#d4a76a",
        });
      } else {
        // Fallback default colors based on theme if no custom colors defined yet
        if (c.theme === "bosko") {
          setCustomColors({
            backgroundColor: "#050d07",
            surfaceColor: "#0a1a10",
            accentColor: "#c98a6c",
          });
        } else {
          setCustomColors({
            backgroundColor: "#07090f",
            surfaceColor: "#0d1119",
            accentColor: "#d4a76a",
          });
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const selectPreset = (preset: "normal" | "bosko") => {
    setActiveTheme(preset);
    if (preset === "normal") {
      setCustomColors({
        backgroundColor: "#07090f",
        surfaceColor: "#0d1119",
        accentColor: "#d4a76a",
      });
      setUseLogoUrl(false);
      setLogoUrl("");
      setLogoSize(40);
      setTextLogoValue("Cocktrail");
      setTextLogoSize(26);
    } else {
      setCustomColors({
        backgroundColor: "#050d07",
        surfaceColor: "#0a1a10",
        accentColor: "#c98a6c",
      });
      setUseLogoUrl(true);
      setLogoUrl("/bosko.webp");
      setLogoSize(56);
      setTextLogoValue("Bosko");
      setTextLogoSize(26);
    }
  };

  const handleColorChange = (key: keyof typeof customColors, val: string) => {
    setCustomColors((prev) => ({ ...prev, [key]: val }));
    setActiveTheme("custom");
  };

  const hasChanges = () => {
    if (!initialConfig) return false;

    const themeChanged = activeTheme !== initialConfig.theme;
    const useLogoUrlChanged = useLogoUrl !== Boolean(initialConfig.useLogoUrl);
    const logoUrlChanged = logoUrl !== (initialConfig.logoUrl || "");
    const logoSizeChanged = logoSize !== (initialConfig.logoSize ?? 40);
    const textLogoValueChanged = textLogoValue !== (initialConfig.textLogoValue || "Cocktrail");
    const textLogoSizeChanged = textLogoSize !== (initialConfig.textLogoSize ?? 26);

    let colorsChanged = false;
    if (activeTheme === "custom" || initialConfig.customTheme) {
      const initialColors = initialConfig.customTheme || {
        backgroundColor: activeTheme === "bosko" ? "#050d07" : "#07090f",
        surfaceColor: activeTheme === "bosko" ? "#0a1a10" : "#0d1119",
        accentColor: activeTheme === "bosko" ? "#c98a6c" : "#d4a76a",
      };
      colorsChanged =
        customColors.backgroundColor !== initialColors.backgroundColor ||
        customColors.surfaceColor !== initialColors.surfaceColor ||
        customColors.accentColor !== initialColors.accentColor;
    }

    return (
      themeChanged ||
      useLogoUrlChanged ||
      logoUrlChanged ||
      logoSizeChanged ||
      textLogoValueChanged ||
      textLogoSizeChanged ||
      colorsChanged
    );
  };

  const saveAllConfig = useCallback(async () => {
    if (!hasChanges()) return;
    setSaving(true);
    try {
      const updated = await configService.update({
        theme: activeTheme,
        customTheme: activeTheme === "custom" ? customColors : null,
        useLogoUrl,
        logoUrl,
        logoSize,
        textLogoValue,
        textLogoSize,
      });

      setInitialConfig(updated);

      // The SSE event from configService.update will trigger ThemeProvider to apply
      // colors globally. We still apply locally for instant feedback.
      if (activeTheme === "bosko") {
        document.documentElement.setAttribute("data-theme", "bosko");
      } else if (activeTheme === "custom") {
        document.documentElement.setAttribute("data-theme", "custom");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }

      localStorage.setItem("cocktrail_theme", activeTheme);
      localStorage.setItem("cocktrail_use_logo_url", String(useLogoUrl));
      localStorage.setItem("cocktrail_logo_url", logoUrl);
      localStorage.setItem("cocktrail_logo_size", String(logoSize));
      localStorage.setItem("cocktrail_text_logo_value", textLogoValue);
      localStorage.setItem("cocktrail_text_logo_size", String(textLogoSize));

      if (activeTheme === "custom") {
        localStorage.setItem("cocktrail_custom_theme", JSON.stringify(customColors));
      } else {
        localStorage.removeItem("cocktrail_custom_theme");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Error saving configuration:", err);
    } finally {
      setSaving(false);
    }
  }, [activeTheme, customColors, useLogoUrl, logoUrl, logoSize, textLogoValue, textLogoSize, initialConfig]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-ink-400" />
      </div>
    );
  }

  const isModified = hasChanges();
  const isBosko = currentAppliedTheme === "bosko";

  return (
    <div className="w-full space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-[32px] font-black tracking-tight text-ink-50 leading-tight flex items-center gap-3 select-none">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 border border-accent/20 text-accent shrink-0">
            <Settings size={16} />
          </div>
          <span>General</span>
        </h1>
        <p className="text-[13px] text-ink-400/80 mt-1">Personalizá la apariencia y el branding de tu boliche.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Column: Theme Selectors & Color Tweak Panel */}
        <div className="lg:col-span-7 flex flex-col">
          <section className="space-y-4 flex-1 flex flex-col">
            <h3 className="text-[18px] font-bold tracking-tight text-ink-100">
              Estética del Local
            </h3>
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 space-y-6 flex-1 flex flex-col justify-between">
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Normal Preset */}
                  <button
                    type="button"
                    onClick={() => selectPreset("normal")}
                    className={`
                      relative group p-4 rounded-xl border-2 transition-all duration-200 text-left cursor-pointer hover:scale-[1.02] active:scale-[0.98]
                      ${activeTheme === "normal"
                        ? "border-blue bg-blue-soft/30 shadow-md"
                        : "border-ink-800 bg-ink-950 hover:border-ink-700"
                      }
                    `}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        activeTheme === "normal" ? "bg-blue/20 text-blue" : "bg-ink-800 text-ink-400"
                      }`}>
                        <Sun size={16} />
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-ink-50">Normal</p>
                        <p className="text-[9px] text-ink-450">Preset Azul</p>
                      </div>
                    </div>
                    {activeTheme === "normal" && (
                      <div className="absolute top-2 right-2 w-5.5 h-5.5 rounded-full bg-blue flex items-center justify-center">
                        <Check size={11} strokeWidth={3} className="text-ink-950" />
                      </div>
                    )}
                  </button>

                  {/* Bosko Preset */}
                  <button
                    type="button"
                    onClick={() => selectPreset("bosko")}
                    className={`
                      relative group p-4 rounded-xl border-2 transition-all duration-200 text-left cursor-pointer hover:scale-[1.02] active:scale-[0.98]
                      ${activeTheme === "bosko"
                        ? "border-accent bg-accent-soft/30 shadow-md"
                        : "border-ink-800 bg-ink-950 hover:border-ink-700"
                      }
                    `}
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        activeTheme === "bosko" ? "bg-accent-soft text-accent" : "bg-ink-800 text-ink-400"
                      }`}>
                        <TreePine size={16} />
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-ink-50">Bosko</p>
                        <p className="text-[9px] text-ink-450">Preset Verde</p>
                      </div>
                    </div>
                    {activeTheme === "bosko" && (
                      <div className="absolute top-2 right-2 w-5.5 h-5.5 rounded-full bg-accent flex items-center justify-center">
                        <Check size={11} strokeWidth={3} className="text-ink-950" />
                      </div>
                    )}
                  </button>

                  {/* Custom Preset */}
                  <div
                    className={`
                      relative p-4 rounded-xl border-2 transition-all duration-200 flex flex-col justify-center hover:scale-[1.02]
                      ${activeTheme === "custom"
                        ? "border-amber bg-[rgba(212,167,106,0.08)] shadow-md"
                        : "border-dashed border-ink-800 bg-transparent text-ink-600"
                      }
                    `}
                  >
                    <div>
                      <p className={`text-[13px] font-semibold ${activeTheme === "custom" ? "text-amber" : "text-ink-500"}`}>
                        Personalizado
                      </p>
                      <p className="text-[9px] text-ink-500">Ajustado a mano</p>
                    </div>
                    {activeTheme === "custom" && (
                      <div className="absolute top-2 right-2 w-5.5 h-5.5 rounded-full bg-amber flex items-center justify-center">
                        <Check size={11} strokeWidth={3} className="text-ink-950" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Color Adjustments */}
                <div className="space-y-4 border-t border-ink-800 pt-5">
                  <h4 className="text-[12px] font-bold uppercase tracking-[0.15em] text-ink-400">
                    Ajuste de Tonos
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-4">
                    {([
                      { key: "backgroundColor" as const, label: "Fondo Principal" },
                      { key: "surfaceColor" as const, label: "Tarjetas / Sidebar" },
                      { key: "accentColor" as const, label: "Textos y Acentos" },
                    ]).map(({ key, label }) => {
                      const isDisabled = activeTheme !== "custom";
                      const displayValue = activeTheme === "custom"
                        ? customColors[key]
                        : activeTheme === "bosko"
                        ? (key === "backgroundColor"
                          ? (isDark ? "#013e37" : "#fffef2")
                          : key === "surfaceColor"
                          ? (isDark ? "#012b26" : "#ffffff")
                          : (isDark ? "#fffeb3" : "#013e37"))
                        : (key === "backgroundColor"
                          ? (isDark ? "#0b0914" : "#f8f7f9")
                          : key === "surfaceColor"
                          ? (isDark ? "#120e1e" : "#ffffff")
                          : (isDark ? "#b89fd4" : "#5e4074"));

                      return (
                        <div key={key} className="space-y-1.5">
                          <label className="text-[13px] font-semibold text-ink-100 block truncate" title={label}>
                            {label}
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={displayValue}
                              disabled={isDisabled}
                              onChange={(e) => handleColorChange(key, e.target.value)}
                              className="w-9 h-9 rounded-lg border border-ink-700 bg-ink-850 cursor-pointer shrink-0 transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                            />
                            <input
                              type="text"
                              value={displayValue}
                              disabled={isDisabled}
                              onChange={(e) => handleColorChange(key, e.target.value)}
                              className="min-w-0 flex-1 h-9 px-3 bg-ink-850 border border-ink-700 rounded-lg text-[12px] text-ink-200 font-mono focus:outline-none focus:border-accent transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Branding & Options */}
        <div className="lg:col-span-5 flex flex-col">
          <section className="space-y-4 flex-1 flex flex-col">
            <h3 className="text-[18px] font-bold tracking-tight text-ink-100">
              Branding del Local
            </h3>
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                {/* Local ID (Read-only) */}
                <div className="space-y-1.5">
                  <label className="text-[14px] font-semibold text-ink-100 block">
                    ID del Local
                  </label>
                  <input
                    type="text"
                    value={clubId}
                    disabled
                    className="w-full h-10 px-3.5 bg-ink-850/40 border border-ink-800 text-ink-500 rounded-lg text-sm cursor-not-allowed select-none font-mono"
                  />
                  <span className="text-[12px] text-ink-400/80 mt-1 block">Este ID es único para el local y no puede ser modificado.</span>
                </div>

                {/* Local Name (Read-only) */}
                <div className="space-y-1.5">
                  <label className="text-[14px] font-semibold text-ink-100 block">
                    Nombre del local
                  </label>
                  <input
                    type="text"
                    value={clubName}
                    disabled
                    className="w-full h-10 px-3.5 bg-ink-850/40 border border-ink-800 text-ink-500 rounded-lg text-sm cursor-not-allowed select-none"
                  />
                  <span className="text-[12px] text-ink-400/80 mt-1 block">El nombre del local está asignado por contrato y es estático.</span>
                </div>

                {/* Logo Type Selector */}
                <div className="space-y-2">
                  <label className="text-[14px] font-semibold text-ink-100 block">
                    Tipo de Logo
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-ink-950 border border-ink-850 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setUseLogoUrl(false)}
                      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        !useLogoUrl
                          ? isBosko ? "bg-accent text-ink-950" : "bg-blue text-ink-950"
                          : "text-ink-400 hover:text-ink-200"
                      }`}
                    >
                      <Type size={12} />
                      Texto Autogenerado
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseLogoUrl(true)}
                      className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        useLogoUrl
                          ? isBosko ? "bg-accent text-ink-950" : "bg-blue text-ink-950"
                          : "text-ink-400 hover:text-ink-200"
                      }`}
                    >
                      <ImageIcon size={12} />
                      URL de Imagen
                    </button>
                  </div>
                </div>

                {/* Dynamic logo inputs */}
                {useLogoUrl ? (
                  <div className="space-y-3.5 animate-in fade-in duration-200">
                    <div className="space-y-1.5">
                      <label htmlFor="logoUrlInput" className="text-[14px] font-semibold text-ink-100 block">
                        Logo URL (Imagen PNG/SVG)
                      </label>
                      <input
                        id="logoUrlInput"
                        type="text"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        className="w-full h-10 px-3.5 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none focus:border-accent transition-all duration-200"
                        placeholder="https://ejemplo.com/logo.png"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-baseline mb-1">
                        <label htmlFor="logoSizeInput" className="text-[14px] font-semibold text-ink-100">
                          Tamaño del Logo
                        </label>
                        <span className="font-mono text-xs text-ink-300">{logoSize}px</span>
                      </div>
                      <input
                        id="logoSizeInput"
                        type="range"
                        min="20"
                        max="150"
                        value={logoSize}
                        onChange={(e) => setLogoSize(Number(e.target.value))}
                        className="w-full h-2 bg-ink-950 rounded-lg appearance-none cursor-pointer accent-accent"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3.5 animate-in fade-in duration-200">
                    <div className="space-y-1.5">
                      <label htmlFor="logoTextInput" className="text-[14px] font-semibold text-ink-100 block">
                        Texto del Logo Autogenerado
                      </label>
                      <input
                        id="logoTextInput"
                        type="text"
                        value={textLogoValue}
                        onChange={(e) => setTextLogoValue(e.target.value)}
                        className="w-full h-10 px-3.5 bg-ink-850 border border-ink-700 rounded-lg text-sm text-ink-50 placeholder:text-ink-500 focus:outline-none focus:border-accent transition-all duration-200"
                        placeholder="ej. Bosko, Cocktrail"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-baseline mb-1">
                        <label htmlFor="textLogoSizeInput" className="text-[14px] font-semibold text-ink-100">
                          Tamaño de Fuente del Logo
                        </label>
                        <span className="font-mono text-xs text-ink-300">{textLogoSize}px</span>
                      </div>
                      <input
                        id="textLogoSizeInput"
                        type="range"
                        min="12"
                        max="80"
                        value={textLogoSize}
                        onChange={(e) => setTextLogoSize(Number(e.target.value))}
                        className="w-full h-2 bg-ink-950 rounded-lg appearance-none cursor-pointer accent-accent"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Save Button Centered */}
      <div className="flex flex-col items-center justify-center pt-2">
        <button
          type="button"
          onClick={saveAllConfig}
          disabled={saving || !isModified}
          className={`
            h-12 px-12 rounded-xl text-xs font-black uppercase tracking-[0.18em] transition-all duration-300 flex items-center gap-2.5 active:scale-[0.98] select-none
            ${isModified
              ? isBosko
                ? "ct-action-btn text-[#050d07] shadow-lg cursor-pointer"
                : "bg-blue hover:bg-blue-bright text-ink-950 shadow-[0_4px_25px_rgba(109,179,242,0.25)] cursor-pointer"
              : "bg-ink-850/50 border border-ink-800 text-ink-500 cursor-not-allowed opacity-50"
            }
          `}
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Guardando Cambios...
            </>
          ) : (
            <>
              <Check size={16} strokeWidth={2.5} />
              Guardar Configuración
            </>
          )}
        </button>
        {!isModified && (
          <span className="text-[10px] text-ink-550 mt-2">
            No has realizado modificaciones para guardar.
          </span>
        )}
      </div>

      {/* Real-time Preview Grid (La Carta Mockup) */}
      <section className="space-y-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-300">
          Vista Previa de la Carta en Vivo
        </h3>
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-6 flex items-center justify-center">
          {(() => {
            const resolvedColors = activeTheme === "bosko"
              ? (isDark
                ? { backgroundColor: "#013e37", surfaceColor: "#012b26", accentColor: "#fffeb3" }
                : { backgroundColor: "#fffef2", surfaceColor: "#ffffff", accentColor: "#013e37" }
              )
              : activeTheme === "normal"
              ? (isDark
                ? { backgroundColor: "#0b0914", surfaceColor: "#120e1e", accentColor: "#b89fd4" }
                : { backgroundColor: "#f8f7f9", surfaceColor: "#ffffff", accentColor: "#5e4074" }
              )
              : customColors;

            const textRgb = hexToRgb(resolvedColors.accentColor);
            const textPrimaryHex = lerpColor(isDark ? [255, 255, 255] : [28, 25, 23], textRgb, isDark ? 0.08 : 0.05);
            const isWebpLogo = logoUrl && logoUrl.toLowerCase().indexOf(".webp") !== -1;
            return (
              <div
                className="w-full max-w-lg border rounded-[32px] overflow-hidden shadow-2xl transition-all duration-300"
                style={{
                  backgroundColor: resolvedColors.backgroundColor,
                  borderColor: `${resolvedColors.accentColor}26`,
                  color: textPrimaryHex,
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {/* Header Mockup */}
                <header className="px-5 py-4 border-b flex items-center justify-between transition-all duration-300" style={{ borderColor: `${resolvedColors.accentColor}26`, backgroundColor: resolvedColors.backgroundColor }}>
                  {/* Dynamic Logo */}
                  <div className="flex items-center gap-2">
                    {useLogoUrl && logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoUrl}
                        alt="Logo"
                        className="object-contain"
                        style={{
                          height: `${logoSize * 1.55}px`,
                          width: "auto",
                          maxWidth: "200px",
                          filter: isWebpLogo && !isDark ? "brightness(0)" : "none",
                        }}
                      />
                    ) : (
                      <span
                        className="font-serif-italic font-black leading-none"
                        style={{ fontSize: `${textLogoSize * 1.55}px`, color: resolvedColors.accentColor }}
                      >
                        {textLogoValue || "Cocktrail"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ backgroundColor: "#10b981" }} />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#10b981" }} />
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: "#10b981" }}>
                      Carta Online
                    </span>
                  </div>
                </header>

                {/* Content Preview */}
                <div className="p-5 space-y-6">
                  {/* Promos Section */}
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <h2 className="text-[10px] uppercase tracking-[0.2em] font-black whitespace-nowrap" style={{ color: resolvedColors.accentColor }}>
                        Promos Especiales
                      </h2>
                      <span className="flex-1 h-px" style={{ backgroundColor: `${resolvedColors.accentColor}15` }} />
                    </div>

                    {/* featured Card matching screenshot */}
                    <div
                      className="relative aspect-[16/10] sm:aspect-[16/9] rounded-[24px] overflow-hidden border transition-all duration-300 group shadow-lg"
                      style={{
                        backgroundColor: resolvedColors.surfaceColor,
                        borderColor: `${resolvedColors.accentColor}26`,
                      }}
                    >
                      {/* Background Mockup Image */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/vodka.webp"
                        alt="Corona beer bucket"
                        className="absolute inset-0 w-full h-full object-cover opacity-80"
                      />
                      {/* Bottom Vignette Gradient */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                      {/* Badge */}
                      <span
                        className="absolute top-4 left-4 z-10 inline-flex items-center gap-1 border rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest backdrop-blur-md"
                        style={{
                          borderColor: `${resolvedColors.accentColor}60`,
                          color: resolvedColors.accentColor,
                          backgroundColor: `${resolvedColors.accentColor}15`,
                        }}
                      >
                        <Sparkles size={11} className="fill-current" /> Promo
                      </span>

                      {/* Bottom Content Overlay */}
                      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
                        <div className="flex flex-col gap-1 text-left">
                          <span className="text-base font-black text-white leading-tight drop-shadow">
                            Balde Corona 3x2
                          </span>
                          <span className="font-mono font-black text-lg drop-shadow transition-colors" style={{ color: resolvedColors.accentColor }}>
                            $300
                          </span>
                        </div>

                        {/* Round Add Button */}
                        <button
                          type="button"
                          className="w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-lg transition-all active:scale-90 cursor-pointer"
                          style={{
                            backgroundColor: "#10b981",
                            color: resolvedColors.backgroundColor,
                          }}
                        >
                          <Plus size={20} strokeWidth={3} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Regular item preview */}
                  <div
                    className="flex items-center justify-between p-3 rounded-2xl border transition-all"
                    style={{
                      borderColor: `${resolvedColors.accentColor}15`,
                      backgroundColor: `${resolvedColors.surfaceColor}80`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center border"
                        style={{ borderColor: `${resolvedColors.accentColor}15`, backgroundColor: resolvedColors.backgroundColor }}
                      >
                        <span style={{ color: `${resolvedColors.accentColor}50` }}>🍸</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm" style={{ color: textPrimaryHex }}>Fernet con Cola</span>
                        <span className="font-mono font-black text-sm" style={{ color: resolvedColors.accentColor }}>$4.500</span>
                      </div>
                    </div>
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: "#10b981", color: resolvedColors.backgroundColor }}
                    >
                      <Plus size={16} strokeWidth={3} />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <footer className="py-6 text-center opacity-30">
                  <p className="text-[9px] font-bold uppercase tracking-widest">Cocktrail Nightclub System</p>
                </footer>
              </div>
            );
          })()}
        </div>
      </section>

      {/* Save feedback toast */}
      {saved && (
        <div className="fixed bottom-6 right-6 bg-green-soft border border-green-line text-green px-4 py-2.5 rounded-xl text-[12px] font-medium flex items-center gap-2 shadow-2xl animate-in slide-in-from-bottom-4 z-50">
          <Check size={16} />
          Configuración guardada correctamente
        </div>
      )}
    </div>
  );
}
