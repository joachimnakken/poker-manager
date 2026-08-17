/**
 * The wire vocabulary of `POST /api/t/[code]/proposal`. Client-safe, so the phone can
 * type its requests without pulling the Postgres driver into the bundle.
 */
export type ProposalOp =
  | {
      op: "create";
      playerId: string;
      fromTable: number;
      fromSeat: number;
      toTable: number;
      toSeat: number;
    }
  | { op: "confirm"; id: string }
  | { op: "decline"; id: string; reason: string }
  | { op: "force"; id: string }
  | { op: "cancel"; id: string };

/** The host may force a stalled proposal through, but not instantly. */
export const FORCE_AFTER_MS = 60_000;
