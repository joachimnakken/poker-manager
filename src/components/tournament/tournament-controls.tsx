"use client";

import { useTournamentStore } from "@/store/tournament-store";
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

export function TournamentControls({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  const startTournament = useTournamentStore((s) => s.startTournament);
  const pauseTournament = useTournamentStore((s) => s.pauseTournament);
  const resumeTournament = useTournamentStore((s) => s.resumeTournament);
  const nextLevel = useTournamentStore((s) => s.nextLevel);
  const prevLevel = useTournamentStore((s) => s.prevLevel);
  const resetTournament = useTournamentStore((s) => s.resetTournament);

  if (!tournament) return null;

  const { status, timer, config } = tournament;
  const isFirstLevel = timer.currentLevelIndex === 0;
  const isLastLevel = timer.currentLevelIndex >= config.blindStructure.length - 1;

  const restartDialog = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {status === "finished" ? (
          <Button size="lg" variant="outline">
            Restart Tournament
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive ml-2"
          >
            Restart
          </Button>
        )}
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
  );

  return (
    <div className="flex items-center justify-center gap-2 md:gap-4">
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
        restartDialog
      ) : (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => prevLevel(tournamentId)}
            disabled={isFirstLevel}
          >
            &laquo; Prev
          </Button>

          {timer.isRunning ? (
            <Button
              size="lg"
              variant="secondary"
              onClick={() => pauseTournament(tournamentId)}
              className="px-8 min-w-[120px]"
            >
              Pause
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => resumeTournament(tournamentId)}
              className="px-8 min-w-[120px]"
            >
              Resume
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => nextLevel(tournamentId)}
            disabled={isLastLevel}
          >
            Next &raquo;
          </Button>

          {restartDialog}
        </>
      )}
    </div>
  );
}
