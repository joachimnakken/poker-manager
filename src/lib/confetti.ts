/**
 * The corner-strike easter egg's burst. Decorative, so unlike the card physics this one
 * is happily random — nothing about it needs to be reproducible frame to frame.
 */

export interface Confetto {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians. */
  rotation: number;
  spin: number;
  /** Seconds remaining. */
  life: number;
  /** Seconds it started with, for the fade. */
  ttl: number;
  size: number;
  color: string;
}

const FESTIVE = ["#f43f5e", "#facc15", "#22d3ee", "#a3e635", "#f97316", "#e879f9", "#ffffff"];
/** An ace goes up in gold. */
const GOLD = ["#fcd34d", "#fbbf24", "#f59e0b", "#fffbeb", "#ffffff"];

const GRAVITY = 900;
const DRAG = 0.86;

export function spawnBurst(x: number, y: number, gold = false): Confetto[] {
  const palette = gold ? GOLD : FESTIVE;
  const count = gold ? 54 : 40;

  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 180 + Math.random() * 420;
    const ttl = 0.9 + Math.random() * 0.7;
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 120,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 14,
      life: ttl,
      ttl,
      size: 6 + Math.random() * 8,
      color: palette[Math.floor(Math.random() * palette.length)],
    };
  });
}

/** Advances the burst and drops anything that has burned out. */
export function stepConfetti(pieces: Confetto[], dt: number): Confetto[] {
  const step = Math.min(dt, 1 / 30);
  const alive: Confetto[] = [];

  for (const piece of pieces) {
    piece.life -= step;
    if (piece.life <= 0) {
      continue;
    }
    piece.vy += GRAVITY * step;
    piece.vx *= Math.pow(DRAG, step * 60);
    piece.vy *= Math.pow(DRAG, step * 60);
    piece.x += piece.vx * step;
    piece.y += piece.vy * step;
    piece.rotation += piece.spin * step;
    alive.push(piece);
  }

  return alive;
}

/** 1 at birth, 0 at the end — the fade as a piece burns out. */
export function opacityOf(piece: Confetto): number {
  return Math.max(0, Math.min(1, piece.life / piece.ttl));
}
