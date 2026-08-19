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
    // Horizontal reach over a burst's whole life, averaged across many bursts. Sampling
    // one instant of one burst straddles the threshold and flakes about a third of the
    // time; gravity also rules out using total displacement, since the fall dominates it
    // and is unaffected by launch speed.
    const runs = 20;
    let averageReach = 0;
    for (let run = 0; run < runs; run++) {
      let pieces = spawnBurst(0, 0);
      let reach = 0;
      for (let frame = 0; frame < 200 && pieces.length > 0; frame++) {
        pieces = stepConfetti(pieces, 1 / 60);
        for (const piece of pieces) {
          reach = Math.max(reach, Math.abs(piece.x));
        }
      }
      averageReach += reach / runs;
    }
    // Measured around 171px at BLAST = 3, against roughly 56px before it.
    assert.ok(averageReach > 120, `average horizontal reach was only ${Math.round(averageReach)}px`);
  });
});
