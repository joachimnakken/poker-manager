import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  suggestPace,
  resolveTargetFinish,
  targetFinishInputValue,
  formatSpan,
} from "./pacing.ts";
import type { BlindLevel, Player } from "./types.ts";

const structure: BlindLevel[] = [
  { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, duration: 1200 },
  { level: 2, smallBlind: 50, bigBlind: 100, ante: 0, duration: 1200 },
  { level: 3, smallBlind: 0, bigBlind: 0, ante: 0, duration: 600, isBreak: true },
  { level: 4, smallBlind: 100, bigBlind: 200, ante: 0, duration: 1200 },
  { level: 5, smallBlind: 200, bigBlind: 400, ante: 0, duration: 1200 },
  { level: 6, smallBlind: 400, bigBlind: 800, ante: 0, duration: 1200 },
];

const T0 = Date.parse("2026-08-21T19:00:00.000Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** `field(11, 2)` = eleven players who bought in, two of them out. */
function field(total: number, busted: number): Player[] {
  return Array.from({ length: total }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    rebuys: 0,
    hasAddon: false,
    isActive: index >= busted,
  }));
}

/** The default night: 11 players, started at T0, aiming to be done by 01:00 (6h in). */
function pace(over: Partial<Parameters<typeof suggestPace>[0]> = {}) {
  return suggestPace({
    players: field(11, 2),
    structure,
    currentLevelIndex: 4,
    startedAt: at(0),
    targetFinishAt: at(6 * HOUR),
    now: T0 + 90 * MINUTE,
    ...over,
  });
}

describe("suggestPace — when it stays quiet", () => {
  test("says nothing with no target set", () => {
    assert.equal(pace({ targetFinishAt: undefined }), null);
  });

  test("says nothing before the tournament has started", () => {
    assert.equal(pace({ startedAt: null }), null);
  });

  test("says nothing until the first break has been played", () => {
    // Level index 2 IS the break; it has to be behind us, not current.
    assert.equal(pace({ currentLevelIndex: 2 }), null);
    assert.equal(pace({ currentLevelIndex: 1 }), null);
    assert.notEqual(pace({ currentLevelIndex: 3 }), null);
  });

  test("says nothing when there is no break in the structure at all", () => {
    assert.equal(pace({ structure: structure.filter((level) => !level.isBreak) }), null);
  });

  test("says nothing when the projection lands inside the target", () => {
    // 8 out in 90m is a fast night: 2 left, ~11m per bust, finishes hours early.
    assert.equal(pace({ players: field(11, 8) }), null);
  });

  test("says nothing within the slack window", () => {
    // 5 out in 90m -> 18m per bust, 5 remaining busts -> 90m more, finishing at T0+3h.
    // A target of T0+2h50m is overrun by only 10m, inside the 15m slack.
    assert.equal(
      pace({ players: field(11, 5), targetFinishAt: at(2 * HOUR + 50 * MINUTE) }),
      null,
    );
  });

  test("says nothing heads-up — one more bust ends it either way", () => {
    assert.equal(pace({ players: field(11, 10) }), null);
  });

  test("says nothing in the first half hour, however hopeless the target", () => {
    // A rate extrapolated from half an hour of play is arithmetic, not evidence.
    assert.equal(pace({ now: T0 + 29 * MINUTE, targetFinishAt: at(0) }), null);
    assert.notEqual(pace({ now: T0 + 31 * MINUTE, targetFinishAt: at(0) }), null);
  });
});

describe("suggestPace — the projection", () => {
  test("extrapolates from the rate people have actually busted", () => {
    // 2 out in 90m = 45m per bust; 8 still to bust = 6h more, so 7h30m after the start.
    const suggestion = pace();
    assert.ok(suggestion);
    assert.equal(suggestion.bustsSoFar, 2);
    assert.equal(suggestion.bustsRemaining, 8);
    assert.equal(suggestion.projectedFinishAt, at(90 * MINUTE + 6 * HOUR));
    assert.equal(suggestion.overrunMs, 90 * MINUTE + 6 * HOUR - 6 * HOUR);
    assert.match(suggestion.reason, /2 out in 1h30m/);
  });

  test("stays finite with nobody out, and says so honestly", () => {
    // The night this exists for: 0 busts would divide by zero, so the rate is floored at
    // one bust — 90m each for the 10 still in, i.e. 15h more.
    const suggestion = pace({ players: field(11, 0) });
    assert.ok(suggestion);
    assert.equal(suggestion.bustsSoFar, 0);
    assert.equal(suggestion.bustsRemaining, 10);
    assert.ok(Number.isFinite(Date.parse(suggestion.projectedFinishAt)));
    assert.equal(suggestion.projectedFinishAt, at(90 * MINUTE + 10 * 90 * MINUTE));
    assert.match(suggestion.reason, /Nobody out after 1h30m/);
    assert.match(suggestion.reason, /Even if the first goes right now/);
  });

  test("counts players added mid-tournament into the field", () => {
    const suggestion = pace({ players: field(12, 2) });
    assert.ok(suggestion);
    assert.equal(suggestion.bustsRemaining, 9);
  });
});

