"use client";

import { useTournamentStore } from "@/store/tournament-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function SeatDraw({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  const drawSeats = useTournamentStore((s) => s.drawSeats);
  const clearSeats = useTournamentStore((s) => s.clearSeats);

  if (!tournament) return null;

  const { seatAssignments, players, tables, seatsPerTable } = tournament;
  const hasPlayers = players.length > 0;
  const tableNumbers = [...new Set((seatAssignments ?? []).map((a) => a.table))].sort(
    (a, b) => a - b,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => drawSeats(tournamentId)}
          disabled={!hasPlayers}
        >
          {seatAssignments ? "Redraw" : "Draw Seats"}
        </Button>
        {seatAssignments && (
          <Button variant="ghost" size="sm" onClick={() => clearSeats(tournamentId)}>
            Clear
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {seatsPerTable} seats/table
        </span>
      </div>

      {!seatAssignments ? (
        <p className="text-muted-foreground text-sm text-center py-4">
          {hasPlayers ? "No seats drawn yet. Click Draw to assign seats." : "Add players first."}
        </p>
      ) : (
        <div className="space-y-4">
          {tableNumbers.map((tableNumber) => {
            const captainId = tables.find((t) => t.tableNumber === tableNumber)?.captainPlayerId;
            const seats = (seatAssignments ?? [])
              .filter((a) => a.table === tableNumber)
              .sort((a, b) => a.seat - b.seat);
            const activeCount = seats.filter(
              (a) => players.find((p) => p.id === a.playerId)?.isActive,
            ).length;

            return (
              <div key={tableNumber} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Table {tableNumber}</span>
                  <Badge variant="outline" className="text-xs">
                    {activeCount} left
                  </Badge>
                  {captainId ? (
                    <span className="text-xs text-muted-foreground">
                      Captain: {players.find((p) => p.id === captainId)?.name ?? "—"}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Captain: host</span>
                  )}
                </div>
                {seats.map((assignment) => {
                  const player = players.find((p) => p.id === assignment.playerId);
                  if (!player) return null;
                  return (
                    <div
                      key={`${assignment.table}-${assignment.seat}`}
                      className={`flex items-center gap-3 p-2 rounded-md bg-muted/30 ${
                        player.isActive ? "" : "opacity-50"
                      }`}
                    >
                      <span className="text-sm font-mono text-muted-foreground w-12">
                        Seat {assignment.seat}
                      </span>
                      <span className="text-sm font-medium">{player.name}</span>
                      {player.id === captainId && (
                        <Badge variant="secondary" className="text-xs">
                          C
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
