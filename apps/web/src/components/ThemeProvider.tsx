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
  isDark: boolean;
  toggleDark: () => void;
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
  "--bg-primary", "--bg-surface", "--text-accent", "--text-primary",
  "--ink-950", "--ink-925", "--ink-900", "--ink-850", "--ink-800", "--ink-750",
  "--ink-700", "--ink-600", "--ink-500", "--ink-450", "--ink-400", "--ink-300", "--ink-200", "--ink-100", "--ink-50",
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

const applyThemeColors = (theme: Theme, customTheme: CustomTheme | null, isDark: boolean) => {
  if (theme === "bosko") {
    document.documentElement.setAttribute("data-theme", "bosko");
    clearCustomVars();
  } else if (theme === "custom" && customTheme) {
    document.documentElement.setAttribute("data-theme", "custom");

    const bgHexCustom = customTheme.backgroundColor;
    const surfaceHexCustom = customTheme.surfaceColor;
    const accentHexCustom = customTheme.accentColor;

    const bgCustom = hexToRgb(bgHexCustom);
    const surfaceCustom = hexToRgb(surfaceHexCustom);
    const accentCustom = hexToRgb(accentHexCustom);

    // If day mode (isDark = false), we dynamically generate a matching light theme out of custom colors
    const bg: [number, number, number] = isDark ? bgCustom : hexToRgb(lerpColor([255, 255, 255], accentCustom, 0.08));
    const card: [number, number, number] = isDark ? surfaceCustom : [255, 255, 255];
    const text: [number, number, number] = isDark ? accentCustom : hexToRgb(lerpColor(accentCustom, [0, 0, 0], 0.40));

    const bgHex = isDark ? bgHexCustom : lerpColor([255, 255, 255], accentCustom, 0.08);
    const surfaceHex = isDark ? surfaceHexCustom : "#ffffff";
    const accentHex = isDark ? accentHexCustom : lerpColor(accentCustom, [0, 0, 0], 0.40);

    // Derive primary text color: 8% accent into white for dark, 5% accent into Stone-900 for light
    const textPrimary = isDark 
      ? hexToRgb(lerpColor([255, 255, 255], text, 0.08))
      : hexToRgb(lerpColor([28, 25, 23], text, 0.05));
    const textPrimaryHex = lerpColor(isDark ? [255, 255, 255] : [28, 25, 23], text, isDark ? 0.08 : 0.05);

    // Derive a mid-gray border by mixing 20% accent into surface
    const borderHex = lerpColor(card, text, 0.20);
    const border = hexToRgb(borderHex);

    const el = document.documentElement.style;

    // Semantic variables
    el.setProperty("--bg-primary", bgHex);
    el.setProperty("--bg-surface", surfaceHex);
    el.setProperty("--text-accent", accentHex);
    el.setProperty("--text-primary", textPrimaryHex);

    // Ink scale
    el.setProperty("--ink-950", bgHex);
    el.setProperty("--ink-925", lerpColor(bg, card, 0.40));
    el.setProperty("--ink-900", surfaceHex);

    // Ultra-subtle borders (4%–22% accent into surface)
    el.setProperty("--ink-850", lerpColor(card, border, 0.04));
    el.setProperty("--ink-800", lerpColor(card, border, 0.09));
    el.setProperty("--ink-750", lerpColor(card, border, 0.15));
    el.setProperty("--ink-700", lerpColor(card, border, 0.22));

    // Muted text range
    el.setProperty("--ink-600", lerpColor(card, textPrimary, 0.35));
    el.setProperty("--ink-500", lerpColor(card, textPrimary, 0.50));
    el.setProperty("--ink-450", lerpColor(card, textPrimary, isDark ? 0.60 : 0.58));
    el.setProperty("--ink-400", lerpColor(card, textPrimary, isDark ? 0.70 : 0.65));

    // Strong text range
    if (isDark) {
      el.setProperty("--ink-300", lerpColor(textPrimary, [255, 255, 255], 0.85));
      el.setProperty("--ink-200", lerpColor(textPrimary, [255, 255, 255], 0.92));
      el.setProperty("--ink-100", lerpColor(textPrimary, [255, 255, 255], 0.97));
    } else {
      el.setProperty("--ink-300", lerpColor(card, textPrimary, 0.80));
      el.setProperty("--ink-200", lerpColor(card, textPrimary, 0.90));
      el.setProperty("--ink-100", lerpColor(card, textPrimary, 0.96));
    }
    el.setProperty("--ink-50", textPrimaryHex);

    // Primary
    el.setProperty("--primary-base", accentHex);
    el.setProperty("--primary-soft", `${accentHex}1a`);
    el.setProperty("--primary-line", `${accentHex}33`);

    // Accent
    el.setProperty("--accent-base", accentHex);
    el.setProperty("--accent-soft", `${accentHex}1a`);
    el.setProperty("--accent-line", `${accentHex}33`);
    el.setProperty("--accent-border", `${accentHex}59`);

    // Static Success and Danger for custom mode
    const success = "#10b981";
    el.setProperty("--success-base", success);
    el.setProperty("--success-soft", `${success}1f`);
    el.setProperty("--success-line", `${success}40`);

    const danger = "#ef4444";
    el.setProperty("--danger-base", danger);
    el.setProperty("--danger-soft", `${danger}1f`);
    el.setProperty("--danger-line", `${danger}40`);
  } else {
    document.documentElement.removeAttribute("data-theme");
    clearCustomVars();
  }
};

