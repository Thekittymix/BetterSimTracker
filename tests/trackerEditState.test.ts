import test from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import { resolveTrackerMessageOwners, resolveTrackerSceneEntityIds, resolveTrackerSceneOwners } from "../src/entityRegistry";
import { applyEditedTrackerActiveState, buildEditedTrackerDataSnapshot, syncEditedTrackerEntityState } from "../src/trackerEditState";
import type { TrackerData } from "../src/types";

function makeTrackerData(): TrackerData {
  return {
    timestamp: 1000,
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:test:blake"],
      messageEntityIds: ["bst_mc_alias:test:blake"],
      source: "model",
    }),
    statistics: {
      affection: { Blake: 55 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Blake: "Hopeful" },
      lastThought: { Blake: "He can handle this." },
    },
    statisticsByEntityId: {
      affection: { "bst_mc_alias:test:blake": 55 },
      trust: {},
      desire: {},
      connection: {},
      mood: { "bst_mc_alias:test:blake": "Hopeful" },
      lastThought: { "bst_mc_alias:test:blake": "He can handle this." },
    },
    customStatistics: {
      tension: { Blake: 42 },
    },
    customStatisticsByEntityId: {
      tension: { "bst_mc_alias:test:blake": 42 },
    },
    customNonNumericStatistics: {
      clothes: { Blake: ["flannel shirt"] },
    },
    customNonNumericStatisticsByEntityId: {
      clothes: { "bst_mc_alias:test:blake": ["flannel shirt"] },
    },
    entityOwnerMap: {
      Blake: {
        entityId: "bst_mc_alias:test:blake",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: [],
        sourceKey: "test",
        kind: "multi_character_alias",
      },
    },
  };
}

test("buildEditedTrackerDataSnapshot preserves resolver identity metadata during manual edits", () => {
  const current = makeTrackerData();
  const next = buildEditedTrackerDataSnapshot({
    current,
    timestamp: 2000,
    activeCharacters: ["Blake"],
    statistics: {
      affection: { Blake: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Blake: "Content" },
      lastThought: { Blake: "Stay calm." },
    },
    customStatistics: {
      tension: { Blake: 37 },
    },
    customNonNumericStatistics: {
      clothes: { Blake: ["flannel shirt", "jeans"] },
    },
  });

  assert.equal(next.timestamp, 2000);
  assert.deepEqual(next.activeCharacters, ["Blake"]);
  assert.deepEqual(next.entityResolution, current.entityResolution);
  assert.deepEqual(next.entityOwnerMap, current.entityOwnerMap);
  assert.deepEqual(next.statisticsByEntityId, current.statisticsByEntityId);
  assert.deepEqual(next.customStatisticsByEntityId, current.customStatisticsByEntityId);
  assert.deepEqual(next.customNonNumericStatisticsByEntityId, current.customNonNumericStatisticsByEntityId);
  assert.equal(next.statistics.affection.Blake, 61);
  assert.equal(next.customStatistics?.tension?.Blake, 37);
  assert.deepEqual(next.customNonNumericStatistics?.clothes?.Blake, ["flannel shirt", "jeans"]);
});

test("applyEditedTrackerActiveState removes inactive owner from resolver-backed scene and message identity", () => {
  const current = {
    ...makeTrackerData(),
    activeCharacters: ["Blake", "Ashley"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake", "Ashley"],
      messageOwners: ["Blake", "Ashley"],
      sceneEntityIds: ["bst_mc_alias:test:blake", "bst_mc_alias:test:ashley"],
      messageEntityIds: ["bst_mc_alias:test:blake", "bst_mc_alias:test:ashley"],
      source: "model" as const,
    }),
    entityOwnerMap: {
      ...makeTrackerData().entityOwnerMap,
      Ashley: {
        entityId: "bst_mc_alias:test:ashley",
        ownerName: "Ashley",
        canonicalName: "Ashley Summers",
        aliases: ["Ash"],
        sourceKey: "test",
        kind: "multi_character_alias" as const,
      },
    },
  } satisfies TrackerData;

  const next = applyEditedTrackerActiveState(current, "Ashley", false);

  assert.deepEqual(next.activeCharacters, ["Blake"]);
  assert.deepEqual(resolveTrackerSceneOwners(null, next), ["Blake"]);
  assert.deepEqual(resolveTrackerMessageOwners(null, next), ["Blake"]);
  assert.deepEqual(resolveTrackerSceneEntityIds(null, next), ["bst_mc_alias:test:blake"]);
  assert.deepEqual(
    next.entityResolution?.resolvedEntities?.filter(entity => entity.inMessage).map(entity => entity.entityId),
    ["bst_mc_alias:test:blake"],
  );
});

