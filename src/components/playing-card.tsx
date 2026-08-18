import { parseCard, SUIT_GLYPHS, type Suit } from "@/lib/poker-hands";
import { cn } from "@/lib/utils";

const RED_SUITS: Suit[] = ["h", "d"];

/** A small face-up card. Takes notation ("As", "Td") so callers stay string-based. */
export function PlayingCard({ notation, size = "md" }: { notation: string; size?: "sm" | "md" }) {
  const card = parseCard(notation);
  const rankChar = notation.trim()[0].toUpperCase().replace("T", "10");
  return (
    <span
      className={cn(
        "inline-flex flex-col items-center justify-center rounded-md bg-white font-semibold leading-none shadow-sm border border-black/10",
        size === "md" ? "w-10 h-14 text-base" : "w-7 h-10 text-xs",
        RED_SUITS.includes(card.suit) ? "text-red-600" : "text-zinc-900",
      )}
    >
      <span>{rankChar}</span>
      <span className={size === "md" ? "text-lg" : "text-sm"}>{SUIT_GLYPHS[card.suit]}</span>
    </span>
  );
}
