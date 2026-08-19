import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { seedParticle, stepParticles, type Particle } from "./card-physics.ts";

const card = (over: Partial<Particle> = {}): Particle => ({
  x: 500, y: 400, vx: 0, vy: 0, width: 128, height: 176, ...over,
});

const WIDTH = 1600;
const HEIGHT = 900;

describe("walls", () => {
  test("a card heading left comes back off the edge", () => {
    // Half a card is 64px, so x=60 puts its edge just past the wall.
    const p = card({ x: 60, vx: -100 });
    stepParticles([p], WIDTH, HEIGHT, null, 1 / 60);
    assert.ok(p.vx > 0, "velocity should reverse");
    assert.ok(p.x - p.width / 2 >= -0.001, "should sit inside the wall");
  });

  test("every edge holds, over a long run", () => {
    const cards = [
      card({ x: 100, y: 100, vx: -400, vy: -400 }),
      card({ x: 1500, y: 800, vx: 400, vy: 400 }),
    ];
    for (let frame = 0; frame < 2000; frame++) {
      stepParticles(cards, WIDTH, HEIGHT, null, 1 / 60);
    }
    for (const p of cards) {
      assert.ok(p.x - p.width / 2 >= -0.5 && p.x + p.width / 2 <= WIDTH + 0.5, `x escaped: ${p.x}`);
      assert.ok(p.y - p.height / 2 >= -0.5 && p.y + p.height / 2 <= HEIGHT + 0.5, `y escaped: ${p.y}`);
    }
  });

  test("a giant dt cannot tunnel a card through a wall", () => {
    const p = card({ x: 800, y: 450, vx: -5000, vy: 0 });
    stepParticles([p], WIDTH, HEIGHT, null, 30); // 30s, as if the tab were backgrounded
    assert.ok(p.x - p.width / 2 >= -0.5, `escaped to ${p.x}`);
  });
});

describe("the QR obstacle", () => {
  const obstacle = { left: 700, top: 300, right: 900, bottom: 600 };

  test("a card is pushed out and turned around", () => {
    const p = card({ x: 780, y: 450, vx: 100, vy: 0 });
    stepParticles([p], WIDTH, HEIGHT, obstacle, 1 / 60);
    const box = { left: p.x - p.width / 2, right: p.x + p.width / 2, top: p.y - p.height / 2, bottom: p.y + p.height / 2 };
    const stillOverlapping =
      box.left < obstacle.right && box.right > obstacle.left &&
      box.top < obstacle.bottom && box.bottom > obstacle.top;
    assert.ok(!stillOverlapping, "should be clear of the obstacle");
  });

  test("the QR stays clear across a long run of traffic", () => {
    const cards = Array.from({ length: 8 }, (_, i) =>
      seedParticle(i, 8, WIDTH, HEIGHT, 128, 176),
    );
    for (let frame = 0; frame < 4000; frame++) {
      stepParticles(cards, WIDTH, HEIGHT, obstacle, 1 / 60);
      for (const p of cards) {
        const box = { left: p.x - p.width / 2, right: p.x + p.width / 2, top: p.y - p.height / 2, bottom: p.y + p.height / 2 };
        const inside =
          box.left < obstacle.right && box.right > obstacle.left &&
          box.top < obstacle.bottom && box.bottom > obstacle.top;
        assert.ok(!inside, `a card sat on the QR at frame ${frame}`);
      }
    }
  });
});