test("applyEditedTrackerActiveState adds manually activated owner back to resolver scene identity without forcing message ownership", () => {
  const current = {
    ...makeTrackerData(),
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:test:blake"],
      messageEntityIds: ["bst_mc_alias:test:blake"],
      source: "model" as const,
    }),
    entityOwnerMap: {
      ...makeTrackerData().entityOwnerMap,
      Ashley: {
        entityId: "bst_mc_alias:test:ashley",
        ownerName: "Ashley",
        canonicalName: "Ashley Summers",
        aliases: ["Ash"],
        sourceKey: "test",
        kind: "multi_character_alias" as const,
      },
    },
  } satisfies TrackerData;

  const next = applyEditedTrackerActiveState(current, "Ash", true);

  assert.deepEqual(next.activeCharacters, ["Blake", "Ashley"]);
  assert.deepEqual(resolveTrackerSceneOwners(null, next), ["Blake", "Ashley"]);
  assert.deepEqual(resolveTrackerMessageOwners(null, next), ["Blake"]);
  assert.deepEqual(resolveTrackerSceneEntityIds(null, next), ["bst_mc_alias:test:blake", "bst_mc_alias:test:ashley"]);
  assert.deepEqual(
    next.entityResolution?.resolvedEntities?.filter(entity => entity.inMessage).map(entity => entity.entityId),
    ["bst_mc_alias:test:blake"],
  );
});

test("applyEditedTrackerActiveState prefers resolver scene owners over stale activeCharacters", () => {
  const current = {
    ...makeTrackerData(),
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake", "Ashley"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:test:blake", "bst_mc_alias:test:ashley"],
      messageEntityIds: ["bst_mc_alias:test:blake"],
      source: "model" as const,
    }),
    entityOwnerMap: {
      ...makeTrackerData().entityOwnerMap,
      Ashley: {
        entityId: "bst_mc_alias:test:ashley",
        ownerName: "Ashley",
        canonicalName: "Ashley Summers",
        aliases: ["Ash"],
        sourceKey: "test",
        kind: "multi_character_alias" as const,
      },
    },
  } satisfies TrackerData;

  const next = applyEditedTrackerActiveState(current, "Ashley", false);

  assert.deepEqual(next.activeCharacters, ["Blake"]);
});

test("buildEditedTrackerDataSnapshot prefers resolver scene owners over stale activeCharacters", () => {
  const current = {
    ...makeTrackerData(),
    activeCharacters: ["Garret"],
    entityResolution: buildEntityResolution({
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:test:blake"],
      messageEntityIds: ["bst_mc_alias:test:blake"],
      source: "model" as const,
    }),
  } satisfies TrackerData;

  const next = buildEditedTrackerDataSnapshot({
    current,
    timestamp: 2000,
    activeCharacters: ["Garret"],
    statistics: current.statistics,
  });

  assert.deepEqual(next.activeCharacters, ["Blake"]);
});

test("syncEditedTrackerEntityState mirrors edited alias values into byEntityId buckets", () => {
  const current = makeTrackerData();
  const edited = buildEditedTrackerDataSnapshot({
    current,
    timestamp: 2000,
    activeCharacters: ["Blake"],
    statistics: {
      affection: { Blake: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Blake: "Content" },
      lastThought: { Blake: "Stay calm." },
    },
    customStatistics: {
      tension: { Blake: 37 },
    },
    customNonNumericStatistics: {
      clothes: { Blake: ["flannel shirt", "jeans"] },
    },
  });

  const next = syncEditedTrackerEntityState(edited, "Blake");

  assert.equal(next.statisticsByEntityId?.affection?.["bst_mc_alias:test:blake"], 61);
  assert.equal(next.statisticsByEntityId?.mood?.["bst_mc_alias:test:blake"], "Content");
  assert.equal(next.statisticsByEntityId?.lastThought?.["bst_mc_alias:test:blake"], "Stay calm.");
  assert.equal(next.customStatisticsByEntityId?.tension?.["bst_mc_alias:test:blake"], 37);
  assert.deepEqual(next.customNonNumericStatisticsByEntityId?.clothes?.["bst_mc_alias:test:blake"], ["flannel shirt", "jeans"]);
});

test("syncEditedTrackerEntityState removes stale byEntityId values when an edited alias value is cleared", () => {
  const current = makeTrackerData();
  const edited = buildEditedTrackerDataSnapshot({
    current,
    timestamp: 2000,
    activeCharacters: ["Blake"],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {
      tension: {},
    },
    customNonNumericStatistics: {
      clothes: {},
    },
  });

  const next = syncEditedTrackerEntityState(edited, "Blake");

  assert.equal(next.statisticsByEntityId?.affection?.["bst_mc_alias:test:blake"], undefined);
  assert.equal(next.statisticsByEntityId?.mood?.["bst_mc_alias:test:blake"], undefined);
  assert.equal(next.statisticsByEntityId?.lastThought?.["bst_mc_alias:test:blake"], undefined);
  assert.equal(next.customStatisticsByEntityId?.tension?.["bst_mc_alias:test:blake"], undefined);
  assert.equal(next.customNonNumericStatisticsByEntityId?.clothes?.["bst_mc_alias:test:blake"], undefined);
});
