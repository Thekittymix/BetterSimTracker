import test from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import { cloneTrackerDataForEdit } from "../src/trackerUiState";
import type { TrackerData } from "../src/types";

test("cloneTrackerDataForEdit preserves resolver and by-entity state for edit modal continuity", () => {
  const data: TrackerData = {
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
      mood: { Blake: "Neutral" },
      lastThought: { Blake: "Keep distance." },
    },
    statisticsByEntityId: {
      affection: { "bst_mc_alias:test:blake": 55 },
      trust: {},
      desire: {},
      connection: {},
      mood: { "bst_mc_alias:test:blake": "Neutral" },
      lastThought: { "bst_mc_alias:test:blake": "Keep distance." },
    },
    customStatistics: {
      tension: { Blake: 40 },
    },
    customStatisticsByEntityId: {
      tension: { "bst_mc_alias:test:blake": 40 },
    },
    customNonNumericStatistics: {
      clothes: { Blake: ["hoodie"] },
    },
    customNonNumericStatisticsByEntityId: {
      clothes: { "bst_mc_alias:test:blake": ["hoodie"] },
    },
    entityOwnerMap: {
      Blake: {
        entityId: "bst_mc_alias:test:blake",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: ["Blackout Blake"],
        sourceKey: "test",
        kind: "multi_character_alias",
      },
    },
  };

  const cloned = cloneTrackerDataForEdit(data);

  assert.notEqual(cloned, data);
  assert.deepEqual(cloned.entityResolution, data.entityResolution);
  assert.deepEqual(cloned.statisticsByEntityId, data.statisticsByEntityId);
  assert.deepEqual(cloned.customStatisticsByEntityId, data.customStatisticsByEntityId);
  assert.deepEqual(cloned.customNonNumericStatisticsByEntityId, data.customNonNumericStatisticsByEntityId);
  assert.deepEqual(cloned.entityOwnerMap, data.entityOwnerMap);

  cloned.statistics.affection.Blake = 61;
  cloned.statisticsByEntityId!.affection["bst_mc_alias:test:blake"] = 61;
  cloned.customNonNumericStatistics!.clothes.Blake = ["jacket"];
  cloned.entityOwnerMap!.Blake.aliases.push("B");

  assert.equal(data.statistics.affection.Blake, 55);
  assert.equal(data.statisticsByEntityId!.affection["bst_mc_alias:test:blake"], 55);
  assert.deepEqual(data.customNonNumericStatistics!.clothes.Blake, ["hoodie"]);
  assert.deepEqual(data.entityOwnerMap!.Blake.aliases, ["Blackout Blake"]);
});

test("cloneTrackerDataForEdit preserves explicit activeCharacters over resolver continuity", () => {
  const data: TrackerData = {
    timestamp: 1000,
    activeCharacters: ["Garret"],
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
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {},
  };

  const cloned = cloneTrackerDataForEdit(data);

  assert.deepEqual(cloned.activeCharacters, ["Garret"]);
});
