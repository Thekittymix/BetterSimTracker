import test from "node:test";
import assert from "node:assert/strict";

import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "../src/constants";
import { __testables } from "../src/editStatsModal";
import type { TrackerData } from "../src/types";

function makeData(): TrackerData {
  return {
    timestamp: Date.now(),
    activeCharacters: [],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {},
  };
}

test("edit modal raw non-global lookup does not fall back to global owner value", () => {
  const data = makeData();
  data.customNonNumericStatistics = {
    clothes: {
      [GLOBAL_TRACKER_KEY]: ["black sundress", "white panties"],
      [USER_TRACKER_KEY]: ["t-shirt", "jeans"],
    },
  };
  const ownerKeys = __testables.uniqueOwnerKeys(USER_TRACKER_KEY, "User");
  const userValue = __testables.resolveEditNonNumericRawValue(data, "clothes", ownerKeys, false);
  assert.deepEqual(userValue, ["t-shirt", "jeans"]);

  const missingOwner = __testables.resolveEditNonNumericRawValue(
    data,
    "clothes",
    __testables.uniqueOwnerKeys("Some Other Owner", "Some Other Owner"),
    false,
  );
  assert.equal(missingOwner, undefined);
});

test("edit modal raw global lookup prefers global owner value", () => {
  const data = makeData();
  data.customNonNumericStatistics = {
    scene_date_time: {
      [GLOBAL_TRACKER_KEY]: "2026-03-04 20:30",
      [USER_TRACKER_KEY]: "2026-03-04 21:00",
    },
  };
  const value = __testables.resolveEditNonNumericRawValue(
    data,
    "scene_date_time",
    __testables.uniqueOwnerKeys(USER_TRACKER_KEY, "User"),
    true,
  );
  assert.equal(value, "2026-03-04 20:30");
});

test("edit modal active state prefers resolver scene owners over stale activeCharacters", () => {
  const data = makeData();
  data.activeCharacters = ["Garret"];
  data.entityResolution = {
    sceneOwners: ["Blake"],
    messageOwners: ["Blake"],
    sceneEntityIds: ["bst_mc_alias:test:blake"],
    messageEntityIds: ["bst_mc_alias:test:blake"],
    source: "model",
  };

  const ownerKeys = __testables.uniqueOwnerKeys("Blake", "Blake");
  assert.equal(__testables.resolveEditIsCurrentlyActive(data, "Blake", ownerKeys), true);
  assert.equal(__testables.resolveEditIsCurrentlyActive(data, "Garret", __testables.uniqueOwnerKeys("Garret", "Garret")), false);
});

test("edit modal active state can resolve alias activity through entity ids", () => {
  const data = makeData();
  data.activeCharacters = ["Ash"];
  data.entityResolution = {
    sceneOwners: ["Ashley"],
    messageOwners: ["Ashley"],
    sceneEntityIds: ["bst_mc_alias:test:ashley"],
    messageEntityIds: ["bst_mc_alias:test:ashley"],
    source: "model",
  };
  data.entityOwnerMap = {
    Ash: {
      entityId: "bst_mc_alias:test:ashley",
      ownerName: "Ashley",
      canonicalName: "Ashley",
      aliases: ["Ash"],
      sourceKey: "camp.png|camp whispering pines",
      kind: "multi_character_alias",
    },
  };

  const ownerKeys = __testables.uniqueOwnerKeys("Ashley", "Ashley");
  assert.deepEqual(__testables.resolveEditOwnerEntityIds(data, ownerKeys), ["bst_mc_alias:test:ashley"]);
  assert.equal(__testables.resolveEditIsCurrentlyActive(data, "Ashley", ownerKeys), true);
});

