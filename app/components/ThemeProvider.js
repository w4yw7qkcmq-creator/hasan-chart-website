"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSafeTheme, writeThemeCookie } from "../../lib/theme-shared";

const ThemeContext = createContext(null);

function markThemeReady() {
  const root = document.documentElement;
  root.classList.remove("theme-pending");
  root.classList.add("theme-ready");
}

export function ThemeProvider({ children, initialTheme = "dark" }) {
  const [theme, setTheme] = useState(() => getSafeTheme(initialTheme));
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);

    let revealed = false;

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      markThemeReady();
      setThemeReady(true);
    };

    const frameId = requestAnimationFrame(() => {
      requestAnimationFrame(reveal);
    });

    // Safety net: never leave the boot loader stuck if rAF/load handlers fail.
    const fallbackTimer = window.setTimeout(reveal, 1500);

    window.addEventListener("load", reveal, { once: true });

    return () => {
      cancelAnimationFrame(frameId);
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
    <ThemeContext.Provider value={{ theme, themeReady, toggleTheme }}>
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
