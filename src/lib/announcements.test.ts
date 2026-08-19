import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { flashText, nextFlash } from "./announcements.ts";
import type { Announcement } from "./types.ts";

const NOW = Date.parse("2026-08-20T22:00:00.000Z");
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();

const shout = (over: Partial<Announcement> = {}): Announcement => ({
  id: "a:1",
  kind: "all-in",
  playerId: "p1",
  playerName: "Joachim Nakken",
  at: at(1),
  ...over,
});

describe("nextFlash", () => {
  test("flashes a fresh, unseen shout", () => {
    assert.equal(nextFlash([shout()], new Set(), NOW)?.id, "a:1");
  });

  test("never flashes the same one twice", () => {
    assert.equal(nextFlash([shout()], new Set(["a:1"]), NOW), null);
  });

  test("a phone waking from a pocket does not replay history", () => {
    const stale = [shout({ id: "a:1", at: at(60) }), shout({ id: "a:2", at: at(25) })];
    assert.equal(nextFlash(stale, new Set(), NOW), null);
  });

  test("when several land between polls, the newest wins", () => {
    const many = [
      shout({ id: "a:1", at: at(5) }),
      shout({ id: "a:3", at: at(1) }),
      shout({ id: "a:2", at: at(3) }),
    ];
    assert.equal(nextFlash(many, new Set(), NOW)?.id, "a:3");
  });

  test("an unseen one is still found among seen ones", () => {
    const list = [shout({ id: "a:1", at: at(4) }), shout({ id: "k:9", kind: "eliminated", at: at(2) })];
    assert.equal(nextFlash(list, new Set(["a:1"]), NOW)?.id, "k:9");
  });

  test("the freshness window is configurable", () => {
    assert.equal(nextFlash([shout({ at: at(20) })], new Set(), NOW, 30_000)?.id, "a:1");
    assert.equal(nextFlash([shout({ at: at(20) })], new Set(), NOW, 10_000), null);
  });

  test("an empty list is not an error", () => {
    assert.equal(nextFlash([], new Set(), NOW), null);
  });
});

describe("flashText", () => {
  test("reads as a shout for an all-in", () => {
    assert.equal(flashText(shout()), "Joachim Nakken is ALL IN");
  });

  test("an elimination carries the placing when there is one", () => {
    assert.equal(
      flashText(shout({ kind: "eliminated", finishPosition: 5 })),
      "Joachim Nakken is out — #5",
    );
    assert.equal(flashText(shout({ kind: "eliminated" })), "Joachim Nakken is out");
  });
});
