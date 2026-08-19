"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTournamentStore } from "@/store/tournament-store";
import { useTournamentSync } from "@/store/use-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BlindLevel, TournamentConfig } from "@/lib/types";
import { DEFAULT_BLIND_STRUCTURE } from "@/lib/constants";
import { useHostGuard } from "@/hooks/use-host-guard";

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  useTournamentSync(id);
  const isHost = useHostGuard(id);

  const tournament = useTournamentStore((s) => s.tournaments[id]);
  const loaded = useTournamentStore((s) => s.loaded);
  const updateConfig = useTournamentStore((s) => s.updateConfig);

  // Every field used to write straight through, which was free against localStorage.
  // Against the server it would be a request per keystroke, and the 2s poll would
  // overwrite the field mid-word — so edits are held locally and committed on blur.
  const [draft, setDraft] = useState<TournamentConfig | null>(null);
  const [seats, setSeats] = useState(9);
  const dirty = useRef(false);

  useEffect(() => {
    if (tournament && !dirty.current) {
      setDraft(tournament.config);
      setSeats(tournament.seatsPerTable);
    }
  }, [tournament]);

  if (!isHost || !tournament || !draft) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">
          {isHost && loaded ? "Tournament not found" : "Loading…"}
        </p>
      </div>
    );
  }

  function edit(patch: Partial<TournamentConfig>) {
    dirty.current = true;
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function commit(patch?: Partial<TournamentConfig>, seatsPerTable?: number) {
    dirty.current = false;
    const next = { ...draft!, ...patch };
    setDraft(next);
    void updateConfig(id, next, seatsPerTable ?? seats);
  }

  function editBlindLevel(index: number, field: keyof BlindLevel, value: number | boolean) {
    const blindStructure = [...draft!.blindStructure];
    blindStructure[index] = { ...blindStructure[index], [field]: value };
    edit({ blindStructure });
  }

  function addLevel() {
    const last = draft!.blindStructure[draft!.blindStructure.length - 1];
    commit({
      blindStructure: [
        ...draft!.blindStructure,
        {
          level: (last?.level ?? 0) + 1,
          smallBlind: last ? last.smallBlind * 2 : 100,
          bigBlind: last ? last.bigBlind * 2 : 200,
          ante: last ? Math.round(last.ante * 1.5) : 0,
          duration: 900,
        },
      ],
    });
  }

  function addBreak() {
    const last = draft!.blindStructure[draft!.blindStructure.length - 1];
    commit({
      blindStructure: [
        ...draft!.blindStructure,
        {
          level: (last?.level ?? 0) + 1,
          smallBlind: 0,
          bigBlind: 0,
          ante: 0,
          duration: 600,
          isBreak: true,
        },
      ],
    });
  }

  function removeLevel(index: number) {
    commit({ blindStructure: draft!.blindStructure.filter((_, i) => i !== index) });
  }

  const tableCount = Math.max(1, Math.ceil(tournament.players.length / seats));

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Tournament Settings</h1>
          <Link href={`/tournament/${id}`}>
            <Button variant="outline">Back to Tournament</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tournament Name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => edit({ name: e.target.value })}
                  onBlur={() => commit()}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input
                  value={draft.currency}
                  onChange={(e) => edit({ currency: e.target.value })}
                  onBlur={() => commit()}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="seats-per-table">Seats per table</Label>
            <Input
              id="seats-per-table"
              type="number"
              min={2}
              max={10}
              value={seats}
              onChange={(e) => {
                dirty.current = true;
                setSeats(Number(e.target.value));
              }}
              onBlur={() => {
                const clamped = Math.min(10, Math.max(2, seats || 9));
                setSeats(clamped);
                commit(undefined, clamped);
              }}
              className="max-w-[120px]"
            />
            <p className="text-sm text-muted-foreground">
              {tournament.players.length} players &rarr; {tableCount}{" "}
              {tableCount === 1 ? "table" : "tables"}. Redraw seats to apply.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Buy-in &amp; Chips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {(
                [
                  ["Buy-in", "buyIn"],
                  ["Starting Chips", "startingChips"],
                  ["Last Rebuy Level", "lastRebuyLevel"],
                  ["Rebuy Amount", "rebuyAmount"],
                  ["Rebuy Chips", "rebuyChips"],
                  ["Addon Amount", "addonAmount"],
                  ["Addon Chips", "addonChips"],
                ] as const
              ).map(([label, field]) => (
                <div key={field} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    value={draft[field]}
                    onChange={(e) => edit({ [field]: Number(e.target.value) })}
                    onBlur={() => commit()}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Blind Structure</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => commit({ blindStructure: [...DEFAULT_BLIND_STRUCTURE] })}
              >
                Reset to Defaults
              </Button>
              <Button variant="outline" size="sm" onClick={addLevel}>
                + Level
              </Button>
              <Button variant="outline" size="sm" onClick={addBreak}>
                + Break
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-6 text-xs text-muted-foreground font-medium px-2">
                <span>Type</span>
                <span>SB</span>
                <span>BB</span>
                <span>Ante</span>
                <span>Min</span>
                <span></span>
              </div>
              <Separator />
              {draft.blindStructure.map((level, index) => (
                <div key={index} className="grid grid-cols-6 gap-2 items-center">
                  <span className="text-sm px-2">
                    {level.isBreak ? "Break" : `Level ${level.level}`}
                  </span>
                  {level.isBreak ? (
                    <span className="col-span-3 text-sm text-muted-foreground px-2">-</span>
                  ) : (
                    <>
                      <Input
                        type="number"
                        value={level.smallBlind}
                        onChange={(e) => editBlindLevel(index, "smallBlind", Number(e.target.value))}
                        onBlur={() => commit()}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        value={level.bigBlind}
                        onChange={(e) => editBlindLevel(index, "bigBlind", Number(e.target.value))}
                        onBlur={() => commit()}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        value={level.ante}
                        onChange={(e) => editBlindLevel(index, "ante", Number(e.target.value))}
                        onBlur={() => commit()}
                        className="h-8 text-sm"
                      />
                    </>
                  )}
                  <Input
                    type="number"
                    value={level.duration / 60}
                    onChange={(e) => editBlindLevel(index, "duration", Number(e.target.value) * 60)}
                    onBlur={() => commit()}
                    className="h-8 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLevel(index)}
                    className="text-destructive hover:text-destructive text-xs h-8"
                  >
                    X
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
