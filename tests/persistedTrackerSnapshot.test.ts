import test from "node:test";
import assert from "node:assert/strict";

import { USER_TRACKER_KEY } from "../src/constants";
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
        sceneEvidence: ["resolver_entity_ref"],
        messageEvidence: ["resolver_entity_ref", "focus_constrained"],
        sceneConfidence: 1,
        messageConfidence: 1,
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
  assert.deepEqual(snapshot.entityResolution?.resolvedEntities, [
    {
      entityId: "bst_mc_alias:test:blake",
      kind: "st-character",
      name: "Blake",
      avatar: null,
      aliases: undefined,
      inScene: true,
      inMessage: true,
      sceneEvidence: ["resolver_entity_ref"],
      messageEvidence: ["resolver_entity_ref", "focus_constrained"],
      sceneConfidence: 1,
      messageConfidence: 1,
      created: false,
    },
  ]);
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

test("buildPersistedTrackerSnapshot prunes stale owner-keyed compatibility buckets while keeping global stats", () => {
  const snapshot = buildPersistedTrackerSnapshot({
    context: null,
    timestamp: 789,
    activeCharacters: ["Ashley", "Blake"],
    activeEntityIds: ["ent-ashley", "ent-blake"],
    entityTrackingMode: "dynamic_characters",
    resolvedEntities: [
      {
        entityId: "ent-ashley",
        kind: "st-character",
        name: "Ashley",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
      {
        entityId: "ent-blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
    ],
    source: "model",
    statistics: {
      affection: { Ashley: 55, Blake: 48, "Elias Mercer": 50 },
      trust: { Ashley: 51, Blake: 46, [USER_TRACKER_KEY]: 77 } as any,
      desire: {},
      connection: {},
      mood: { Ashley: "Anxious", Blake: "Playful", "Elias Mercer": "Neutral" },
      lastThought: { Ashley: "Stay low.", Blake: "Keep talking.", [USER_TRACKER_KEY]: "Do not leak." },
    },
    customStatistics: {
      satisfaction: { [USER_TRACKER_KEY]: 50, Ashley: 63 } as any,
    },
    customNonNumericStatistics: {
      clothes: { Ashley: ["hoodie"], Blake: ["dark shirt"], "Elias Mercer": ["boots"] },
      scene_date_time: { __bst_global__: "2026-03-04 20:12" },
    },
    globalCustomNonNumericStatisticIds: ["scene_date_time"],
  });

  assert.deepEqual(snapshot.statistics.affection, { Ashley: 55, Blake: 48 });
  assert.deepEqual(snapshot.statistics.trust, { Ashley: 51, Blake: 46 });
  assert.deepEqual(snapshot.statistics.mood, { Ashley: "Anxious", Blake: "Playful" });
  assert.deepEqual(snapshot.statistics.lastThought, { Ashley: "Stay low.", Blake: "Keep talking." });
  assert.deepEqual(snapshot.customStatistics?.satisfaction, { Ashley: 63 });
  assert.deepEqual(snapshot.customNonNumericStatistics?.clothes, { Ashley: ["hoodie"], Blake: ["dark shirt"] });
  assert.deepEqual(snapshot.customNonNumericStatistics?.scene_date_time, { __bst_global__: "2026-03-04 20:12" });
});
