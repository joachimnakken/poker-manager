import type { Tournament } from "./types";

export interface StateResponse {
  tournament: Tournament;
  /** ISO timestamp from the server, so each client can measure its own clock skew. */
  serverNow: string;
}

export interface ListResponse {
  tournaments: Tournament[];
  serverNow: string;
}

export interface CreateResponse {
  code: string;
  ownerToken: string;
}

/**
 * A profile's record across every finished tournament. Winnings are replayed from
 * each tournament's config and pot at read time — never stored, so an undo or a
 * late correction to an old game is reflected automatically.
 */
export interface ProfileStats {
  profileId: string;
  firstName: string;
  lastName: string;
  /** Finished tournaments this profile played. */
  nights: number;
  wins: number;
  /** Knockouts dealt, across finished tournaments. */
  knockouts: number;
  bestFinish: number | null;
  winnings: number;
  /** Currency of the most recent finished tournament played, for display. */
  currency: string | null;
}

export interface StatsResponse {
  leaderboard: ProfileStats[];
  serverNow: string;
}

export interface CheckinRequest {
  firstName: string;
  lastName: string;
  /** When present and known, check-in reattaches to this profile instead of matching by name. */
  profileToken?: string;
}

export interface CheckinResponse {
  playerId: string;
  playerToken: string;
  profileToken: string;
  firstName: string;
  lastName: string;
  stats: ProfileStats;
}
