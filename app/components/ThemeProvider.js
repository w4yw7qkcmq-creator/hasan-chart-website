"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSafeTheme, resolveThemeColor, writeThemeCookie } from "../../lib/theme-shared";

const ThemeContext = createContext(null);

function syncThemeColorMeta(theme) {
  const color = resolveThemeColor(theme);
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');

  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }

  meta.setAttribute("content", color);
}

function readPrepaintTheme() {
  if (typeof document === "undefined") {
    return "dark";
  }

  return getSafeTheme(document.documentElement.getAttribute("data-theme"));
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readPrepaintTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    syncThemeColorMeta(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "light" ? "dark" : "light";
      writeThemeCookie(nextTheme);
      void fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: nextTheme }),
      });
      document.documentElement.setAttribute("data-theme", nextTheme);
      syncThemeColorMeta(nextTheme);
      return nextTheme;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      initialTheme: theme,
      themeReady: true,
      toggleTheme,
    }),
    [theme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
