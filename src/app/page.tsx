"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreateTournamentForm } from "@/components/tournament/create-tournament-form";
import { useTournamentStore } from "@/store/tournament-store";

export default function HomePage() {
  const tournaments = useTournamentStore((s) => s.tournaments);
  const deleteTournament = useTournamentStore((s) => s.deleteTournament);
  const tournamentList = Object.values(tournaments).sort(
    (a, b) => b.config.date.localeCompare(a.config.date)
  );

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">
            Poker Tournament Manager
          </h1>
          <p className="text-muted-foreground">
            Manage blinds, players, and payouts for your home games
          </p>
        </div>

        <CreateTournamentForm />

        {tournamentList.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Tournaments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tournamentList.map((t) => (
                <div
                  key={t.config.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <Link
                    href={`/tournament/${t.config.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="font-medium truncate">{t.config.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {t.config.date} &middot; {t.players.length} players
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 ml-4">
                    <Badge
                      variant={
                        t.status === "finished"
                          ? "secondary"
                          : t.status === "setup"
                          ? "outline"
                          : "default"
                      }
                    >
                      {t.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteTournament(t.config.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
