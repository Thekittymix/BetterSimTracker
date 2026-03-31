import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { USER_TRACKER_KEY } from "../src/constants";
import { defaultSettings } from "../src/settings";
import { getResolvedMoodSource, isBuiltInTextStatVisibleForOwner, resolveMoodSymbol, resolveMoodSymbolBoxStyleVars } from "../src/ui";

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

test("getResolvedMoodSource ignores per-owner overrides for narrative entities", () => {
  const settings = {
    ...defaultSettings,
    moodSource: "bst_images" as const,
    characterDefaults: {
      "Forest Spirit": {
        moodSource: "st_expressions" as const,
      },
    },
  };

  assert.equal(
    getResolvedMoodSource(
      settings,
      "Forest Spirit",
      undefined,
      { id: "bst_narrative:forest-spirit", kind: "narrative-entity" },
    ),
    "bst_images",
  );
});

test("mood fallback css allows kaomoji and long symbols to wrap instead of clipping", () => {
  const source = fs.readFileSync(path.resolve("src/ui.ts"), "utf8");
  assert.match(source, /\.bst-mood-emoji \{[\s\S]*white-space: pre-wrap;[\s\S]*overflow-wrap: anywhere;[\s\S]*word-break: break-word;/);
  assert.match(source, /\.bst-mood-chip \{[\s\S]*max-width: 100%;/);
  assert.match(source, /\.bst-mood-bubble-text \{[\s\S]*white-space: pre-wrap;[\s\S]*overflow-wrap: anywhere;[\s\S]*word-break: break-word;/);
});

test("isBuiltInTextStatVisibleForOwner hides character mood when global char mood tracking is off", () => {
  assert.equal(isBuiltInTextStatVisibleForOwner({
    trackMood: false,
    trackLastThought: true,
    enableUserTracking: true,
    userTrackMood: true,
    userTrackLastThought: true,
  }, "Seraphina", "mood"), false);

  assert.equal(isBuiltInTextStatVisibleForOwner({
    trackMood: false,
    trackLastThought: true,
    enableUserTracking: true,
    userTrackMood: true,
    userTrackLastThought: true,
  }, USER_TRACKER_KEY, "mood"), true);
});

test("isBuiltInTextStatVisibleForOwner hides character last thought when global char thought tracking is off", () => {
  assert.equal(isBuiltInTextStatVisibleForOwner({
    trackMood: true,
    trackLastThought: false,
    enableUserTracking: true,
    userTrackMood: true,
    userTrackLastThought: true,
  }, "Seraphina", "lastThought"), false);

  assert.equal(isBuiltInTextStatVisibleForOwner({
    trackMood: true,
    trackLastThought: false,
    enableUserTracking: true,
    userTrackMood: true,
    userTrackLastThought: true,
  }, USER_TRACKER_KEY, "lastThought"), true);
});
