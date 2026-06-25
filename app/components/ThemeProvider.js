"use client";

import { createContext, useContext, useState } from "react";
import { getSafeTheme, writeThemeCookie } from "../../lib/theme-shared";

const ThemeContext = createContext(null);

export function ThemeProvider({ children, initialTheme = "dark" }) {
  const [theme, setTheme] = useState(() => getSafeTheme(initialTheme));

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
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
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
