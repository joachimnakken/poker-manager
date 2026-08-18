import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { judgeShowdown } from "./showdown.ts";
import { parseCard } from "./poker-hands.ts";

const cards = (...notation: string[]) => notation.map(parseCard);

describe("judgeShowdown", () => {
  const board = cards("Kc", "9d", "4h", "9s", "2c");

  test("names the winner and why, citing the beaten hand", () => {
    const verdict = judgeShowdown(
      [
        { label: "Seat 1", cards: cards("Kh", "Qd") },
        { label: "Seat 2", cards: cards("Ad", "9h") },
      ],
      board,
    );
    assert.equal(
      verdict.explanation,
      "Seat 2 wins with three of a kind, nines — beating two pair, kings and nines (Seat 1).",
    );
    assert.deepEqual(
      verdict.seats.map((seat) => seat.wins),
      [false, true],
    );
  });

  test("a chop is a split pot", () => {
    const straightBoard = cards("Tc", "Jd", "Qh", "Ks", "Ac");
    const verdict = judgeShowdown(
      [
        { label: "Seat 1", cards: cards("2h", "3d") },
        { label: "Seat 2", cards: cards("7s", "8c") },
      ],
      straightBoard,
    );
    assert.equal(verdict.explanation, "Split pot — everyone plays a straight, ace high.");
    assert.ok(verdict.seats.every((seat) => seat.wins));
  });

  test("a partial chop names only the splitters", () => {
    const verdict = judgeShowdown(
      [
        { label: "Seat 1", cards: cards("Ah", "Kd") },
        { label: "Seat 2", cards: cards("As", "Kh") },
        { label: "Seat 3", cards: cards("3h", "5d") },
      ],
      board,
    );
    assert.match(verdict.explanation, /^Split pot between Seat 1 and Seat 2 — both have two pair, kings and nines\./);
    assert.deepEqual(
      verdict.seats.map((seat) => seat.wins),
      [true, true, false],
    );
  });
});
