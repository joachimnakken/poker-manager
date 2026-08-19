"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const THRESHOLD = 70;
/** Pull feels better when it lags the finger a little. */
const DAMPING = 0.5;
const MAX_PULL = 110;

/**
 * Drag down from the top to fetch now. The app polls anyway, but an installed app has
 * its timers suspended while it is in someone's pocket, so coming back to a live table
 * should not mean waiting out an interval — and there is no browser chrome offering a
 * reload once it is on the home screen.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  children: React.ReactNode;
}) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  function onTouchStart(event: React.TouchEvent) {
    // Only from the very top, or this would fight normal scrolling.
    if (busy || window.scrollY > 0) {
      startY.current = null;
      return;
    }
    startY.current = event.touches[0].clientY;
  }

  function onTouchMove(event: React.TouchEvent) {
    if (startY.current === null) {
      return;
    }
    const distance = event.touches[0].clientY - startY.current;
    if (distance <= 0) {
      setPull(0);
      return;
    }
    // Claim the gesture so Safari's own overscroll refresh does not also fire.
    if (event.cancelable) {
      event.preventDefault();
    }
    setPull(Math.min(MAX_PULL, distance * DAMPING));
  }

  async function onTouchEnd() {
    const pulled = pull;
    startY.current = null;
    if (pulled < THRESHOLD) {
      setPull(0);
      return;
    }
    setBusy(true);
    setPull(THRESHOLD);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
      setPull(0);
    }
  }

  const ready = pull >= THRESHOLD;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        className="pointer-events-none flex items-end justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: pull }}
      >
        <span
          className={cn(
            "pb-2 text-xs",
            ready || busy ? "text-primary" : "text-muted-foreground",
          )}
          data-testid="pull-indicator"
        >
          {busy ? "Refreshing…" : ready ? "Release to refresh" : "Pull to refresh"}
        </span>
      </div>
      <div
        style={{ transform: `translateY(${pull ? 0 : 0}px)` }}
        className={cn(busy && "opacity-70 transition-opacity")}
      >
        {children}
      </div>
    </div>
  );
}
