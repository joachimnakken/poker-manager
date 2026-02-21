"use client";

import { useTournamentStore } from "@/store/tournament-store";
import { Button } from "@/components/ui/button";

export function SeatDraw({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  const drawSeats = useTournamentStore((s) => s.drawSeats);
  const clearSeats = useTournamentStore((s) => s.clearSeats);

  if (!tournament) return null;

  const { seatAssignments, players } = tournament;
  const hasPlayers = players.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => drawSeats(tournamentId)}
          disabled={!hasPlayers}
        >
          {seatAssignments ? "Redraw" : "Draw Seats"}
        </Button>
        {seatAssignments && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearSeats(tournamentId)}
          >
            Clear
          </Button>
        )}
      </div>

      {!seatAssignments ? (
        <p className="text-muted-foreground text-sm text-center py-4">
          {hasPlayers ? "No seats drawn yet. Click Draw to assign seats." : "Add players first."}
        </p>
      ) : (
        <div className="space-y-1">
          {seatAssignments.map((assignment) => {
            const player = players.find((p) => p.id === assignment.playerId);
            if (!player) return null;
            return (
              <div
                key={assignment.seat}
                className="flex items-center gap-3 p-2 rounded-md bg-muted/30"
              >
                <span className="text-sm font-mono text-muted-foreground w-12">
                  Seat {assignment.seat}
                </span>
                <span className="text-sm font-medium">{player.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
