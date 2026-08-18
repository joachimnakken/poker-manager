/**
 * Deterministic Texas hold'em hand evaluation. The showdown camera uses a vision model
 * only to READ the cards off the table — who actually wins is decided here, in code
 * that can be unit-tested, so the app's verdict is provable rather than an AI opinion.
 */

export type Suit = "s" | "h" | "d" | "c";

export interface Card {
  /** 2–14, where 11=J, 12=Q, 13=K, 14=A. */
  rank: number;
  suit: Suit;
}

const RANK_CHARS: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

const RANK_WORDS: Record<number, [singular: string, plural: string]> = {
  2: ["two", "twos"], 3: ["three", "threes"], 4: ["four", "fours"],
  5: ["five", "fives"], 6: ["six", "sixes"], 7: ["seven", "sevens"],
  8: ["eight", "eights"], 9: ["nine", "nines"], 10: ["ten", "tens"],
  11: ["jack", "jacks"], 12: ["queen", "queens"], 13: ["king", "kings"],
  14: ["ace", "aces"],
};

export const SUIT_GLYPHS: Record<Suit, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

/** Parses standard notation like "As", "Td", "9h". Throws on anything else. */
export function parseCard(text: string): Card {
  const trimmed = text.trim();
  const rank = RANK_CHARS[trimmed[0]?.toUpperCase() ?? ""];
  const suit = trimmed[1]?.toLowerCase() as Suit;
  if (trimmed.length !== 2 || !rank || !"shdc".includes(suit)) {
    throw new Error(`Not a card: "${text}" (expected e.g. "As", "Td", "9h")`);
  }
  return { rank, suit };
}

export function cardLabel(card: Card): string {
  const rankChar = Object.entries(RANK_CHARS).find(([, value]) => value === card.rank)![0];
  return `${rankChar}${SUIT_GLYPHS[card.suit]}`;
}

/** Back to wire notation ("As"), the inverse of parseCard. */
export function cardNotation(card: Card): string {
  const rankChar = Object.entries(RANK_CHARS).find(([, value]) => value === card.rank)![0];
  return `${rankChar}${card.suit}`;
}

export function rankWord(rank: number, plural = false): string {
  return RANK_WORDS[rank][plural ? 1 : 0];
}

export interface HandResult {
  /** 1 (high card) … 9 (straight flush). */
  category: number;
  categoryName: string;
  /** Compared lexicographically within a category. */
  tiebreak: number[];
  /** The best five cards. */
  cards: Card[];
  /** e.g. "a full house, kings full of nines". */
  description: string;
}

const CATEGORY_NAMES = [
  "", "High card", "One pair", "Two pair", "Three of a kind", "Straight",
  "Flush", "Full house", "Four of a kind", "Straight flush",
];

/** The straight's high card, treating A-2-3-4-5 as five-high; null when no straight. */
function straightHigh(ranks: number[]): number | null {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.length !== 5) return null;
  if (unique[0] - unique[4] === 4) return unique[0];
  if (unique[0] === 14 && unique[1] === 5 && unique[1] - unique[4] === 3) return 5;
  return null;
}

