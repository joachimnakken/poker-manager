"use client";

import { useTournamentStore } from "@/store/tournament-store";
import { suggestPace, formatSpan } from "@/lib/pacing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Advisory only — the host decides. Once a break has been played and the night is projected
 * to run past the target finish time, this offers the two levers that shorten it.
 *
 * There is no dismiss, matching `TableBalance`: the card goes away when the projection comes
 * back inside the target, which is either because the host acted or because people busted.
 */
export function PaceNudge({ tournamentId }: { tournamentId: string }) {
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  const nextLevel = useTournamentStore((s) => s.nextLevel);
  const updateConfig = useTournamentStore((s) => s.updateConfig);

  if (!tournament) return null;

  const { players, config, timer, status, startedAt } = tournament;
  const suggestion =
    status === "setup" || status === "finished"
      ? null
      : suggestPace({
          players,
          structure: config.blindStructure,
          currentLevelIndex: timer.currentLevelIndex,
          startedAt,
          targetFinishAt: config.targetFinishAt,
        });

  if (!suggestion) return null;

  const cut = suggestion.cut;
  const finishAt = new Date(suggestion.projectedFinishAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Card data-testid="pace-nudge">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          On this pace you finish around {finishAt}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            data-testid="pace-skip-level"
            onClick={() => nextLevel(tournamentId)}
          >
            Raise the blinds now
          </Button>
          {cut && (
            <Button
              size="sm"
              variant="outline"
              data-testid="pace-cut-rounds"
              onClick={() => updateConfig(tournamentId, { blindStructure: cut.structure })}
            >
              Cut the coming rounds to {Math.round(cut.nextToSeconds / 60)} min — saves{" "}
              {formatSpan(cut.savedMs)}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
