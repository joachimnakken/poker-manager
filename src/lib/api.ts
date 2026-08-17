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

export interface CheckinResponse {
  playerId: string;
  playerToken: string;
}
