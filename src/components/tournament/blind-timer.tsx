"use client";

import { useTournamentStore } from "@/store/tournament-store";
import { formatTime } from "@/lib/tournament-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// SVG icon components
function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M6 19h4V5H6zm8-14v14h4V5z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6z" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    </svg>
  );
}

export function BlindTimer({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  const startTournament = useTournamentStore((s) => s.startTournament);
  const pauseTournament = useTournamentStore((s) => s.pauseTournament);
  const resumeTournament = useTournamentStore((s) => s.resumeTournament);
  const nextLevel = useTournamentStore((s) => s.nextLevel);
  const prevLevel = useTournamentStore((s) => s.prevLevel);
  const resetLevelTimer = useTournamentStore((s) => s.resetLevelTimer);
  const resetTournament = useTournamentStore((s) => s.resetTournament);

  if (!tournament) return null;

  const { timer, config, status } = tournament;
  const currentLevel = config.blindStructure[timer.currentLevelIndex];
  const nextLevelData = config.blindStructure[timer.currentLevelIndex + 1];

  const isWarning = timer.secondsRemaining <= 60 && timer.secondsRemaining > 30;
  const isCritical = timer.secondsRemaining <= 30;
  const isFirstLevel = timer.currentLevelIndex === 0;
  const isLastLevel = timer.currentLevelIndex >= config.blindStructure.length - 1;
  const isActive = status !== "setup" && status !== "finished";

  const nextLevelText = nextLevelData
    ? nextLevelData.isBreak
      ? "Break"
      : `${nextLevelData.smallBlind}/${nextLevelData.bigBlind}${
          nextLevelData.ante > 0 ? ` (ante ${nextLevelData.ante})` : ""
        }`
    : null;

  return (
    <div
      className={cn(
        "rounded-xl p-6 md:p-8 text-center transition-colors duration-500 relative",
        "bg-card border",
        isCritical && status !== "paused" && "border-red-500/50 bg-red-950/20",
        isWarning && status !== "paused" && !isCritical && "border-amber-500/50 bg-amber-950/20",
        status === "break" && "border-primary/50 bg-primary/5"
      )}
    >
      {/* Restart tournament - top right */}
      {isActive && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 md:top-4 md:right-4 rounded-full w-9 h-9 [&_svg]:w-4 [&_svg]:h-4 text-muted-foreground hover:text-destructive"
            >
              <RestartIcon />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restart tournament?</AlertDialogTitle>
              <AlertDialogDescription>
                This will reset the timer, clear all knockouts, rebuys, and addons,
                and put the tournament back in setup mode. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => resetTournament(tournamentId)}>
                Restart
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Level info */}
      {currentLevel?.isBreak ? (
        <div className="text-lg md:text-xl font-medium text-primary uppercase tracking-wider">
          Break
        </div>
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
        </>
      )}

      {/* Countdown + reset round */}
      <div className="flex items-center justify-center gap-3 my-4">
        <div
          className={cn(
            "text-6xl md:text-8xl font-mono font-bold tabular-nums",
            isCritical && status !== "paused" && "text-red-400",
            isWarning && status !== "paused" && !isCritical && "text-amber-400"
          )}
        >
          {formatTime(timer.secondsRemaining)}
        </div>
        {isActive && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => resetLevelTimer(tournamentId)}
            className={cn(
              "rounded-full w-9 h-9 [&_svg]:w-4 [&_svg]:h-4 text-muted-foreground hover:text-foreground",
              timer.isRunning && "invisible"
            )}
          >
            <ResetIcon />
          </Button>
        )}
      </div>

      {/* Next level */}
      {nextLevelText && (
        <div className="text-muted-foreground mb-4">
          Next: {nextLevelText}
        </div>
      )}

      {/* Paused indicator */}
      <div
        className={cn(
          "font-medium uppercase tracking-wider mb-4",
          status === "paused" ? "text-amber-400 animate-pulse" : "invisible"
        )}
      >
        Paused
      </div>

      {/* Transport controls */}
      {status === "setup" ? (
        <Button
          size="lg"
          onClick={() => startTournament(tournamentId)}
          disabled={tournament.players.length < 2}
          className="px-8"
        >
          Start Tournament
        </Button>
      ) : status === "finished" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="lg" variant="outline">
              Restart Tournament
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restart tournament?</AlertDialogTitle>
              <AlertDialogDescription>
                This will reset the timer, clear all knockouts, rebuys, and addons,
                and put the tournament back in setup mode. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => resetTournament(tournamentId)}>
                Restart
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <div className="flex items-end justify-center gap-3 md:gap-4">
          {/* Prev level */}
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => prevLevel(tournamentId)}
              disabled={isFirstLevel}
              className="rounded-full w-12 h-12 md:w-14 md:h-14 [&_svg]:w-6 [&_svg]:h-6 md:[&_svg]:w-7 md:[&_svg]:h-7"
            >
              <PrevIcon />
            </Button>
            <span className="text-[10px] text-muted-foreground">Prev</span>
          </div>

          {/* Play / Pause */}
          <div className="flex flex-col items-center gap-1">
            <Button
              variant={timer.isRunning ? "secondary" : "default"}
              size="icon"
              onClick={() =>
                timer.isRunning
                  ? pauseTournament(tournamentId)
                  : resumeTournament(tournamentId)
              }
              className="rounded-full w-14 h-14 md:w-16 md:h-16 [&_svg]:w-7 [&_svg]:h-7 md:[&_svg]:w-8 md:[&_svg]:h-8"
            >
              {timer.isRunning ? <PauseIcon /> : <PlayIcon />}
            </Button>
            <span className="text-[10px] text-muted-foreground">
              {timer.isRunning ? "Pause" : "Play"}
            </span>
          </div>

          {/* Next level */}
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => nextLevel(tournamentId)}
              disabled={isLastLevel}
              className="rounded-full w-12 h-12 md:w-14 md:h-14 [&_svg]:w-6 [&_svg]:h-6 md:[&_svg]:w-7 md:[&_svg]:h-7"
            >
              <NextIcon />
            </Button>
            <span className="text-[10px] text-muted-foreground">Next</span>
          </div>

        </div>
      )}
    </div>
  );
}
