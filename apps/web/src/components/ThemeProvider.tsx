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

const applyThemeColors = () => {
  document.documentElement.setAttribute("data-theme", "bosko");
  clearCustomVars();
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
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>("bosko");
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(null);
  const [useLogoUrl, setUseLogoUrl] = useState<boolean>(true);
  const [logoUrl, setLogoUrl] = useState<string>("/bosko.webp");
  const [logoSize, setLogoSize] = useState<number>(56);
  const [textLogoValue, setTextLogoValue] = useState<string>("Bosko");
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
    applyThemeColors();
  }, [theme, customTheme, isDark]);

  // Cargar localmente al montar para evitar delay y consultar al backend
  useEffect(() => {
    // 1. Cargar desde localStorage si existe
    const cached = (localStorage.getItem("cocktrail_theme") || "bosko") as Theme;
    const cachedCustom = localStorage.getItem("cocktrail_custom_theme");
    const customThemeVal = cachedCustom ? JSON.parse(cachedCustom) : null;
    
    const cachedUseLogo = localStorage.getItem("cocktrail_use_logo_url") !== "false";
    const cachedLogoUrl = localStorage.getItem("cocktrail_logo_url") || "/bosko.webp";
    const cachedLogoSize = Number(localStorage.getItem("cocktrail_logo_size") || "56");
    const cachedTextLogo = localStorage.getItem("cocktrail_text_logo_value") || "Bosko";
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
          setUseLogoUrl(data.useLogoUrl !== false);
          setLogoUrl(data.logoUrl || "/bosko.webp");
          setLogoSize(Number(data.logoSize ?? 56));
          setTextLogoValue(data.textLogoValue || "Bosko");
          setTextLogoSize(Number(data.textLogoSize ?? 26));

          localStorage.setItem("cocktrail_theme", newTheme);
          localStorage.setItem("cocktrail_use_logo_url", String(data.useLogoUrl !== false));
          localStorage.setItem("cocktrail_logo_url", data.logoUrl || "/bosko.webp");
          localStorage.setItem("cocktrail_logo_size", String(data.logoSize ?? 56));
          localStorage.setItem("cocktrail_text_logo_value", data.textLogoValue || "Bosko");
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
      setUseLogoUrl(data.useLogoUrl !== false);
      setLogoUrl(data.logoUrl || "/bosko.webp");
      setLogoSize(Number(data.logoSize ?? 56));
      setTextLogoValue(data.textLogoValue || "Bosko");
      setTextLogoSize(Number(data.textLogoSize ?? 26));

      localStorage.setItem("cocktrail_theme", typedTheme);
      localStorage.setItem("cocktrail_use_logo_url", String(data.useLogoUrl !== false));
      localStorage.setItem("cocktrail_logo_url", data.logoUrl || "/bosko.webp");
      localStorage.setItem("cocktrail_logo_size", String(data.logoSize ?? 56));
      localStorage.setItem("cocktrail_text_logo_value", data.textLogoValue || "Bosko");
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
