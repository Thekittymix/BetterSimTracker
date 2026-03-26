import test from "node:test";
import assert from "node:assert/strict";

import { buildPersistedTrackerSnapshot } from "../src/persistedTrackerSnapshot";

test("buildPersistedTrackerSnapshot persists entity-scoped buckets for resolved active characters", () => {
  const snapshot = buildPersistedTrackerSnapshot({
    context: null,
    timestamp: 123,
    activeCharacters: ["Blake"],
    activeEntityIds: ["bst_mc_alias:test:blake"],
    entityTrackingMode: "dynamic_characters",
    resolvedEntities: [
      {
        entityId: "bst_mc_alias:test:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
    ],
    source: "model",
    statistics: {
      affection: { Blake: 49 },
      trust: { Blake: 49 },
      desire: { Blake: 50 },
      connection: { Blake: 50 },
      mood: { Blake: "Serious" },
      lastThought: { Blake: "Only I should be advancing this turn." },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: { Blake: ["oversized baggy dark emo goth clothes"] },
    },
  });

  assert.equal(snapshot.timestamp, 123);
  assert.deepEqual(snapshot.activeCharacters, ["Blake"]);
  assert.deepEqual(snapshot.statisticsByEntityId?.affection, {
    "bst_mc_alias:test:blake": 49,
  });
  assert.deepEqual(snapshot.statisticsByEntityId?.mood, {
    "bst_mc_alias:test:blake": "Serious",
  });
  assert.deepEqual(snapshot.customNonNumericStatisticsByEntityId?.clothes, {
    "bst_mc_alias:test:blake": ["oversized baggy dark emo goth clothes"],
  });
});

test("buildPersistedTrackerSnapshot lets explicit target mapping override mismatched positional entity ids", () => {
  const snapshot = buildPersistedTrackerSnapshot({
    context: null,
    timestamp: 456,
    activeCharacters: ["__bst_user__"],
    activeEntityIds: ["bst_mc_alias:test:blake"],
    explicitTargetToEntity: {
      __bst_user__: "bst_owner:__bst_user__",
    },
    entityTrackingMode: "dynamic_characters",
    resolvedEntities: [
      {
        entityId: "bst_mc_alias:test:blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: false,
      },
    ],
    source: "model",
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { __bst_user__: "Neutral" },
      lastThought: { __bst_user__: "Keep Blake focused." },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: { __bst_user__: ["t-shirt", "jeans"] },
    },
  });

  assert.deepEqual(snapshot.statisticsByEntityId?.mood, {
    "bst_owner:__bst_user__": "Neutral",
  });
  assert.deepEqual(snapshot.statisticsByEntityId?.lastThought, {
    "bst_owner:__bst_user__": "Keep Blake focused.",
  });
  assert.deepEqual(snapshot.customNonNumericStatisticsByEntityId?.clothes, {
    "bst_owner:__bst_user__": ["t-shirt", "jeans"],
  });
});
