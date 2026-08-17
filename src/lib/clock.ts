import type { BlindLevel, ClockAnchor } from "./types";

export type { ClockAnchor };

export interface ClockReading {
  level: BlindLevel | undefined;
  nextLevel: BlindLevel | undefined;
  secondsRemaining: number;
  isRunning: boolean;
  isBreak: boolean;
  /** True once the final level's time is spent. */
  isComplete: boolean;
}

/**
 * Phone clocks drift, so every reading is taken against the server's notion of now.
 * Capture this once per state fetch and pass it to `readClock`.
 */
export function serverOffset(serverNow: string, localNow = Date.now()): number {
  return new Date(serverNow).getTime() - localNow;
}

function elapsedMs(anchor: ClockAnchor, now: number): number {
  if (!anchor.levelStartedAt) {
    return 0;
  }
  const started = new Date(anchor.levelStartedAt).getTime();
  const frozenAt = anchor.pausedAt ? new Date(anchor.pausedAt).getTime() : now;
  return Math.max(0, frozenAt - started - anchor.pausedMs);
}

export function readClock(
  anchor: ClockAnchor,
  structure: BlindLevel[],
  offset = 0,
  localNow = Date.now(),
): ClockReading {
  const now = localNow + offset;
  const level = structure[anchor.currentLevelIndex];
  const nextLevel = structure[anchor.currentLevelIndex + 1];
  const isRunning = anchor.levelStartedAt !== null && anchor.pausedAt === null;

  if (!level) {
    return { level, nextLevel, secondsRemaining: 0, isRunning: false, isBreak: false, isComplete: true };
  }

  const remaining = level.duration - Math.floor(elapsedMs(anchor, now) / 1000);
  const isLast = anchor.currentLevelIndex >= structure.length - 1;

  return {
    level,
    nextLevel,
    secondsRemaining: Math.max(0, remaining),
    isRunning,
    isBreak: level.isBreak ?? false,
    isComplete: isLast && remaining <= 0,
  };
}

/**
 * How many whole levels the anchor has overrun. The host polls this and advances the
 * server; clients only read. Returns 0 when the anchor is still on the right level.
 */
export function levelsOverrun(
  anchor: ClockAnchor,
  structure: BlindLevel[],
  offset = 0,
  localNow = Date.now(),
): number {
  if (!anchor.levelStartedAt || anchor.pausedAt) {
    return 0;
  }
  let spent = elapsedMs(anchor, localNow + offset) / 1000;
  let overrun = 0;
  let index = anchor.currentLevelIndex;

  while (index < structure.length && spent >= structure[index].duration) {
    spent -= structure[index].duration;
    index += 1;
    overrun += 1;
  }
  return overrun;
}
