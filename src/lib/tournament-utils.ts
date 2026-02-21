import { Player, Tournament } from "./types";

export function getActivePlayers(players: Player[]): Player[] {
  return players.filter((p) => p.isActive);
}

export function getActivePlayerCount(players: Player[]): number {
  return players.filter((p) => p.isActive).length;
}

export function getTotalChipsInPlay(players: Player[], startingChips: number, rebuyChips: number, addonChips: number): number {
  const totalBuyIns = players.length * startingChips;
  const totalRebuys = players.reduce((sum, p) => sum + p.rebuys, 0) * rebuyChips;
  const totalAddons = players.filter((p) => p.hasAddon).length * addonChips;
  return totalBuyIns + totalRebuys + totalAddons;
}

export function getAverageStack(tournament: Tournament): number {
  const activeCount = getActivePlayerCount(tournament.players);
  if (activeCount === 0) return 0;
  const totalChips = getTotalChipsInPlay(
    tournament.players,
    tournament.config.startingChips,
    tournament.config.rebuyChips,
    tournament.config.addonChips
  );
  return Math.round(totalChips / activeCount);
}

export function formatChips(chips: number): string {
  if (chips >= 1000) {
    return chips % 1000 === 0
      ? `${chips / 1000}k`
      : chips.toLocaleString();
  }
  return chips.toString();
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function formatCurrency(amount: number, currency: string): string {
  return `${amount.toLocaleString()} ${currency}`;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}
