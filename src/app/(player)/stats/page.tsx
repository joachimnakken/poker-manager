"use client";

import { useEffect, useState } from "react";
import type { ProfileStats, StatsResponse } from "@/lib/api";
import { formatCurrency } from "@/lib/tournament-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PlayerBack } from "@/components/player-back";

export default function StatsPage() {
  const [leaderboard, setLeaderboard] = useState<ProfileStats[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: StatsResponse) => {
        if (!cancelled) setLeaderboard(data.leaderboard);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load stats");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen px-4 pt-safe pb-safe max-w-2xl mx-auto space-y-4">
      <PlayerBack />
      <div>
        <h1 className="text-2xl font-bold">Career stats</h1>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!leaderboard && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {leaderboard && leaderboard.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No profiles yet — stats appear once someone checks in and a tournament finishes.
        </p>
      )}

      {leaderboard && leaderboard.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">All-time leaderboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {leaderboard.map((entry, index) => (
              <div
                key={entry.profileId}
                data-testid={`stats-row-${entry.firstName} ${entry.lastName}`}
                className={cn(
                  "flex items-center gap-3 rounded-md p-3",
                  index === 0 && entry.wins > 0 ? "bg-primary/10" : "bg-muted/30",
                )}
              >
                <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {entry.firstName} {entry.lastName}
                  </div>
                  {/* A wrapping meta line rather than fixed columns: seven columns of
                      numbers cannot fit a phone, and the name loses every time. */}
                  <div className="text-xs text-muted-foreground">
                    {entry.nights} {entry.nights === 1 ? "night" : "nights"} &middot;{" "}
                    {entry.wins} {entry.wins === 1 ? "win" : "wins"} &middot; {entry.knockouts} KO
                    {entry.bestFinish !== null && <> &middot; best #{entry.bestFinish}</>}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {formatCurrency(entry.winnings, entry.currency ?? "")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Only finished tournaments count. Winnings follow each night&apos;s payout structure.
      </p>
    </div>
  );
}