const getIsDarkKey = () => {
  let role = "public";
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    if (path.startsWith("/admin")) role = "admin";
    else if (path.startsWith("/caja")) role = "caja";
    else if (path.startsWith("/barra")) role = "barra";
  }
  return `cocktrail_is_dark_${role}`;
};

export function ThemeProvider({
  children,
  initialTheme
}: {
  children: React.ReactNode;
  initialTheme: Theme;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(null);
  const [useLogoUrl, setUseLogoUrl] = useState<boolean>(false);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [logoSize, setLogoSize] = useState<number>(40);
  const [textLogoValue, setTextLogoValue] = useState<string>("Cocktrail");
  const [textLogoSize, setTextLogoSize] = useState<number>(26);
  const [isDark, setIsDark] = useState<boolean>(true);

  const toggleDark = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    const key = getIsDarkKey();
    localStorage.setItem(key, String(nextDark));
    if (nextDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Re-run whenever theme, customTheme or isDark changes
  useEffect(() => {
    applyThemeColors(theme, customTheme, isDark);
  }, [theme, customTheme, isDark]);

  // Cargar localmente al montar para evitar delay y consultar al backend
  useEffect(() => {
    // 1. Cargar desde localStorage si existe
    const cached = localStorage.getItem("cocktrail_theme") as Theme;
    const cachedCustom = localStorage.getItem("cocktrail_custom_theme");
    const customThemeVal = cachedCustom ? JSON.parse(cachedCustom) : null;
    
    const cachedUseLogo = localStorage.getItem("cocktrail_use_logo_url") === "true";
    const cachedLogoUrl = localStorage.getItem("cocktrail_logo_url") || "";
    const cachedLogoSize = Number(localStorage.getItem("cocktrail_logo_size") || "40");
    const cachedTextLogo = localStorage.getItem("cocktrail_text_logo_value") || "Cocktrail";
    const cachedTextLogoSize = Number(localStorage.getItem("cocktrail_text_logo_size") || "26");
    
    const key = getIsDarkKey();
    const cachedIsDark = localStorage.getItem(key) !== "false"; // Default true

    if (cached) {
      setTheme(cached);
    }
    if (customThemeVal) {
      setCustomTheme(customThemeVal);
    }
    setUseLogoUrl(cachedUseLogo);
    setLogoUrl(cachedLogoUrl);
    setLogoSize(cachedLogoSize);
    setTextLogoValue(cachedTextLogo);
    setTextLogoSize(cachedTextLogoSize);
    
    setIsDark(cachedIsDark);
    if (cachedIsDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

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
          const customThemeData = data.customTheme;
          
          setTheme(newTheme);
          setCustomTheme(customThemeData || null);
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

          if (customThemeData) {
            localStorage.setItem("cocktrail_custom_theme", JSON.stringify(customThemeData));
          } else {
            localStorage.removeItem("cocktrail_custom_theme");
          }
        }
      })
      .catch((err) => {
        console.error("Error loading theme from API:", err);
      });
  }, []);

  useSSE({
    "theme.changed": (data) => {
      const typedTheme = data.theme as Theme;
      const customThemeData = data.customTheme;
      
      setTheme(typedTheme);
      setCustomTheme(customThemeData || null);
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

      if (customThemeData) {
        localStorage.setItem("cocktrail_custom_theme", JSON.stringify(customThemeData));
      } else {
        localStorage.removeItem("cocktrail_custom_theme");
      }
    }
  });

  return (
    <ThemeContext.Provider value={{ theme, useLogoUrl, logoUrl, logoSize, textLogoValue, textLogoSize, isDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}
