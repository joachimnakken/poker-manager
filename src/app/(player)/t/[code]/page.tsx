"use client";

import { use, useEffect, useRef, useState } from "react";
import { useTournamentStore } from "@/store/tournament-store";
import { useTournamentSync } from "@/store/use-sync";
import { useClockTick } from "@/store/use-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { clearProfile, getIdentity, getProfile, type StoredProfile } from "@/lib/identity";
import { didYouMean } from "@/lib/name-match";
import type { CheckinRequest, StatsResponse } from "@/lib/api";
import { formatTime, formatChips, getAverageStack, formatCurrency } from "@/lib/tournament-utils";
import { calculatePayouts, calculateTotalPot } from "@/lib/prize-calculator";
import { CHIP_SET } from "@/lib/constants";
import { playLevelChangeSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Announcement, Player, Tournament } from "@/lib/types";
import { PlayerNav } from "@/components/player-nav";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { SelfieCapture } from "@/components/selfie-capture";
import { Avatar } from "@/components/avatar";
import { AnnouncementFlash } from "@/components/announcement-flash";

const LAYOUT_KEY = "poker-phone-layout";
type Layout = "companion" | "clock";

export default function PhonePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  useTournamentSync(code);
  useClockTick(code);

  const tournament = useTournamentStore((s) => s.tournaments[code]);
  const loaded = useTournamentStore((s) => s.loaded);
  const error = useTournamentStore((s) => s.error);
  const checkIn = useTournamentStore((s) => s.checkIn);

  // Identity lives in this device's localStorage, so it can only be read after mount.
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [hasOwnerToken, setHasOwnerToken] = useState(false);
  const [layout, setLayout] = useState<Layout>("companion");
  // Offered once, when the profile has no photo yet. Always skippable.
  const [needsPhoto, setNeedsPhoto] = useState(false);

  useEffect(() => {
    const identity = getIdentity(code);
    setPlayerId(identity.playerId ?? null);
    setHasOwnerToken(Boolean(identity.ownerToken));
    setLayout((window.localStorage.getItem(LAYOUT_KEY) as Layout) ?? "companion");
  }, [code]);

  function chooseLayout(next: Layout) {
    setLayout(next);
    window.localStorage.setItem(LAYOUT_KEY, next);
  }

  // Host authority reaches this device either way: the owner token, or being the
  // player the owner device marked as themselves.
  const isHost =
    hasOwnerToken || (playerId !== null && tournament?.hostPlayerId === playerId);

  const me = tournament?.players.find((p) => p.id === playerId);
  const myTable = tournament?.seatAssignments?.find((a) => a.playerId === playerId);
  const amCaptain =
    tournament?.tables.some(
      (t) => t.tableNumber === myTable?.table && t.captainPlayerId === playerId,
    ) ?? false;

  // Captains get a chime on level change and a wake lock, because they are the ones who
  // have to act on the clock rather than just read it.
  useWakeLock(amCaptain && (tournament?.timer.isRunning ?? false));
  const lastLevel = useRef<number | null>(null);
  useEffect(() => {
    const index = tournament?.timer.currentLevelIndex;
    if (index === undefined) return;
    if (amCaptain && lastLevel.current !== null && lastLevel.current !== index) {
      playLevelChangeSound();
    }
    lastLevel.current = index;
  }, [tournament?.timer.currentLevelIndex, amCaptain]);

  if (!tournament) {
    return (
      <Shell code={code}>
        <p className="text-center text-muted-foreground py-12">
          {loaded ? `No tournament with code ${code}.` : "Loading…"}
        </p>
      </Shell>
    );
  }

  if (layout === "clock") {
    return (
      <Shell
      code={code}
      layout={layout}
      onLayout={chooseLayout}
      name={tournament.config.name}
      isHost={isHost}
      announcements={tournament.announcements}
    >
        <StandaloneClock tournament={tournament} />
      </Shell>
    );
  }

  return (
    <Shell
      code={code}
      layout={layout}
      onLayout={chooseLayout}
      name={tournament.config.name}
      isHost={isHost}
      announcements={tournament.announcements}
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!me ? (
        tournament.status === "setup" ? (
          // Identity is read from localStorage on mount, so checking in has to hand the
          // new player id back or this device would keep showing the form.
          <CheckIn
            onSubmit={async (request) => {
              const result = await checkIn(code, request);
              if (result) {
                setPlayerId(result.playerId);
                setNeedsPhoto(!result.hasAvatar);
              }
            }}
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This game is already under way, so check-in has closed. You are watching.
            </p>
            <Spectator tournament={tournament} />
          </>
        )
      ) : needsPhoto ? (
        <Card>
          <CardContent className="pt-4">
            <SelfieCapture
              onSkip={() => setNeedsPhoto(false)}
              onCapture={async (image) => {
                const stored = getProfile();
                if (stored) {
                  await fetch("/api/profiles/avatar", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ profileToken: stored.profileToken, image }),
                  });
                }
                setNeedsPhoto(false);
              }}
            />
          </CardContent>
        </Card>
      ) : tournament.status === "finished" ? (
        <Results tournament={tournament} me={me} />
      ) : tournament.status === "setup" ? (
        <PreGame tournament={tournament} me={me} seat={myTable} />
      ) : !me.isActive ? (
        <Busted tournament={tournament} me={me} />
      ) : (
        <InPlay
          tournament={tournament}
          me={me}
          tableNumber={myTable?.table}
          seatNumber={myTable?.seat}
          amCaptain={amCaptain}
          isHost={isHost}
        />
      )}
    </Shell>
  );
}

