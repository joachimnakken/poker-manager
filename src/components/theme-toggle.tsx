"use client";

import { useEffect } from "react";
import { APP_THEMES, useAppTheme, type AppTheme } from "@/store/use-theme";
import { cn } from "@/lib/utils";

/** One dot per theme, previewing its palette. Noir has no html class — it is the base. */
const SWATCHES: Record<AppTheme, string> = {
  sunset: "linear-gradient(135deg, #8b5cf6, #ec4899 55%, #f97316)",
  felt: "linear-gradient(135deg, #065f46, #16a34a 60%, #facc15)",
  ocean: "linear-gradient(135deg, #1e40af, #0284c7 55%, #22d3ee)",
  ember: "linear-gradient(135deg, #7f1d1d, #dc2626 55%, #f59e0b)",
  noir: "linear-gradient(135deg, #09090b, #52525b)",
};

/**
 * Rendered once from the root layout, so every page gets the same corner pill.
 * The `theme-*` class on <html> is what recolors the semantic tokens.
 */
export function ThemeToggle() {
  const theme = useAppTheme((s) => s.theme);
  const setTheme = useAppTheme((s) => s.setTheme);

  useEffect(() => {
    const html = document.documentElement;
    for (const name of APP_THEMES) {
      html.classList.remove(`theme-${name}`);
    }
    if (theme !== "noir") {
      html.classList.add(`theme-${theme}`);
    }
  }, [theme]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-white/20 bg-black/25 px-3 py-2 opacity-40 hover:opacity-100 transition-opacity">
      {APP_THEMES.map((name) => (
        <button
          key={name}
          onClick={() => setTheme(name)}
          title={name}
          aria-label={`${name} theme`}
          className={cn(
            "w-5 h-5 rounded-full transition-transform",
            theme === name
              ? "ring-2 ring-white ring-offset-2 ring-offset-black/50 scale-110"
              : "opacity-80 hover:scale-110",
          )}
          style={{ background: SWATCHES[name] }}
        />
      ))}
    </div>
  );
}
