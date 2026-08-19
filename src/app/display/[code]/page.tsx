"use client";

import { use, useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { useTournamentStore } from "@/store/tournament-store";
import { useTournamentSync } from "@/store/use-sync";
import { useClockTick } from "@/store/use-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { formatTime, getAverageStack, formatChips } from "@/lib/tournament-utils";
import { calculatePayouts, calculateTotalPot } from "@/lib/prize-calculator";
import { formatCurrency } from "@/lib/tournament-utils";
import { cn } from "@/lib/utils";
import { assignCards } from "@/lib/name-cards";
import { BouncingCards } from "@/components/bouncing-cards";
import type { Tournament } from "@/lib/types";

/**
 * The projector's palette. It reads across a room, so it styles itself with explicit
 * classes rather than the semantic tokens the rest of the app uses — full class
 * literals on purpose, since Tailwind only generates classes it can see in the source.
 */
const THEME = {
  pageBg: "bg-gradient-to-br from-blue-950 via-blue-900 to-cyan-900",
  prestartBg: "bg-gradient-to-br from-indigo-900 via-blue-800 to-cyan-700",
  statusLabel: "text-cyan-300",
  levelLabel: "text-sky-200",
  muted: "text-white/60",
  payoutPosition: "text-cyan-300",
  seatNumber: "text-white/50",
  busted: "text-white/40 line-through",
  tableCard: "border border-white/20 bg-white/10",
  statCard: "rounded-2xl bg-white/10 p-4",
  critical: "text-red-300",
  accent: "text-cyan-300",
  qrCard: "shadow-2xl shadow-blue-950/60",
  prestartHint: "text-white/90",
  /** For text laid straight over the gradient, with no card behind it. */
  nameShadow: "0 2px 16px rgba(0, 0, 0, 0.45)",
};

type Theme = typeof THEME;

/**
 * The second window on an extended display: controls stay on the laptop, this goes on
 * the projector. Everything here is sized to be read across a room, and nothing but
 * the theme toggle is interactive — a stray click on a projector is always a mistake.
 */
export default function DisplayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  // Always the live poll rate: the wall is where new check-ins and the
  // flip-to-play moment have to feel immediate.
  useTournamentSync(code, { live: true });
  useClockTick(code);

  const tournament = useTournamentStore((s) => s.tournaments[code]);
  const loaded = useTournamentStore((s) => s.loaded);
  useWakeLock(tournament !== undefined && tournament.status !== "finished");

  const theme = THEME;

  if (!tournament) {
    return (
      <div
        className={cn("min-h-screen flex items-center justify-center text-white", theme.prestartBg)}
      >
        <p className={cn("text-4xl", theme.muted)}>
          {loaded ? `No tournament ${code}` : "Loading…"}
        </p>
      </div>
    );
  }

  if (tournament.status === "setup") {
    return <PreStart tournament={tournament} theme={theme} />;
  }

  const { timer, config, status, players, seatAssignments, tables } = tournament;
  const level = config.blindStructure[timer.currentLevelIndex];
  const next = config.blindStructure[timer.currentLevelIndex + 1];
  const active = players.filter((p) => p.isActive);
  const isCritical = timer.secondsRemaining <= 60 && status !== "paused";
  const payouts = calculatePayouts(players, config);
  const tableNumbers = [...new Set((seatAssignments ?? []).map((a) => a.table))].sort(
    (a, b) => a - b,
  );

  return (
    <div className={cn("min-h-screen text-white p-8 flex flex-col gap-8", theme.pageBg)}>
      <div className="flex items-baseline justify-between">
        <h1 className="text-5xl font-bold">{config.name}</h1>
        <span className={cn("text-3xl uppercase tracking-widest", theme.statusLabel)}>
          {status === "break" ? "Break" : status}
        </span>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 items-center">
        <div className="text-center space-y-4">
          {level?.isBreak ? (
            <div className={cn("text-6xl font-medium uppercase tracking-widest", theme.accent)}>
              Break
            </div>
          ) : (
            <>
              <div className={cn("text-4xl", theme.levelLabel)}>Level {level?.level}</div>
              <div className="text-8xl font-bold tabular-nums">
                {level?.smallBlind.toLocaleString()}/{level?.bigBlind.toLocaleString()}
                {level && level.ante > 0 && (
                  <span className={cn("text-5xl ml-4", theme.muted)}>
                    ante {level.ante.toLocaleString()}
                  </span>
                )}
              </div>
            </>
          )}

          <div
            className={cn(
              "text-[10rem] leading-none font-mono font-bold tabular-nums",
              isCritical && theme.critical,
              status === "paused" && cn(theme.accent, "animate-pulse"),
            )}
          >
            {formatTime(timer.secondsRemaining)}
          </div>

          {next && (
            <div className={cn("text-3xl", theme.muted)}>
              Next:{" "}
              {next.isBreak
                ? "Break"
                : `${next.smallBlind.toLocaleString()}/${next.bigBlind.toLocaleString()}`}
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-6 text-center">
            <Stat theme={theme} label="Players left" value={`${active.length}/${players.length}`} />
            <Stat
              theme={theme}
              label="Prize pool"
              value={formatCurrency(calculateTotalPot(players, config), config.currency)}
            />
            <Stat theme={theme} label="Avg stack" value={formatChips(getAverageStack(tournament))} />
            <Stat theme={theme} label="Tables" value={String(Math.max(tableNumbers.length, 1))} />
          </div>

          {payouts.length > 0 && (
            <div className="space-y-1">
              <div className={cn("text-2xl uppercase tracking-wider", theme.muted)}>Payouts</div>
              {payouts.map((payout) => (
                <div key={payout.position} className="flex justify-between text-3xl">
                  <span className={theme.payoutPosition}>#{payout.position}</span>
                  <span className="font-medium">
                    {formatCurrency(payout.amount, config.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {tableNumbers.length > 0 && (
        <SeatChart tournament={tournament} theme={theme} showRemaining />
      )}
    </div>
  );
}

/**
 * The per-table seating chart, shared by the live layout and the pre-start wall. Sized
 * for a room: seat number, name, and a star on the captain. `showRemaining` is for live
 * play, where "{n} left" means something — before the start nobody is out yet.
 */
function SeatChart({
  tournament,
  theme,
  showRemaining = false,
  large = false,
}: {
  tournament: Tournament;
  theme: Theme;
  showRemaining?: boolean;
  /** Pre-start, the chart *is* the screen, so it reads a size up. */
  large?: boolean;
}) {
  const { players, seatAssignments, tables } = tournament;
  const tableNumbers = [...new Set((seatAssignments ?? []).map((a) => a.table))].sort(
    (a, b) => a - b,
  );
  const columns = Math.min(Math.max(tableNumbers.length, 1), 4);

  return (
    <div
      className="grid gap-6 w-full mx-auto"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        // One table full-bleed across a 16:9 wall is mostly empty space, so cap the
        // width per column and let the grid centre itself.
        maxWidth: large ? `${columns * 34}rem` : undefined,
      }}
    >
      {tableNumbers.map((tableNumber) => {
        const seats = (seatAssignments ?? [])
          .filter((a) => a.table === tableNumber)
          .sort((a, b) => a.seat - b.seat);
        const captainId = tables.find((t) => t.tableNumber === tableNumber)?.captainPlayerId;
        const left = seats.filter(
          (a) => players.find((p) => p.id === a.playerId)?.isActive,
        ).length;

        return (
          <div key={tableNumber} className={cn("rounded-2xl p-5", theme.tableCard)}>
            <div className="flex items-baseline justify-between mb-3">
              <span className={cn("font-semibold", large ? "text-5xl" : "text-3xl")}>
                Table {tableNumber}
              </span>
              <span className={cn(large ? "text-3xl" : "text-2xl", theme.levelLabel)}>
                {showRemaining
                  ? `${left} left`
                  : `${seats.length} ${seats.length === 1 ? "seat" : "seats"}`}
              </span>
            </div>
            <div className="space-y-1">
              {seats.map((assignment) => {
                const player = players.find((p) => p.id === assignment.playerId);
                if (!player) return null;
                return (
                  <div
                    key={`${assignment.table}-${assignment.seat}`}
                    className={cn(
                      "flex items-baseline gap-3",
                      large ? "text-4xl py-1" : "text-2xl",
                      showRemaining && !player.isActive && theme.busted,
                    )}
                  >
                    <span
                      className={cn("font-mono", large ? "w-12" : "w-8", theme.seatNumber)}
                    >
                      {assignment.seat}
                    </span>
                    <span className="truncate">{player.name}</span>
                    {player.id === captainId && <span className={theme.accent}>★</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** How many floating cards the slot ring holds before overflowing into "+N more". */
const MAX_FLOATING_CARDS = 14;





/**
 * Pre-start wall: nothing but the join QR and who's in. Flips to the live
 * layout the moment the host starts, via the status branch above.
 */
function PreStart({ tournament, theme }: { tournament: Tournament; theme: Theme }) {
  const code = tournament.code;

  const [joinUrl, setJoinUrl] = useState("");
  useEffect(() => {
    // The deployment-specific *.vercel.app origins sit behind Vercel SSO, so a QR
    // built from window.location.origin can dead-end a guest's phone on a login
    // page. The canonical public URL wins when configured.
    const base = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    setJoinUrl(`${base}/t/${code}`);
  }, [code]);

  const names = tournament.players.map((player) => player.name);
  const floating = names.slice(0, MAX_FLOATING_CARDS);
  const overflow = names.length - floating.length;
  const cards = assignCards(floating);
  const qrRef = useRef<HTMLDivElement>(null);

  // Once the host draws, the wall's job changes from "join" to "find your chair", so the
  // chart takes the room and the QR shrinks to a corner — latecomers can still scan it.
  if (tournament.seatAssignments !== undefined) {
    return (
      <div
        className={cn("min-h-screen text-white relative p-8 flex flex-col gap-6", theme.prestartBg)}
      >
        <div className="flex items-baseline justify-between">
          <h1 className="text-6xl font-bold">Find your seat</h1>
          <span className={cn("text-3xl", theme.prestartHint)}>
            {names.length} checked in
          </span>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <SeatChart tournament={tournament} theme={theme} large />
        </div>

        <div className="flex items-center justify-center gap-6">
          <div
            className={cn("bg-white p-4 rounded-2xl flex items-center gap-4", theme.qrCard)}
            data-testid="prestart-qr"
          >
            {joinUrl && <QRCode value={joinUrl} size={120} />}
            <div className="text-black pr-2">
              <div className="text-base text-zinc-600">Join code</div>
              <div className="text-4xl font-mono font-bold tracking-[0.2em]">{code}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-h-screen text-white relative overflow-hidden flex items-center justify-center p-8",
        theme.prestartBg,
      )}
    >
      <BouncingCards names={floating} cards={cards} obstacleRef={qrRef} />

      <div ref={qrRef} className="relative flex flex-col items-center gap-6">
        <div
          className={cn("bg-white p-8 rounded-3xl flex flex-col items-center gap-5", theme.qrCard)}
          data-testid="prestart-qr"
        >
          {joinUrl && <QRCode value={joinUrl} size={340} />}
          <div className="text-center text-black">
            <div className="text-xl text-zinc-600">Join code</div>
            <div className="text-6xl font-mono font-bold tracking-[0.2em]">{code}</div>
          </div>
        </div>
        <p
          className={cn("text-2xl", theme.prestartHint)}
          style={{ textShadow: theme.nameShadow }}
        >
          Scan to join &middot; {names.length} checked in
          {overflow > 0 && ` (+${overflow} not shown)`}
        </p>
      </div>
    </div>
  );
}

function Stat({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  return (
    <div className={theme.statCard}>
      <div className={cn("text-xl uppercase tracking-wider", theme.muted)}>{label}</div>
      <div className="text-5xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
