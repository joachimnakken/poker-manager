"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearLastJoined, getLastJoined, setLastJoined } from "@/lib/identity";
import type { StateResponse } from "@/lib/api";
import { QrScanner } from "@/components/qr-scanner";
import { InstallPrompt } from "@/components/install-prompt";
import { PlayerNav } from "@/components/player-nav";

/**
 * Where the installed app opens. A player belongs to one tournament at a time, so this
 * either sends them straight into it or, once that night is finished or gone, shows the
 * camera to scan into the next one. There is deliberately no tournament list and no way
 * to create one — that is the host's job, on the web.
 */
export default function PlayPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const code = getLastJoined();
    if (!code) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    fetch(`/api/t/${code}/state`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: StateResponse | null) => {
        if (cancelled) {
          return;
        }
        // Gone, or the night is over: back to the scanner rather than a stale game.
        if (!data || data.tournament.status === "finished") {
          clearLastJoined();
          setChecking(false);
          return;
        }
        router.replace(`/t/${code}`);
      })
      .catch(() => {
        if (!cancelled) {
          setChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const join = useCallback(
    (code: string) => {
      setLastJoined(code);
      router.replace(`/t/${code}`);
    },
    [router],
  );

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pt-safe pb-safe max-w-md mx-auto space-y-4">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">Join a table</h1>
        <p className="text-sm text-muted-foreground">
          Scan the code on the screen to sit down
        </p>
      </div>

      <QrScanner onJoin={join} />
      <InstallPrompt />

      <PlayerNav className="pt-2" />
    </div>
  );
}
