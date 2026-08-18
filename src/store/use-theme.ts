"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const APP_THEMES = ["sunset", "felt", "ocean", "ember", "noir"] as const;

export type AppTheme = (typeof APP_THEMES)[number];

interface ThemeState {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}

/**
 * One theme for the whole service — home, host, settings, phone and projector all
 * read the same value. Per device on purpose: the projector can run noir while a
 * player's phone stays colorful.
 */
export const useAppTheme = create<ThemeState>()(
  persist((set) => ({ theme: "sunset", setTheme: (theme) => set({ theme }) }), {
    name: "poker-theme",
    version: 1,
    // v0 had exactly two themes, "color" and "noir"; "color" became "sunset".
    migrate: (persisted) => {
      const theme = (persisted as { theme?: string })?.theme;
      return { theme: theme === "noir" ? "noir" : "sunset" } as ThemeState;
    },
  }),
);
