import type { SeatAssignment } from "./types";

export interface Move {
  playerId: string;
  fromTable: number;
  fromSeat: number;
  toTable: number;
  toSeat: number;
}

export interface BalanceSuggestion {
  /** `break` empties a table outright; `move` evens two tables out by one player. */
  kind: "break" | "move";
  tableNumber: number;
  moves: Move[];
  reason: string;
}

export interface TableOccupancy {
  tableNumber: number;
  /** Seats held by players still in the tournament. */
  occupied: SeatAssignment[];
  freeSeats: number[];
}

/**
 * Busted players keep their seat row — it is a record of where they sat — but their
 * seat is free for balancing purposes, so occupancy is computed from active players.
 */
export function tableOccupancy(
  seats: SeatAssignment[],
  activePlayerIds: Set<string>,
  seatsPerTable: number,
): TableOccupancy[] {
  const tableNumbers = [...new Set(seats.map((seat) => seat.table))].sort((a, b) => a - b);

  return tableNumbers.map((tableNumber) => {
    const occupied = seats
      .filter((seat) => seat.table === tableNumber && activePlayerIds.has(seat.playerId))
      .sort((a, b) => a.seat - b.seat);
    const taken = new Set(occupied.map((seat) => seat.seat));
    const freeSeats: number[] = [];
    for (let seat = 1; seat <= seatsPerTable; seat++) {
      if (!taken.has(seat)) {
        freeSeats.push(seat);
      }
    }
    return { tableNumber, occupied, freeSeats };
  });
}

/**
 * Advisory only — a human always confirms. Breaking a table is preferred over evening
 * two out, because it is the move that actually reduces the table count.
 *
 * Player choice is deterministic (highest seat number at the fullest table) so the
 * suggestion does not reshuffle under the 2s poll while someone is reading it.
 */
export function suggestBalance(
  seats: SeatAssignment[],
  activePlayerIds: Set<string>,
  seatsPerTable: number,
): BalanceSuggestion | null {
  const tables = tableOccupancy(seats, activePlayerIds, seatsPerTable).filter(
    (table) => table.occupied.length > 0,
  );

  if (tables.length < 2) {
    return null;
  }

  const smallest = [...tables].sort((a, b) => a.occupied.length - b.occupied.length)[0];
  const others = tables.filter((table) => table.tableNumber !== smallest.tableNumber);
  const freeElsewhere = others.reduce((sum, table) => sum + table.freeSeats.length, 0);

  if (smallest.occupied.length <= freeElsewhere) {
    const pool = others.flatMap((table) =>
      table.freeSeats.map((seat) => ({ toTable: table.tableNumber, toSeat: seat })),
    );
    const moves = smallest.occupied.map((seat, index) => ({
      playerId: seat.playerId,
      fromTable: seat.table,
      fromSeat: seat.seat,
      toTable: pool[index].toTable,
      toSeat: pool[index].toSeat,
    }));
    return {
      kind: "break",
      tableNumber: smallest.tableNumber,
      moves,
      reason: `Table ${smallest.tableNumber} has ${smallest.occupied.length} left and there ${
        freeElsewhere === 1 ? "is 1 free seat" : `are ${freeElsewhere} free seats`
      } elsewhere — break it.`,
    };
  }

  const counts = tables.map((table) => table.occupied.length);
  const spread = Math.max(...counts) - Math.min(...counts);
  if (spread < 2) {
    return null;
  }

  const fullest = [...tables].sort(
    (a, b) => b.occupied.length - a.occupied.length || a.tableNumber - b.tableNumber,
  )[0];
  const target = smallest;
  const toSeat = target.freeSeats[0];
  if (toSeat === undefined) {
    return null;
  }

  const moving = fullest.occupied[fullest.occupied.length - 1];
  return {
    kind: "move",
    tableNumber: fullest.tableNumber,
    moves: [
      {
        playerId: moving.playerId,
        fromTable: moving.table,
        fromSeat: moving.seat,
        toTable: target.tableNumber,
        toSeat,
      },
    ],
    reason: `Table ${fullest.tableNumber} has ${fullest.occupied.length}, table ${target.tableNumber} has ${target.occupied.length} — move one across.`,
  };
}
