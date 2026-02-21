import { BlindLevel } from "./types";

// Chip set: 25 (Yellow), 100 (Blue), 500 (Green), 1000 (Red), 5000 (Black - addon only)
// Starting stack: 12x25 + 12x100 + 7x500 + 5x1000 = 10,000
export const CHIP_SET = [
  { value: 25, color: "Yellow", startingQty: 12, total: 300 },
  { value: 100, color: "Blue", startingQty: 12, total: 1200 },
  { value: 500, color: "Green", startingQty: 7, total: 3500 },
  { value: 1000, color: "Red", startingQty: 5, total: 5000 },
  { value: 5000, color: "Black", startingQty: 0, total: 0, addonOnly: true },
];

export const DEFAULT_BLIND_STRUCTURE: BlindLevel[] = [
  // Levels 1-4: 25-chip denomination in play (30 min)
  { level: 1, smallBlind: 25, bigBlind: 50, ante: 0, duration: 1800 },
  { level: 2, smallBlind: 50, bigBlind: 100, ante: 0, duration: 1800 },
  { level: 3, smallBlind: 75, bigBlind: 150, ante: 0, duration: 1800 },
  { level: 4, smallBlind: 100, bigBlind: 200, ante: 0, duration: 1800 },
  // Break: color up 25s, addon available
  { level: 5, smallBlind: 0, bigBlind: 0, ante: 0, duration: 600, isBreak: true },
  // Levels 6-9: min denomination 100 (30 min)
  { level: 6, smallBlind: 200, bigBlind: 400, ante: 0, duration: 1800 },
  { level: 7, smallBlind: 300, bigBlind: 600, ante: 0, duration: 1800 },
  { level: 8, smallBlind: 400, bigBlind: 800, ante: 0, duration: 1800 },
  { level: 9, smallBlind: 500, bigBlind: 1000, ante: 0, duration: 1800 },
  // Break: color up 100s
  { level: 10, smallBlind: 0, bigBlind: 0, ante: 0, duration: 600, isBreak: true },
  // Levels 11-14: min denomination 500, ante introduced (20 min)
  { level: 11, smallBlind: 1000, bigBlind: 2000, ante: 500, duration: 1200 },
  { level: 12, smallBlind: 1500, bigBlind: 3000, ante: 500, duration: 1200 },
  { level: 13, smallBlind: 2000, bigBlind: 4000, ante: 1000, duration: 1200 },
  { level: 14, smallBlind: 3000, bigBlind: 6000, ante: 1000, duration: 1200 },
  // Levels 15-18: min denomination 1000 (20 min)
  { level: 15, smallBlind: 4000, bigBlind: 8000, ante: 1000, duration: 1200 },
  { level: 16, smallBlind: 5000, bigBlind: 10000, ante: 2000, duration: 1200 },
  { level: 17, smallBlind: 8000, bigBlind: 16000, ante: 2000, duration: 1200 },
  { level: 18, smallBlind: 10000, bigBlind: 20000, ante: 5000, duration: 1200 },
];

export const DEFAULT_CONFIG = {
  buyIn: 200,
  rebuyAmount: 200,
  addonAmount: 200,
  startingChips: 10000,
  rebuyChips: 10000,
  addonChips: 10000,
  lastRebuyLevel: 4,
  currency: "kr",
};

export const PAYOUT_STRUCTURES: Record<string, number[]> = {
  "2": [100],
  "3-4": [65, 35],
  "5-6": [60, 30, 10],
  "7-10": [50, 30, 20],
  "11-15": [45, 27, 18, 10],
};
