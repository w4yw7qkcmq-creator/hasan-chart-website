"use client";

import { createContext, useContext } from "react";

const NewsListContext = createContext(null);

export function NewsListProvider({ value, children }) {
  return <NewsListContext.Provider value={value}>{children}</NewsListContext.Provider>;
}

export function useNewsListControls() {
  const context = useContext(NewsListContext);
  if (!context) {
    throw new Error("useNewsListControls must be used within NewsListProvider");
  }

  return context;
}
