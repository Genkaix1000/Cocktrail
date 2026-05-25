"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useSSE } from "@/lib/useSSE";
import type { Theme } from "@/types/domain";

type ThemeContextType = {
  theme: Theme;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export function ThemeProvider({ 
  children,
  initialTheme
}: { 
  children: React.ReactNode;
  initialTheme: Theme;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // Fallback initial paint para asegurar que el DOM coincida con el servidor
  useEffect(() => {
    if (initialTheme === "bosko") {
      document.documentElement.setAttribute("data-theme", "bosko");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [initialTheme]);

  useSSE({
    "theme.changed": ({ theme: newTheme }) => {
      setTheme(newTheme as Theme);
      if (newTheme === "bosko") {
        document.documentElement.setAttribute("data-theme", "bosko");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    }
  });

  return (
    <ThemeContext.Provider value={{ theme }}>
      {children}
    </ThemeContext.Provider>
  );
}
