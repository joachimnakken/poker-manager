"use client";

import { useTournamentStore } from "@/store/tournament-store";
import { calculatePayouts, calculateTotalPot } from "@/lib/prize-calculator";
import { formatCurrency } from "@/lib/tournament-utils";

export function PrizePoolDisplay({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  if (!tournament) return null;

  const { players, config } = tournament;
  if (players.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-4">Add players to see payouts.</p>;
  }

  const totalPot = calculateTotalPot(players, config);
  const payouts = calculatePayouts(players, config);
  const totalRebuys = players.reduce((sum, p) => sum + p.rebuys, 0);
  const totalAddons = players.filter((p) => p.hasAddon).length;

  return (
    <div className="space-y-4">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Buy-ins ({players.length}x)</span>
          <span>{formatCurrency(players.length * config.buyIn, config.currency)}</span>
        </div>
        {totalRebuys > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rebuys ({totalRebuys}x)</span>
            <span>{formatCurrency(totalRebuys * config.rebuyAmount, config.currency)}</span>
          </div>
        )}
        {totalAddons > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Addons ({totalAddons}x)</span>
            <span>{formatCurrency(totalAddons * config.addonAmount, config.currency)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold border-t pt-2 border-border">
          <span>Total</span>
          <span>{formatCurrency(totalPot, config.currency)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Payouts</h4>
        {payouts.map((p) => {
          const winner = tournament.players.find((pl) => pl.finishPosition === p.position);
          return (
            <div key={p.position} className="flex justify-between text-sm">
              <span>
                {p.position === 1 ? "1st" : p.position === 2 ? "2nd" : p.position === 3 ? "3rd" : `${p.position}th`}
                {winner && <span className="text-primary ml-1">({winner.name})</span>}
              </span>
              <span className="font-medium">
                {formatCurrency(p.amount, config.currency)}{" "}
                <span className="text-muted-foreground text-xs">({p.percentage}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
