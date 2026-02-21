import { Player, TournamentConfig } from "./types";
import { PAYOUT_STRUCTURES } from "./constants";

export function getPayoutPercentages(playerCount: number): number[] {
  if (playerCount <= 1) return [100];
  if (playerCount === 2) return PAYOUT_STRUCTURES["2"];
  if (playerCount <= 4) return PAYOUT_STRUCTURES["3-4"];
  if (playerCount <= 6) return PAYOUT_STRUCTURES["5-6"];
  if (playerCount <= 10) return PAYOUT_STRUCTURES["7-10"];
  return PAYOUT_STRUCTURES["11-15"];
}

export function calculateTotalPot(players: Player[], config: TournamentConfig): number {
  const buyIns = players.length * config.buyIn;
  const rebuys = players.reduce((sum, p) => sum + p.rebuys, 0) * config.rebuyAmount;
  const addons = players.filter((p) => p.hasAddon).length * config.addonAmount;
  return buyIns + rebuys + addons;
}

export function calculatePayouts(
  players: Player[],
  config: TournamentConfig
): { position: number; amount: number; percentage: number }[] {
  const totalPot = calculateTotalPot(players, config);
  const percentages = getPayoutPercentages(players.length);

  return percentages.map((pct, i) => ({
    position: i + 1,
    amount: Math.round(totalPot * (pct / 100)),
    percentage: pct,
  }));
}
