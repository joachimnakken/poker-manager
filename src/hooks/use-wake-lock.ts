"use client";

import { useEffect, useRef } from "react";

export function useWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled) {
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
      return;
    }

    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Wake lock not supported or denied
      }
    }

    requestWakeLock();

    // Re-acquire on visibility change
    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && enabled) {
        requestWakeLock();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [enabled]);
}
