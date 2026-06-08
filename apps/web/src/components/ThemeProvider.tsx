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

const applyThemeColors = (theme: Theme, customTheme: CustomTheme | null) => {
  if (theme === "bosko") {
    document.documentElement.setAttribute("data-theme", "bosko");
    // Clear custom colors
    document.documentElement.style.removeProperty("--ink-950");
    document.documentElement.style.removeProperty("--ink-900");
    document.documentElement.style.removeProperty("--ink-700");
    document.documentElement.style.removeProperty("--primary-base");
    document.documentElement.style.removeProperty("--primary-soft");
    document.documentElement.style.removeProperty("--primary-line");
    document.documentElement.style.removeProperty("--accent-base");
    document.documentElement.style.removeProperty("--accent-soft");
    document.documentElement.style.removeProperty("--accent-line");
    document.documentElement.style.removeProperty("--accent-border");
  } else if (theme === "custom" && customTheme) {
    document.documentElement.setAttribute("data-theme", "custom");
    document.documentElement.style.setProperty("--ink-950", customTheme.background);
    document.documentElement.style.setProperty("--ink-900", customTheme.cardBg);
    document.documentElement.style.setProperty("--ink-700", customTheme.borders);
    document.documentElement.style.setProperty("--primary-base", customTheme.primary);
    document.documentElement.style.setProperty("--accent-base", customTheme.accent);

    // Calculate secondary transparent overlays
    document.documentElement.style.setProperty("--primary-soft", `${customTheme.primary}24`);
    document.documentElement.style.setProperty("--primary-line", `${customTheme.primary}48`);
    document.documentElement.style.setProperty("--accent-soft", `${customTheme.accent}24`);
    document.documentElement.style.setProperty("--accent-line", `${customTheme.accent}48`);
    document.documentElement.style.setProperty("--accent-border", `${customTheme.accent}80`);
  } else {
    document.documentElement.removeAttribute("data-theme");
    // Clear custom colors
    document.documentElement.style.removeProperty("--ink-950");
    document.documentElement.style.removeProperty("--ink-900");
    document.documentElement.style.removeProperty("--ink-700");
    document.documentElement.style.removeProperty("--primary-base");
    document.documentElement.style.removeProperty("--primary-soft");
    document.documentElement.style.removeProperty("--primary-line");
    document.documentElement.style.removeProperty("--accent-base");
    document.documentElement.style.removeProperty("--accent-soft");
    document.documentElement.style.removeProperty("--accent-line");
    document.documentElement.style.removeProperty("--accent-border");
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
