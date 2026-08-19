"use client";

import { useEffect, useRef } from "react";
import { seedParticle, stepParticles, type Box, type Particle } from "@/lib/card-physics";
import { isReserved } from "@/lib/name-cards";
import { parseCard, SUIT_GLYPHS } from "@/lib/poker-hands";
import { cn } from "@/lib/utils";

/** Must match the w-32 / h-44 on the card below — the physics works in pixels. */
const CARD_WIDTH = 128;
const CARD_HEIGHT = 176;

/**
 * The pre-start wall's drifting cards. Positions live in a ref and are written straight
 * to transforms on each frame, never to React state: the tournament poll re-renders this
 * component every couple of seconds, and the simulation has to survive that untouched.
 */
export function BouncingCards({
  names,
  cards,
  obstacleRef,
}: {
  names: string[];
  cards: Map<string, string>;
  /** The join-QR card. Cards bounce off it, so it is never covered. */
  obstacleRef: React.RefObject<HTMLElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const particles = useRef(new Map<string, Particle>());
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
        }
      }

      const order = live.filter((name) => particles.current.has(name));
      const active = order.map((name) => particles.current.get(name)!);
      stepParticles(active, width, height, obstacle(), dt);

      for (const [index, name] of order.entries()) {
        const node = nodes.current.get(name);
        const particle = active[index];
        if (node) {
          node.style.transform = `translate3d(${particle.x - CARD_WIDTH / 2}px, ${
            particle.y - CARD_HEIGHT / 2
          }px, 0) rotate(${((index * 37) % 17) - 8}deg)`;
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [obstacleRef]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
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
          <NameCard name={name} notation={cards.get(name) ?? "2s"} />
        </div>
      ))}
    </div>
  );
}

/**
 * One checked-in player as a playing card. The aces belong to Joachim and Martin — see
 * `assignCards` — so an ace on the wall is a signature rather than a coincidence, and
 * gets a gold edge to match.
 */
function NameCard({ name, notation }: { name: string; notation: string }) {
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

      <div className="px-0.5 text-center text-base font-semibold leading-tight text-zinc-900 break-words">
        {name}
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
