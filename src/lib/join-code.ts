/**
 * Pulling a tournament code out of whatever a QR turns out to contain. The projector
 * encodes a full join URL, but people also read the five characters off the screen and
 * type them, so both shapes are accepted.
 */

/**
 * The join-code alphabet: no I, O, 0 or 1, so nobody misreads one for another off a
 * projector. Lives here rather than beside the generator because the client needs it
 * too, and two copies would eventually disagree.
 */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 5;

const CODE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
const IN_URL = new RegExp(`/T/([${CODE_ALPHABET}]{${CODE_LENGTH}})(?:[/?#]|$)`);

export function normalizeCode(input: string): string | null {
  const candidate = input.trim().toUpperCase();
  return CODE.test(candidate) ? candidate : null;
}

/**
 * The code a scanned payload points at, or null if it is not one of ours. Accepts a
 * join URL from any host — a guest may have scanned a preview deployment — and a bare
 * typed code.
 */
export function parseJoinTarget(payload: string): string | null {
  const text = payload.trim();

  const direct = normalizeCode(text);
  if (direct) {
    return direct;
  }

  // Any /t/CODE path, with or without a scheme, query or trailing slash.
  const match = text.toUpperCase().match(IN_URL);
  return match ? match[1] : null;
}
