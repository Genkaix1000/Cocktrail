"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useSSE } from "@/lib/useSSE";
import type { Theme, CustomTheme } from "@cocktrail/shared";

type ThemeContextType = {
  theme: Theme;
  useLogoUrl: boolean;
  logoUrl: string;
  logoSize: number;
  textLogoValue: string;
  textLogoSize: number;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/** Parse a hex color to [r,g,b] */
const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
};

/** Interpolate between two [r,g,b] at t (0→1) and return hex */
const lerpColor = (a: [number, number, number], b: [number, number, number], t: number): string => {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
};

/** All CSS custom properties that we manage */
const MANAGED_VARS = [
  "--ink-950", "--ink-925", "--ink-900", "--ink-850", "--ink-800", "--ink-750",
  "--ink-700", "--ink-600", "--ink-500", "--ink-400", "--ink-300", "--ink-200", "--ink-100", "--ink-50",
  "--primary-base", "--primary-soft", "--primary-line",
  "--accent-base", "--accent-soft", "--accent-line", "--accent-border",
  "--success-base", "--success-soft", "--success-line",
  "--danger-base", "--danger-soft", "--danger-line",
] as const;

const clearCustomVars = () => {
  for (const v of MANAGED_VARS) {
    document.documentElement.style.removeProperty(v);
  }
};

const applyThemeColors = (theme: Theme, customTheme: CustomTheme | null) => {
  if (theme === "bosko") {
    document.documentElement.setAttribute("data-theme", "bosko");
    clearCustomVars();
  } else if (theme === "custom" && customTheme) {
    document.documentElement.setAttribute("data-theme", "custom");

    const bg = hexToRgb(customTheme.background);
    const text = hexToRgb(customTheme.textColor || "#f1ede2");
    const card = hexToRgb(customTheme.cardBg);
    const border = hexToRgb(customTheme.borders);

    // Derive the full ink scale via interpolation: bg → borders → text
    // 950=bg, 900=card, 700=borders, 50=text. Interpolate the rest.
    const el = document.documentElement.style;
    el.setProperty("--ink-950", customTheme.background);
    el.setProperty("--ink-925", lerpColor(bg, card, 0.33));
    el.setProperty("--ink-900", customTheme.cardBg);
    el.setProperty("--ink-850", lerpColor(card, border, 0.25));
    el.setProperty("--ink-800", lerpColor(card, border, 0.5));
    el.setProperty("--ink-750", lerpColor(card, border, 0.75));
    el.setProperty("--ink-700", customTheme.borders);
    el.setProperty("--ink-600", lerpColor(border, text, 0.15));
    el.setProperty("--ink-500", lerpColor(border, text, 0.28));
    el.setProperty("--ink-400", lerpColor(border, text, 0.42));
    el.setProperty("--ink-300", lerpColor(border, text, 0.58));
    el.setProperty("--ink-200", lerpColor(border, text, 0.72));
    el.setProperty("--ink-100", lerpColor(border, text, 0.86));
    el.setProperty("--ink-50", customTheme.textColor || "#f1ede2");

    // Primary
    el.setProperty("--primary-base", customTheme.primary);
    el.setProperty("--primary-soft", `${customTheme.primary}24`);
    el.setProperty("--primary-line", `${customTheme.primary}48`);

    // Accent
    el.setProperty("--accent-base", customTheme.accent);
    el.setProperty("--accent-soft", `${customTheme.accent}24`);
    el.setProperty("--accent-line", `${customTheme.accent}48`);
    el.setProperty("--accent-border", `${customTheme.accent}80`);

    // Success
    const success = customTheme.success || "#34d399";
    el.setProperty("--success-base", success);
    el.setProperty("--success-soft", `${success}24`);
    el.setProperty("--success-line", `${success}48`);

    // Danger
    const danger = customTheme.danger || "#ef4444";
    el.setProperty("--danger-base", danger);
    el.setProperty("--danger-soft", `${danger}24`);
    el.setProperty("--danger-line", `${danger}48`);
  } else {
    document.documentElement.removeAttribute("data-theme");
    clearCustomVars();
  }
};

