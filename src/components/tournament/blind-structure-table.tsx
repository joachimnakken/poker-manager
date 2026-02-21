"use client";

import { useTournamentStore } from "@/store/tournament-store";
import { cn } from "@/lib/utils";

export function BlindStructureTable({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  if (!tournament) return null;

  const { config, timer } = tournament;

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-5 text-xs text-muted-foreground font-medium px-3 py-1">
        <span>Lvl</span>
        <span>SB</span>
        <span>BB</span>
        <span>Ante</span>
        <span className="text-right">Min</span>
      </div>
      {config.blindStructure.map((level, index) => (
        <div
          key={index}
          className={cn(
            "grid grid-cols-5 text-sm px-3 py-2 rounded-md transition-colors",
            index === timer.currentLevelIndex && "bg-primary/20 text-primary font-medium",
            index < timer.currentLevelIndex && "text-muted-foreground/50"
          )}
        >
          {level.isBreak ? (
            <>
              <span className="col-span-4 italic text-muted-foreground">
                Break
              </span>
              <span className="text-right">{level.duration / 60}</span>
            </>
          ) : (
            <>
              <span>{level.level}</span>
              <span>{level.smallBlind.toLocaleString()}</span>
              <span>{level.bigBlind.toLocaleString()}</span>
              <span>{level.ante > 0 ? level.ante.toLocaleString() : "-"}</span>
              <span className="text-right">{level.duration / 60}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
