import test from "node:test";
import assert from "node:assert/strict";

import { resolveMoodSymbol, resolveMoodSymbolBoxStyleVars } from "../src/ui";

test("resolveMoodSymbol uses configured custom symbols before default emoji", () => {
  assert.equal(resolveMoodSymbol("Happy", { Happy: "(≧▽≦)" }), "(≧▽≦)");
  assert.equal(resolveMoodSymbol("Neutral", { Neutral: "(-_-)" }), "(-_-)");
});

test("resolveMoodSymbol falls back to default symbols for known moods and neutral for unknown mood text", () => {
  assert.equal(resolveMoodSymbol("Hopeful"), "🤞");
  assert.equal(resolveMoodSymbol("Something Else"), "😶");
});

test("resolveMoodSymbolBoxStyleVars maps display settings to css variables", () => {
  assert.deepEqual(resolveMoodSymbolBoxStyleVars({
    moodSymbolMinWidth: 46,
    moodSymbolMinHeight: 38,
    moodSymbolBoxRadius: 17,
    moodSymbolFontSize: 24,
  }), {
    "--bst-mood-symbol-min-width": "46px",
    "--bst-mood-symbol-min-height": "38px",
    "--bst-mood-symbol-radius": "17px",
    "--bst-mood-symbol-font-size": "24px",
  });
});
