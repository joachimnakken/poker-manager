"use client";

import { useTournamentStore } from "@/store/tournament-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerAddDialog } from "./player-add-dialog";

export function PlayerTable({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  const removePlayer = useTournamentStore((s) => s.removePlayer);
  const knockoutPlayer = useTournamentStore((s) => s.knockoutPlayer);
  const undoKnockout = useTournamentStore((s) => s.undoKnockout);
  const registerRebuy = useTournamentStore((s) => s.registerRebuy);
  const registerAddon = useTournamentStore((s) => s.registerAddon);

  if (!tournament) return null;

  const { players, status, config, timer } = tournament;
  const isSetup = status === "setup";
  const isFinished = status === "finished";

  // Calculate current play level for rebuy eligibility
  let currentPlayLevel = 0;
  for (let i = 0; i <= timer.currentLevelIndex; i++) {
    if (!config.blindStructure[i]?.isBreak) {
      currentPlayLevel = config.blindStructure[i]?.level ?? 0;
    }
  }
  const canRebuy = currentPlayLevel <= config.lastRebuyLevel && !isSetup && !isFinished;

  // Sort: active first, then by finish position
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    if (!a.isActive && !b.isActive) {
      return (a.finishPosition ?? 999) - (b.finishPosition ?? 999);
    }
    return 0;
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg">Players ({players.length})</CardTitle>
        {!isFinished && <PlayerAddDialog tournamentId={tournamentId} />}
      </CardHeader>
      <CardContent>
        {sortedPlayers.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No players yet. Add players to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {sortedPlayers.map((player) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                  player.isActive
                    ? "bg-muted/30"
                    : "bg-muted/10 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {player.finishPosition && (
                    <span className="text-sm font-mono text-muted-foreground w-6 text-right">
                      #{player.finishPosition}
                    </span>
                  )}
                  <span className="font-medium truncate">{player.name}</span>
                  <div className="flex gap-1">
                    {player.isActive ? (
                      <Badge variant="default" className="text-xs">IN</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">OUT</Badge>
                    )}
                    {player.rebuys > 0 && (
                      <Badge variant="outline" className="text-xs">
                        R:{player.rebuys}
                      </Badge>
                    )}
                    {player.hasAddon && (
                      <Badge variant="outline" className="text-xs">A</Badge>
                    )}
                  </div>
                </div>

                <div className="flex gap-1 ml-2">
                  {isSetup && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePlayer(tournamentId, player.id)}
                      className="text-destructive hover:text-destructive text-xs"
                    >
                      Remove
                    </Button>
                  )}

                  {!isSetup && !isFinished && player.isActive && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => knockoutPlayer(tournamentId, player.id)}
                      className="text-xs"
                    >
                      KO
                    </Button>
                  )}

                  {!isSetup && !isFinished && canRebuy && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => registerRebuy(tournamentId, player.id)}
                      className="text-xs"
                    >
                      Rebuy
                    </Button>
                  )}

                  {!isFinished && player.isActive && !player.hasAddon && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => registerAddon(tournamentId, player.id)}
                      className="text-xs"
                    >
                      Addon
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {!isSetup && !isFinished && tournament.knockoutOrder.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => undoKnockout(tournamentId)}
                className="text-xs text-muted-foreground mt-2"
              >
                Undo Last Knockout
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
