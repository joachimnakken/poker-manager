import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeCode, parseJoinTarget } from "./join-code.ts";

describe("parseJoinTarget", () => {
  test("reads the code out of a projector join URL", () => {
    assert.equal(parseJoinTarget("https://poker-manager-five.vercel.app/t/2NLCK"), "2NLCK");
  });

  test("survives a trailing slash, query or fragment", () => {
    assert.equal(parseJoinTarget("https://example.com/t/2NLCK/"), "2NLCK");
    assert.equal(parseJoinTarget("https://example.com/t/2NLCK?utm=qr"), "2NLCK");
    assert.equal(parseJoinTarget("https://example.com/t/2NLCK#top"), "2NLCK");
  });

  test("accepts a preview deployment host", () => {
    assert.equal(parseJoinTarget("https://poker-git-branch-x.vercel.app/t/EX6AL"), "EX6AL");
  });

  test("accepts a bare code typed off the projector, in any case", () => {
    assert.equal(parseJoinTarget("ex6al"), "EX6AL");
    assert.equal(parseJoinTarget("  EX6AL  "), "EX6AL");
  });

  test("rejects anything that is not one of ours", () => {
    assert.equal(parseJoinTarget("https://example.com/"), null);
    assert.equal(parseJoinTarget("hello world"), null);
    assert.equal(parseJoinTarget("https://example.com/display/2NLCK"), null);
    assert.equal(parseJoinTarget(""), null);
  });

  test("rejects codes using the letters the alphabet leaves out", () => {
    // I, O, 0 and 1 are excluded so nobody mistypes them for each other.
    assert.equal(normalizeCode("2NLCI"), null);
    assert.equal(normalizeCode("2NLC0"), null);
    assert.equal(normalizeCode("2NLCK"), "2NLCK");
  });

  test("rejects the wrong length", () => {
    assert.equal(normalizeCode("2NLC"), null);
    assert.equal(normalizeCode("2NLCKK"), null);
  });
});
