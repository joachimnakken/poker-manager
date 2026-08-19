import Link from "next/link";
import { HAND_RANKINGS } from "@/lib/poker-hands";
import { PlayingCard } from "@/components/playing-card";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Poker hand rankings" };

/** The printed cheat sheet, retired: every hand, best to worst, with example cards. */
export default function RankingsPage() {
  return (
    <div className="min-h-screen px-4 py-6 max-w-md mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Hand rankings</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Best to worst. Your hand is the best five cards out of your two plus the five on the
        table.
      </p>

      <div className="space-y-2">
        {HAND_RANKINGS.map((ranking, index) => (
          <Card key={ranking.name}>
            <CardContent className="py-3 space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-mono text-muted-foreground w-4">{index + 1}</span>
                <span className="font-semibold">{ranking.name}</span>
              </div>
              <div className="flex gap-1 pl-6">
                {ranking.example.map((notation) => (
                  <PlayingCard key={notation} notation={notation} size="sm" />
                ))}
              </div>
              <p className="text-xs text-muted-foreground pl-6">{ranking.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Arguing about who won anyway? <Link href="/showdown" className="underline">Tap the cards
        in</Link> and let the app rule.
      </p>
    </div>
  );
}
