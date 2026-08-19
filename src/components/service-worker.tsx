"use client";

import { useEffect } from "react";

/**
 * Registers the worker in production only. In development it would sit in front of the
 * dev server and serve stale chunks straight through hot reload, which looks exactly
 * like a broken build.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // An unavailable worker costs installability and offline, nothing more.
    });
  }, []);

  return null;
}
