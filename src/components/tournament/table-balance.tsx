"use client";

import { useState } from "react";
import { useTournamentStore } from "@/store/tournament-store";
import { suggestBalance } from "@/lib/balancing";
import { FORCE_AFTER_MS } from "@/lib/proposal-ops";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * Advisory only — a human always confirms. The host can apply a move outright, or put
 * it to the two captains, who each have to agree before anyone stands up.
 */
export function TableBalance({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  const movePlayer = useTournamentStore((s) => s.movePlayer);
  const proposeMove = useTournamentStore((s) => s.proposeMove);
  const confirmProposal = useTournamentStore((s) => s.confirmProposal);
  const declineProposal = useTournamentStore((s) => s.declineProposal);
  const forceProposal = useTournamentStore((s) => s.forceProposal);
  const cancelProposal = useTournamentStore((s) => s.cancelProposal);

  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (!tournament) return null;

  const { players, seatAssignments, seatsPerTable, proposals, status } = tournament;
  const activeIds = new Set(players.filter((p) => p.isActive).map((p) => p.id));
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "—";

  const pending = proposals.filter((p) => p.status === "pending");
  const declined = proposals.filter((p) => p.status === "declined");

  // A player already under a pending move, and anyone whose move was just turned down,
  // are both poor candidates — so the next suggestion skips them.
  const excluded = new Set([
    ...pending.map((p) => p.playerId),
    ...declined.map((p) => p.playerId),
  ]);
  const candidateSeats = (seatAssignments ?? []).filter(
    (seat) => !excluded.has(seat.playerId) || !activeIds.has(seat.playerId),
  );
  const suggestion =
    status === "setup" || status === "finished"
      ? null
      : suggestBalance(candidateSeats, activeIds, seatsPerTable);

  if (!suggestion && pending.length === 0 && declined.length === 0) {
    return null;
  }

  return (
    <Card data-testid="table-balance">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Table balance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pending.map((proposal) => {
          const age = Date.now() - new Date(proposal.proposedAt).getTime();
          const forceable = age >= FORCE_AFTER_MS;
          return (
            <div
              key={proposal.id}
              data-testid="pending-proposal"
              className="space-y-2 p-3 rounded-lg border bg-muted/20"
            >
              <div className="text-sm">
                Move <span className="font-medium">{nameOf(proposal.playerId)}</span> from table{" "}
                {proposal.fromTable} seat {proposal.fromSeat} to table {proposal.toTable} seat{" "}
                {proposal.toSeat}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge
                  variant={proposal.fromConfirmedAt ? "default" : "outline"}
                  data-testid={`confirm-from-${proposal.fromTable}`}
                >
                  Table {proposal.fromTable} {proposal.fromConfirmedAt ? "✓" : "waiting"}
                </Badge>
                <Badge
                  variant={proposal.toConfirmedAt ? "default" : "outline"}
                  data-testid={`confirm-to-${proposal.toTable}`}
                >
                  Table {proposal.toTable} {proposal.toConfirmedAt ? "✓" : "waiting"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => confirmProposal(tournamentId, proposal.id)}>
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  disabled={!forceable}
                  onClick={() => forceProposal(tournamentId, proposal.id)}
                >
                  {forceable ? "Force" : `Force in ${Math.ceil((FORCE_AFTER_MS - age) / 1000)}s`}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDecliningId(proposal.id)}>
                  Decline
                </Button>
                <Button size="sm" variant="ghost" onClick={() => cancelProposal(tournamentId, proposal.id)}>
                  Cancel
                </Button>
              </div>
              {decliningId === proposal.id && (
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    placeholder="Why not? e.g. mid-hand"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={!reason.trim()}
                    onClick={() => {
                      declineProposal(tournamentId, proposal.id, reason.trim());
                      setReason("");
                      setDecliningId(null);
                    }}
                  >
                    Send
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {declined.map((proposal) => (
          <p key={proposal.id} className="text-xs text-muted-foreground">
            {nameOf(proposal.playerId)} declined: {proposal.declineReason}
          </p>
        ))}

        {suggestion && (
          <div className="space-y-2" data-testid="balance-suggestion">
            <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
            <div className="space-y-1">
              {suggestion.moves.map((move) => (
                <div
                  key={move.playerId}
                  className="flex items-center justify-between gap-2 text-sm p-2 rounded-md bg-muted/30"
                >
                  <span>
                    <span className="font-medium">{nameOf(move.playerId)}</span> &middot; table{" "}
                    {move.fromTable} seat {move.fromSeat} &rarr; table {move.toTable} seat{" "}
                    {move.toSeat}
                  </span>
                  <span className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => proposeMove(tournamentId, move)}
                    >
                      Ask captains
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => movePlayer(tournamentId, move.playerId, move.toTable, move.toSeat)}
                    >
                      Move now
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
