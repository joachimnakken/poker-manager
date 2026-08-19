"use client";

import { create } from "zustand";
import type { Tournament, TournamentConfig } from "@/lib/types";
import type { CheckinRequest, CheckinResponse, ListResponse, StateResponse } from "@/lib/api";
import { levelsOverrun, readClock, serverOffset } from "@/lib/clock";
import { setIdentity, setLastJoined, setProfile, tokenFor } from "@/lib/identity";
import type { Action } from "@/lib/actions";
import type { Move } from "@/lib/balancing";
import type { ProposalOp } from "@/lib/proposal-ops";

/**
 * The read API is deliberately unchanged from the localStorage era: components still
 * call `useTournamentStore(s => s.tournaments[id])` and get a whole `Tournament`.
 * Only the internals moved — `persist` became server-sync, and actions became async.
 * The store is keyed by tournament code, which is also `config.id`.
 */
interface TournamentState {
  tournaments: Record<string, Tournament>;
  /** `serverNow - Date.now()` at the last response. Phone clocks drift; this cancels it. */
  offsetMs: number;
  loaded: boolean;
  error: string | null;

  loadAll: () => Promise<void>;
  loadOne: (code: string) => Promise<void>;

  createTournament: (name: string, date: string) => Promise<string>;
  deleteTournament: (id: string) => Promise<void>;
  updateConfig: (
    id: string,
    config: Partial<TournamentConfig>,
    seatsPerTable?: number,
  ) => Promise<void>;

  addPlayer: (tournamentId: string, firstName: string, lastName: string) => Promise<void>;
  removePlayer: (tournamentId: string, playerId: string) => Promise<void>;

  startTournament: (id: string) => Promise<void>;
  pauseTournament: (id: string) => Promise<void>;
  resumeTournament: (id: string) => Promise<void>;
  finishTournament: (id: string) => Promise<void>;
  resetTournament: (id: string) => Promise<void>;

  /** Recomputes the countdown from the anchor. Not a decrement — nothing is stored ticking. */
  tick: (id: string) => void;
  nextLevel: (id: string) => Promise<void>;
  prevLevel: (id: string) => Promise<void>;
  resetLevelTimer: (id: string) => Promise<void>;

  knockoutPlayer: (
    tournamentId: string,
    playerId: string,
    knockedOutByPlayerId?: string,
  ) => Promise<void>;
  undoKnockout: (tournamentId: string) => Promise<void>;
  registerRebuy: (tournamentId: string, playerId: string) => Promise<void>;
  registerAddon: (tournamentId: string, playerId: string) => Promise<void>;

  duplicateTournament: (sourceId: string) => Promise<string | null>;

  drawSeats: (tournamentId: string) => Promise<void>;
  clearSeats: (tournamentId: string) => Promise<void>;

  assignCaptain: (
    tournamentId: string,
    tableNumber: number,
    playerId: string | null,
  ) => Promise<void>;
  setHostPlayer: (tournamentId: string, playerId: string | null) => Promise<void>;
  announceAllIn: (tournamentId: string, playerId: string) => Promise<void>;

  movePlayer: (
    tournamentId: string,
    playerId: string,
    toTable: number,
    toSeat: number,
  ) => Promise<void>;
  proposeMove: (tournamentId: string, move: Move) => Promise<void>;
  confirmProposal: (tournamentId: string, id: string) => Promise<void>;
  declineProposal: (tournamentId: string, id: string, reason: string) => Promise<void>;
  forceProposal: (tournamentId: string, id: string) => Promise<void>;
  cancelProposal: (tournamentId: string, id: string) => Promise<void>;

  checkIn: (code: string, request: CheckinRequest) => Promise<CheckinResponse | null>;
}

