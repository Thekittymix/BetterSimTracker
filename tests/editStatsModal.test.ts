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

test("edit modal raw numeric lookup resolves alias-backed values through byEntityId", () => {
  const data = makeData();
  data.customStatistics = {
    bravery: {
      Ashley: 15,
    },
  };
  data.customStatisticsByEntityId = {
    bravery: {
      "bst_mc_alias:test:ashley": 77,
    },
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

  const value = __testables.resolveEditNumericRawValue(
    data,
    "bravery",
    __testables.uniqueOwnerKeys("Ashley", "Ashley"),
    false,
  );
  assert.equal(value, 77);
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

test("edit modal raw non-numeric lookup resolves alias-backed values through byEntityId", () => {
  const data = makeData();
  data.customNonNumericStatistics = {
    clothes: {
      Ashley: ["hoodie"],
    },
  };
  data.customNonNumericStatisticsByEntityId = {
    clothes: {
      "bst_mc_alias:test:ashley": ["oversized jacket", "boots"],
    },
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

  const value = __testables.resolveEditNonNumericRawValue(
    data,
    "clothes",
    __testables.uniqueOwnerKeys("Ashley", "Ashley"),
    false,
  );
  assert.deepEqual(value, ["oversized jacket", "boots"]);
});

test("edit modal built-in text lookup resolves alias-backed values through byEntityId", () => {
  const data = makeData();
  data.statistics.mood = {
    Ashley: "Neutral",
  };
  data.statistics.lastThought = {
    Ashley: "legacy thought",
  };
  data.statisticsByEntityId = {
    affection: {},
    trust: {},
    desire: {},
    connection: {},
    mood: {
      "bst_mc_alias:test:ashley": "Hopeful",
    },
    lastThought: {
      "bst_mc_alias:test:ashley": "new entity thought",
    },
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
  assert.equal(__testables.resolveEditBuiltInTextValue(data, "mood", ownerKeys), "Hopeful");
  assert.equal(__testables.resolveEditBuiltInTextValue(data, "lastThought", ownerKeys), "new entity thought");
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

