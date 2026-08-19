import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assignCards, isReserved } from "./name-cards.ts";

const others = ["Anna Berg", "Erik Dahl", "Petter Olsen", "Hanne Lie", "Ida Moen"];

describe("assignCards", () => {
  test("the two of us always get aces, whatever the company", () => {
    const cards = assignCards(["Anna Berg", "Joachim Nakken", "Martin Jakobsen"]);
    assert.equal(cards.get("Joachim Nakken"), "As");
    assert.equal(cards.get("Martin Jakobsen"), "Ah");
  });

  test("matching ignores case and extra whitespace", () => {
    const cards = assignCards(["  joachim   NAKKEN "]);
    assert.equal(cards.get("  joachim   NAKKEN "), "As");
    assert.ok(isReserved("Martin  JAKOBSEN"));
    assert.ok(!isReserved("Martin Solheim"));
  });

  test("nobody else can be dealt an ace, even at 40 players", () => {
    const crowd = Array.from({ length: 40 }, (_, i) => `Player ${i} Test`);
    for (const card of assignCards(crowd).values()) {
      assert.notEqual(card[0], "A", `${card} was dealt to a non-reserved player`);
    }
  });

  test("no two players share a card", () => {
    const names = [...others, "Joachim Nakken", "Martin Jakobsen"];
    const cards = [...assignCards(names).values()];
    assert.equal(new Set(cards).size, cards.length);
    assert.equal(cards.length, names.length);
  });

  test("the same field always deals the same cards", () => {
    const a = assignCards(others);
    const b = assignCards(others);
    for (const name of others) {
      assert.equal(a.get(name), b.get(name));
    }
  });

  test("a late arrival does not disturb anyone already dealt in", () => {
    const before = assignCards(others);
    const after = assignCards([...others, "Late Guest"]);
    for (const name of others) {
      assert.equal(after.get(name), before.get(name), `${name}'s card moved`);
    }
    assert.ok(after.get("Late Guest"));
  });

  test("every card is valid notation", () => {
    for (const card of assignCards([...others, "Joachim Nakken"]).values()) {
      assert.match(card, /^[2-9TJQKA][shdc]$/);
    }
  });
});
