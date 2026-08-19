"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getIdentity } from "@/lib/identity";
import { useTournamentStore } from "@/store/tournament-store";

/**
 * Who may open the host pages: the device that created the tournament, and the player
 * the host has marked as themselves — the host plays too, and runs the night from their
 * seat rather than walking to a laptop. Anyone else is sent to the phone view, which has
 * a mode for every role.
 *
 * Writes were always rejected server-side; this keeps the wrong dashboard from even
 * rendering. Returns false until it can tell, so callers can hold their render.
 */
export function useHostGuard(code: string): boolean {
  const router = useRouter();
  const tournament = useTournamentStore((s) => s.tournaments[code]);
  const loaded = useTournamentStore((s) => s.loaded);
  const [identity, setIdentity] = useState<{ ownerToken?: string; playerId?: string } | null>(null);

  useEffect(() => {
    setIdentity(getIdentity(code));
  }, [code]);

  const isOwnerDevice = Boolean(identity?.ownerToken);
  const isHostPlayer =
    identity?.playerId !== undefined && tournament?.hostPlayerId === identity.playerId;

  useEffect(() => {
    // Nothing read from localStorage yet, or the owner token settles it outright.
    if (identity === null || isOwnerDevice) {
      return;
    }
    // Being the host player depends on server state, so wait for it before judging.
    if (!loaded) {
      return;
    }
    if (!isHostPlayer) {
      router.replace(`/t/${code}`);
    }
  }, [identity, isOwnerDevice, isHostPlayer, loaded, code, router]);

  return isOwnerDevice || isHostPlayer;
}
