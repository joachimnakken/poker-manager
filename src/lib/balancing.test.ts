import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestBalance, tableOccupancy } from "./balancing.ts";
import type { SeatAssignment } from "./types.ts";

/** `seat("A", 1, 3)` = player A at table 1, seat 3. */
function seat(playerId: string, table: number, seatNumber: number): SeatAssignment {
  return { playerId, table, seat: seatNumber };
}

/** Seats n players across the given tables, filling each in order. */
function layout(spec: Record<number, string[]>): SeatAssignment[] {
  return Object.entries(spec).flatMap(([table, players]) =>
    players.map((playerId, index) => seat(playerId, Number(table), index + 1)),
  );
}

const allActive = (seats: SeatAssignment[]) => new Set(seats.map((s) => s.playerId));

describe("tableOccupancy", () => {
  it("frees the seats of busted players", () => {
    const seats = layout({ 1: ["a", "b", "c"] });
    const occupancy = tableOccupancy(seats, new Set(["a", "c"]), 9);

    assert.equal(occupancy[0].occupied.length, 2);
    assert.deepEqual(occupancy[0].freeSeats, [2, 4, 5, 6, 7, 8, 9]);
  });

  it("reports every seat free at an empty table", () => {
    const occupancy = tableOccupancy(layout({ 1: ["a"] }), new Set(), 3);
    assert.deepEqual(occupancy[0].freeSeats, [1, 2, 3]);
  });
});

describe("suggestBalance", () => {
  it("says nothing with a single table", () => {
    const seats = layout({ 1: ["a", "b", "c"] });
    assert.equal(suggestBalance(seats, allActive(seats), 9), null);
  });

  it("says nothing while the spread is under two", () => {
    const seats = layout({ 1: ["a", "b", "c", "d", "e"], 2: ["f", "g", "h", "i"] });
    assert.equal(suggestBalance(seats, allActive(seats), 5), null);
  });

  it("proposes a named player into a named free seat once the spread hits two", () => {
    const seats = layout({ 1: ["a", "b", "c", "d", "e"], 2: ["f", "g", "h"] });
    const suggestion = suggestBalance(seats, allActive(seats), 5);

    assert.ok(suggestion);
    assert.equal(suggestion.kind, "move");
    assert.equal(suggestion.moves.length, 1);
    assert.deepEqual(suggestion.moves[0], {
      playerId: "e",
      fromTable: 1,
      fromSeat: 5,
      toTable: 2,
      toSeat: 4,
    });
  });

  it("is stable across repeated calls, so the poll does not reshuffle it", () => {
    const seats = layout({ 1: ["a", "b", "c", "d", "e"], 2: ["f", "g", "h"] });
    const first = suggestBalance(seats, allActive(seats), 5);
    const second = suggestBalance(seats, allActive(seats), 5);
    assert.deepEqual(first, second);
  });

  it("prefers breaking a table when its players fit in the free seats elsewhere", () => {
    const seats = layout({ 1: ["a", "b", "c", "d", "e", "f"], 2: ["g", "h"] });
    const suggestion = suggestBalance(seats, allActive(seats), 9);

    assert.ok(suggestion);
    assert.equal(suggestion.kind, "break");
    assert.equal(suggestion.tableNumber, 2);
    assert.equal(suggestion.moves.length, 2);
    assert.deepEqual(
      suggestion.moves.map((move) => move.playerId),
      ["g", "h"],
    );
    // Both land on table 1, in distinct free seats.
    assert.deepEqual(new Set(suggestion.moves.map((move) => move.toTable)), new Set([1]));
    assert.equal(new Set(suggestion.moves.map((move) => move.toSeat)).size, 2);
  });

  it("balances rather than breaks when the short table will not fit", () => {
    const seats = layout({ 1: ["a", "b", "c", "d", "e"], 2: ["f", "g", "h"] });
    const suggestion = suggestBalance(seats, allActive(seats), 5);
    assert.equal(suggestion?.kind, "move");
  });

  it("counts only active players, so busts trigger the proposal", () => {
    const seats = layout({ 1: ["a", "b", "c", "d", "e"], 2: ["f", "g", "h", "i", "j"] });
    // Even at 5/5 there is nothing to do.
    assert.equal(suggestBalance(seats, allActive(seats), 5), null);

    // Two busts at table 2 leave 5 against 3.
    const active = new Set(["a", "b", "c", "d", "e", "f", "g", "h"]);
    const suggestion = suggestBalance(seats, active, 5);
    assert.equal(suggestion?.kind, "move");
    assert.equal(suggestion?.moves[0].toTable, 2);
  });

  it("ignores tables that have emptied out", () => {
    const seats = layout({ 1: ["a", "b", "c"], 2: ["d", "e"] });
    const suggestion = suggestBalance(seats, new Set(["a", "b", "c"]), 9);
    assert.equal(suggestion, null);
  });
});
