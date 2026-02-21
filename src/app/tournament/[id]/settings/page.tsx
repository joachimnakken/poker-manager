"use client";

import { use } from "react";
import Link from "next/link";
import { useTournamentStore } from "@/store/tournament-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { BlindLevel } from "@/lib/types";
import { DEFAULT_BLIND_STRUCTURE } from "@/lib/constants";

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tournament = useTournamentStore((s) => s.tournaments[id]);
  const updateConfig = useTournamentStore((s) => s.updateConfig);

  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Tournament not found</p>
      </div>
    );
  }

  const { config } = tournament;

  function updateField(field: string, value: number | string) {
    updateConfig(id, { [field]: value });
  }

  function updateBlindLevel(index: number, field: keyof BlindLevel, value: number | boolean) {
    const newStructure = [...config.blindStructure];
    newStructure[index] = { ...newStructure[index], [field]: value };
    updateConfig(id, { blindStructure: newStructure });
  }

  function addLevel() {
    const last = config.blindStructure[config.blindStructure.length - 1];
    const newLevel: BlindLevel = {
      level: (last?.level ?? 0) + 1,
      smallBlind: last ? last.smallBlind * 2 : 100,
      bigBlind: last ? last.bigBlind * 2 : 200,
      ante: last ? Math.round(last.ante * 1.5) : 0,
      duration: 900,
    };
    updateConfig(id, { blindStructure: [...config.blindStructure, newLevel] });
  }

  function addBreak() {
    const lastLevel = config.blindStructure[config.blindStructure.length - 1];
    const breakLevel: BlindLevel = {
      level: (lastLevel?.level ?? 0) + 1,
      smallBlind: 0,
      bigBlind: 0,
      ante: 0,
      duration: 600,
      isBreak: true,
    };
    updateConfig(id, { blindStructure: [...config.blindStructure, breakLevel] });
  }

  function removeLevel(index: number) {
    const newStructure = config.blindStructure.filter((_, i) => i !== index);
    updateConfig(id, { blindStructure: newStructure });
  }

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
                  value={config.name}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input
                  value={config.currency}
                  onChange={(e) => updateField("currency", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Buy-in & Chips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Buy-in</Label>
                <Input
                  type="number"
                  value={config.buyIn}
                  onChange={(e) => updateField("buyIn", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Starting Chips</Label>
                <Input
                  type="number"
                  value={config.startingChips}
                  onChange={(e) => updateField("startingChips", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Last Rebuy Level</Label>
                <Input
                  type="number"
                  value={config.lastRebuyLevel}
                  onChange={(e) => updateField("lastRebuyLevel", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Rebuy Amount</Label>
                <Input
                  type="number"
                  value={config.rebuyAmount}
                  onChange={(e) => updateField("rebuyAmount", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Rebuy Chips</Label>
                <Input
                  type="number"
                  value={config.rebuyChips}
                  onChange={(e) => updateField("rebuyChips", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Addon Amount</Label>
                <Input
                  type="number"
                  value={config.addonAmount}
                  onChange={(e) => updateField("addonAmount", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Addon Chips</Label>
                <Input
                  type="number"
                  value={config.addonChips}
                  onChange={(e) => updateField("addonChips", Number(e.target.value))}
                />
              </div>
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
                onClick={() => updateConfig(id, { blindStructure: [...DEFAULT_BLIND_STRUCTURE] })}
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
              {config.blindStructure.map((level, index) => (
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
                        onChange={(e) => updateBlindLevel(index, "smallBlind", Number(e.target.value))}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        value={level.bigBlind}
                        onChange={(e) => updateBlindLevel(index, "bigBlind", Number(e.target.value))}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        value={level.ante}
                        onChange={(e) => updateBlindLevel(index, "ante", Number(e.target.value))}
                        className="h-8 text-sm"
                      />
                    </>
                  )}
                  <Input
                    type="number"
                    value={level.duration / 60}
                    onChange={(e) => updateBlindLevel(index, "duration", Number(e.target.value) * 60)}
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
