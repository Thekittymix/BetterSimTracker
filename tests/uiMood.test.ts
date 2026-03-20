import test from "node:test";
import assert from "node:assert/strict";

import { resolveMoodSymbol } from "../src/ui";

test("resolveMoodSymbol uses configured custom symbols before default emoji", () => {
  assert.equal(resolveMoodSymbol("Happy", { Happy: "(≧▽≦)" }), "(≧▽≦)");
  assert.equal(resolveMoodSymbol("Neutral", { Neutral: "(-_-)" }), "(-_-)");
});

test("resolveMoodSymbol falls back to default symbols for known moods and neutral for unknown mood text", () => {
  assert.equal(resolveMoodSymbol("Hopeful"), "🤞");
  assert.equal(resolveMoodSymbol("Something Else"), "😶");
});
