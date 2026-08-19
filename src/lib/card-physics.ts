/**
 * Just enough physics for the pre-start wall: cards drifting, bouncing off the edges,
 * off each other, and off the join-QR card in the middle. Pure and framework-free so
 * the collision maths can be tested without a browser.
 *
 * Everything is axis-aligned. The cards carry a small visual tilt, but treating them as
 * upright boxes is invisible at ±8 degrees and keeps the resolution to one axis.
 */

export interface Particle {
  /** Centre, in container pixels. */
  x: number;
  y: number;
  /** Pixels per second. */
  vx: number;
  vy: number;
  width: number;
  height: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlap(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function boxOf(p: Particle): Box {
  const halfWidth = p.width / 2;
  const halfHeight = p.height / 2;
  return {
    left: p.x - halfWidth,
    right: p.x + halfWidth,
    top: p.y - halfHeight,
    bottom: p.y + halfHeight,
  };
}

/** Bounce off the container edges, clamping back inside so nothing escapes. */
function bounceOffWalls(p: Particle, width: number, height: number): void {
  const halfWidth = p.width / 2;
  const halfHeight = p.height / 2;

  if (p.x - halfWidth < 0) {
    p.x = halfWidth;
    p.vx = Math.abs(p.vx);
  } else if (p.x + halfWidth > width) {
    p.x = width - halfWidth;
    p.vx = -Math.abs(p.vx);
  }

  if (p.y - halfHeight < 0) {
    p.y = halfHeight;
    p.vy = Math.abs(p.vy);
  } else if (p.y + halfHeight > height) {
    p.y = height - halfHeight;
    p.vy = -Math.abs(p.vy);
  }
}

/**
 * Push a card out of a static box along whichever axis it is least deep into, and
 * reverse that component. Least-penetration is what makes a card clip the corner of
 * the QR and glance off sideways rather than teleporting through it.
 */
function bounceOffObstacle(p: Particle, obstacle: Box): void {
  const box = boxOf(p);
  if (!overlap(box, obstacle)) {
    return;
  }

  const fromLeft = box.right - obstacle.left;
  const fromRight = obstacle.right - box.left;
  const fromTop = box.bottom - obstacle.top;
  const fromBottom = obstacle.bottom - box.top;
  const least = Math.min(fromLeft, fromRight, fromTop, fromBottom);

  if (least === fromLeft) {
    p.x -= fromLeft;
    p.vx = -Math.abs(p.vx);
  } else if (least === fromRight) {
    p.x += fromRight;
    p.vx = Math.abs(p.vx);
  } else if (least === fromTop) {
    p.y -= fromTop;
    p.vy = -Math.abs(p.vy);
  } else {
    p.y += fromBottom;
    p.vy = Math.abs(p.vy);
  }
}

/**
 * Equal-mass elastic collision between two cards. On the axis they are least deep into
 * each other, they swap that velocity component and are pushed apart by half the
 * penetration each — so a pair never sticks together.
 */
function collide(a: Particle, b: Particle): void {
  const boxA = boxOf(a);
  const boxB = boxOf(b);
  if (!overlap(boxA, boxB)) {
    return;
  }

  const overlapX = Math.min(boxA.right, boxB.right) - Math.max(boxA.left, boxB.left);
  const overlapY = Math.min(boxA.bottom, boxB.bottom) - Math.max(boxA.top, boxB.top);

  if (overlapX < overlapY) {
    const push = (overlapX / 2) * (a.x < b.x ? -1 : 1);
    a.x += push;
    b.x -= push;
    [a.vx, b.vx] = [b.vx, a.vx];
  } else {
    const push = (overlapY / 2) * (a.y < b.y ? -1 : 1);
    a.y += push;
    b.y -= push;
    [a.vy, b.vy] = [b.vy, a.vy];
  }
}

/**
 * Advances the simulation in place by `dt` seconds. Mutates rather than copying: this
 * runs every animation frame, and the caller writes the results straight to transforms.
 */
export function stepParticles(
  particles: Particle[],
  width: number,
  height: number,
  obstacle: Box | null,
  dt: number,
): void {
  // A backgrounded tab hands back a huge dt on return; a capped step keeps cards from
  // tunnelling clean through the walls.
  const step = Math.min(dt, 1 / 30);

  for (const p of particles) {
    p.x += p.vx * step;
    p.y += p.vy * step;
    bounceOffWalls(p, width, height);
    if (obstacle) {
      bounceOffObstacle(p, obstacle);
    }
  }

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      collide(particles[i], particles[j]);
    }
  }
}

/**
 * A starting position and drift for card `index` of `total`. Deterministic, and laid out
 * on a ring away from the centre so nothing begins inside the QR card.
 */
export function seedParticle(
  index: number,
  total: number,
  width: number,
  height: number,
  cardWidth: number,
  cardHeight: number,
): Particle {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2;
  const ring = index % 2 === 0 ? 0.78 : 0.94;
  const x = width / 2 + Math.cos(angle) * (width / 2 - cardWidth) * ring;
  const y = height / 2 + Math.sin(angle) * (height / 2 - cardHeight) * ring;
  // Varied but calm: fast enough that collisions happen while people are arriving,
  // slow enough to read a name in passing.
  const speed = 55 + ((index * 17) % 45);
  const heading = angle + 2.2 + (index % 5) * 0.4;

  return {
    x: Math.min(width - cardWidth / 2, Math.max(cardWidth / 2, x)),
    y: Math.min(height - cardHeight / 2, Math.max(cardHeight / 2, y)),
    vx: Math.cos(heading) * speed,
    vy: Math.sin(heading) * speed,
    width: cardWidth,
    height: cardHeight,
  };
}
