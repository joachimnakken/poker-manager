import type { TournamentConfig } from "./types";

/**
 * The wire vocabulary of `POST /api/t/[code]/action`. Lives outside `lib/server` so the
 * client can type its requests without pulling the Postgres driver into the bundle.
 */
export type Action =
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "finish" }
  | { type: "reset" }
  | { type: "next-level" }
  | { type: "prev-level" }
  | { type: "reset-level" }
  | { type: "advance-level"; fromIndex: number }
  | { type: "add-player"; firstName: string; lastName: string }
  | { type: "remove-player"; playerId: string }
  | { type: "knockout"; playerId: string; byPlayerId?: string }
  | { type: "undo-knockout" }
  | { type: "rebuy"; playerId: string }
  | { type: "addon"; playerId: string }
  | { type: "draw-seats" }
  | { type: "clear-seats" }
  | { type: "move-player"; playerId: string; toTable: number; toSeat: number }
  | { type: "update-config"; config: Partial<TournamentConfig>; seatsPerTable?: number }
  | { type: "assign-captain"; tableNumber: number; playerId: string | null }
  /** Which player the host is sitting as. Their token then carries owner authority. */
  | { type: "set-host-player"; playerId: string | null }
  /** Shout it to the room: this player is all in. */
  | { type: "announce-all-in"; playerId: string };