export function ThemeProvider({
  children,
  initialTheme
}: {
  children: React.ReactNode;
  initialTheme: Theme;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [useLogoUrl, setUseLogoUrl] = useState<boolean>(false);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [logoSize, setLogoSize] = useState<number>(40);
  const [textLogoValue, setTextLogoValue] = useState<string>("Cocktrail");
  const [textLogoSize, setTextLogoSize] = useState<number>(26);

  // Cargar localmente al montar para evitar delay y consultar al backend
  useEffect(() => {
    // 1. Cargar desde localStorage si existe
    const cached = localStorage.getItem("cocktrail_theme") as Theme;
    const cachedCustom = localStorage.getItem("cocktrail_custom_theme");
    const customTheme = cachedCustom ? JSON.parse(cachedCustom) : null;
    
    const cachedUseLogo = localStorage.getItem("cocktrail_use_logo_url") === "true";
    const cachedLogoUrl = localStorage.getItem("cocktrail_logo_url") || "";
    const cachedLogoSize = Number(localStorage.getItem("cocktrail_logo_size") || "40");
    const cachedTextLogo = localStorage.getItem("cocktrail_text_logo_value") || "Cocktrail";
    const cachedTextLogoSize = Number(localStorage.getItem("cocktrail_text_logo_size") || "26");

    if (cached) {
      setTheme(cached);
      applyThemeColors(cached, customTheme);
    }
    setUseLogoUrl(cachedUseLogo);
    setLogoUrl(cachedLogoUrl);
    setLogoSize(cachedLogoSize);
    setTextLogoValue(cachedTextLogo);
    setTextLogoSize(cachedTextLogoSize);

    // 2. Sincronizar con el backend
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
    fetch(`${apiBase}/api/theme`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch theme");
        return res.json();
      })
      .then((data) => {
        if (data && data.theme) {
          const newTheme = data.theme;
          const customTheme = data.customTheme;
          
          setTheme(newTheme);
          setUseLogoUrl(Boolean(data.useLogoUrl));
          setLogoUrl(data.logoUrl || "");
          setLogoSize(Number(data.logoSize ?? 40));
          setTextLogoValue(data.textLogoValue || "Cocktrail");
          setTextLogoSize(Number(data.textLogoSize ?? 26));

          localStorage.setItem("cocktrail_theme", newTheme);
          localStorage.setItem("cocktrail_use_logo_url", String(Boolean(data.useLogoUrl)));
          localStorage.setItem("cocktrail_logo_url", data.logoUrl || "");
          localStorage.setItem("cocktrail_logo_size", String(data.logoSize ?? 40));
          localStorage.setItem("cocktrail_text_logo_value", data.textLogoValue || "Cocktrail");
          localStorage.setItem("cocktrail_text_logo_size", String(data.textLogoSize ?? 26));

          if (customTheme) {
            localStorage.setItem("cocktrail_custom_theme", JSON.stringify(customTheme));
          } else {
            localStorage.removeItem("cocktrail_custom_theme");
          }
          applyThemeColors(newTheme, customTheme);
        }
      })
      .catch((err) => {
        console.error("Error loading theme from API:", err);
      });
  }, []);

  useSSE({
    "theme.changed": (data) => {
      const typedTheme = data.theme as Theme;
      const customTheme = data.customTheme;
      
      setTheme(typedTheme);
      setUseLogoUrl(Boolean(data.useLogoUrl));
      setLogoUrl(data.logoUrl || "");
      setLogoSize(Number(data.logoSize ?? 40));
      setTextLogoValue(data.textLogoValue || "Cocktrail");
      setTextLogoSize(Number(data.textLogoSize ?? 26));

      localStorage.setItem("cocktrail_theme", typedTheme);
      localStorage.setItem("cocktrail_use_logo_url", String(Boolean(data.useLogoUrl)));
      localStorage.setItem("cocktrail_logo_url", data.logoUrl || "");
      localStorage.setItem("cocktrail_logo_size", String(data.logoSize ?? 40));
      localStorage.setItem("cocktrail_text_logo_value", data.textLogoValue || "Cocktrail");
      localStorage.setItem("cocktrail_text_logo_size", String(data.textLogoSize ?? 26));

      if (customTheme) {
        localStorage.setItem("cocktrail_custom_theme", JSON.stringify(customTheme));
      } else {
        localStorage.removeItem("cocktrail_custom_theme");
      }
      applyThemeColors(typedTheme, customTheme || null);
    }
  });

  return (
    <ThemeContext.Provider value={{ theme, useLogoUrl, logoUrl, logoSize, textLogoValue, textLogoSize }}>
      {children}
    </ThemeContext.Provider>
  );
}
