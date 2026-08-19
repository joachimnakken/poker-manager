import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { opacityOf, spawnBurst, stepConfetti } from "./confetti.ts";

describe("spawnBurst", () => {
  test("throws a spread of pieces from the given point", () => {
    const burst = spawnBurst(400, 300);
    assert.ok(burst.length >= 30);
    assert.ok(burst.every((p) => p.x === 400 && p.y === 300));
    // Not all flying the same way.
    assert.ok(new Set(burst.map((p) => Math.round(p.vx))).size > 5);
  });

  test("an ace goes up in gold, and bigger", () => {
    const gold = spawnBurst(0, 0, true);
    const plain = spawnBurst(0, 0, false);
    assert.ok(gold.length > plain.length);
    assert.ok(gold.every((p) => /^#(fcd34d|fbbf24|f59e0b|fffbeb|ffffff)$/i.test(p.color)));
  });
});

describe("stepConfetti", () => {
  test("gravity wins in the end", () => {
    let pieces = spawnBurst(500, 100);
    for (let i = 0; i < 30; i++) {
      pieces = stepConfetti(pieces, 1 / 60);
    }
    assert.ok(pieces.every((p) => p.vy > 0), "everything should be falling by now");
  });

  test("a burst clears itself out", () => {
    let pieces = spawnBurst(500, 100);
    for (let i = 0; i < 200; i++) {
      pieces = stepConfetti(pieces, 1 / 60);
    }
    assert.equal(pieces.length, 0, "confetti should not accumulate forever");
  });

  test("a huge dt does not strand pieces alive", () => {
    let pieces = spawnBurst(0, 0);
    for (let i = 0; i < 100; i++) {
      pieces = stepConfetti(pieces, 30);
    }
    assert.equal(pieces.length, 0);
  });

  test("pieces fade as they burn out", () => {
    const [piece] = spawnBurst(0, 0);
    assert.equal(opacityOf(piece), 1);
    piece.life = piece.ttl / 2;
    assert.ok(Math.abs(opacityOf(piece) - 0.5) < 0.01);
    piece.life = 0;
    assert.equal(opacityOf(piece), 0);
  });
});

describe("blast radius", () => {
  test("a burst throws pieces well clear of the card it came from", () => {
    let pieces = spawnBurst(0, 0);
    for (let i = 0; i < 30; i++) {
      pieces = stepConfetti(pieces, 1 / 60);
    }
    const furthest = Math.max(...pieces.map((p) => Math.hypot(p.x, p.y)));
    // A card is 128x176, so anything under about that is a puff, not a blast.
    assert.ok(furthest > 180, `furthest piece only reached ${Math.round(furthest)}px`);
  });
});
