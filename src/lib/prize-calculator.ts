import { Player, TournamentConfig } from "./types";
import { PAYOUT_STRUCTURES } from "./constants";

/** The pot only depends on these fields, so career stats can replay old tournaments
 * from bare DB rows without materializing full Player objects. */
export type PotEntry = Pick<Player, "rebuys" | "hasAddon">;

export function getPayoutPercentages(playerCount: number): number[] {
  if (playerCount <= 1) return [100];
  if (playerCount === 2) return PAYOUT_STRUCTURES["2"];
  if (playerCount <= 4) return PAYOUT_STRUCTURES["3-4"];
  if (playerCount <= 6) return PAYOUT_STRUCTURES["5-6"];
  if (playerCount <= 10) return PAYOUT_STRUCTURES["7-10"];
  return PAYOUT_STRUCTURES["11-15"];
}

export function calculateTotalPot(players: PotEntry[], config: TournamentConfig): number {
  const buyIns = players.length * config.buyIn;
  const rebuys = players.reduce((sum, p) => sum + p.rebuys, 0) * config.rebuyAmount;
  const addons = players.filter((p) => p.hasAddon).length * config.addonAmount;
  return buyIns + rebuys + addons;
}

export function calculatePayouts(
  players: PotEntry[],
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
