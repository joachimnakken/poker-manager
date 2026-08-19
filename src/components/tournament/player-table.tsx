"use client";

import { useState } from "react";
import { useTournamentStore } from "@/store/tournament-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PlayerAddDialog } from "./player-add-dialog";
import type { Player } from "@/lib/types";

export function PlayerTable({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  const removePlayer = useTournamentStore((s) => s.removePlayer);
  const knockoutPlayer = useTournamentStore((s) => s.knockoutPlayer);
  const undoKnockout = useTournamentStore((s) => s.undoKnockout);
  const registerRebuy = useTournamentStore((s) => s.registerRebuy);
  const registerAddon = useTournamentStore((s) => s.registerAddon);
  const assignCaptain = useTournamentStore((s) => s.assignCaptain);
  const setHostPlayer = useTournamentStore((s) => s.setHostPlayer);

  const [koPopoverOpen, setKoPopoverOpen] = useState<string | null>(null);
  const [captainPopoverOpen, setCaptainPopoverOpen] = useState<number | null>(null);

  if (!tournament) return null;

  const { players, status, config, timer, seatAssignments, tables, hostPlayerId } = tournament;
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

  function sortPlayers(list: Player[]): Player[] {
    return [...list].sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      if (!a.isActive && !b.isActive) {
        return (a.finishPosition ?? 999) - (b.finishPosition ?? 999);
      }
      return 0;
    });
  }

  /** The captain picker for one table. The host decides; nobody claims it themselves. */
  function captainControl(tableNumber: number, tablePlayers: Player[]) {
    const captainId = tables.find((t) => t.tableNumber === tableNumber)?.captainPlayerId;
    const captain = players.find((p) => p.id === captainId);
    return (
      <Popover
        open={captainPopoverOpen === tableNumber}
        onOpenChange={(open) => setCaptainPopoverOpen(open ? tableNumber : null)}
      >
        <PopoverTrigger asChild>
          <Button
            variant={captain ? "ghost" : "outline"}
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            data-testid={`captain-picker-${tableNumber}`}
          >
            {captain ? `Captain: ${captain.name}` : "Choose captain"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-2" align="start">
          <p className="mb-2 px-1 text-xs text-muted-foreground">
            Captain for table {tableNumber}
          </p>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs"
              onClick={() => {
                assignCaptain(tournamentId, tableNumber, null);
                setCaptainPopoverOpen(null);
              }}
            >
              Nobody (host acts)
            </Button>
            {tablePlayers
              .filter((p) => p.isActive)
              .map((p) => (
                <Button
                  key={p.id}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs"
                  data-testid={`make-captain-${p.name}`}
                  onClick={() => {
                    assignCaptain(tournamentId, tableNumber, p.id);
                    setCaptainPopoverOpen(null);
                  }}
                >
                  {p.name}
                </Button>
              ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  function renderRow(player: Player) {
    return (
      <div
        key={player.id}
        data-player-row={player.name}
        className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
          player.isActive ? "bg-muted/30" : "bg-muted/10 opacity-60"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {player.finishPosition && (
            <span
              data-finish-position={player.name}
              className="text-sm font-mono text-muted-foreground w-6 text-right"
            >
              #{player.finishPosition}
            </span>
          )}
          <div className="min-w-0">
            <span className="font-medium truncate block">{player.name}</span>
            {player.knockedOutBy && (() => {
              const eliminator = players.find((p) => p.id === player.knockedOutBy);
              return eliminator ? (
                <span className="text-xs text-muted-foreground">by {eliminator.name}</span>
              ) : null;
            })()}
          </div>
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
            {player.id === hostPlayerId && (
              <Badge variant="default" className="text-xs" data-testid="host-badge">
                HOST
              </Badge>
            )}
          </div>
        </div>

        <div className="flex gap-1 ml-2">
          {/* The host is a player too, so they say which one is them. Their phone then
              carries host authority and they run the night from their seat. */}
          {!isFinished && player.id !== hostPlayerId && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              data-testid={`mark-host-${player.name}`}
              onClick={() => setHostPlayer(tournamentId, player.id)}
            >
              This is me
            </Button>
          )}

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
            <Popover
              open={koPopoverOpen === player.id}
              onOpenChange={(open) => setKoPopoverOpen(open ? player.id : null)}
            >
              <PopoverTrigger asChild>
                <Button variant="destructive" size="sm" className="text-xs">
                  KO
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                <p className="text-xs text-muted-foreground mb-2 px-1">Knocked out by:</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {players
                    .filter((p) => p.isActive && p.id !== player.id)
                    .map((p) => (
                      <Button
                        key={p.id}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-xs"
                        onClick={() => {
                          knockoutPlayer(tournamentId, player.id, p.id);
                          setKoPopoverOpen(null);
                        }}
                      >
                        {p.name}
                      </Button>
                    ))}
                </div>
              </PopoverContent>
            </Popover>
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
    );
  }

  const tableNumbers = [...new Set((seatAssignments ?? []).map((a) => a.table))].sort(
    (a, b) => a - b,
  );
  // The flat list is still right for a single table, and for setup before the draw.
  const grouped = tableNumbers.length > 1;

  const needsCaptain = isFinished
    ? []
    : tableNumbers.filter((table) => {
        const captainId = tables.find((t) => t.tableNumber === table)?.captainPlayerId;
        if (captainId) {
          return false;
        }
        const seatedIds = new Set(
          (seatAssignments ?? []).filter((a) => a.table === table).map((a) => a.playerId),
        );
        return players.some((p) => seatedIds.has(p.id) && p.isActive);
      });

  const undoButton = !isSetup && !isFinished && tournament.knockoutOrder.length > 0 && (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => undoKnockout(tournamentId)}
      className="text-xs text-muted-foreground mt-2"
    >
      Undo Last Knockout
    </Button>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg">Players ({players.length})</CardTitle>
        {!isFinished && <PlayerAddDialog tournamentId={tournamentId} />}
      </CardHeader>
      <CardContent>
        {needsCaptain.length > 0 && (
          <div
            className="mb-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
            data-testid="captain-needed"
          >
            {needsCaptain.length === 1
              ? `Table ${needsCaptain[0]} has no captain.`
              : `Tables ${needsCaptain.join(", ")} have no captain.`}{" "}
            <span className="text-muted-foreground">
              Choose one, or knockouts there stay with you.
            </span>
          </div>
        )}
        {players.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No players yet. Add players to get started.
          </p>
        ) : !grouped ? (
          <div className="space-y-2">
            {tableNumbers.length === 1 && (
              <div className="flex items-center gap-2 pb-1">
                <span className="text-sm font-semibold">Table {tableNumbers[0]}</span>
                {captainControl(tableNumbers[0], players)}
              </div>
            )}
            {sortPlayers(players).map(renderRow)}
            {undoButton}
          </div>
        ) : (
          <div className="space-y-5">
            {tableNumbers.map((tableNumber) => {
              const seated = (seatAssignments ?? []).filter((a) => a.table === tableNumber);
              const seatedIds = new Set(seated.map((a) => a.playerId));
              const tablePlayers = players.filter((p) => seatedIds.has(p.id));
              const captainId = tables.find((t) => t.tableNumber === tableNumber)?.captainPlayerId;
              const captain = players.find((p) => p.id === captainId);
              const activeCount = tablePlayers.filter((p) => p.isActive).length;

              return (
                <div key={tableNumber} className="space-y-2" data-table={tableNumber}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Table {tableNumber}</span>
                    <Badge variant="outline" className="text-xs">
                      {activeCount} left
                    </Badge>
                    {captainControl(tableNumber, tablePlayers)}
                  </div>
                  <div className="space-y-2">{sortPlayers(tablePlayers).map(renderRow)}</div>
                </div>
              );
            })}
            {undoButton}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
