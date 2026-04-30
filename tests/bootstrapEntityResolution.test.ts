import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBootstrapFallbackEntityResolution,
  buildGreetingBootstrapDefaultTrackerData,
  resolveBootstrapContinueEntityResolution,
  resolveBootstrapEntityResolutionOwnerScopes,
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

test("bootstrap entity-resolution falls back to the opening AI speaker when the model resolves an empty scene", () => {
  const resolved = resolveBootstrapEntityResolutionOwnerScopes({
    context: {
      characters: [
        { name: "Seraphina", avatar: "seraphina.png" },
      ],
    } as any,
    candidateOwners: ["Seraphina"],
    message: {
      name: "Seraphina",
      mes: "She exhales slowly and watches the doorway without saying anything.",
      is_user: false,
      is_system: false,
    } as any,
    settings: { entityTrackingMode: "dynamic_characters" },
    modelOwnerScopes: {
      sceneActiveCharacters: [],
      requestCharacters: [],
    },
  });

  assert.deepEqual(resolved, {
    sceneActiveCharacters: ["Seraphina"],
    requestCharacters: ["Seraphina"],
    source: "fallback",
  });
});

test("buildBootstrapFallbackEntityResolution serializes fallback owner scopes for continue reuse", () => {
  const fallback = buildBootstrapFallbackEntityResolution({
    context: {
      characters: [
        { name: "Seraphina", avatar: "seraphina.png" },
      ],
    } as any,
    sceneActiveCharacters: ["Seraphina"],
    requestCharacters: ["Seraphina"],
    settings: { entityTrackingMode: "dynamic_characters" },
  });

  assert.deepEqual(fallback, {
    source: "fallback",
    resolvedEntities: [
      {
        entityId: "bst_owner:seraphina.png|seraphina",
        kind: "st-character",
        name: "Seraphina",
        avatar: null,
        inScene: true,
        inMessage: true,
        created: false,
      },
    ],
  });
});

test("greeting bootstrap defaults preserve fallback entity resolution for the continue extraction pass", () => {
  const previous = makeTracker();
  const fallbackEntityResolution = buildBootstrapFallbackEntityResolution({
    context: {
      characters: [
        { name: "Seraphina", avatar: "seraphina.png" },
      ],
    } as any,
    sceneActiveCharacters: ["Seraphina"],
    requestCharacters: ["Seraphina"],
    settings: { entityTrackingMode: "dynamic_characters" },
  });
  const seeded = buildGreetingBootstrapDefaultTrackerData({
    timestamp: 2,
    activeCharacters: ["Seraphina"],
    previous,
    entityResolution: fallbackEntityResolution,
  });

  assert.deepEqual(
    resolveBootstrapContinueEntityResolution({
      isBootstrapContinue: true,
      existingTrackerData: seeded,
    }),
    fallbackEntityResolution,
  );
});
