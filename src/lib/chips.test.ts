import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bigBlinds, chipRanking, countStatus, countedTotal, expectedTotal, isStale } from "./chips.ts";
import type { BlindLevel, Player, TournamentConfig } from "./types.ts";

const config = {
  startingChips: 10_000,
  rebuyChips: 10_000,
  addonChips: 5_000,
} as TournamentConfig;

const player = (over: Partial<Player> = {}): Player => ({
  id: over.name ?? "p",
  name: "A",
  rebuys: 0,
  hasAddon: false,
  isActive: true,
  ...over,
});

describe("expectedTotal", () => {
  test("counts buy-ins, rebuys and add-ons", () => {
    const field = [
      player({ name: "a" }),
      player({ name: "b", rebuys: 2 }),
      player({ name: "c", hasAddon: true }),
    ];
    // 3 buy-ins + 2 rebuys + 1 add-on
    assert.equal(expectedTotal(field, config), 30_000 + 20_000 + 5_000);
  });
});

describe("countStatus", () => {
  test("reports what is still uncounted", () => {
    const field = [
      player({ name: "a", chipCount: 12_000 }),
      player({ name: "b" }),
      player({ name: "c", chipCount: 8_000 }),
    ];
    const status = countStatus(field, config);
    assert.equal(status.active, 3);
    assert.equal(status.counted, 2);
    assert.equal(status.missing, 1);
    assert.equal(status.countedChips, 20_000);
    // Nothing is claimed to be wrong while a stack is still uncounted.
    assert.equal(status.mismatch, false);
  });

  test("a full, correct count adds up", () => {
    const field = [
      player({ name: "a", chipCount: 12_000 }),
      player({ name: "b", chipCount: 18_000 }),
    ];
    const status = countStatus(field, config);
    assert.equal(status.expectedChips, 20_000);
    assert.equal(status.difference, 10_000);
    assert.equal(status.mismatch, true, "30k counted against 20k paid for is a miscount");
  });

  test("catches a miscount once everyone is counted", () => {
    const field = [
      player({ name: "a", chipCount: 9_000 }),
      player({ name: "b", chipCount: 10_000 }),
    ];
    const status = countStatus(field, config);
    assert.equal(status.difference, -1_000);
    assert.equal(status.mismatch, true);
  });

  test("eliminated players take their chips out of the expectation", () => {
    const field = [
      player({ name: "a", chipCount: 15_000 }),
      player({ name: "b", chipCount: 5_000 }),
      player({ name: "c", isActive: false, finishPosition: 3 }),
    ];
    const status = countStatus(field, config);
    // Three bought in, one is out: 20k should be on the table, and it is.
    assert.equal(status.expectedChips, 20_000);
    assert.equal(status.mismatch, false);
  });

  test("a rebuy is accounted for", () => {
    const field = [
      player({ name: "a", rebuys: 1, chipCount: 20_000 }),
      player({ name: "b", chipCount: 10_000 }),
    ];
    assert.equal(countStatus(field, config).mismatch, false);
  });

  test("nothing counted is not a mismatch", () => {
    const field = [player({ name: "a" }), player({ name: "b" })];
    const status = countStatus(field, config);
    assert.equal(status.mismatch, false);
    assert.equal(status.counted, 0);
  });
});

describe("bigBlinds", () => {
  const level = { level: 3, smallBlind: 100, bigBlind: 200, ante: 0, duration: 600 } as BlindLevel;

  test("expresses a stack in the only unit players care about", () => {
    assert.equal(bigBlinds(10_000, level), 50);
    assert.equal(bigBlinds(4_300, level), 21.5);
  });

  test("a break has no blinds to divide by", () => {
    assert.equal(bigBlinds(10_000, undefined), null);
    assert.equal(bigBlinds(10_000, { ...level, bigBlind: 0 }), null);
  });
});

describe("chipRanking", () => {
  test("biggest stack first, uncounted after, eliminated last", () => {
    const field = [
      player({ name: "small", chipCount: 3_000 }),
      player({ name: "out", isActive: false, finishPosition: 4 }),
      player({ name: "unknown" }),
      player({ name: "big", chipCount: 30_000 }),
    ];
    assert.deepEqual(
      chipRanking(field).map((p) => p.name),
      ["big", "small", "unknown", "out"],
    );
  });

  test("an uncounted stack does not read as a short stack", () => {
    const order = chipRanking([player({ name: "unknown" }), player({ name: "tiny", chipCount: 1 })]);
    assert.equal(order[0].name, "tiny");
  });
});

describe("isStale", () => {
  const levelStart = "2026-08-20T21:00:00.000Z";

  test("a count from before this level is stale", () => {
    const p = player({ chipCount: 100, chipsUpdatedAt: "2026-08-20T20:30:00.000Z" });
    assert.equal(isStale(p, levelStart), true);
  });

  test("a count from this level is current", () => {
    const p = player({ chipCount: 100, chipsUpdatedAt: "2026-08-20T21:05:00.000Z" });
    assert.equal(isStale(p, levelStart), false);
  });

  test("an uncounted stack is not stale, it is absent", () => {
    assert.equal(isStale(player(), levelStart), false);
  });
});

describe("countedTotal", () => {
  test("ignores players who are out", () => {
    const field = [
      player({ name: "a", chipCount: 10 }),
      player({ name: "b", isActive: false, chipCount: 999 }),
    ];
    assert.equal(countedTotal(field), 10);
  });
});
