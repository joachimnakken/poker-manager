/**
 * Fuzzy name matching for the check-in "did you mean" prompt. Deliberately client-side
 * and advisory: the server only ever attaches on an exact (case-insensitive) name, so a
 * typo can never silently merge two people — "Anna Berg" and "Anne Berg" are one edit
 * apart and both real. The prompt turns a typo into one extra tap instead of a
 * duplicate profile.
 */

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) {
    previous[j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= b.length; j++) {
      previous[j] = current[j];
    }
  }
  return previous[b.length];
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/** One typo forgiven in short names, two in long ones. */
export function typoBudget(length: number): number {
  return length >= 12 ? 2 : 1;
}

/**
 * The index of the unique candidate within a typo of `input`, or null. An exact match
 * returns null too — there is nothing to ask. Two candidates equally close also return
 * null rather than guessing which friend was meant.
 */
export function didYouMean(input: string, candidates: string[]): number | null {
  const target = normalize(input);
  if (candidates.some((candidate) => normalize(candidate) === target)) {
    return null;
  }
  const budget = typoBudget(target.length);
  let best: { index: number; distance: number } | null = null;
  let tied = false;
  candidates.forEach((candidate, index) => {
    const distance = editDistance(normalize(candidate), target);
    if (distance > budget) {
      return;
    }
    if (!best || distance < best.distance) {
      best = { index, distance };
      tied = false;
    } else if (distance === best.distance) {
      tied = true;
    }
  });
  return best !== null && !tied ? (best as { index: number }).index : null;
}
