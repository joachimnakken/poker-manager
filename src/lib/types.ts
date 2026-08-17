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
  rebuys: number;
  hasAddon: boolean;
  isActive: boolean;
  finishPosition?: number;
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
  tables: TableInfo[];
  proposals: Proposal[];
}
