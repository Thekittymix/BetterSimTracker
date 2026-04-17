import test from "node:test";
import assert from "node:assert/strict";

import { compareTrackerDataParity } from "../src/jsonExtractionProtocolParity";
import type { TrackerData } from "../src/types";

function makeTracker(): TrackerData {
  return {
    timestamp: 1,
    activeCharacters: ["Candy", "Lisa"],
    entityResolution: {
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          aliases: [],
          inScene: true,
          inMessage: true,
        },
        {
          entityId: "bst_narrative:lisa",
          kind: "narrative-entity",
          name: "Lisa",
          aliases: [],
          inScene: true,
          inMessage: false,
        },
      ],
    },
    statistics: {
      affection: { Candy: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Candy: "Playful" },
      lastThought: { Candy: "Still teasing him." },
    },
    customStatistics: {
      stress: { Candy: 44 },
    },
    customNonNumericStatistics: {
      clothes: { Candy: ["t-shirt", "panties"] },
    },
  };
}

test("compareTrackerDataParity returns ok for equivalent tracker outputs", () => {
  const expected = makeTracker();
  const actual = makeTracker();

  const report = compareTrackerDataParity(expected, actual);
  assert.equal(report.ok, true);
  assert.deepEqual(report.mismatches, []);
});

test("compareTrackerDataParity reports active scene mismatches", () => {
  const expected = makeTracker();
  const actual = makeTracker();
  actual.activeCharacters = ["Candy"];

  const report = compareTrackerDataParity(expected, actual);
  assert.equal(report.ok, false);
  assert.equal(report.mismatches[0]?.path, "activeCharacters");
});

test("compareTrackerDataParity reports custom non-numeric mismatches", () => {
  const expected = makeTracker();
  const actual = makeTracker();
  actual.customNonNumericStatistics = {
    clothes: { Candy: [] },
  };

  const report = compareTrackerDataParity(expected, actual);
  assert.equal(report.ok, false);
  assert.equal(report.mismatches[0]?.path, "customNonNumericStatistics");
});
