import type { BlindLevel, Player } from "./types";

/** Under a quarter hour over is noise, not a problem worth interrupting the night for. */
const SLACK_MS = 15 * 60 * 1000;

/** No round gets cut below this. Past it you are playing bingo, not poker. */
const MIN_LEVEL_SECONDS = 300;

/**
 * Half an hour of play before the first word. A rate extrapolated from three minutes is
 * arithmetic, not evidence — it produces "1 out in 0m, the last 9 take 1m more", which is
 * self-consistent and useless.
 */
const MIN_ELAPSED_MS = 30 * 60 * 1000;

export interface RoundCut {
  /** The whole structure with unplayed non-break levels shortened. */
  structure: BlindLevel[];
  /** Scheduled play time removed. Exact — arithmetic over the structure, not a projection. */
  savedMs: number;
  /** The next unplayed level, before and after, so the label can name a real number. */
  nextFromSeconds: number;
  nextToSeconds: number;
}

export interface PaceSuggestion {
  /** ISO. The caller formats it — a pure function has no business knowing the locale. */
  projectedFinishAt: string;
  overrunMs: number;
  bustsSoFar: number;
  bustsRemaining: number;
  /** Null when there is nothing left worth shortening. */
  cut: RoundCut | null;
  reason: string;
}

export function formatSpan(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return minutes === 0 ? `${hours}h` : `${hours}h${minutes}m`;
}

/**
 * `"01:00"` entered at 22:00 means tomorrow morning, not fourteen hours ago — so the
 * time-of-day the host types resolves to its next occurrence.
 */
export function resolveTargetFinish(hhmm: string, from: Date = new Date()): string | undefined {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) {
    return undefined;
  }
  const target = new Date(from);
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (target.getTime() <= from.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.toISOString();
}

/** The `HH:MM` an `<input type="time">` wants, in the host's own timezone. */
export function targetFinishInputValue(iso: string | undefined): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Shortens every unplayed non-break level, aiming to give back the overrun.
 *
 * The current level is deliberately untouched: `readClock` derives its remaining time as
 * `duration - elapsed` against an unchanged `levelStartedAt`, so cutting the live level
 * below its elapsed time drives it negative and fires an immediate `advance-level`.
 */
function cutRemainingRounds(
  structure: BlindLevel[],
  currentLevelIndex: number,
  overrunMs: number,
): RoundCut | null {
  const cuttable = (level: BlindLevel, index: number) =>
    index > currentLevelIndex && !level.isBreak && level.duration > MIN_LEVEL_SECONDS;

  const cuttableMs = structure.reduce(
    (sum, level, index) => (cuttable(level, index) ? sum + level.duration * 1000 : sum),
    0,
  );
  if (cuttableMs === 0) {
    return null;
  }

  const factor = Math.max(0.2, 1 - overrunMs / cuttableMs);
  let savedMs = 0;
  let nextFromSeconds = 0;
  let nextToSeconds = 0;

  const next = structure.map((level, index) => {
    if (!cuttable(level, index)) {
      return level;
    }
    // Whole minutes, because that is the unit the settings page and the timer show.
    const duration = Math.max(MIN_LEVEL_SECONDS, Math.round((level.duration * factor) / 60) * 60);
    if (duration >= level.duration) {
      return level;
    }
    savedMs += (level.duration - duration) * 1000;
    if (nextFromSeconds === 0) {
      nextFromSeconds = level.duration;
      nextToSeconds = duration;
    }
    return { ...level, duration };
  });

  return savedMs === 0 ? null : { structure: next, savedMs, nextFromSeconds, nextToSeconds };
}

/**
 * Advisory only — the host decides. Projects the finish from the rate people have actually
 * been busting, and speaks up only once a break has been played and the projection runs
 * past the target the host set.
 *
 * The rate is linear and therefore pessimistic: eliminations accelerate as blinds rise, so
 * real finishes land earlier. That is the right way to be wrong for something whose job is
 * to get a decision made before 3am.
 */
export function suggestPace(input: {
  players: Player[];
  structure: BlindLevel[];
  currentLevelIndex: number;
  startedAt: string | null;
  targetFinishAt?: string;
  now?: number;
}): PaceSuggestion | null {
  const {
    players,
    structure,
    currentLevelIndex,
    startedAt,
    targetFinishAt,
    now = Date.now(),
  } = input;

  if (!startedAt || !targetFinishAt) {
    return null;
  }

  // Early levels are meant to be quiet, so nothing is said until a break has been played.
  const firstBreak = structure.findIndex((level) => level.isBreak);
  if (firstBreak < 0 || firstBreak >= currentLevelIndex) {
    return null;
  }

  const elapsedMs = now - Date.parse(startedAt);
  if (elapsedMs < MIN_ELAPSED_MS) {
    return null;
  }

  const activeCount = players.filter((player) => player.isActive).length;
  const bustsRemaining = activeCount - 1;
  if (bustsRemaining <= 0) {
    return null;
  }

  const bustsSoFar = players.length - activeCount;
  // Nobody out is the night this feature exists for, and also the divide-by-zero. Projecting
  // as if the first bust lands right now keeps the estimate finite and still pessimistic.
  const msPerBust = elapsedMs / Math.max(bustsSoFar, 1);
  const remainingMs = bustsRemaining * msPerBust;
  const projectedFinish = now + remainingMs;
  const overrunMs = projectedFinish - Date.parse(targetFinishAt);

  if (overrunMs <= SLACK_MS) {
    return null;
  }

  const reason =
    bustsSoFar === 0
      ? `Nobody out after ${formatSpan(elapsedMs)}. Even if the first goes right now, the last ${bustsRemaining} take ${formatSpan(remainingMs)} more — ${formatSpan(overrunMs)} past your target.`
      : `${bustsSoFar} out in ${formatSpan(elapsedMs)}. At that rate the last ${bustsRemaining} take ${formatSpan(remainingMs)} more — ${formatSpan(overrunMs)} past your target.`;

  return {
    projectedFinishAt: new Date(projectedFinish).toISOString(),
    overrunMs,
    bustsSoFar,
    bustsRemaining,
    cut: cutRemainingRounds(structure, currentLevelIndex, overrunMs),
    reason,
  };
}