export function evaluateFive(cards: Card[]): HandResult {
  if (cards.length !== 5) {
    throw new Error(`evaluateFive needs exactly 5 cards, got ${cards.length}`);
  }
  const ranks = cards.map((card) => card.rank);
  const isFlush = cards.every((card) => card.suit === cards[0].suit);
  const straight = straightHigh(ranks);

  // Rank multiplicities, ordered by count then rank — the tiebreak skeleton for
  // every paired category.
  const counts = new Map<number, number>();
  for (const rank of ranks) {
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map(([, count]) => count).join("");
  const byGroup = groups.map(([rank]) => rank);

  const result = (category: number, tiebreak: number[], description: string): HandResult => ({
    category,
    categoryName: CATEGORY_NAMES[category],
    tiebreak,
    cards: [...cards].sort((a, b) => b.rank - a.rank),
    description,
  });

  if (isFlush && straight !== null) {
    return result(
      9,
      [straight],
      straight === 14 ? "a royal flush" : `a straight flush, ${rankWord(straight)} high`,
    );
  }
  if (shape === "41") {
    return result(8, byGroup, `four of a kind, ${rankWord(byGroup[0], true)}`);
  }
  if (shape === "32") {
    return result(
      7,
      byGroup,
      `a full house, ${rankWord(byGroup[0], true)} full of ${rankWord(byGroup[1], true)}`,
    );
  }
  if (isFlush) {
    return result(6, byGroup, `a flush, ${rankWord(byGroup[0])} high`);
  }
  if (straight !== null) {
    return result(5, [straight], `a straight, ${rankWord(straight)} high`);
  }
  if (shape === "311") {
    return result(4, byGroup, `three of a kind, ${rankWord(byGroup[0], true)}`);
  }
  if (shape === "221") {
    return result(
      3,
      byGroup,
      `two pair, ${rankWord(byGroup[0], true)} and ${rankWord(byGroup[1], true)}`,
    );
  }
  if (shape === "2111") {
    return result(2, byGroup, `a pair of ${rankWord(byGroup[0], true)}`);
  }
  return result(1, byGroup, `${rankWord(byGroup[0])} high`);
}

/** Positive when a beats b, negative when b beats a, zero on a genuine chop. */
export function compareHands(a: HandResult, b: HandResult): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const difference = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The best five-card hand from 5–7 cards (hole cards + board). */
export function evaluateBest(cards: Card[]): HandResult {
  if (cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluateBest needs 5–7 cards, got ${cards.length}`);
  }
  let best: HandResult | null = null;
  const chosen: Card[] = [];
  const pick = (start: number) => {
    if (chosen.length === 5) {
      const candidate = evaluateFive(chosen);
      if (!best || compareHands(candidate, best) > 0) {
        best = candidate;
      }
      return;
    }
    for (let i = start; i <= cards.length - (5 - chosen.length); i++) {
      chosen.push(cards[i]);
      pick(i + 1);
      chosen.pop();
    }
  };
  pick(0);
  return best!;
}

/** The reference sheet, best to worst — what used to be the printed piece of paper. */
export const HAND_RANKINGS: { name: string; description: string; example: string[] }[] = [
  {
    name: "Royal flush",
    description: "A, K, Q, J, 10, all the same suit. The best possible hand.",
    example: ["As", "Ks", "Qs", "Js", "Ts"],
  },
  {
    name: "Straight flush",
    description: "Five cards in a row, all the same suit.",
    example: ["9h", "8h", "7h", "6h", "5h"],
  },
  {
    name: "Four of a kind",
    description: "Four cards of the same rank.",
    example: ["Qc", "Qd", "Qh", "Qs", "7d"],
  },
  {
    name: "Full house",
    description: "Three of a kind plus a pair. Ties break on the three first.",
    example: ["Kd", "Kh", "Ks", "9c", "9s"],
  },
  {
    name: "Flush",
    description: "Five cards of the same suit, any order. Highest card breaks ties.",
    example: ["Ad", "Jd", "8d", "6d", "3d"],
  },
  {
    name: "Straight",
    description: "Five cards in a row, mixed suits. The ace can play low: A-2-3-4-5.",
    example: ["Tc", "9d", "8h", "7s", "6c"],
  },
  {
    name: "Three of a kind",
    description: "Three cards of the same rank.",
    example: ["7c", "7d", "7h", "Ks", "2d"],
  },
  {
    name: "Two pair",
    description: "Two different pairs. The higher pair breaks ties, then the lower, then the kicker.",
    example: ["Kh", "Kc", "9d", "9s", "5h"],
  },
  {
    name: "One pair",
    description: "Two cards of the same rank. The other three cards break ties.",
    example: ["Jd", "Js", "Ac", "8h", "4d"],
  },
  {
    name: "High card",
    description: "None of the above — your highest card plays.",
    example: ["Ah", "Qd", "9s", "6c", "3h"],
  },
];
