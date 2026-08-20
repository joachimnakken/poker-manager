export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  duration: number; // seconds
  isBreak?: boolean;
}

export interface TournamentConfig {
  id: string;
  name: string;
  date: string;
  buyIn: number;
  rebuyAmount: number;
  addonAmount: number;
  startingChips: number;
  rebuyChips: number;
  addonChips: number;
  lastRebuyLevel: number;
  blindStructure: BlindLevel[];
  payoutPercentages: number[];
  currency: string;
}

export interface Player {
  id: string;
  name: string;
  /** The person behind this seat, for the avatar endpoint and career stats. */
  profileId?: string;
  rebuys: number;
  hasAddon: boolean;
  isActive: boolean;
  finishPosition?: number;
  /** Last counted stack, if a captain has counted it. */
  chipCount?: number;
  /** When it was counted — a count from two breaks ago is not the truth any more. */
  chipsUpdatedAt?: string;
  knockedOutInLevel?: number;
  knockedOutBy?: string;
}

export interface Timer {
  currentLevelIndex: number;
  secondsRemaining: number;
  isRunning: boolean;
}

export type TournamentStatus = "setup" | "running" | "paused" | "break" | "finished";

export interface SeatAssignment {
  playerId: string;
  seat: number;
  table: number;
}

export interface TableInfo {
  tableNumber: number;
  captainPlayerId?: string;
}

export type ProposalStatus = "pending" | "applied" | "declined" | "cancelled";

export interface Proposal {
  id: string;
  playerId: string;
  fromTable: number;
  fromSeat: number;
  toTable: number;
  toSeat: number;
  proposedAt: string;
  fromConfirmedAt?: string;
  toConfirmedAt?: string;
  status: ProposalStatus;
  declineReason?: string;
}

/**
 * A shout for the room: someone is all in, someone just went out. Ephemeral by design —
 * only the last few seconds are sent, and each client flashes an id once.
 */
export interface Announcement {
  /** Stable and unique across both sources, e.g. "a:12" or "k:34". */
  id: string;
  kind: "all-in" | "eliminated";
  playerId: string;
  playerName: string;
  /** ISO timestamp, for ordering and for judging freshness. */
  at: string;
  /** Finishing place, on eliminations. */
  finishPosition?: number;
}

/** The clock anchor as stored on the server. `secondsRemaining` is never persisted. */
export interface ClockAnchor {
  currentLevelIndex: number;
  /** ISO timestamp of when the current level began. Null before the tournament starts. */
  levelStartedAt: string | null;
  /** ISO timestamp of when the current pause began, null if running. */
  pausedAt: string | null;
  /** Paused milliseconds accumulated on the current level. */
  pausedMs: number;
}

export interface Tournament {
  config: TournamentConfig;
  players: Player[];
  /** Derived from `anchor` on every client — never the source of truth. */
  timer: Timer;
  status: TournamentStatus;
  knockoutOrder: string[]; // player IDs in knockout order
  seatAssignments?: SeatAssignment[];
  code: string;
  anchor: ClockAnchor;
  seatsPerTable: number;
  /** The player the host is sitting as, if they have marked themselves. */
  hostPlayerId?: string;
  tables: TableInfo[];
  proposals: Proposal[];
  /** The last few seconds' worth only; clients flash what they have not seen. */
  announcements: Announcement[];
}
