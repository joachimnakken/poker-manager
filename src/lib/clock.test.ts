import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readClock, levelsOverrun, serverOffset, type ClockAnchor } from "./clock.ts";
import type { BlindLevel } from "./types.ts";

const structure: BlindLevel[] = [
  { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, duration: 600 },
  { level: 2, smallBlind: 50, bigBlind: 100, ante: 0, duration: 600 },
  { level: 3, smallBlind: 0, bigBlind: 0, ante: 0, duration: 300, isBreak: true },
  { level: 4, smallBlind: 100, bigBlind: 200, ante: 0, duration: 600 },
];

const T0 = Date.parse("2026-08-17T20:00:00.000Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();

function anchor(over: Partial<ClockAnchor> = {}): ClockAnchor {
  return { currentLevelIndex: 0, levelStartedAt: at(0), pausedAt: null, pausedMs: 0, ...over };
}

describe("readClock", () => {
  test("counts down from the level duration", () => {
    const r = readClock(anchor(), structure, 0, T0 + 90_000);
    assert.equal(r.secondsRemaining, 510);
    assert.equal(r.isRunning, true);
    assert.equal(r.level?.level, 1);
    assert.equal(r.nextLevel?.level, 2);
  });

  test("full time remains before the level has started ticking", () => {
    assert.equal(readClock(anchor(), structure, 0, T0).secondsRemaining, 600);
  });

  test("freezes while paused, however long ago the pause began", () => {
    const a = anchor({ pausedAt: at(120_000) });
    assert.equal(readClock(a, structure, 0, T0 + 120_000).secondsRemaining, 480);
    assert.equal(readClock(a, structure, 0, T0 + 999_000).secondsRemaining, 480);
    assert.equal(readClock(a, structure, 0, T0 + 999_000).isRunning, false);
  });

  test("discounts accumulated pause time once resumed", () => {
    // ran 60s, paused 30s, then resumed and ran 60s more => 120s spent
    const a = anchor({ pausedMs: 30_000 });
    assert.equal(readClock(a, structure, 0, T0 + 150_000).secondsRemaining, 480);
  });

  test("never reports negative time", () => {
    assert.equal(readClock(anchor(), structure, 0, T0 + 9_999_000).secondsRemaining, 0);
  });

  test("flags a break level", () => {
    const a = anchor({ currentLevelIndex: 2 });
    const r = readClock(a, structure, 0, T0);
    assert.equal(r.isBreak, true);
    assert.equal(r.secondsRemaining, 300);
  });

  test("isComplete only on the final level, and only once spent", () => {
    const last = anchor({ currentLevelIndex: 3 });
    assert.equal(readClock(last, structure, 0, T0 + 100_000).isComplete, false);
    assert.equal(readClock(last, structure, 0, T0 + 600_000).isComplete, true);
    // an overrun mid-structure level is not "complete"
    assert.equal(readClock(anchor(), structure, 0, T0 + 600_000).isComplete, false);
  });

  test("an out-of-range index reads as complete rather than throwing", () => {
    const r = readClock(anchor({ currentLevelIndex: 99 }), structure, 0, T0);
    assert.equal(r.isComplete, true);
    assert.equal(r.level, undefined);
  });

  test("a phone whose clock is wrong still agrees, given the offset", () => {
    const skewed = T0 + 90_000 - 45_000; // phone is 45s behind
    const offset = serverOffset(at(90_000), skewed);
    assert.equal(readClock(anchor(), structure, offset, skewed).secondsRemaining, 510);
  });
});

describe("levelsOverrun", () => {
  test("zero while inside the current level", () => {
    assert.equal(levelsOverrun(anchor(), structure, 0, T0 + 599_000), 0);
  });

  test("counts a single elapsed level", () => {
    assert.equal(levelsOverrun(anchor(), structure, 0, T0 + 601_000), 1);
  });

  test("counts several, including across a break of a different length", () => {
    // 600 + 600 + 300 = 1500s covers levels 1, 2 and the break
    assert.equal(levelsOverrun(anchor(), structure, 0, T0 + 1_501_000), 3);
  });

  test("stops at the end of the structure instead of running away", () => {
    assert.equal(levelsOverrun(anchor(), structure, 0, T0 + 99_999_000), 4);
  });

  test("a paused clock never overruns", () => {
    assert.equal(levelsOverrun(anchor({ pausedAt: at(1000) }), structure, 0, T0 + 99_999_000), 0);
  });

  test("an unstarted clock never overruns", () => {
    assert.equal(levelsOverrun(anchor({ levelStartedAt: null }), structure, 0, T0 + 99_999_000), 0);
  });
});
