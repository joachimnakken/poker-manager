"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ENTRY_KEY } from "@/components/player-history";

/**
 * True once this session has moved off the screen it launched on. Unknown counts as no —
 * pushing /play is recoverable, popping out of the app is not.
 */
function canGoBack(pathname: string): boolean {
  const entry = window.sessionStorage.getItem(ENTRY_KEY);
  return entry !== null && entry !== pathname;
}

/**
 * The reference screens are reached from `PlayerNav` and have no way out of their own.
 * Installed, the app has no browser chrome, so the edge swipe is the only way back — and
 * an invisible gesture is not an affordance.
 *
 * Falls back to /play on a cold launch straight onto one of these screens, where going
 * back would leave the app altogether.
 */
export function PlayerBack() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <button
      type="button"
      data-testid="player-back"
      aria-label="Back"
      // -ml-2 pulls the icon out to the page's optical edge while the padding keeps the
      // target 44pt, the same minimum the nav tiles clear.
      onClick={() => (canGoBack(pathname) ? router.back() : router.push("/play"))}
      className="-ml-2 flex min-h-11 items-center gap-1 pl-2 pr-3 text-sm font-medium text-muted-foreground transition-colors active:text-foreground"
    >
      <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden />
      Back
    </button>
  );
}
