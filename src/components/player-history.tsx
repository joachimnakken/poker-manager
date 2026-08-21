"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const ENTRY_KEY = "player-entry";

/**
 * Records the first player screen of this session, so `PlayerBack` can tell a navigation
 * from a cold launch: if you are still on the screen the app opened at, there is nothing
 * in-app behind you.
 *
 * `window.history.length` cannot answer that — it counts entries from before the app was
 * ever opened, so it reads greater than one on a fresh launch and `router.back()` then
 * leaves the app for whatever the tab showed before, or a blank page.
 *
 * Deliberately a remembered path rather than a counter: effects run twice in development,
 * and a counter that double-increments turns a cold launch into a false "you navigated".
 */
export function PlayerHistory() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.sessionStorage.getItem(ENTRY_KEY) === null) {
      window.sessionStorage.setItem(ENTRY_KEY, pathname);
    }
  }, [pathname]);

  return null;
}
