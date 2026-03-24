import test from "node:test";
import assert from "node:assert/strict";

import { applyEditedTrackerActiveState, buildEditedTrackerDataSnapshot } from "../src/trackerEditState";
import type { TrackerData } from "../src/types";

function makeTrackerData(): TrackerData {
  return {
    timestamp: 1000,
    activeCharacters: ["Blake"],
    entityResolution: {
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:test:blake"],
      messageEntityIds: ["bst_mc_alias:test:blake"],
      source: "model",
    },
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
    entityResolution: {
      sceneOwners: ["Blake", "Ashley"],
      messageOwners: ["Blake", "Ashley"],
      sceneEntityIds: ["bst_mc_alias:test:blake", "bst_mc_alias:test:ashley"],
      messageEntityIds: ["bst_mc_alias:test:blake", "bst_mc_alias:test:ashley"],
      source: "model" as const,
    },
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
  assert.deepEqual(next.entityResolution?.sceneOwners, ["Blake"]);
  assert.deepEqual(next.entityResolution?.messageOwners, ["Blake"]);
  assert.deepEqual(next.entityResolution?.sceneEntityIds, ["bst_mc_alias:test:blake"]);
  assert.deepEqual(next.entityResolution?.messageEntityIds, ["bst_mc_alias:test:blake"]);
});

test("applyEditedTrackerActiveState adds manually activated owner back to resolver scene identity without forcing message ownership", () => {
  const current = {
    ...makeTrackerData(),
    activeCharacters: ["Blake"],
    entityResolution: {
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["bst_mc_alias:test:blake"],
      messageEntityIds: ["bst_mc_alias:test:blake"],
      source: "model" as const,
    },
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
  assert.deepEqual(next.entityResolution?.sceneOwners, ["Blake", "Ashley"]);
  assert.deepEqual(next.entityResolution?.messageOwners, ["Blake"]);
  assert.deepEqual(next.entityResolution?.sceneEntityIds, ["bst_mc_alias:test:blake", "bst_mc_alias:test:ashley"]);
  assert.deepEqual(next.entityResolution?.messageEntityIds, ["bst_mc_alias:test:blake"]);
});
