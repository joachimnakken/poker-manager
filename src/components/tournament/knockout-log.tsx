"use client";

import { useTournamentStore } from "@/store/tournament-store";

export function KnockoutLog({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  if (!tournament) return null;

  const { knockoutOrder, players } = tournament;

  if (knockoutOrder.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-4">No knockouts yet.</p>;
  }

  // Show most recent first
  const entries = [...knockoutOrder].reverse().map((playerId) => {
    const player = players.find((p) => p.id === playerId);
    return player;
  }).filter(Boolean);

  return (
    <div className="space-y-2">
      {entries.map((player) => (
        <div
          key={player!.id}
          className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30"
        >
          <span>{player!.name}</span>
          <div className="text-muted-foreground text-xs">
            {player!.finishPosition && `#${player!.finishPosition}`}
            {player!.knockedOutInLevel && ` · Level ${player!.knockedOutInLevel}`}
            {player!.knockedOutBy && (() => {
              const eliminator = players.find((p) => p.id === player!.knockedOutBy);
              return eliminator ? ` · by ${eliminator.name}` : null;
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}
