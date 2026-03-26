import test from "node:test";
import assert from "node:assert/strict";

import { buildPersistedTrackerSnapshot } from "../src/persistedTrackerSnapshot";

test("buildPersistedTrackerSnapshot persists entity-scoped buckets for resolved active characters", () => {
  const snapshot = buildPersistedTrackerSnapshot({
    context: null,
    timestamp: 123,
    activeCharacters: ["Blake"],
    activeEntityIds: ["bst_mc_alias:test:blake"],
    entityTrackingMode: "multi_character",
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
