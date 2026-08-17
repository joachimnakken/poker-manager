"use client";

import { use, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { useTournamentStore } from "@/store/tournament-store";
import { useTournamentSync } from "@/store/use-sync";
import { useClockTick } from "@/store/use-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { formatTime, getAverageStack, formatChips } from "@/lib/tournament-utils";
import { calculatePayouts, calculateTotalPot } from "@/lib/prize-calculator";
import { formatCurrency } from "@/lib/tournament-utils";
import { cn } from "@/lib/utils";

/**
 * The second window on an extended display: controls stay on the laptop, this goes on
 * the projector. Everything here is sized to be read across a room, and nothing is
 * interactive — a stray click on a projector is always a mistake.
 */
export default function DisplayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  useTournamentSync(code);
  useClockTick(code);

  const tournament = useTournamentStore((s) => s.tournaments[code]);
  const loaded = useTournamentStore((s) => s.loaded);
  useWakeLock(tournament?.timer.isRunning ?? false);

  const [joinUrl, setJoinUrl] = useState("");
  useEffect(() => {
    setJoinUrl(`${window.location.origin}/t/${code}`);
  }, [code]);

  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p className="text-4xl text-zinc-500">{loaded ? `No tournament ${code}` : "Loading…"}</p>
      </div>
    );
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
    <div className="min-h-screen bg-black text-white p-8 flex flex-col gap-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-5xl font-bold">{config.name}</h1>
        <span className="text-3xl text-zinc-500 uppercase tracking-widest">
          {status === "break" ? "Break" : status}
        </span>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 items-center">
        <div className="text-center space-y-4">
          {level?.isBreak ? (
            <div className="text-6xl font-medium text-amber-400 uppercase tracking-widest">
              Break
            </div>
          ) : (
            <>
              <div className="text-4xl text-zinc-500">Level {level?.level}</div>
              <div className="text-8xl font-bold tabular-nums">
                {level?.smallBlind.toLocaleString()}/{level?.bigBlind.toLocaleString()}
                {level && level.ante > 0 && (
                  <span className="text-5xl text-zinc-500 ml-4">
                    ante {level.ante.toLocaleString()}
                  </span>
                )}
              </div>
            </>
          )}

          <div
            className={cn(
              "text-[10rem] leading-none font-mono font-bold tabular-nums",
              isCritical && "text-red-500",
              status === "paused" && "text-amber-400 animate-pulse",
            )}
          >
            {formatTime(timer.secondsRemaining)}
          </div>

          {next && (
            <div className="text-3xl text-zinc-500">
              Next:{" "}
              {next.isBreak
                ? "Break"
                : `${next.smallBlind.toLocaleString()}/${next.bigBlind.toLocaleString()}`}
            </div>
          )}
        </div>

        <div className="space-y-8">
          {status === "setup" && joinUrl && (
            <div className="bg-white p-6 rounded-2xl flex flex-col items-center gap-4">
              <QRCode value={joinUrl} size={260} />
              <div className="text-center text-black">
                <div className="text-xl text-zinc-600">Join code</div>
                <div className="text-6xl font-mono font-bold tracking-[0.2em]">{code}</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6 text-center">
            <Stat label="Players left" value={`${active.length}/${players.length}`} />
            <Stat label="Prize pool" value={formatCurrency(calculateTotalPot(players, config), config.currency)} />
            <Stat label="Avg stack" value={formatChips(getAverageStack(tournament))} />
            <Stat label="Tables" value={String(Math.max(tableNumbers.length, 1))} />
          </div>

          {payouts.length > 0 && (
            <div className="space-y-1">
              <div className="text-2xl text-zinc-500">Payouts</div>
              {payouts.map((payout) => (
                <div key={payout.position} className="flex justify-between text-3xl">
                  <span className="text-zinc-400">#{payout.position}</span>
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
        <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.min(tableNumbers.length, 4)}, minmax(0, 1fr))` }}>
          {tableNumbers.map((tableNumber) => {
            const seats = (seatAssignments ?? [])
              .filter((a) => a.table === tableNumber)
              .sort((a, b) => a.seat - b.seat);
            const captainId = tables.find((t) => t.tableNumber === tableNumber)?.captainPlayerId;
            const left = seats.filter(
              (a) => players.find((p) => p.id === a.playerId)?.isActive,
            ).length;

            return (
              <div key={tableNumber} className="rounded-2xl border border-zinc-800 p-5">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-3xl font-semibold">Table {tableNumber}</span>
                  <span className="text-2xl text-zinc-500">{left} left</span>
                </div>
                <div className="space-y-1">
                  {seats.map((assignment) => {
                    const player = players.find((p) => p.id === assignment.playerId);
                    if (!player) return null;
                    return (
                      <div
                        key={`${assignment.table}-${assignment.seat}`}
                        className={cn(
                          "flex items-baseline gap-3 text-2xl",
                          !player.isActive && "text-zinc-600 line-through",
                        )}
                      >
                        <span className="text-zinc-600 font-mono w-8">{assignment.seat}</span>
                        <span className="truncate">{player.name}</span>
                        {player.id === captainId && <span className="text-amber-400">★</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xl text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="text-5xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
