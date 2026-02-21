"use client";

import { useEffect, useRef } from "react";
import { useTournamentStore } from "./tournament-store";
import { playWarningSound, playLevelChangeSound } from "@/lib/sounds";

export function useTimer(tournamentId: string) {
  const tick = useTournamentStore((s) => s.tick);
  const tournament = useTournamentStore((s) => s.tournaments[tournamentId]);
  const prevLevelRef = useRef<number | null>(null);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!tournament?.timer.isRunning) return;

    const interval = setInterval(() => {
      tick(tournamentId);
    }, 1000);

    return () => clearInterval(interval);
  }, [tournament?.timer.isRunning, tournamentId, tick]);

  // Sound effects
  useEffect(() => {
    if (!tournament) return;

    const { secondsRemaining, currentLevelIndex } = tournament.timer;

    // Level change sound
    if (prevLevelRef.current !== null && prevLevelRef.current !== currentLevelIndex) {
      playLevelChangeSound();
      warnedRef.current = false;
    }
    prevLevelRef.current = currentLevelIndex;

    // Warning sound at 60 seconds
    if (secondsRemaining === 60 && !warnedRef.current) {
      playWarningSound();
      warnedRef.current = true;
    }

    // Reset warning flag when time is above 60
    if (secondsRemaining > 60) {
      warnedRef.current = false;
    }
  }, [tournament?.timer.secondsRemaining, tournament?.timer.currentLevelIndex]);

  // Update browser tab title
  useEffect(() => {
    if (!tournament || tournament.status === "setup" || tournament.status === "finished") {
      document.title = "Poker Tournament Manager";
      return;
    }

    const { secondsRemaining, currentLevelIndex } = tournament.timer;
    const level = tournament.config.blindStructure[currentLevelIndex];
    const mins = Math.floor(secondsRemaining / 60);
    const secs = secondsRemaining % 60;
    const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;

    if (level?.isBreak) {
      document.title = `BREAK ${timeStr} - Poker`;
    } else {
      document.title = `${level?.smallBlind}/${level?.bigBlind} ${timeStr} - Poker`;
    }
  }, [tournament?.timer.secondsRemaining, tournament?.timer.currentLevelIndex, tournament?.status]);
}
