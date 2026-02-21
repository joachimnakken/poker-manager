"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTournamentStore } from "@/store/tournament-store";
import { useTimer } from "@/store/use-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { BlindTimer } from "@/components/tournament/blind-timer";
import { StatsBar } from "@/components/tournament/stats-bar";
import { PlayerTable } from "@/components/tournament/player-table";
import { TournamentHeader } from "@/components/tournament/tournament-header";
import { BlindStructureTable } from "@/components/tournament/blind-structure-table";
import { PrizePoolDisplay } from "@/components/tournament/prize-pool-display";
import { KnockoutLog } from "@/components/tournament/knockout-log";
import { SeatDraw } from "@/components/tournament/seat-draw";
import { TournamentResults } from "@/components/tournament/tournament-results";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const tournament = useTournamentStore((s) => s.tournaments[id]);

  useTimer(id);
  useWakeLock(tournament?.timer.isRunning ?? false);

  // Keyboard shortcut: Space to pause/resume
  const pauseTournament = useTournamentStore((s) => s.pauseTournament);
  const resumeTournament = useTournamentStore((s) => s.resumeTournament);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        if (!tournament) return;
        if (tournament.timer.isRunning) {
          pauseTournament(id);
        } else if (tournament.status === "paused" || tournament.status === "break" || tournament.status === "running") {
          resumeTournament(id);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tournament?.timer.isRunning, tournament?.status, id, pauseTournament, resumeTournament]);

  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Tournament not found</p>
          <button onClick={() => router.push("/")} className="text-primary underline">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (tournament.status === "finished") {
    return (
      <div className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto space-y-4 md:space-y-6">
        <TournamentHeader tournamentId={id} />
        <TournamentResults tournamentId={id} />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto space-y-4 md:space-y-6">
      <TournamentHeader tournamentId={id} />

      <BlindTimer tournamentId={id} />
      <StatsBar tournamentId={id} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <PlayerTable tournamentId={id} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg sr-only">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="blinds">
              <TabsList className="w-full">
                <TabsTrigger value="blinds" className="flex-1">Blinds</TabsTrigger>
                <TabsTrigger value="payouts" className="flex-1">Payouts</TabsTrigger>
                <TabsTrigger value="knockouts" className="flex-1">Knockouts</TabsTrigger>
                <TabsTrigger value="seating" className="flex-1">Seating</TabsTrigger>
              </TabsList>
              <TabsContent value="blinds" className="mt-4">
                <BlindStructureTable tournamentId={id} />
              </TabsContent>
              <TabsContent value="payouts" className="mt-4">
                <PrizePoolDisplay tournamentId={id} />
              </TabsContent>
              <TabsContent value="knockouts" className="mt-4">
                <KnockoutLog tournamentId={id} />
              </TabsContent>
              <TabsContent value="seating" className="mt-4">
                <SeatDraw tournamentId={id} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
