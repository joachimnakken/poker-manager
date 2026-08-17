"use client";

import { use, useEffect, useRef, useState } from "react";
import { useTournamentStore } from "@/store/tournament-store";
import { useTournamentSync } from "@/store/use-sync";
import { useClockTick } from "@/store/use-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { getIdentity } from "@/lib/identity";
import { formatTime, formatChips, getAverageStack, formatCurrency } from "@/lib/tournament-utils";
import { calculatePayouts, calculateTotalPot } from "@/lib/prize-calculator";
import { CHIP_SET } from "@/lib/constants";
import { playLevelChangeSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Player, Tournament } from "@/lib/types";

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
  const [isHost, setIsHost] = useState(false);
  const [layout, setLayout] = useState<Layout>("companion");

  useEffect(() => {
    const identity = getIdentity(code);
    setPlayerId(identity.playerId ?? null);
    setIsHost(Boolean(identity.ownerToken));
    setLayout((window.localStorage.getItem(LAYOUT_KEY) as Layout) ?? "companion");
  }, [code]);

  function chooseLayout(next: Layout) {
    setLayout(next);
    window.localStorage.setItem(LAYOUT_KEY, next);
  }

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
      <Shell code={code} layout={layout} onLayout={chooseLayout} name={tournament.config.name}>
        <StandaloneClock tournament={tournament} />
      </Shell>
    );
  }

  return (
    <Shell code={code} layout={layout} onLayout={chooseLayout} name={tournament.config.name}>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!me ? (
        tournament.status === "setup" ? (
          // Identity is read from localStorage on mount, so checking in has to hand the
          // new player id back or this device would keep showing the form.
          <CheckIn
            onSubmit={async (name) => {
              const result = await checkIn(code, name);
              if (result) {
                setPlayerId(result.playerId);
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
  children,
}: {
  code: string;
  name?: string;
  layout?: Layout;
  onLayout?: (next: Layout) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen px-4 py-5 max-w-md mx-auto space-y-4 overflow-x-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">{name ?? "Poker"}</h1>
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
    </div>
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

function CheckIn({ onSubmit }: { onSubmit: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

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
            if (!name.trim() || busy) return;
            setBusy(true);
            try {
              await onSubmit(name.trim());
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
          <Button type="submit" className="w-full" disabled={!name.trim() || busy}>
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
          <div className="text-2xl font-bold">{me.name}</div>
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
      <ChipReference startingChips={tournament.config.startingChips} />
      <p className="text-center text-sm text-muted-foreground">
        {tournament.players.length} checked in
      </p>
    </div>
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
  const claimCaptaincy = useTournamentStore((s) => s.claimCaptaincy);
  const releaseCaptaincy = useTournamentStore((s) => s.releaseCaptaincy);
  const knockoutPlayer = useTournamentStore((s) => s.knockoutPlayer);
  const registerRebuy = useTournamentStore((s) => s.registerRebuy);
  const registerAddon = useTournamentStore((s) => s.registerAddon);
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

      {tableNumber !== undefined && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Table {tableNumber}</CardTitle>
            {amCaptain ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => releaseCaptaincy(code, tableNumber)}
              >
                Step down
              </Button>
            ) : captainId ? (
              <span className="text-xs text-muted-foreground">Captain: {captainName}</span>
            ) : (
              <Button
                size="sm"
                className="text-xs"
                data-testid="claim-captaincy"
                onClick={() => claimCaptaincy(code, tableNumber)}
              >
                Be captain
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <TableRoster
              tournament={tournament}
              tableNumber={tableNumber}
              actions={
                canAct
                  ? (player) => (
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
                    )
                  : undefined
              }
            />
            {!canAct && (
              <p className="text-xs text-muted-foreground mt-3">
                Only this table&apos;s captain can record knockouts.
              </p>
            )}
          </CardContent>
        </Card>
      )}
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
