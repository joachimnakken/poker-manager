"use client";

import { useState } from "react";
import Link from "next/link";
import { judgeShowdown, type ShowdownVerdict } from "@/lib/showdown";
import { cardNotation, parseCard, SUIT_GLYPHS, type Suit } from "@/lib/poker-hands";
import { PlayingCard } from "@/components/playing-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const SUITS: Suit[] = ["s", "h", "d", "c"];

type Target = { kind: "board" } | { kind: "seat"; index: number };

/**
 * Tap the cards in, get a ruling. Everything runs in the browser: the evaluator is pure
 * TypeScript, so settling an argument needs no API, no key, and no signal.
 */
export default function ShowdownPage() {
  const [board, setBoard] = useState<string[]>([]);
  const [seats, setSeats] = useState<string[][]>([[], []]);
  const [target, setTarget] = useState<Target>({ kind: "board" });
  const [verdict, setVerdict] = useState<ShowdownVerdict | null>(null);

  const used = new Set([...board, ...seats.flat()]);

  function place(notation: string) {
    setVerdict(null);
    if (target.kind === "board") {
      if (board.length >= 5) return;
      const next = [...board, notation];
      setBoard(next);
      if (next.length === 5) setTarget({ kind: "seat", index: 0 });
      return;
    }
    const seat = seats[target.index];
    if (seat.length >= 2) return;
    const nextSeats = seats.map((cards, i) => (i === target.index ? [...cards, notation] : cards));
    setSeats(nextSeats);
    if (nextSeats[target.index].length === 2 && target.index < seats.length - 1) {
      setTarget({ kind: "seat", index: target.index + 1 });
    }
  }

  function remove(notation: string) {
    setVerdict(null);
    if (board.includes(notation)) {
      setBoard(board.filter((card) => card !== notation));
      setTarget({ kind: "board" });
      return;
    }
    setSeats(
      seats.map((cards, i) => {
        if (!cards.includes(notation)) return cards;
        setTarget({ kind: "seat", index: i });
        return cards.filter((card) => card !== notation);
      }),
    );
  }

  const seatsReady = seats.every((cards) => cards.length === 2);
  const canJudge = board.length >= 3 && seatsReady && seats.length >= 2;

  function judge() {
    setVerdict(
      judgeShowdown(
        seats.map((cards, i) => ({ label: `Seat ${i + 1}`, cards: cards.map(parseCard) })),
        board.map(parseCard),
      ),
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 max-w-md mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Settle a showdown</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Tap in the board and everyone&apos;s two cards. The winner is computed by the rules, not
        by opinion. Tap a placed card to remove it.
      </p>

      <Section
        title={`Board (${board.length}/5, at least 3)`}
        active={target.kind === "board"}
        onSelect={() => setTarget({ kind: "board" })}
      >
        <SlotRow cards={board} slots={5} onRemove={remove} />
      </Section>

      {seats.map((cards, index) => (
        <Section
          key={index}
          title={`Seat ${index + 1}`}
          active={target.kind === "seat" && target.index === index}
          onSelect={() => setTarget({ kind: "seat", index })}
          onDelete={
            seats.length > 2
              ? () => {
                  setVerdict(null);
                  setSeats(seats.filter((_, i) => i !== index));
                  setTarget({ kind: "seat", index: Math.min(index, seats.length - 2) });
                }
              : undefined
          }
        >
          <SlotRow cards={cards} slots={2} onRemove={remove} />
        </Section>
      ))}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={seats.length >= 10}
          onClick={() => {
            setVerdict(null);
            setSeats([...seats, []]);
            setTarget({ kind: "seat", index: seats.length });
          }}
        >
          + Add seat
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setBoard([]);
            setSeats([[], []]);
            setTarget({ kind: "board" });
            setVerdict(null);
          }}
        >
          Clear
        </Button>
      </div>

      <div className="grid grid-cols-13 gap-0.5">
        {SUITS.map((suit) =>
          RANKS.map((rank) => {
            const notation = `${rank}${suit}`;
            const taken = used.has(notation);
            return (
              <button
                key={notation}
                disabled={taken}
                onClick={() => place(notation)}
                data-testid={`deck-${notation}`}
                className={cn(
                  "h-9 rounded-sm bg-white text-[11px] font-semibold leading-none flex flex-col items-center justify-center border border-black/10",
                  suit === "h" || suit === "d" ? "text-red-600" : "text-zinc-900",
                  taken && "opacity-15",
                )}
              >
                <span>{rank === "T" ? "10" : rank}</span>
                <span>{SUIT_GLYPHS[suit]}</span>
              </button>
            );
          }),
        )}
      </div>

      <Button className="w-full" disabled={!canJudge} onClick={judge} data-testid="judge-button">
        Who wins?
      </Button>

      {verdict && (
        <div className="space-y-3">
          <Card className="border-primary/50">
            <CardContent className="py-4">
              <p className="text-base font-semibold" data-testid="showdown-verdict">
                {verdict.explanation}
              </p>
            </CardContent>
          </Card>
          {verdict.seats.map((seat) => (
            <Card key={seat.label} className={cn(seat.wins && "border-primary")}>
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-medium">
                    {seat.label}
                    {seat.wins && (
                      <span className="ml-2 text-xs font-semibold text-primary uppercase tracking-wider">
                        Winner
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{seat.hand.description}</div>
                </div>
                <div className="flex gap-1">
                  {seat.hand.cards.map((card) => (
                    <PlayingCard key={cardNotation(card)} notation={cardNotation(card)} size="sm" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground">
            Each seat&apos;s five shown cards are its best hand out of the seven.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        New to this? See the <Link href="/rankings" className="underline">hand rankings</Link>.
      </p>
    </div>
  );
}

function Section({
  title,
  active,
  onSelect,
  onDelete,
  children,
}: {
  title: string;
  active: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "rounded-lg border p-3 space-y-2 cursor-pointer",
        active ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{title}</span>
        {onDelete && (
          <button
            className="text-xs text-muted-foreground underline"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            remove
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function SlotRow({
  cards,
  slots,
  onRemove,
}: {
  cards: string[];
  slots: number;
  onRemove: (notation: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {cards.map((notation) => (
        <button
          key={notation}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(notation);
          }}
        >
          <PlayingCard notation={notation} size="sm" />
        </button>
      ))}
      {Array.from({ length: slots - cards.length }).map((_, i) => (
        <span
          key={i}
          className="w-7 h-10 rounded-md border border-dashed border-muted-foreground/40"
        />
      ))}
    </div>
  );
}
