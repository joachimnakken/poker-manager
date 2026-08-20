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

describe("held cards", () => {
  test("a held card is not moved by the simulation", () => {
    const p = card({ x: 500, y: 400, vx: 900, vy: 900, held: true });
    stepParticles([p], WIDTH, HEIGHT, null, 1 / 60);
    assert.equal(p.x, 500);
    assert.equal(p.y, 400);
  });

  test("a held card cannot set off the corner easter egg", () => {
    const p = card({ x: 66, y: 90, vx: -400, vy: -400, held: true });
    assert.deepEqual(stepParticles([p], WIDTH, HEIGHT, null, 1 / 60), []);
  });

  test("a held card shoves a loose one and stays put", () => {
    const held = card({ x: 500, y: 400, vx: 300, vy: 0, held: true });
    const loose = card({ x: 560, y: 400, vx: 0, vy: 0 });
    stepParticles([held, loose], WIDTH, HEIGHT, null, 1 / 60);
    assert.equal(held.x, 500, "the held card should not be pushed back");
    assert.ok(loose.x > 560, `the loose card should be shoved clear, got ${loose.x}`);
    assert.ok(loose.vx > 0, "and sent on its way");
  });

  test("shoving hands over some of the held card's motion", () => {
    const still = card({ x: 500, y: 400, vx: 0, vy: 0, held: true });
    const shoved = card({ x: 500, y: 400, vx: 600, vy: 0, held: true });
    const a = card({ x: 560, y: 400, vx: 0, vy: 0 });
    const b = card({ x: 560, y: 400, vx: 0, vy: 0 });
    stepParticles([still, a], WIDTH, HEIGHT, null, 1 / 60);
    stepParticles([shoved, b], WIDTH, HEIGHT, null, 1 / 60);
    assert.ok(b.vx > a.vx, `a moving hand should impart more: ${b.vx} vs ${a.vx}`);
  });

  test("two held cards ignore each other rather than fighting", () => {
    const a = card({ x: 500, y: 400, held: true });
    const b = card({ x: 520, y: 400, held: true });
    stepParticles([a, b], WIDTH, HEIGHT, null, 1 / 60);
    assert.equal(a.x, 500);
    assert.equal(b.x, 520);
  });

  test("released, it rejoins the simulation", () => {
    const p = card({ x: 500, y: 400, vx: 200, vy: 0, held: true });
    stepParticles([p], WIDTH, HEIGHT, null, 1 / 60);
    assert.equal(p.x, 500);
    p.held = false;
    stepParticles([p], WIDTH, HEIGHT, null, 1 / 60);
    assert.ok(p.x > 500, "it should fly off once let go");
  });
});

describe("containment after collisions", () => {
  test("a card shoved at a wall does not end the frame outside it", () => {
    // Held card pressed against the left edge with a loose one between it and the wall.
    const held = card({ x: 130, y: 400, vx: -900, vy: 0, held: true });
    const loose = card({ x: 100, y: 400, vx: 0, vy: 0 });
    stepParticles([held, loose], WIDTH, HEIGHT, null, 1 / 60);
    assert.ok(loose.x - loose.width / 2 >= -0.5, `pushed off screen to ${loose.x}`);
  });

  test("a crowd against a corner all stay inside", () => {
    const cards = [
      card({ x: 70, y: 95, vx: -600, vy: -600, held: true }),
      card({ x: 80, y: 100 }),
      card({ x: 90, y: 110 }),
      card({ x: 100, y: 120 }),
    ];
    for (let frame = 0; frame < 200; frame++) {
      stepParticles(cards, WIDTH, HEIGHT, null, 1 / 60);
      for (const p of cards) {
        if (p.held) continue;
        assert.ok(p.x - p.width / 2 >= -0.5 && p.y - p.height / 2 >= -0.5, `escaped at frame ${frame}`);
      }
    }
  });
});

describe("the obstacle survives a crowd", () => {
  test("cards pressed onto the QR do not come to rest on it", () => {
    const obstacle = { left: 700, top: 300, right: 900, bottom: 600 };
    const inside = (p: Particle) => {
      const box = {
        left: p.x - p.width / 2,
        right: p.x + p.width / 2,
        top: p.y - p.height / 2,
        bottom: p.y + p.height / 2,
      };
      return (
        box.left < obstacle.right &&
        box.right > obstacle.left &&
        box.top < obstacle.bottom &&
        box.bottom > obstacle.top
      );
    };
    // A held card shoving a loose one straight at the QR, repeatedly.
    const held = card({ x: 620, y: 450, vx: 500, vy: 0, held: true });
    const loose = card({ x: 660, y: 450, vx: 0, vy: 0 });
    for (let frame = 0; frame < 300; frame++) {
      stepParticles([held, loose], WIDTH, HEIGHT, obstacle, 1 / 60);
      assert.ok(!inside(loose), `a card sat on the QR at frame ${frame}`);
    }
  });
});

describe("the walls beat the obstacle", () => {
  test("ejecting a card from an obstacle never puts it off screen", () => {
    // An obstacle whose bottom edge is close to the floor: pushing a card "down and out"
    // would leave it below the viewport.
    const obstacle = { left: 600, top: 150, right: 800, bottom: 700 };
    const cards = [
      card({ x: 700, y: 690, vx: 0, vy: 120 }),
      card({ x: 640, y: 200, vx: -90, vy: -140 }),
      card({ x: 780, y: 660, vx: 200, vy: 200 }),
    ];
    for (let frame = 0; frame < 600; frame++) {
      stepParticles(cards, WIDTH, HEIGHT, obstacle, 1 / 60);
      for (const p of cards) {
        assert.ok(
          p.y - p.height / 2 >= -0.5 && p.y + p.height / 2 <= HEIGHT + 0.5,
          `off screen vertically at frame ${frame}: y=${Math.round(p.y)}`,
        );
        assert.ok(
          p.x - p.width / 2 >= -0.5 && p.x + p.width / 2 <= WIDTH + 0.5,
          `off screen horizontally at frame ${frame}: x=${Math.round(p.x)}`,
        );
      }
    }
  });
});
