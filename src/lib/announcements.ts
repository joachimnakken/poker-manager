import type { Announcement } from "./types";

/** Anything older than this is history, not news, and is never flashed. */
export const FRESH_MS = 8000;

/**
 * Which shout a device should flash next, given what it has already shown.
 *
 * The list arrives on every poll, so without a record of what has been seen a phone
 * would re-flash the same all-in every two seconds. And a phone that was asleep must not
 * wake up and replay a minute of them, which is what the freshness window is for.
 */
export function nextFlash(
  announcements: Announcement[],
  seen: ReadonlySet<string>,
  nowMs: number,
  freshMs: number = FRESH_MS,
): Announcement | null {
  let best: Announcement | null = null;
  for (const announcement of announcements) {
    if (seen.has(announcement.id)) {
      continue;
    }
    if (nowMs - Date.parse(announcement.at) > freshMs) {
      continue;
    }
    // Several can land between two polls; the newest is the one worth showing.
    if (best === null || announcement.at > best.at) {
      best = announcement;
    }
  }
  return best;
}

/** What the room reads. Kept here so the phone and the projector cannot drift. */
export function flashText(announcement: Announcement): string {
  if (announcement.kind === "all-in") {
    return `${announcement.playerName} is ALL IN`;
  }
  return announcement.finishPosition !== undefined
    ? `${announcement.playerName} is out — #${announcement.finishPosition}`
    : `${announcement.playerName} is out`;
}
