import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGreetingBootstrapDefaultTrackerData,
  resolveBootstrapContinueEntityResolution,
} from "../src/bootstrapEntityResolution";
import type { TrackerData } from "../src/types";

function makeTracker(entityResolution?: TrackerData["entityResolution"] | null): TrackerData {
  return {
    timestamp: 1,
    activeCharacters: ["Serena", "Lisa", "Candy"],
    ...(entityResolution ? { entityResolution } : {}),
    statistics: {
      affection: { Serena: 45, Lisa: 45, Candy: 45 },
      trust: { Serena: 45, Lisa: 45, Candy: 45 },
      desire: { Serena: 35, Lisa: 35, Candy: 35 },
      connection: { Serena: 48, Lisa: 48, Candy: 48 },
      mood: { Serena: "Neutral", Lisa: "Neutral", Candy: "Neutral" },
      lastThought: { Serena: "", Lisa: "", Candy: "" },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      pose: { Serena: "Unknown", Lisa: "Unknown", Candy: "Unknown" },
    },
  };
}

const resolvedEntityResolution: NonNullable<TrackerData["entityResolution"]> = {
  source: "model",
  resolvedEntities: [
    {
      entityId: "bst_narrative:serena",
      name: "Serena",
      kind: "narrative-entity",
      aliases: ["seductive younger sister"],
      inScene: true,
      inMessage: true,
      created: true,
    },
    {
      entityId: "bst_narrative:lisa",
      name: "Lisa",
      kind: "narrative-entity",
      aliases: ["bratty older sister"],
      inScene: true,
      inMessage: true,
      created: true,
    },
  ],
};

test("greeting bootstrap defaults preserve model entity resolution for the continue extraction pass", () => {
  const previous = makeTracker();
  const seeded = buildGreetingBootstrapDefaultTrackerData({
    timestamp: 2,
    activeCharacters: ["Serena", "Lisa"],
    previous,
    entityResolution: resolvedEntityResolution,
  });

  assert.deepEqual(seeded.entityResolution, resolvedEntityResolution);
  assert.deepEqual(seeded.activeCharacters, ["Serena", "Lisa"]);
  assert.equal(seeded.statistics.affection.Serena, 45);
});

test("bootstrap continue reuses only current-message bootstrap entity resolution", () => {
  const existingTrackerData = makeTracker(resolvedEntityResolution);

  assert.equal(
    resolveBootstrapContinueEntityResolution({
      isBootstrapContinue: false,
      existingTrackerData,
    }),
    null,
  );
  assert.deepEqual(
    resolveBootstrapContinueEntityResolution({
      isBootstrapContinue: true,
      existingTrackerData,
    }),
    resolvedEntityResolution,
  );
});
