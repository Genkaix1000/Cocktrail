"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useSSE } from "@/lib/useSSE";
import { apiFetch } from "@/services/api-client";
import { isDemoStatic } from "@/demo/store";
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

const DEFAULT_LOGO = "/miboliche-mark.svg";
const DEFAULT_NAME = "miBoliche";

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Variante que no explota si no hay ThemeProvider en el árbol (devuelve
 * `undefined` en vez de tirar). Pensada para componentes que necesitan un
 * fallback gracioso (ej. BrandLogo fuera del layout raíz) sin violar
 * react-hooks/rules-of-hooks con un try/catch alrededor de un hook.
 */
export function useThemeSafe() {
  return useContext(ThemeContext);
}

const getIsDarkKey = () => {
  let role = "public";
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    if (path.startsWith("/admin")) role = "admin";
    else if (path.startsWith("/caja")) role = "caja";
  }
  return `cocktrail_is_dark_${role}`;
};

function applyThemePayload(
  data: {
    theme?: string;
    customTheme?: CustomTheme | null;
    useLogoUrl?: boolean;
    logoUrl?: string;
    logoSize?: number;
    textLogoValue?: string;
    textLogoSize?: number;
  },
  setters: {
    setTheme: (t: Theme) => void;
    setCustomTheme: (c: CustomTheme | null) => void;
    setUseLogoUrl: (v: boolean) => void;
    setLogoUrl: (v: string) => void;
    setLogoSize: (v: number) => void;
    setTextLogoValue: (v: string) => void;
    setTextLogoSize: (v: number) => void;
  },
) {
  if (!data?.theme) return;
  const newTheme = data.theme as Theme;
  const customThemeData = data.customTheme ?? null;
  const logo = data.logoUrl || DEFAULT_LOGO;
  const name = data.textLogoValue || DEFAULT_NAME;

  setters.setTheme(newTheme);
  setters.setCustomTheme(customThemeData);
  setters.setUseLogoUrl(data.useLogoUrl !== false);
  setters.setLogoUrl(logo);
  setters.setLogoSize(Number(data.logoSize ?? 56));
  setters.setTextLogoValue(name);
  setters.setTextLogoSize(Number(data.textLogoSize ?? 26));

  localStorage.setItem("cocktrail_theme", newTheme);
  localStorage.setItem("cocktrail_use_logo_url", String(data.useLogoUrl !== false));
  localStorage.setItem("cocktrail_logo_url", logo);
  localStorage.setItem("cocktrail_logo_size", String(data.logoSize ?? 56));
  localStorage.setItem("cocktrail_text_logo_value", name);
  localStorage.setItem("cocktrail_text_logo_size", String(data.textLogoSize ?? 26));
  if (customThemeData) {
    localStorage.setItem("cocktrail_custom_theme", JSON.stringify(customThemeData));
  } else {
    localStorage.removeItem("cocktrail_custom_theme");
  }
}

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>("miboliche");
  const [customTheme, setCustomTheme] = useState<CustomTheme | null>(null);
  const [useLogoUrl, setUseLogoUrl] = useState<boolean>(true);
  const [logoUrl, setLogoUrl] = useState<string>(DEFAULT_LOGO);
  const [logoSize, setLogoSize] = useState<number>(56);
  const [textLogoValue, setTextLogoValue] = useState<string>(DEFAULT_NAME);
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

  useEffect(() => {
    const cached = (localStorage.getItem("cocktrail_theme") || "miboliche") as Theme;
    const cachedCustom = localStorage.getItem("cocktrail_custom_theme");
    const customThemeVal = cachedCustom ? JSON.parse(cachedCustom) : null;

    const cachedUseLogo = localStorage.getItem("cocktrail_use_logo_url") !== "false";
    const cachedLogoUrl = localStorage.getItem("cocktrail_logo_url") || DEFAULT_LOGO;
    const cachedLogoSize = Number(localStorage.getItem("cocktrail_logo_size") || "56");
    const cachedTextLogo = localStorage.getItem("cocktrail_text_logo_value") || DEFAULT_NAME;
    const cachedTextLogoSize = Number(localStorage.getItem("cocktrail_text_logo_size") || "26");

    const key = getIsDarkKey();
    const cachedIsDark = localStorage.getItem(key) !== "false";

    if (cached) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde localStorage
      setTheme(cached);
    }
    if (customThemeVal) setCustomTheme(customThemeVal);
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

    // Demo: forzar marca miBoliche (pisa cache Bosko del localStorage).
    if (isDemoStatic()) {
      localStorage.setItem("cocktrail_theme", "miboliche");
      localStorage.setItem("cocktrail_logo_url", DEFAULT_LOGO);
      localStorage.setItem("cocktrail_text_logo_value", DEFAULT_NAME);
      localStorage.setItem("cocktrail_use_logo_url", "true");
      setTheme("miboliche");
      setLogoUrl(DEFAULT_LOGO);
      setTextLogoValue(DEFAULT_NAME);
      setUseLogoUrl(true);
      return;
    }

    apiFetch<{
      theme?: string;
      customTheme?: CustomTheme | null;
      useLogoUrl?: boolean;
      logoUrl?: string;
      logoSize?: number;
      textLogoValue?: string;
      textLogoSize?: number;
    }>("/api/theme")
      .then((data) => {
        applyThemePayload(data, {
          setTheme,
          setCustomTheme,
          setUseLogoUrl,
          setLogoUrl,
          setLogoSize,
          setTextLogoValue,
          setTextLogoSize,
        });
      })
      .catch((err) => {
        console.error("Error loading theme from API:", err);
      });
  }, []);

  useSSE({
    "theme.changed": (data) => {
      applyThemePayload(data, {
        setTheme,
        setCustomTheme,
        setUseLogoUrl,
        setLogoUrl,
        setLogoSize,
        setTextLogoValue,
        setTextLogoSize,
      });
    },
  });

  return (
    <ThemeContext.Provider
      value={{
        theme,
        useLogoUrl,
        logoUrl,
        logoSize,
        textLogoValue,
        textLogoSize,
        isDark,
        toggleDark,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
