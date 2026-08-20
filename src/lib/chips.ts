import type { BlindLevel, Player, TournamentConfig } from "./types";

/**
 * Counted stacks, and whether to believe them.
 *
 * Every chip on the table arrived through a buy-in, a rebuy or an add-on, so the counted
 * total is checkable arithmetic rather than a matter of trust. That is the whole value of
 * this: a ranking built on a miscount is worse than no ranking, and the app can tell.
 */

/** How many chips are in play, from what everyone has paid for. */
export function expectedTotal(players: Player[], config: TournamentConfig): number {
  const buyIns = players.length * config.startingChips;
  const rebuys = players.reduce((sum, p) => sum + p.rebuys, 0) * config.rebuyChips;
  const addons = players.filter((p) => p.hasAddon).length * config.addonChips;
  return buyIns + rebuys + addons;
}

/** The sum of what has actually been counted, over players still in. */
export function countedTotal(players: Player[]): number {
  return players
    .filter((p) => p.isActive && p.chipCount !== undefined)
    .reduce((sum, p) => sum + (p.chipCount ?? 0), 0);
}

/** Stacks in big blinds, which is what a player actually judges their position by. */
export function bigBlinds(chips: number, level: BlindLevel | undefined): number | null {
  if (!level || level.bigBlind <= 0) {
    return null;
  }
  return Math.round((chips / level.bigBlind) * 10) / 10;
}

export interface CountStatus {
  /** Active players whose stack nobody has counted. */
  missing: number;
  counted: number;
  active: number;
  countedChips: number;
  /** What the counted chips should add up to once everyone is counted. */
  expectedChips: number;
  /** Signed difference, only meaningful once nothing is missing. */
  difference: number;
  /** True when every active player is counted and the total does not add up. */
  mismatch: boolean;
}

/**
 * Eliminated players' chips are gone from the table, so the expected total is scaled to
 * the field still playing: everything paid for, minus what the busted players started
 * and bought with. Simpler and equivalent: expected minus the eliminated contributions.
 */
export function countStatus(players: Player[], config: TournamentConfig): CountStatus {
  const active = players.filter((p) => p.isActive);
  const counted = active.filter((p) => p.chipCount !== undefined);
  const out = players.filter((p) => !p.isActive);

  const expectedChips = expectedTotal(players, config) - expectedTotal(out, config);
  const countedChips = countedTotal(players);
  const missing = active.length - counted.length;

  return {
    missing,
    counted: counted.length,
    active: active.length,
    countedChips,
    expectedChips,
    difference: countedChips - expectedChips,
    mismatch: missing === 0 && counted.length > 0 && countedChips !== expectedChips,
  };
}

/** True when a count predates the level the tournament is on now. */
export function isStale(player: Player, levelStartedAt: string | null): boolean {
  if (player.chipCount === undefined || !player.chipsUpdatedAt || !levelStartedAt) {
    return false;
  }
  return Date.parse(player.chipsUpdatedAt) < Date.parse(levelStartedAt);
}

/**
 * The field ordered as a chip ranking: biggest stack first, then anyone uncounted, then
 * the eliminated in finishing order. Uncounted players sink rather than sorting as zero,
 * which would read as "short stack" when it means "nobody has looked".
 */
export function chipRanking(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    if (a.isActive !== b.isActive) {
      return a.isActive ? -1 : 1;
    }
    if (!a.isActive && !b.isActive) {
      return (a.finishPosition ?? 999) - (b.finishPosition ?? 999);
    }
    const left = a.chipCount;
    const right = b.chipCount;
    if (left === undefined && right === undefined) {
      return a.name.localeCompare(b.name);
    }
    if (left === undefined) {
      return 1;
    }
    if (right === undefined) {
      return -1;
    }
    return right - left;
  });
}
