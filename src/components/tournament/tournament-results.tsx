"use client";

import { useTournamentStore } from "@/store/tournament-store";
import { calculatePayouts, calculateTotalPot } from "@/lib/prize-calculator";
import { formatCurrency } from "@/lib/tournament-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function TournamentResults({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  const resetTournament = useTournamentStore((s) => s.resetTournament);
  if (!tournament) return null;

  const { players, config } = tournament;
  const payouts = calculatePayouts(players, config);
  const totalPot = calculateTotalPot(players, config);
  const totalRebuys = players.reduce((sum, p) => sum + p.rebuys, 0);
  const totalAddons = players.filter((p) => p.hasAddon).length;

  const payoutMap = new Map(payouts.map((p) => [p.position, p]));

  const sorted = [...players].sort(
    (a, b) => (a.finishPosition ?? 999) - (b.finishPosition ?? 999)
  );

  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  // Podium order: 2nd, 1st, 3rd for visual display
  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3;

  const podiumStyles = top3.length >= 3
    ? [
        { height: "h-28", label: "2nd", color: "text-zinc-300" },
        { height: "h-36", label: "1st", color: "text-yellow-400" },
        { height: "h-20", label: "3rd", color: "text-amber-600" },
      ]
    : top3.map((_, i) => ({
        height: i === 0 ? "h-36" : "h-28",
        label: i === 0 ? "1st" : "2nd",
        color: i === 0 ? "text-yellow-400" : "text-zinc-300",
      }));

  return (
    <div className="space-y-6">
      {/* Prize pool summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-1">
            <div className="text-sm text-muted-foreground uppercase tracking-wider">Total Prize Pool</div>
            <div className="text-3xl font-bold">{formatCurrency(totalPot, config.currency)}</div>
            <div className="text-sm text-muted-foreground">
              {players.length} players &middot; {totalRebuys} rebuys &middot; {totalAddons} addons
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Podium */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end justify-center gap-4 md:gap-8">
            {podiumOrder.map((player, i) => {
              const style = podiumStyles[i];
              const payout = payoutMap.get(player.finishPosition ?? 0);
              return (
                <div key={player.id} className="flex flex-col items-center gap-2 flex-1 max-w-[160px]">
                  <div className={`text-lg md:text-xl font-bold ${style.color}`}>
                    {player.name}
                  </div>
                  {payout && (
                    <div className="text-sm font-medium">
                      {formatCurrency(payout.amount, config.currency)}
                    </div>
                  )}
                  <div
                    className={`${style.height} w-full rounded-t-lg bg-muted flex items-center justify-center`}
                  >
                    <span className={`text-2xl font-bold ${style.color}`}>
                      {style.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Full results */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Final Standings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {sorted.map((player) => {
              const payout = payoutMap.get(player.finishPosition ?? 0);
              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-muted-foreground w-8 text-right">
                      #{player.finishPosition}
                    </span>
                    <span className="font-medium">{player.name}</span>
                    {player.rebuys > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {player.rebuys}x rebuy
                      </span>
                    )}
                    {player.hasAddon && (
                      <span className="text-xs text-muted-foreground">addon</span>
                    )}
                  </div>
                  <div className="text-right">
                    {payout ? (
                      <span className="font-medium text-primary">
                        {formatCurrency(payout.amount, config.currency)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {player.knockedOutInLevel
                          ? `Level ${player.knockedOutInLevel}`
                          : ""}
                        {player.knockedOutBy && (() => {
                          const eliminator = players.find((p) => p.id === player.knockedOutBy);
                          return eliminator ? ` · KO'd by ${eliminator.name}` : null;
                        })()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Restart button */}
      <div className="pt-2 flex justify-center">
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
      </div>
    </div>
  );
}
