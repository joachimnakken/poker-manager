"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppTheme = "color" | "noir";

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
  persist((set) => ({ theme: "color", setTheme: (theme) => set({ theme }) }), {
    name: "poker-theme",
  }),
);
