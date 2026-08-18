"use client";

import { useEffect } from "react";
import { useAppTheme } from "@/store/use-theme";
import { cn } from "@/lib/utils";

/**
 * Rendered once from the root layout, so every page gets the same corner pill.
 * The `.theme-color` class on <html> is what recolors the semantic tokens.
 */
export function ThemeToggle() {
  const theme = useAppTheme((s) => s.theme);
  const setTheme = useAppTheme((s) => s.setTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("theme-color", theme === "color");
  }, [theme]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex rounded-full border border-white/20 bg-black/20 overflow-hidden opacity-30 hover:opacity-100 transition-opacity">
      {(["color", "noir"] as const).map((name) => (
        <button
          key={name}
          onClick={() => setTheme(name)}
          className={cn(
            "px-3 py-1 text-xs uppercase tracking-wider",
            theme === name ? "bg-white/25 text-white" : "text-white/60",
          )}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