describe("card on card", () => {
  test("two cards meeting head on swap direction", () => {
    const a = card({ x: 500, vx: 100 });
    const b = card({ x: 600, vx: -100 });
    stepParticles([a, b], WIDTH, HEIGHT, null, 1 / 60);
    assert.ok(a.vx < 0, "a should be turned back");
    assert.ok(b.vx > 0, "b should be turned back");
  });

  test("an overlapping pair is separated rather than left stuck", () => {
    const a = card({ x: 500, vx: 60 });
    const b = card({ x: 520, vx: -60 });
    stepParticles([a, b], WIDTH, HEIGHT, null, 1 / 60);
    assert.ok(Math.abs(a.x - b.x) >= a.width - 0.001, `still overlapping: ${Math.abs(a.x - b.x)}`);
  });

  test("a crowded wall never leaves two cards overlapping", () => {
    const cards = Array.from({ length: 14 }, (_, i) =>
      seedParticle(i, 14, WIDTH, HEIGHT, 128, 176),
    );
    for (let frame = 0; frame < 3000; frame++) {
      stepParticles(cards, WIDTH, HEIGHT, null, 1 / 60);
    }
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i];
        const b = cards[j];
        const apart =
          Math.abs(a.x - b.x) >= a.width - 1 || Math.abs(a.y - b.y) >= a.height - 1;
        assert.ok(apart, `cards ${i} and ${j} overlap after settling`);
      }
    }
  });
});

describe("seedParticle", () => {
  test("cards start inside the wall and actually move", () => {
    for (let i = 0; i < 14; i++) {
      const p = seedParticle(i, 14, WIDTH, HEIGHT, 128, 176);
      assert.ok(p.x - p.width / 2 >= -0.5 && p.x + p.width / 2 <= WIDTH + 0.5);
      assert.ok(p.y - p.height / 2 >= -0.5 && p.y + p.height / 2 <= HEIGHT + 0.5);
      assert.ok(Math.hypot(p.vx, p.vy) > 30, "should have a real drift");
    }
  });

  test("the same index always seeds the same card", () => {
    const a = seedParticle(3, 14, WIDTH, HEIGHT, 128, 176);
    const b = seedParticle(3, 14, WIDTH, HEIGHT, 128, 176);
    assert.deepEqual(a, b);
  });
});

describe("corner strikes", () => {
  test("a card driven into the top-left corner reports a hit", () => {
    const p = card({ x: 66, y: 90, vx: -200, vy: -200 });
    const hits = stepParticles([p], WIDTH, HEIGHT, null, 1 / 60);
    assert.deepEqual(hits, [0]);
  });

  test("all four corners count", () => {
    const corners: Particle[] = [
      card({ x: 66, y: 90, vx: -200, vy: -200 }),
      card({ x: WIDTH - 66, y: 90, vx: 200, vy: -200 }),
      card({ x: 66, y: HEIGHT - 90, vx: -200, vy: 200 }),
      card({ x: WIDTH - 66, y: HEIGHT - 90, vx: 200, vy: 200 }),
    ];
    for (const p of corners) {
      assert.deepEqual(stepParticles([p], WIDTH, HEIGHT, null, 1 / 60), [0], "corner missed");
    }
  });

  test("a plain side bounce in the middle of a wall is not a corner", () => {
    const p = card({ x: 66, y: HEIGHT / 2, vx: -200, vy: 0 });
    assert.deepEqual(stepParticles([p], WIDTH, HEIGHT, null, 1 / 60), []);
  });

  test("drifting along a wall without turning is not a corner", () => {
    // Hugging the top wall, moving sideways only: no turn, so no confetti.
    const p = card({ x: 800, y: 88, vx: 200, vy: 0 });
    assert.deepEqual(stepParticles([p], WIDTH, HEIGHT, null, 1 / 60), []);
  });

  test("corners stay rare over a long ordinary run", () => {
    const cards = Array.from({ length: 11 }, (_, i) =>
      seedParticle(i, 11, WIDTH, HEIGHT, 128, 176),
    );
    let hits = 0;
    // Ten minutes of wall time at 60fps.
    for (let frame = 0; frame < 36_000; frame++) {
      hits += stepParticles(cards, WIDTH, HEIGHT, { left: 700, top: 300, right: 900, bottom: 600 }, 1 / 60).length;
    }
    assert.ok(hits < 200, `${hits} corner hits in ten minutes is too many to feel special`);
  });
});
