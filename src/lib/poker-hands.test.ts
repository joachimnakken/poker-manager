import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  compareHands,
  evaluateBest,
  evaluateFive,
  parseCard,
  type Card,
} from "./poker-hands.ts";

const cards = (...notation: string[]): Card[] => notation.map(parseCard);
const five = (...notation: string[]) => evaluateFive(cards(...notation));
const best = (...notation: string[]) => evaluateBest(cards(...notation));

describe("parseCard", () => {
  test("reads standard notation case-insensitively", () => {
    assert.deepEqual(parseCard("As"), { rank: 14, suit: "s" });
    assert.deepEqual(parseCard("td"), { rank: 10, suit: "d" });
  });

  test("rejects garbage", () => {
    assert.throws(() => parseCard("1s"));
    assert.throws(() => parseCard("Axs"));
    assert.throws(() => parseCard("Kx"));
  });
});

describe("evaluateFive categories", () => {
  test("names every category", () => {
    assert.equal(five("As", "Ks", "Qs", "Js", "Ts").description, "a royal flush");
    assert.equal(five("9h", "8h", "7h", "6h", "5h").description, "a straight flush, nine high");
    assert.equal(five("Qc", "Qd", "Qh", "Qs", "7d").description, "four of a kind, queens");
    assert.equal(five("Kd", "Kh", "Ks", "9c", "9s").description, "a full house, kings full of nines");
    assert.equal(five("Ad", "Jd", "8d", "6d", "3d").description, "a flush, ace high");
    assert.equal(five("Tc", "9d", "8h", "7s", "6c").description, "a straight, ten high");
    assert.equal(five("7c", "7d", "7h", "Ks", "2d").description, "three of a kind, sevens");
    assert.equal(five("Kh", "Kc", "9d", "9s", "5h").description, "two pair, kings and nines");
    assert.equal(five("Jd", "Js", "Ac", "8h", "4d").description, "a pair of jacks");
    assert.equal(five("Ah", "Qd", "9s", "6c", "3h").description, "ace high");
  });

  test("the wheel is a five-high straight, not ace-high", () => {
    const wheel = five("Ah", "2d", "3s", "4c", "5h");
    assert.equal(wheel.description, "a straight, five high");
    const sixHigh = five("2h", "3d", "4s", "5c", "6h");
    assert.ok(compareHands(sixHigh, wheel) > 0);
  });

  test("A-K-Q-J with a low card is not a round-the-corner straight", () => {
    assert.equal(five("Ah", "Kd", "Qs", "Jc", "2h").category, 1);
  });
});

describe("tiebreaks", () => {
  test("kicker decides between equal pairs", () => {
    const aceKicker = five("Jd", "Js", "Ac", "8h", "4d");
    const kingKicker = five("Jh", "Jc", "Kc", "8s", "4c");
    assert.ok(compareHands(aceKicker, kingKicker) > 0);
  });

  test("two pair compares high pair, low pair, then kicker", () => {
    assert.ok(compareHands(five("Ah", "Ac", "2d", "2s", "3h"), five("Kh", "Kc", "Qd", "Qs", "Ah")) > 0);
    assert.ok(compareHands(five("Kh", "Kc", "9d", "9s", "Ah"), five("Kd", "Ks", "9h", "9c", "Qh")) > 0);
  });

  test("full house compares the trips before the pair", () => {
    assert.ok(compareHands(five("9d", "9h", "9s", "2c", "2s"), five("8d", "8h", "8s", "Ac", "As")) > 0);
  });

  test("identical ranks in different suits chop", () => {
    assert.equal(compareHands(five("Ah", "Kd", "9s", "6c", "3h"), five("As", "Kc", "9d", "6h", "3d")), 0);
  });

  test("a straight flush beats quads", () => {
    assert.ok(compareHands(five("5h", "4h", "3h", "2h", "Ah"), five("Ac", "Ad", "As", "Ah", "Kd")) > 0);
  });
});

describe("evaluateBest over seven cards", () => {
  test("finds the flush hiding behind a paired board", () => {
    const result = best("Ah", "Kh", "Qh", "Qd", "7h", "2h", "2c");
    assert.equal(result.description, "a flush, ace high");
  });

  test("the board can play: everyone chops on a board straight", () => {
    const board = ["Tc", "Jd", "Qh", "Ks", "Ac"];
    const one = best("2h", "3d", ...board);
    const other = best("7s", "8c", ...board);
    assert.equal(compareHands(one, other), 0);
    assert.equal(one.description, "a straight, ace high");
  });

  test("uses the better kicker from the hole", () => {
    const board = ["Ad", "Kc", "7h", "4s", "2d"];
    const goodKicker = best("Ah", "Qc", ...board);
    const weakKicker = best("As", "Jc", ...board);
    assert.ok(compareHands(goodKicker, weakKicker) > 0);
  });

  test("counterfeited two pair: the board's better pair replaces the weak one", () => {
    // Holding 3-3 on a board that ends K-K-Q-Q-J: threes no longer play.
    const result = best("3h", "3d", "Kc", "Ks", "Qh", "Qd", "Jc");
    assert.equal(result.description, "two pair, kings and queens");
    assert.deepEqual(result.tiebreak, [13, 12, 11]);
  });

  test("rejects wrong card counts", () => {
    assert.throws(() => evaluateBest(cards("Ah", "Kd")));
    assert.throws(() => evaluateFive(cards("Ah", "Kd", "Qs", "Jc")));
  });
});
