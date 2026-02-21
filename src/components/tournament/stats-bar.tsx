"use client";

import { useTournamentStore } from "@/store/tournament-store";
import { getActivePlayerCount, getAverageStack, formatChips, formatCurrency } from "@/lib/tournament-utils";
import { calculateTotalPot } from "@/lib/prize-calculator";

export function StatsBar({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  if (!tournament) return null;

  const activeCount = getActivePlayerCount(tournament.players);
  const totalPlayers = tournament.players.length;
  const avgStack = getAverageStack(tournament);
  const totalPot = calculateTotalPot(tournament.players, tournament.config);
  const totalRebuys = tournament.players.reduce((sum, p) => sum + p.rebuys, 0);
  const totalAddons = tournament.players.filter((p) => p.hasAddon).length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
      <StatItem label="Players" value={`${activeCount}/${totalPlayers}`} />
      <StatItem label="Avg Stack" value={formatChips(avgStack)} />
      <StatItem
        label="Prize Pool"
        value={formatCurrency(totalPot, tournament.config.currency)}
      />
      <StatItem
        label="Rebuys / Addons"
        value={`${totalRebuys} / ${totalAddons}`}
      />
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}
