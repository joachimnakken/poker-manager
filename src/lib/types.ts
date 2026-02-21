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
}

export interface Tournament {
  config: TournamentConfig;
  players: Player[];
  timer: Timer;
  status: TournamentStatus;
  knockoutOrder: string[]; // player IDs in knockout order
  seatAssignments?: SeatAssignment[];
}