function Shell({
  code,
  name,
  layout,
  onLayout,
  isHost,
  announcements,
  children,
}: {
  code: string;
  name?: string;
  layout?: Layout;
  onLayout?: (next: Layout) => void;
  isHost?: boolean;
  announcements?: Announcement[];
  children: React.ReactNode;
}) {
  const loadOne = useTournamentStore((s) => s.loadOne);

  return (
    <PullToRefresh onRefresh={() => loadOne(code)}>
      <div className="min-h-screen px-4 pt-safe pb-safe max-w-md mx-auto space-y-4 overflow-x-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold truncate">{name ?? "Poker"}</h1>
            {isHost && (
              <Badge variant="default" className="shrink-0 text-[10px]" data-testid="host-badge">
                HOST
              </Badge>
            )}
          </div>
          <span className="text-xs font-mono text-muted-foreground tracking-widest">{code}</span>
        </div>
        {layout && onLayout && (
          <div className="flex shrink-0 rounded-md border overflow-hidden">
            <button
              onClick={() => onLayout("companion")}
              className={cn(
                "px-2.5 py-1.5 text-xs",
                layout === "companion" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              Table
            </button>
            <button
              onClick={() => onLayout("clock")}
              className={cn(
                "px-2.5 py-1.5 text-xs",
                layout === "clock" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              Clock
            </button>
          </div>
        )}
      </div>
      {children}
      <PlayerNav className="pt-2" />
      {announcements && <AnnouncementFlash announcements={announcements} />}
      </div>
    </PullToRefresh>
  );
}

function Clock({ tournament, size = "text-6xl" }: { tournament: Tournament; size?: string }) {
  const { timer, config, status } = tournament;
  const level = config.blindStructure[timer.currentLevelIndex];
  const isCritical = timer.secondsRemaining <= 60 && status !== "paused";

  return (
    <div className="text-center space-y-1">
      {level?.isBreak ? (
        <div className="text-base font-medium text-amber-500 uppercase tracking-widest">Break</div>
      ) : (
        <div className="text-sm text-muted-foreground">
          Level {level?.level} &middot; {level?.smallBlind.toLocaleString()}/
          {level?.bigBlind.toLocaleString()}
          {level && level.ante > 0 && ` (ante ${level.ante.toLocaleString()})`}
        </div>
      )}
      <div
        className={cn(
          "font-mono font-bold tabular-nums",
          size,
          isCritical && "text-red-500",
          status === "paused" && "text-amber-500 animate-pulse",
        )}
      >
        {formatTime(timer.secondsRemaining)}
      </div>
      {status === "paused" && (
        <div className="text-xs uppercase tracking-widest text-amber-500">Paused</div>
      )}
    </div>
  );
}

function StandaloneClock({ tournament }: { tournament: Tournament }) {
  const next = tournament.config.blindStructure[tournament.timer.currentLevelIndex + 1];
  return (
    <div className="py-16 space-y-6">
      <Clock tournament={tournament} size="text-7xl" />
      {next && (
        <p className="text-center text-sm text-muted-foreground">
          Next:{" "}
          {next.isBreak
            ? "Break"
            : `${next.smallBlind.toLocaleString()}/${next.bigBlind.toLocaleString()}`}
        </p>
      )}
    </div>
  );
}

function CheckIn({ onSubmit }: { onSubmit: (request: CheckinRequest) => Promise<unknown> }) {
  // The stored profile makes a returning device one tap; localStorage is mount-only.
  const [profile, setStoredProfile] = useState<StoredProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  // A near-miss against an existing profile ("Joachm" vs "Joachim") pauses the submit
  // and asks, rather than silently creating a duplicate — or worse, merging two people.
  const [suggestion, setSuggestion] = useState<{ firstName: string; lastName: string } | null>(
    null,
  );

  useEffect(() => {
    setStoredProfile(getProfile());
  }, []);

  async function submit(request: CheckinRequest) {
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit(request);
    } finally {
      setBusy(false);
    }
  }

  /** Checks the typed name against known profiles before committing to a new one. */
  async function submitTyped() {
    const typed = { firstName: firstName.trim(), lastName: lastName.trim() };
    setBusy(true);
    try {
      const data: StatsResponse = await fetch("/api/stats", { cache: "no-store" }).then(
        (response) => response.json(),
      );
      const index = didYouMean(
        `${typed.firstName} ${typed.lastName}`,
        data.leaderboard.map((entry) => `${entry.firstName} ${entry.lastName}`),
      );
      if (index !== null) {
        const match = data.leaderboard[index];
        setSuggestion({ firstName: match.firstName, lastName: match.lastName });
        return;
      }
    } catch {
      // If the lookup fails, check in on the typed name — the prompt is best-effort.
    } finally {
      setBusy(false);
    }
    await submit(typed);
  }

  if (profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Welcome back</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full"
            disabled={busy}
            data-testid="join-as-profile"
            onClick={() => submit(profile)}
          >
            {busy ? "Checking in…" : `Join as ${profile.firstName} ${profile.lastName}`}
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground underline"
            onClick={() => {
              clearProfile();
              setStoredProfile(null);
            }}
          >
            Not {profile.firstName}? Check in with another name
          </button>
        </CardContent>
      </Card>
    );
  }

  if (suggestion) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Have we met?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {firstName.trim()} {lastName.trim()} is close to a name we already know.
          </p>
          <Button
            className="w-full"
            disabled={busy}
            data-testid="checkin-existing-profile"
            onClick={() => submit(suggestion)}
          >
            {busy ? "Checking in…" : `Yes, I'm ${suggestion.firstName} ${suggestion.lastName}`}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            data-testid="checkin-new-profile"
            onClick={() => submit({ firstName: firstName.trim(), lastName: lastName.trim() })}
          >
            No, I&apos;m new — join as {firstName.trim()} {lastName.trim()}
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground underline"
            onClick={() => setSuggestion(null)}
          >
            Go back and retype
          </button>
        </CardContent>
      </Card>
    );
  }

  const complete = firstName.trim() && lastName.trim();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Check in</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!complete) return;
            await submitTyped();
          }}
        >
          <Input
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
          />
          <Input
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
          <Button type="submit" className="w-full" disabled={!complete || busy}>
            {busy ? "Checking in…" : "I'm in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ChipReference({ startingChips }: { startingChips: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Your stack</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {CHIP_SET.filter((chip) => chip.startingQty > 0).map((chip) => (
          <div key={chip.value} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border border-border bg-muted" />
              {chip.color} &middot; {chip.value}
            </span>
            <span className="text-muted-foreground font-mono">
              {chip.startingQty} = {formatChips(chip.total)}
            </span>
          </div>
        ))}
        <div className="flex justify-between text-sm font-medium pt-2 border-t">
          <span>Total</span>
          <span className="font-mono">{formatChips(startingChips)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function PreGame({
  tournament,
  me,
  seat,
}: {
  tournament: Tournament;
  me: Player;
  seat?: { table: number; seat: number };
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 text-center space-y-1">
          <div className="text-sm text-muted-foreground">Checked in as</div>
          <div className="text-2xl font-bold" data-testid="my-name">
            {me.name}
          </div>
          {seat ? (
            <div className="text-lg" data-testid="my-seat">
              Table {seat.table} &middot; Seat {seat.seat}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Waiting for the host to draw seats…
            </div>
          )}
        </CardContent>
      </Card>
      <FieldPanel tournament={tournament} meId={me.id} title="Checked in" />
      <ChipReference startingChips={tournament.config.startingChips} />
    </div>
  );
}

/**
 * The one list of players on the phone. Active first, then the knocked-out in finishing
 * order, struck through with their place. Rebuys and add-ons are badges because "has he
 * already rebought?" is what starts arguments at the table.
 *
 * With more than one table it gains tabs, so a player can look at the whole field or
 * just the table in front of them without a second list competing for the screen.
 */
function FieldPanel({
  tournament,
  meId,
  title,
  header,
  actionsFor,
}: {
  tournament: Tournament;
  meId?: string;
  title: string;
  header?: React.ReactNode;
  actionsFor?: (player: Player) => React.ReactNode;
}) {
  const { players, seatAssignments, tables } = tournament;
  const tableNumbers = [...new Set((seatAssignments ?? []).map((a) => a.table))].sort(
    (a, b) => a - b,
  );
  const [tab, setTab] = useState("all");
  const active = players.filter((p) => p.isActive);

  const seatOf = (playerId: string) => (seatAssignments ?? []).find((a) => a.playerId === playerId);
  const captainOf = (table: number) =>
    tables.find((t) => t.tableNumber === table)?.captainPlayerId;

  function rowsFor(table: number | null): Player[] {
    const scoped =
      table === null ? players : players.filter((p) => seatOf(p.id)?.table === table);
    return [...scoped].sort((a, b) => {
      if (a.isActive !== b.isActive) {
        return a.isActive ? -1 : 1;
      }
      if (!a.isActive && !b.isActive) {
        return (a.finishPosition ?? 999) - (b.finishPosition ?? 999);
      }
      if (table !== null) {
        return (seatOf(a.id)?.seat ?? 0) - (seatOf(b.id)?.seat ?? 0);
      }
      return a.name.localeCompare(b.name);
    });
  }

  const list = (table: number | null) => (
    <div className="space-y-1">
      {rowsFor(table).map((player) => {
        const seat = seatOf(player.id);
        const isCaptain = seat !== undefined && captainOf(seat.table) === player.id;
        return (
          <div
            key={player.id}
            data-testid={`field-${player.name}`}
            data-player-row={player.name}
            className={cn(
              "flex items-center gap-2 rounded-md p-2",
              player.id === meId ? "bg-primary/10" : "bg-muted/30",
              !player.isActive && "opacity-60",
            )}
          >
            {table !== null && seat && (
              <span className="w-4 shrink-0 text-xs font-mono text-muted-foreground">
                {seat.seat}
              </span>
            )}
            <Avatar profileId={player.profileId} name={player.name} className="h-7 w-7" />
            <span
              className={cn(
                "flex-1 truncate text-sm font-medium",
                !player.isActive && "line-through",
              )}
            >
              {player.name}
            </span>

            {isCaptain && (
              <Badge variant="secondary" className="px-1.5 text-[10px]">
                C
              </Badge>
            )}
            {player.rebuys > 0 && (
              <Badge variant="outline" className="px-1.5 text-[10px]">
                R{player.rebuys}
              </Badge>
            )}
            {player.hasAddon && (
              <Badge variant="outline" className="px-1.5 text-[10px]">
                A
              </Badge>
            )}

            {!player.isActive ? (
              <span
                data-finish-position={player.name}
                className="shrink-0 text-xs font-mono text-muted-foreground"
              >
                #{player.finishPosition}
              </span>
            ) : table === null && seat ? (
              <span className="shrink-0 text-xs font-mono text-muted-foreground">
                T{seat.table}&middot;S{seat.seat}
              </span>
            ) : null}

            {player.isActive && actionsFor?.(player)}
          </div>
        );
      })}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {header ?? (
          <span className="text-xs text-muted-foreground">
            {active.length}/{players.length} left
          </span>
        )}
      </CardHeader>
      <CardContent>
        {tableNumbers.length > 1 ? (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1">
                All
              </TabsTrigger>
              {tableNumbers.map((table) => (
                <TabsTrigger key={table} value={String(table)} className="flex-1">
                  T{table}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="all" className="mt-3">
              {list(null)}
            </TabsContent>
            {tableNumbers.map((table) => (
              <TabsContent key={table} value={String(table)} className="mt-3">
                {list(table)}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          list(null)
        )}
      </CardContent>
    </Card>
  );
}

function TableRoster({
  tournament,
  tableNumber,
  actions,
}: {
  tournament: Tournament;
  tableNumber: number;
  actions?: (player: Player) => React.ReactNode;
}) {
  const seats = (tournament.seatAssignments ?? [])
    .filter((a) => a.table === tableNumber)
    .sort((a, b) => a.seat - b.seat);
  const captainId = tournament.tables.find((t) => t.tableNumber === tableNumber)?.captainPlayerId;

  return (
    <div className="space-y-1">
      {seats.map((assignment) => {
        const player = tournament.players.find((p) => p.id === assignment.playerId);
        if (!player) return null;
        return (
          <div
            key={`${assignment.table}-${assignment.seat}`}
            data-player-row={player.name}
            className={cn(
              "flex items-center gap-2 p-2 rounded-md bg-muted/30",
              !player.isActive && "opacity-50",
            )}
          >
            <span className="text-xs font-mono text-muted-foreground w-4">{assignment.seat}</span>
            <span className="text-sm font-medium truncate flex-1">{player.name}</span>
            {player.id === captainId && (
              <Badge variant="secondary" className="text-[10px] px-1.5">C</Badge>
            )}
            {player.rebuys > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5">R{player.rebuys}</Badge>
            )}
            {!player.isActive && (
              <span
                data-finish-position={player.name}
                className="text-xs font-mono text-muted-foreground"
              >
                #{player.finishPosition}
              </span>
            )}
            {player.isActive && actions?.(player)}
          </div>
        );
      })}
    </div>
  );
}

function InPlay({
  tournament,
  me,
  tableNumber,
  seatNumber,
  amCaptain,
  isHost,
}: {
  tournament: Tournament;
  me: Player;
  tableNumber?: number;
  seatNumber?: number;
  amCaptain: boolean;
  isHost: boolean;
}) {
  const code = tournament.code;
  const knockoutPlayer = useTournamentStore((s) => s.knockoutPlayer);
  const registerRebuy = useTournamentStore((s) => s.registerRebuy);
  const registerAddon = useTournamentStore((s) => s.registerAddon);
  const announceAllIn = useTournamentStore((s) => s.announceAllIn);
  const [koTarget, setKoTarget] = useState<string | null>(null);

  const captainId =
    tournament.tables.find((t) => t.tableNumber === tableNumber)?.captainPlayerId ?? null;
  const captainName = tournament.players.find((p) => p.id === captainId)?.name;

  const { config, timer, players } = tournament;
  let playLevel = 0;
  for (let i = 0; i <= timer.currentLevelIndex; i++) {
    if (!config.blindStructure[i]?.isBreak) {
      playLevel = config.blindStructure[i]?.level ?? 0;
    }
  }
  const rebuyOpen = playLevel <= config.lastRebuyLevel;
  const active = players.filter((p) => p.isActive);
  const canAct = amCaptain || isHost;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <Clock tournament={tournament} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniStat
          label="Left"
          value={`${active.length}/${players.length}`}
          testId="players-left"
        />
        <MiniStat label="Avg stack" value={formatChips(getAverageStack(tournament))} />
        <MiniStat
          label="Rebuys"
          value={rebuyOpen ? `to L${config.lastRebuyLevel}` : "closed"}
        />
      </div>

      <Card>
        <CardContent className="pt-5 text-center space-y-1">
          <div className="text-2xl font-bold">{me.name}</div>
          {tableNumber !== undefined ? (
            <div className="text-base" data-testid="my-seat">
              Table {tableNumber} &middot; Seat {seatNumber}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No seat assigned</div>
          )}
        </CardContent>
      </Card>

      {tableNumber !== undefined && <ProposalsForMe tournament={tournament} canConfirm={canAct} />}

      <FieldPanel
        tournament={tournament}
        meId={me.id}
        title="Players"
        header={
          tableNumber === undefined ? undefined : (
            <span className="text-xs text-muted-foreground">
              {captainName ? `Captain: ${captainName}` : "Captain: host"}
            </span>
          )
        }
        actionsFor={(player) => {
          // The host may act on anyone; a captain only on their own table. The server
          // enforces the same rule, so this is about not offering a button that 403s.
          const seat = (tournament.seatAssignments ?? []).find((a) => a.playerId === player.id);
          const mine = isHost || (amCaptain && seat?.table === tableNumber);
          if (!mine) {
            return null;
          }
          return (
            <span className="flex gap-1 shrink-0">
              {koTarget === player.id ? (
                <span className="flex gap-1 items-center">
                  <span className="text-[10px] text-muted-foreground">by</span>
                  <select
                    autoFocus
                    className="text-xs bg-background border rounded px-1 py-0.5 max-w-[90px]"
                    data-testid={`ko-by-${player.name}`}
                    defaultValue=""
                    onChange={(e) => {
                      knockoutPlayer(code, player.id, e.target.value || undefined);
                      setKoTarget(null);
                    }}
                  >
                    <option value="">who?</option>
                    {active
                      .filter((p) => p.id !== player.id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </span>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px]"
                    data-testid={`allin-${player.name}`}
                    onClick={() => announceAllIn(code, player.id)}
                  >
                    ALL IN
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="text-[10px] h-7 px-2"
                    data-testid={`ko-${player.name}`}
                    onClick={() => setKoTarget(player.id)}
                  >
                    KO
                  </Button>
                  {rebuyOpen && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[10px] h-7 px-2"
                      onClick={() => registerRebuy(code, player.id)}
                    >
                      R
                    </Button>
                  )}
                  {!player.hasAddon && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[10px] h-7 px-2"
                      onClick={() => registerAddon(code, player.id)}
                    >
                      A
                    </Button>
                  )}
                </>
              )}
            </span>
          );
        }}
      />
    </div>
  );
}

/** A captain sees the moves that need their word, and nothing else. */
function ProposalsForMe({
  tournament,
  canConfirm,
}: {
  tournament: Tournament;
  canConfirm: boolean;
}) {
  const confirmProposal = useTournamentStore((s) => s.confirmProposal);
  const declineProposal = useTournamentStore((s) => s.declineProposal);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const pending = tournament.proposals.filter((p) => p.status === "pending");
  if (pending.length === 0 || !canConfirm) {
    return null;
  }

  return (
    <div className="space-y-2">
      {pending.map((proposal) => {
        const name = tournament.players.find((p) => p.id === proposal.playerId)?.name ?? "—";
        return (
          <Card key={proposal.id} data-testid="phone-proposal" className="border-amber-500/50">
            <CardContent className="pt-4 space-y-2">
              <p className="text-sm">
                Move <span className="font-medium">{name}</span> from table {proposal.fromTable}{" "}
                seat {proposal.fromSeat} to table {proposal.toTable} seat {proposal.toSeat}?
              </p>
              <div className="flex gap-2 text-[10px] text-muted-foreground">
                <span>T{proposal.fromTable} {proposal.fromConfirmedAt ? "✓" : "waiting"}</span>
                <span>T{proposal.toTable} {proposal.toConfirmedAt ? "✓" : "waiting"}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  data-testid="confirm-proposal"
                  onClick={() => confirmProposal(tournament.code, proposal.id)}
                >
                  OK
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDecliningId(proposal.id)}
                >
                  Not now
                </Button>
              </div>
              {decliningId === proposal.id && (
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    placeholder="Why?"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={!reason.trim()}
                    onClick={() => {
                      declineProposal(tournament.code, proposal.id, reason.trim());
                      setReason("");
                      setDecliningId(null);
                    }}
                  >
                    Send
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Busted({ tournament, me }: { tournament: Tournament; me: Player }) {
  const payouts = calculatePayouts(tournament.players, tournament.config);
  const mine = payouts.find((p) => p.position === me.finishPosition);
  const eliminator = tournament.players.find((p) => p.id === me.knockedOutBy);

  return (
    <div className="space-y-4">
      <Card className="border-muted">
        <CardContent className="pt-6 text-center space-y-2">
          <div className="text-sm text-muted-foreground uppercase tracking-widest">
            You&apos;re out
          </div>
          <div className="text-5xl font-bold" data-testid="my-finish-position">
            #{me.finishPosition}
          </div>
          <div className="text-sm text-muted-foreground">
            of {tournament.players.length}
            {eliminator && ` · knocked out by ${eliminator.name}`}
          </div>
          {mine && (
            <div className="text-xl font-medium text-primary pt-1">
              {formatCurrency(mine.amount, tournament.config.currency)}
            </div>
          )}
        </CardContent>
      </Card>
      <Spectator tournament={tournament} />
    </div>
  );
}

function Spectator({ tournament }: { tournament: Tournament }) {
  const tableNumbers = [...new Set((tournament.seatAssignments ?? []).map((a) => a.table))].sort(
    (a, b) => a - b,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <Clock tournament={tournament} />
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-2 text-center">
        <MiniStat
          label="Left"
          value={`${tournament.players.filter((p) => p.isActive).length}/${tournament.players.length}`}
          testId="players-left"
        />
        <MiniStat
          label="Pot"
          value={formatCurrency(
            calculateTotalPot(tournament.players, tournament.config),
            tournament.config.currency,
          )}
        />
      </div>
      {tableNumbers.map((tableNumber) => (
        <Card key={tableNumber}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Table {tableNumber}</CardTitle>
          </CardHeader>
          <CardContent>
            <TableRoster tournament={tournament} tableNumber={tableNumber} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Results({ tournament, me }: { tournament: Tournament; me: Player }) {
  const payouts = calculatePayouts(tournament.players, tournament.config);
  const payoutMap = new Map(payouts.map((p) => [p.position, p]));
  const sorted = [...tournament.players].sort(
    (a, b) => (a.finishPosition ?? 999) - (b.finishPosition ?? 999),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 text-center space-y-1">
          <div className="text-sm text-muted-foreground uppercase tracking-widest">
            You finished
          </div>
          <div className="text-5xl font-bold" data-testid="my-finish-position">
            #{me.finishPosition}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Final standings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {sorted.map((player) => {
            const payout = payoutMap.get(player.finishPosition ?? 0);
            return (
              <div
                key={player.id}
                data-player-row={player.name}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-md",
                  player.id === me.id ? "bg-primary/10" : "bg-muted/30",
                )}
              >
                <span
                  data-finish-position={player.name}
                  className="text-xs font-mono text-muted-foreground w-6 text-right"
                >
                  #{player.finishPosition}
                </span>
                <span className="text-sm font-medium truncate flex-1">{player.name}</span>
                {payout && (
                  <span className="text-sm text-primary">
                    {formatCurrency(payout.amount, tournament.config.currency)}
                  </span>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums truncate" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}
