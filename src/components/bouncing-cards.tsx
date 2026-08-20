"use client";

import { useEffect, useRef } from "react";
import { seedParticle, stepParticles, type Box, type Particle } from "@/lib/card-physics";
import { opacityOf, spawnBurst, stepConfetti, type Confetto } from "@/lib/confetti";
import { isReserved } from "@/lib/name-cards";
import { parseCard, SUIT_GLYPHS } from "@/lib/poker-hands";
import { cn } from "@/lib/utils";

/** Must match the w-32 / h-44 on the card below — the physics works in pixels. */
const CARD_WIDTH = 128;
const CARD_HEIGHT = 176;

/** How long a card stays gone after it goes off, and how long it takes to fade back. */
const HIDDEN_MS = 700;
const RETURN_MS = 500;

/**
 * The pre-start wall's drifting cards. Positions live in a ref and are written straight
 * to transforms on each frame, never to React state: the tournament poll re-renders this
 * component every couple of seconds, and the simulation has to survive that untouched.
 */
export function BouncingCards({
  names,
  cards,
  profiles,
  obstacleRef,
}: {
  names: string[];
  cards: Map<string, string>;
  /** Profile per name, so a card can carry the player's photo. */
  profiles?: Map<string, string>;
  /** The join-QR card. Cards bounce off it, so it is never covered. */
  obstacleRef: React.RefObject<HTMLElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const particles = useRef(new Map<string, Particle>());
  // Easter egg state: when each exploded card is due back, and the live confetti.
  const returning = useRef(new Map<string, number>());
  const confetti = useRef<Confetto[]>([]);
  const namesRef = useRef(names);
  namesRef.current = names;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let frame = 0;
    let last = performance.now();

    const obstacle = (): Box | null => {
      const element = obstacleRef.current;
      if (!element) {
        return null;
      }
      const bounds = container.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      // A little padding so a card grazing the QR still reads as a clean bounce.
      const pad = 12;
      return {
        left: box.left - bounds.left - pad,
        top: box.top - bounds.top - pad,
        right: box.right - bounds.left + pad,
        bottom: box.bottom - bounds.top + pad,
      };
    };

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      const { clientWidth: width, clientHeight: height } = container;
      const live = namesRef.current;

      // Seed arrivals and forget anyone who left, without disturbing the rest.
      for (const [index, name] of live.entries()) {
        if (!particles.current.has(name)) {
          particles.current.set(
            name,
            seedParticle(index, live.length, width, height, CARD_WIDTH, CARD_HEIGHT),
          );
        }
      }
      for (const name of [...particles.current.keys()]) {
        if (!live.includes(name)) {
          particles.current.delete(name);
          returning.current.delete(name);
        }
      }

      const order = live.filter((name) => particles.current.has(name));
      const active = order.map((name) => particles.current.get(name)!);
      const cornerHits = stepParticles(active, width, height, obstacle(), dt);

      // A card that catches a corner dead on goes off in confetti and comes back.
      for (const index of cornerHits) {
        const name = order[index];
        if (name === undefined || returning.current.has(name)) {
          continue;
        }
        const particle = active[index];
        confetti.current.push(...spawnBurst(particle.x, particle.y, isReserved(name)));
        returning.current.set(name, now + HIDDEN_MS);
      }

      for (const [index, name] of order.entries()) {
        const node = nodes.current.get(name);
        const particle = active[index];
        if (!node) {
          continue;
        }
        node.style.transform = `translate3d(${particle.x - CARD_WIDTH / 2}px, ${
          particle.y - CARD_HEIGHT / 2
        }px, 0) rotate(${((index * 37) % 17) - 8}deg)`;

        // Gone while the confetti flies, then fading back in mid-flight — it keeps
        // moving the whole time, so it simply reappears wherever it now is.
        const due = returning.current.get(name);
        if (due === undefined) {
          node.style.opacity = "1";
        } else {
          const since = now - due;
          if (since < 0) {
            node.style.opacity = "0";
          } else if (since < RETURN_MS) {
            node.style.opacity = String(since / RETURN_MS);
          } else {
            node.style.opacity = "1";
            returning.current.delete(name);
          }
        }
      }

      confetti.current = stepConfetti(confetti.current, dt);
      drawConfetti(canvasRef.current, width, height, confetti.current);

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [obstacleRef]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 z-20 pointer-events-none" />
      {names.map((name) => (
        <div
          key={name}
          ref={(node) => {
            if (node) {
              nodes.current.set(name, node);
            } else {
              nodes.current.delete(name);
            }
          }}
          className={cn(
            "absolute top-0 left-0 will-change-transform select-none",
            isReserved(name) && "z-10",
          )}
          style={{ animation: "projector-fade-in 1.2s ease-out" }}
        >
          <NameCard
            name={name}
            notation={cards.get(name) ?? "2s"}
            profileId={profiles?.get(name)}
          />
        </div>
      ))}
    </div>
  );
}

/** Paints the live burst. Cleared and redrawn each frame, so nothing is retained. */
function drawConfetti(
  canvas: HTMLCanvasElement | null,
  width: number,
  height: number,
  pieces: Confetto[],
): void {
  if (!canvas) {
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  for (const piece of pieces) {
    context.save();
    context.translate(piece.x, piece.y);
    context.rotate(piece.rotation);
    context.globalAlpha = opacityOf(piece);
    context.fillStyle = piece.color;
    // Ribbons rather than squares — they read as confetti even at a glance.
    context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
    context.restore();
  }
  context.globalAlpha = 1;
}

/**
 * One checked-in player as a playing card. The aces belong to Joachim and Martin — see
 * `assignCards` — so an ace on the wall is a signature rather than a coincidence, and
 * gets a gold edge to match.
 */
function NameCard({
  name,
  notation,
  profileId,
}: {
  name: string;
  notation: string;
  profileId?: string;
}) {
  const card = parseCard(notation);
  const rank = notation[0].toUpperCase() === "T" ? "10" : notation[0].toUpperCase();
  const red = card.suit === "h" || card.suit === "d";
  const isAce = card.rank === 14;

  return (
    <div
      data-testid="name-card"
      className={cn(
        "w-32 h-44 rounded-xl bg-white flex flex-col justify-between p-2.5",
        isAce ? "ring-4 ring-amber-300 shadow-2xl shadow-black/50" : "shadow-xl shadow-black/40",
      )}
    >
      <div
        className={cn("flex items-center gap-1 leading-none", red ? "text-red-600" : "text-zinc-900")}
      >
        <span className="text-xl font-bold">{rank}</span>
        <span className="text-xl">{SUIT_GLYPHS[card.suit]}</span>
      </div>

      <div className="flex flex-col items-center gap-1 px-0.5">
        {profileId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/profiles/${profileId}/avatar`}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
            // Most people will have skipped the photo; a broken-image icon on the wall
            // would be worse than none.
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        )}
        <span className="text-center text-sm font-semibold leading-tight text-zinc-900 break-words">
          {name}
        </span>
      </div>

      <div
        className={cn(
          "flex items-center justify-end gap-1 leading-none",
          red ? "text-red-600" : "text-zinc-900",
        )}
      >
        <span className="text-xl font-bold">{rank}</span>
        <span className="text-xl">{SUIT_GLYPHS[card.suit]}</span>
      </div>
    </div>
  );
}
