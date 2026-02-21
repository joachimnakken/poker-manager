"use client";

import { useTournamentStore } from "@/store/tournament-store";
import { formatTime } from "@/lib/tournament-utils";
import { cn } from "@/lib/utils";

export function BlindTimer({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  if (!tournament) return null;

  const { timer, config, status } = tournament;
  const currentLevel = config.blindStructure[timer.currentLevelIndex];
  const nextLevel = config.blindStructure[timer.currentLevelIndex + 1];

  const isWarning = timer.secondsRemaining <= 60 && timer.secondsRemaining > 30;
  const isCritical = timer.secondsRemaining <= 30;

  return (
    <div
      className={cn(
        "rounded-xl p-6 md:p-8 text-center transition-colors duration-500",
        "bg-card border",
        isCritical && status !== "paused" && "border-red-500/50 bg-red-950/20",
        isWarning && status !== "paused" && !isCritical && "border-amber-500/50 bg-amber-950/20",
        status === "break" && "border-primary/50 bg-primary/5"
      )}
    >
      {currentLevel?.isBreak ? (
        <>
          <div className="text-lg md:text-xl font-medium text-primary uppercase tracking-wider">
            Break
          </div>
          <div
            className={cn(
              "text-6xl md:text-8xl font-mono font-bold my-4 tabular-nums",
              isCritical && "text-red-400",
              isWarning && !isCritical && "text-amber-400"
            )}
          >
            {formatTime(timer.secondsRemaining)}
          </div>
          {nextLevel && !nextLevel.isBreak && (
            <div className="text-muted-foreground">
              Next: {nextLevel.smallBlind}/{nextLevel.bigBlind}
              {nextLevel.ante > 0 && ` (ante ${nextLevel.ante})`}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="text-lg md:text-xl font-medium text-muted-foreground">
            Level {currentLevel?.level}
          </div>
          <div className="text-3xl md:text-5xl font-bold my-2">
            {currentLevel?.smallBlind?.toLocaleString()}/{currentLevel?.bigBlind?.toLocaleString()}
            {currentLevel?.ante > 0 && (
              <span className="text-xl md:text-3xl text-muted-foreground ml-2">
                (ante {currentLevel.ante.toLocaleString()})
              </span>
            )}
          </div>
          <div
            className={cn(
              "text-6xl md:text-8xl font-mono font-bold my-4 tabular-nums",
              isCritical && status !== "paused" && "text-red-400",
              isWarning && status !== "paused" && !isCritical && "text-amber-400"
            )}
          >
            {formatTime(timer.secondsRemaining)}
          </div>
          {nextLevel && (
            <div className="text-muted-foreground">
              Next:{" "}
              {nextLevel.isBreak
                ? "Break"
                : `${nextLevel.smallBlind}/${nextLevel.bigBlind}${
                    nextLevel.ante > 0 ? ` (ante ${nextLevel.ante})` : ""
                  }`}
            </div>
          )}
        </>
      )}

      {status === "paused" && (
        <div className="mt-2 text-amber-400 font-medium uppercase tracking-wider animate-pulse">
          Paused
        </div>
      )}
    </div>
  );
}
