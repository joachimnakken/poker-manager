"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResultsView } from "./tournament-results";
import type { Player, TournamentConfig } from "@/lib/types";

/** The shape zustand's `persist` wrote before tournaments moved to the server. */
interface LegacyGame {
  config: TournamentConfig;
  players: Player[];
  status: string;
}

const LEGACY_KEY = "poker-tournament-storage";

/**
 * Games played before the server existed live only in the browser that played them.
 * They are shown read-only and deliberately not migrated — a tournament nobody can
 * still be sitting at is a record, not a thing to resume.
 */
export function LegacyLocalGames() {
  const [games, setGames] = useState<LegacyGame[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LEGACY_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as { state?: { tournaments?: Record<string, LegacyGame> } };
      const found = Object.values(parsed.state?.tournaments ?? {}).filter(
        (game) => game?.config && Array.isArray(game.players),
      );
      setGames(found.sort((a, b) => b.config.date.localeCompare(a.config.date)));
    } catch {
      // A corrupt legacy blob is not worth surfacing; there is nothing to recover.
    }
  }, []);

  if (games.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-muted-foreground">
          Past games (this browser)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {games.map((game) => (
          <div key={game.config.id} className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div className="min-w-0">
                <div className="font-medium truncate">{game.config.name}</div>
                <div className="text-sm text-muted-foreground">
                  {game.config.date} &middot; {game.players.length} players &middot; {game.status}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpenId(openId === game.config.id ? null : game.config.id)}
              >
                {openId === game.config.id ? "Hide" : "Results"}
              </Button>
            </div>
            {openId === game.config.id && (
              <ResultsView players={game.players} config={game.config} />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
