"use client";

import { useEffect, useRef, useState } from "react";
import { flashText, nextFlash } from "@/lib/announcements";
import { playLevelChangeSound } from "@/lib/sounds";
import type { Announcement } from "@/lib/types";
import { cn } from "@/lib/utils";

const SHOW_MS = 2600;

/**
 * Flashes the room's shouts red, once each. Opening the app deliberately shows nothing:
 * everything already on screen at mount counts as seen, so arriving late does not set
 * off a burst of things that happened before you got here.
 *
 * `size` is the only difference between a phone in someone's hand and a wall across the
 * room — the wording lives in `flashText` so the two cannot drift.
 */
export function AnnouncementFlash({
  announcements,
  size = "phone",
}: {
  announcements: Announcement[];
  size?: "phone" | "wall";
}) {
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const [showing, setShowing] = useState<Announcement | null>(null);

  useEffect(() => {
    // First pass: adopt whatever is already there without flashing it.
    if (!primed.current) {
      for (const announcement of announcements) {
        seen.current.add(announcement.id);
      }
      primed.current = true;
      return;
    }

    const next = nextFlash(announcements, seen.current, Date.now());
    for (const announcement of announcements) {
      seen.current.add(announcement.id);
    }
    if (!next) {
      return;
    }

    setShowing(next);
    // An all-in is the moment worth looking up for; a bust announces itself.
    if (next.kind === "all-in") {
      playLevelChangeSound();
    }
    const timer = setTimeout(() => setShowing(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [announcements]);

  if (!showing) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center p-6"
      data-testid="announcement-flash"
      data-kind={showing.kind}
    >
      <div
        className={cn(
          "absolute inset-0",
          showing.kind === "all-in" ? "bg-red-600/70" : "bg-zinc-900/75",
        )}
        style={{ animation: "flash-pulse 2.6s ease-out" }}
      />
      <p
        className={cn(
          "relative text-center font-bold uppercase leading-tight tracking-wide text-white",
          size === "wall" ? "text-8xl" : "text-4xl",
        )}
        style={{ textShadow: "0 4px 24px rgba(0,0,0,0.55)" }}
      >
        {flashText(showing)}
      </p>
    </div>
  );
}
