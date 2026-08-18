"use client";

import { useEffect } from "react";
import { useTournamentStore } from "./tournament-store";

/** Idle tournaments change rarely, so they are polled a good deal less often. */
const IDLE_INTERVAL_MS = 6000;
const LIVE_INTERVAL_MS = 2000;

/**
 * Keeps one tournament in step with the server. Polling rather than SSE on purpose:
 * 16 phones at 2s is ~8 req/s of a ~10KB body, well inside Fluid Compute defaults.
 */
export function useTournamentSync(code: string, options?: { live?: boolean }): void {
  const loadOne = useTournamentStore((s) => s.loadOne);
  const status = useTournamentStore((s) => s.tournaments[code]?.status);
  // The projector passes live: true — check-ins and the flip-to-play moment
  // have to land within a beat on the wall, even while status is `setup`.
  const alwaysLive = options?.live ?? false;

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      if (!cancelled && document.visibilityState === "visible") {
        void loadOne(code);
      }
    };

    poll();
    const idle =
      !alwaysLive && (status === undefined || status === "setup" || status === "finished");
    const interval = setInterval(poll, idle ? IDLE_INTERVAL_MS : LIVE_INTERVAL_MS);

    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [code, loadOne, status, alwaysLive]);
}

/** The home page's list. */
export function useTournamentListSync(): void {
  const loadAll = useTournamentStore((s) => s.loadAll);

  useEffect(() => {
    void loadAll();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadAll();
      }
    }, IDLE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadAll]);
}
