"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSafeTheme, writeThemeCookie } from "../../lib/theme-shared";

const ThemeContext = createContext(null);
const THEME_REVEAL_TIMEOUT_MS = 2500;

function markThemeReady() {
  const root = document.documentElement;
  root.classList.remove("theme-pending");
  root.classList.add("theme-ready");

  const loader = document.getElementById("theme-boot-loader");
  if (loader) {
    loader.setAttribute("aria-busy", "false");
  }
}

function isThemeAlreadyReady() {
  return document.documentElement.classList.contains("theme-ready");
}

export function ThemeProvider({ children, initialTheme = "dark" }) {
  const resolvedInitialTheme = getSafeTheme(initialTheme);
  const [theme, setTheme] = useState(() => resolvedInitialTheme);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (isThemeAlreadyReady()) {
      setThemeReady(true);
      return undefined;
    }

    let revealed = false;

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      markThemeReady();
      setThemeReady(true);
    };

    if (document.readyState === "complete") {
      requestAnimationFrame(() => {
        requestAnimationFrame(reveal);
      });
    } else {
      window.addEventListener("load", reveal, { once: true });
      requestAnimationFrame(() => {
        requestAnimationFrame(reveal);
      });
    }

    const fallbackTimer = window.setTimeout(reveal, THEME_REVEAL_TIMEOUT_MS);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("load", reveal);
    };
  }, []);

  const toggleTheme = () => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "light" ? "dark" : "light";
      writeThemeCookie(nextTheme);
      void fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: nextTheme }),
      });
      document.documentElement.setAttribute("data-theme", nextTheme);
      return nextTheme;
    });
  };

  return (
    <ThemeContext.Provider
      value={{ theme, initialTheme: resolvedInitialTheme, themeReady, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
