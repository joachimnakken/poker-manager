"use client";

import { useEffect, useState } from "react";
import type { ProfileStats, StatsResponse } from "@/lib/api";
import { formatCurrency } from "@/lib/tournament-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
    <div className="min-h-screen px-4 py-6 max-w-2xl mx-auto space-y-4">
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
            <div className="grid grid-cols-[2rem_1fr_repeat(5,3.5rem)] gap-1 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span />
              <span>Player</span>
              <span className="text-right">Nights</span>
              <span className="text-right">Wins</span>
              <span className="text-right">KOs</span>
              <span className="text-right">Best</span>
              <span className="text-right">Won</span>
            </div>
            {leaderboard.map((entry, index) => (
              <div
                key={entry.profileId}
                data-testid={`stats-row-${entry.firstName} ${entry.lastName}`}
                className={cn(
                  "grid grid-cols-[2rem_1fr_repeat(5,3.5rem)] gap-1 items-center rounded-md p-2 text-sm",
                  index === 0 && entry.wins > 0 ? "bg-primary/10" : "bg-muted/30",
                )}
              >
                <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
                <span className="font-medium truncate">
                  {entry.firstName} {entry.lastName}
                </span>
                <span className="text-right tabular-nums">{entry.nights}</span>
                <span className="text-right tabular-nums">{entry.wins}</span>
                <span className="text-right tabular-nums">{entry.knockouts}</span>
                <span className="text-right tabular-nums">
                  {entry.bestFinish !== null ? `#${entry.bestFinish}` : "—"}
                </span>
                <span className="text-right tabular-nums">
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
