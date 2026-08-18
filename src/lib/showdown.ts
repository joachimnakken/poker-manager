import { compareHands, evaluateBest, type Card, type HandResult } from "./poker-hands.ts";

export interface ShowdownSeat {
  label: string;
  /** Exactly two hole cards. */
  cards: Card[];
}

export interface SeatVerdict {
  label: string;
  cards: Card[];
  hand: HandResult;
  wins: boolean;
}

export interface ShowdownVerdict {
  seats: SeatVerdict[];
  explanation: string;
}

/**
 * Rules on a showdown: best five from each seat's two cards plus the board, ties chop.
 * Pure and client-side — settling an argument costs nothing and works with no signal.
 */
export function judgeShowdown(seats: ShowdownSeat[], board: Card[]): ShowdownVerdict {
  const evaluated = seats.map((seat) => ({
    label: seat.label,
    cards: seat.cards,
    hand: evaluateBest([...seat.cards, ...board]),
  }));
  const ranked = [...evaluated].sort((a, b) => compareHands(b.hand, a.hand));
  const winners = new Set(
    ranked
      .filter((entry) => compareHands(entry.hand, ranked[0].hand) === 0)
      .map((entry) => entry.label),
  );

  return {
    seats: evaluated.map((entry) => ({ ...entry, wins: winners.has(entry.label) })),
    explanation: explain(ranked, winners),
  };
}

function explain(ranked: { label: string; hand: HandResult }[], winners: Set<string>): string {
  if (winners.size > 1) {
    const description = ranked[0].hand.description;
    return winners.size === ranked.length
      ? `Split pot — everyone plays ${description}.`
      : `Split pot between ${[...winners].join(" and ")} — both have ${description}.`;
  }
  const winner = ranked[0];
  const runnerUp = ranked[1];
  const beat = runnerUp ? ` — beating ${runnerUp.hand.description} (${runnerUp.label})` : "";
  return `${winner.label} wins with ${winner.hand.description}${beat}.`;
}
