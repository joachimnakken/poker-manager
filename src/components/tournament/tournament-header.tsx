"use client";

import Link from "next/link";
import { useTournamentStore } from "@/store/tournament-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function TournamentHeader({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  if (!tournament) return null;

  const statusColor = {
    setup: "outline" as const,
    running: "default" as const,
    paused: "secondary" as const,
    break: "default" as const,
    finished: "secondary" as const,
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate">
            {tournament.config.name}
          </h1>
          <p className="text-sm text-muted-foreground">{tournament.config.date}</p>
        </div>
        <Badge variant={statusColor[tournament.status]}>
          {tournament.status === "break" ? "Break" : tournament.status}
        </Badge>
      </div>
      <div className="flex gap-2">
        {tournament.status !== "finished" && (
          <Link href={`/tournament/${tournamentId}/settings`}>
            <Button variant="outline" size="sm">
              Settings
            </Button>
          </Link>
        )}
        <Link href="/">
          <Button variant="ghost" size="sm">
            Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
