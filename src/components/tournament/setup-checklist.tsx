"use client";

import { useTournamentStore } from "@/store/tournament-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The setup phase in order, on the page the host is already looking at. The seat draw
 * used to live behind the 4th of 4 tabs in an unlabeled card, which is a bad place for
 * a step the whole room depends on — drawing before the start is what gives people time
 * to find their chair.
 */
export function SetupChecklist({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  const drawSeats = useTournamentStore((s) => s.drawSeats);

  if (!tournament || tournament.status !== "setup") {
    return null;
  }

  const { players, seatAssignments, seatsPerTable, code } = tournament;
  const seated = new Set((seatAssignments ?? []).map((a) => a.playerId));
  const unseated = players.filter((player) => !seated.has(player.id));
  const tableCount = new Set((seatAssignments ?? []).map((a) => a.table)).size;

  const enoughPlayers = players.length >= 2;
  // A draw only counts as done while it still covers everyone. Late arrivals are
  // auto-seated, so this normally stays true on its own.
  const seatsReady = seatAssignments !== undefined && unseated.length === 0;

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <Step
          done={enoughPlayers}
          label="Players join"
          detail={
            players.length === 0
              ? "Share the join code or the projector QR"
              : `${players.length} checked in${enoughPlayers ? "" : " - two or more to start"}`
          }
        />

        <Step
          done={seatsReady}
          label="Draw the seats"
          detail={
            seatsReady
              ? `${players.length} players over ${tableCount} ${tableCount === 1 ? "table" : "tables"}`
              : seatAssignments === undefined
                ? `Assign everyone a table and seat - ${seatsPerTable} seats per table`
                : `${unseated.length} without a seat`
          }
          action={
            <Button
              size="sm"
              onClick={() => drawSeats(tournamentId)}
              disabled={players.length === 0}
              data-testid="checklist-draw-seats"
            >
              {seatAssignments === undefined ? "Draw seats" : "Redraw"}
            </Button>
          }
        />

        <Step
          done={false}
          label="Everyone sits down"
          detail="The projector shows the seating chart as soon as it is drawn"
          action={
            <a href={`/display/${code}`} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                Open projector
              </Button>
            </a>
          }
        />
      </CardContent>
    </Card>
  );
}

function Step({
  done,
  label,
  detail,
  action,
}: {
  done: boolean;
  label: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
          done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 text-muted-foreground",
        )}
      >
        {done ? "✓" : ""}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground truncate">{detail}</div>
      </div>
      {action}
    </div>
  );
}