describe("suggestPace — the round cut", () => {
  test("never touches played levels, the current level, or a break", () => {
    const suggestion = pace();
    assert.ok(suggestion?.cut);
    const cut = suggestion.cut.structure;

    for (let index = 0; index <= 4; index++) {
      assert.deepEqual(cut[index], structure[index], `level ${index} must be untouched`);
    }
    assert.deepEqual(
      cut.filter((level) => level.isBreak),
      structure.filter((level) => level.isBreak),
      "breaks must be untouched",
    );
  });

  test("shortens the unplayed levels and reports what that actually saves", () => {
    const suggestion = pace();
    assert.ok(suggestion?.cut);
    const { structure: cut, savedMs, nextFromSeconds, nextToSeconds } = suggestion.cut;

    // Only level index 5 is unplayed: 20m of cuttable play against a 1h30m overrun, so the
    // factor floors at 0.2 -> 1200s * 0.2 = 240s, below the 300s minimum, so 300s.
    assert.equal(cut[5].duration, 300);
    assert.equal(nextFromSeconds, 1200);
    assert.equal(nextToSeconds, 300);
    assert.equal(savedMs, (1200 - 300) * 1000);
    assert.equal(cut.length, structure.length, "cutting must not add or drop levels");
  });

  test("keeps blinds and antes identical — only duration changes", () => {
    const suggestion = pace();
    assert.ok(suggestion?.cut);
    suggestion.cut.structure.forEach((level, index) => {
      assert.equal(level.smallBlind, structure[index].smallBlind);
      assert.equal(level.bigBlind, structure[index].bigBlind);
      assert.equal(level.ante, structure[index].ante);
      assert.equal(level.level, structure[index].level);
    });
  });

  test("offers no cut when every remaining level is already at the floor", () => {
    const floored = structure.map((level, index) =>
      index > 4 && !level.isBreak ? { ...level, duration: 300 } : level,
    );
    const suggestion = pace({ structure: floored });
    assert.ok(suggestion);
    assert.equal(suggestion.cut, null);
  });

  test("offers no cut on the last level, when nothing is unplayed", () => {
    const suggestion = pace({ currentLevelIndex: structure.length - 1 });
    assert.ok(suggestion);
    assert.equal(suggestion.cut, null);
  });

  test("makes a proportional cut when the overrun is modest", () => {
    // 3 out in 3h = 1h per bust, 7 to go = 7h more, finishing 4h past a T0+6h target.
    // Cuttable play is levels 5 and 6 (40m), so the factor floors again — assert instead
    // that a long tail gets a proportional trim rather than the floor.
    const longTail: BlindLevel[] = [
      ...structure,
      ...Array.from({ length: 20 }, (_, index) => ({
        level: 7 + index,
        smallBlind: 800,
        bigBlind: 1600,
        ante: 0,
        duration: 1200,
      })),
    ];
    const suggestion = pace({ structure: longTail, players: field(11, 3), now: T0 + 3 * HOUR });
    assert.ok(suggestion?.cut);
    const trimmed = suggestion.cut.structure[5].duration;
    assert.ok(trimmed > 300, `expected a proportional trim, got ${trimmed}`);
    assert.ok(trimmed < 1200, `expected a trim, got ${trimmed}`);
    assert.equal(trimmed % 60, 0, "durations stay whole minutes");
  });
});

describe("resolveTargetFinish", () => {
  test("resolves to today when the time is still ahead", () => {
    const from = new Date("2026-08-21T19:00:00.000Z");
    const iso = resolveTargetFinish(`${(from.getHours() + 2) % 24}:30`.padStart(5, "0"), from);
    assert.ok(iso);
    assert.ok(Date.parse(iso) > from.getTime());
  });

  test("rolls past midnight rather than landing in the past", () => {
    const from = new Date("2026-08-21T22:00:00.000Z");
    // One minute ago in local terms, so it must resolve to tomorrow.
    const hhmm = targetFinishInputValue(new Date(from.getTime() - MINUTE).toISOString());
    const iso = resolveTargetFinish(hhmm, from);
    assert.ok(iso);
    const delta = Date.parse(iso) - from.getTime();
    assert.ok(delta > 23 * HOUR, `expected nearly a day ahead, got ${formatSpan(delta)}`);
  });

  test("round-trips through the input value", () => {
    const from = new Date("2026-08-21T19:00:00.000Z");
    const iso = resolveTargetFinish("01:15", from);
    assert.ok(iso);
    assert.equal(targetFinishInputValue(iso), "01:15");
  });

  test("rejects anything that is not a time", () => {
    assert.equal(resolveTargetFinish(""), undefined);
    assert.equal(resolveTargetFinish("midnight"), undefined);
    assert.equal(targetFinishInputValue(undefined), "");
  });
});

describe("formatSpan", () => {
  test("reads the way someone would say it", () => {
    assert.equal(formatSpan(45 * MINUTE), "45m");
    assert.equal(formatSpan(HOUR), "1h");
    assert.equal(formatSpan(HOUR + 10 * MINUTE), "1h10m");
    assert.equal(formatSpan(6 * HOUR), "6h");
    assert.equal(formatSpan(-5000), "0m");
  });
});
