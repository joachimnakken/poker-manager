/**
 * Which playing card stands for each checked-in player on the projector wall.
 *
 * Two properties matter. The wall re-renders on every poll, so an assignment must be
 * derived from the name rather than drawn fresh — otherwise everyone's card flickers
 * every two seconds. And the aces belong to the two of us: they are simply not in the
 * deck anyone else is dealt from, so no amount of probing can hand one out.
 */

/** Normalized full name to the ace that is theirs, always. */
const RESERVED_ACES: Record<string, string> = {
  "joachim nakken": "As",
  "martin jakobsen": "Ah",
};

/** Everything except the aces — 48 cards, plenty for a home game. */
const DEALT_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
const SUITS = ["s", "h", "d", "c"];
const DEALABLE = DEALT_RANKS.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}`));

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** FNV-1a. Any stable hash would do; this one is short and has no dependencies. */
function hashName(name: string): number {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function isReserved(name: string): boolean {
  return normalize(name) in RESERVED_ACES;
}

/**
 * A card per name, in notation `PlayingCard` understands. Names are processed in the
 * order given — check-in order — so a guest arriving later probes around the cards
 * already claimed instead of shuffling anyone else's.
 */
export function assignCards(names: string[]): Map<string, string> {
  const cards = new Map<string, string>();
  const taken = new Set<string>();

  for (const name of names) {
    const ace = RESERVED_ACES[normalize(name)];
    if (ace !== undefined && !taken.has(ace)) {
      cards.set(name, ace);
      taken.add(ace);
    }
  }

  for (const name of names) {
    if (cards.has(name)) {
      continue;
    }
    const start = hashName(normalize(name)) % DEALABLE.length;
    for (let step = 0; step < DEALABLE.length; step++) {
      const card = DEALABLE[(start + step) % DEALABLE.length];
      if (!taken.has(card)) {
        cards.set(name, card);
        taken.add(card);
        break;
      }
    }
  }

  return cards;
}
