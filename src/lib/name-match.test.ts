import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { didYouMean, editDistance, typoBudget } from "./name-match.ts";

describe("editDistance", () => {
  test("identical strings are zero apart", () => {
    assert.equal(editDistance("joachim", "joachim"), 0);
  });

  test("counts substitutions, insertions and deletions", () => {
    assert.equal(editDistance("anna", "anne"), 1);
    assert.equal(editDistance("joachm", "joachim"), 1);
    assert.equal(editDistance("jo", "joachim"), 5);
  });
});

describe("didYouMean", () => {
  const profiles = ["Joachim Nakken", "Anna Berg", "Anne Berg", "Martin Solheim"];

  test("a one-letter typo finds the profile", () => {
    assert.equal(didYouMean("Joachm Nakken", profiles), 0);
  });

  test("an exact match asks nothing — the server attaches it anyway", () => {
    assert.equal(didYouMean("joachim nakken", profiles), null);
    assert.equal(didYouMean("  Joachim   Nakken ", profiles), null);
  });

  test("two equally close candidates refuse to guess", () => {
    // "Ann Berg" is one edit from both Anna and Anne.
    assert.equal(didYouMean("Ann Berg", profiles), null);
  });

  test("a genuinely new name matches nothing", () => {
    assert.equal(didYouMean("Petter Berg", profiles), null);
  });

  test("long names get a two-typo budget, short ones only one", () => {
    assert.equal(typoBudget("Joachim Nakken".length), 2);
    assert.equal(typoBudget("Ann Li".length), 1);
    assert.equal(didYouMean("Martin Solhiem", profiles), 3); // transposed = 2 edits
  });
});