/** Applies the client's clock offset so `timer` reflects the anchor, not local time. */
function withDerivedTimer(tournament: Tournament, offsetMs: number): Tournament {
  const reading = readClock(tournament.anchor, tournament.config.blindStructure, offsetMs);
  if (
    tournament.timer.secondsRemaining === reading.secondsRemaining &&
    tournament.timer.isRunning === reading.isRunning &&
    tournament.timer.currentLevelIndex === tournament.anchor.currentLevelIndex
  ) {
    return tournament;
  }
  return {
    ...tournament,
    timer: {
      currentLevelIndex: tournament.anchor.currentLevelIndex,
      secondsRemaining: reading.secondsRemaining,
      isRunning: reading.isRunning,
    },
  };
}

async function request<T>(url: string, init?: RequestInit & { code?: string }): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  const token = init?.code ? tokenFor(init.code) : undefined;
  if (token) {
    headers.set("x-poker-token", token);
  }

  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${response.status})`);
  }
  return body as T;
}

export const useTournamentStore = create<TournamentState>()((set, get) => {
  /** Merges a state response, keeping object identity when nothing actually changed. */
  function absorb(data: StateResponse | ListResponse): void {
    const offsetMs = serverOffset(data.serverNow);
    const incoming = "tournaments" in data ? data.tournaments : [data.tournament];

    set((state) => {
      const tournaments = { ...state.tournaments };
      for (const tournament of incoming) {
        const previous = tournaments[tournament.code];
        const next = withDerivedTimer(tournament, offsetMs);
        // Polling every 2s would otherwise re-render every subscriber on each pass.
        tournaments[tournament.code] =
          previous && JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
      }
      return { tournaments, offsetMs, loaded: true, error: null };
    });
  }

  async function act(code: string, action: Action): Promise<void> {
    try {
      absorb(
        await request<StateResponse>(`/api/t/${code}/action`, {
          method: "POST",
          body: JSON.stringify(action),
          code,
        }),
      );
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Something went wrong" });
    }
  }

  async function propose(code: string, operation: ProposalOp): Promise<void> {
    try {
      absorb(
        await request<StateResponse>(`/api/t/${code}/proposal`, {
          method: "POST",
          body: JSON.stringify(operation),
          code,
        }),
      );
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Something went wrong" });
    }
  }

  // One in-flight advance per tournament: the DB guard makes a duplicate a no-op, but
  // there is no reason to send it.
  const advancing = new Set<string>();

  return {
    tournaments: {},
    offsetMs: 0,
    loaded: false,
    error: null,

    loadAll: async () => {
      try {
        absorb(await request<ListResponse>("/api/tournaments"));
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Could not load tournaments" });
      }
    },

    loadOne: async (code) => {
      try {
        absorb(await request<StateResponse>(`/api/t/${code}/state`));
      } catch (error) {
        set((state) => ({
          loaded: true,
          error: error instanceof Error ? error.message : "Could not load tournament",
          tournaments: state.tournaments,
        }));
      }
    },

    createTournament: async (name, date) => {
      const created = await request<{ code: string; ownerToken: string }>("/api/tournaments", {
        method: "POST",
        body: JSON.stringify({ name, date }),
      });
      setIdentity(created.code, { ownerToken: created.ownerToken });
      await get().loadOne(created.code);
      return created.code;
    },

    deleteTournament: async (id) => {
      try {
        await request(`/api/t/${id}`, { method: "DELETE", code: id });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Could not delete" });
        return;
      }
      set((state) => {
        const { [id]: _removed, ...rest } = state.tournaments;
        return { tournaments: rest };
      });
    },

    updateConfig: (id, config, seatsPerTable) =>
      act(id, { type: "update-config", config, seatsPerTable }),

    addPlayer: (tournamentId, firstName, lastName) =>
      act(tournamentId, { type: "add-player", firstName, lastName }),
    removePlayer: (tournamentId, playerId) =>
      act(tournamentId, { type: "remove-player", playerId }),

    startTournament: (id) => act(id, { type: "start" }),
    pauseTournament: (id) => act(id, { type: "pause" }),
    resumeTournament: (id) => act(id, { type: "resume" }),
    finishTournament: (id) => act(id, { type: "finish" }),
    resetTournament: (id) => act(id, { type: "reset" }),

    tick: (id) => {
      const { tournaments, offsetMs } = get();
      const tournament = tournaments[id];
      if (!tournament) {
        return;
      }

      const overrun = levelsOverrun(tournament.anchor, tournament.config.blindStructure, offsetMs);
      if (overrun > 0 && !advancing.has(id)) {
        advancing.add(id);
        act(id, { type: "advance-level", fromIndex: tournament.anchor.currentLevelIndex }).finally(
          () => advancing.delete(id),
        );
      }

      const next = withDerivedTimer(tournament, offsetMs);
      if (next !== tournament) {
        set((state) => ({ tournaments: { ...state.tournaments, [id]: next } }));
      }
    },

    nextLevel: (id) => act(id, { type: "next-level" }),
    prevLevel: (id) => act(id, { type: "prev-level" }),
    resetLevelTimer: (id) => act(id, { type: "reset-level" }),

    knockoutPlayer: (tournamentId, playerId, knockedOutByPlayerId) =>
      act(tournamentId, { type: "knockout", playerId, byPlayerId: knockedOutByPlayerId }),
    undoKnockout: (tournamentId) => act(tournamentId, { type: "undo-knockout" }),
    registerRebuy: (tournamentId, playerId) => act(tournamentId, { type: "rebuy", playerId }),
    registerAddon: (tournamentId, playerId) => act(tournamentId, { type: "addon", playerId }),

    duplicateTournament: async (sourceId) => {
      const source = get().tournaments[sourceId];
      if (!source) {
        return null;
      }
      const today = new Date().toISOString().split("T")[0];
      const code = await get().createTournament(source.config.name, today);
      await get().updateConfig(code, source.config, source.seatsPerTable);
      for (const player of source.players) {
        // Names are stored as "First Last"; the first word is the first name, the
        // rest the last — matching how check-in composed them.
        const [firstName, ...rest] = player.name.split(" ");
        await get().addPlayer(code, firstName, rest.join(" ") || firstName);
      }
      return code;
    },

    drawSeats: (tournamentId) => act(tournamentId, { type: "draw-seats" }),
    clearSeats: (tournamentId) => act(tournamentId, { type: "clear-seats" }),

    assignCaptain: (tournamentId, tableNumber, playerId) =>
      act(tournamentId, { type: "assign-captain", tableNumber, playerId }),
    setHostPlayer: (tournamentId, playerId) => act(tournamentId, { type: "set-host-player", playerId }),
    announceAllIn: (tournamentId, playerId) =>
      act(tournamentId, { type: "announce-all-in", playerId }),

    movePlayer: (tournamentId, playerId, toTable, toSeat) =>
      act(tournamentId, { type: "move-player", playerId, toTable, toSeat }),

    proposeMove: (tournamentId, move) =>
      propose(tournamentId, {
        op: "create",
        playerId: move.playerId,
        fromTable: move.fromTable,
        fromSeat: move.fromSeat,
        toTable: move.toTable,
        toSeat: move.toSeat,
      }),
    confirmProposal: (tournamentId, id) => propose(tournamentId, { op: "confirm", id }),
    declineProposal: (tournamentId, id, reason) =>
      propose(tournamentId, { op: "decline", id, reason }),
    forceProposal: (tournamentId, id) => propose(tournamentId, { op: "force", id }),
    cancelProposal: (tournamentId, id) => propose(tournamentId, { op: "cancel", id }),

    checkIn: async (code, checkinRequest) => {
      try {
        const result = await request<CheckinResponse & StateResponse>(`/api/t/${code}/checkin`, {
          method: "POST",
          body: JSON.stringify(checkinRequest),
        });
        setIdentity(code, { playerToken: result.playerToken, playerId: result.playerId });
        // The installed app opens straight back into this tournament.
        setLastJoined(code);
        // The profile outlives the tournament: next poker night starts at "Join as X".
        setProfile({
          profileToken: result.profileToken,
          firstName: result.firstName,
          lastName: result.lastName,
        });
        absorb(result);
        return result;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Could not check in" });
        return null;
      }
    },
  };
});
