import test from "node:test";
import assert from "node:assert/strict";

import { buildStatSeries, hasNumericSnapshot, selectGraphTimelineEntries, type GraphNumericStatDefinition } from "../src/graphTimeline";
import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "../src/constants";
import type { TrackerData } from "../src/types";

function makeTracker(timestamp: number): TrackerData {
  return {
    timestamp,
    activeCharacters: ["Seraphina"],
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

test("hasNumericSnapshot detects built-in and global custom numeric entries", () => {
  const entry = makeTracker(1);
  entry.statistics.affection.Seraphina = 42;
  entry.customStatistics = {
    scene_score: {
      [GLOBAL_TRACKER_KEY]: 55,
    },
  };
  const defs: GraphNumericStatDefinition[] = [
    { key: "affection", defaultValue: 50, globalScope: false },
    { key: "scene_score", defaultValue: 50, globalScope: true },
  ];

  assert.equal(hasNumericSnapshot(entry, "Seraphina", defs), true);
  assert.equal(hasNumericSnapshot(entry, USER_TRACKER_KEY, [{ key: "scene_score", defaultValue: 50, globalScope: false }]), false);
  assert.equal(hasNumericSnapshot(entry, USER_TRACKER_KEY, [{ key: "missing_stat", defaultValue: 50, globalScope: false }]), false);
});

test("buildStatSeries carries previous value and clamps range", () => {
  const t1 = makeTracker(1);
  const t2 = makeTracker(2);
  const t3 = makeTracker(3);
  const t4 = makeTracker(4);
  const def: GraphNumericStatDefinition = {
    key: "trust",
    defaultValue: 50,
    globalScope: false,
  };

  t2.statistics.trust.Seraphina = 65;
  t4.statistics.trust.Seraphina = 150;

  const series = buildStatSeries([t1, t2, t3, t4], "Seraphina", def);
  assert.deepEqual(series, [50, 65, 65, 100]);
});

test("graph timeline helpers can resolve alias-owned values through per-entry lookup names", () => {
  const entry = makeTracker(1);
  entry.statistics.affection.Ashley = 62;
  entry.customStatistics = {
    owner_score: {
      Ashley: 71,
    },
  };

  const defs: GraphNumericStatDefinition[] = [
    { key: "affection", defaultValue: 50, globalScope: false },
    { key: "owner_score", defaultValue: 50, globalScope: false },
  ];

  assert.equal(
    hasNumericSnapshot(entry, current => (current.timestamp === 1 ? ["Ash", "Ashley"] : ["Ash"]), defs),
    true,
  );

  const series = buildStatSeries(
    [entry],
    () => ["Ash", "Ashley"],
    { key: "owner_score", defaultValue: 50, globalScope: false },
  );
  assert.deepEqual(series, [71]);
});

test("graph timeline helpers prefer by-entity numeric values through entityOwnerMap", () => {
  const entry = makeTracker(1);
  entry.entityOwnerMap = {
    Ashley: {
      entityId: "ent-ashley",
      ownerName: "Ashley",
      canonicalName: "Ashley Summers",
      aliases: ["Ash"],
      sourceKey: "camp|ashley",
      kind: "multi_character_alias",
    },
  };
  entry.statisticsByEntityId = {
    affection: {
      "ent-ashley": 68,
    },
    trust: {},
    desire: {},
    connection: {},
    mood: {},
    lastThought: {},
  };
  entry.customStatisticsByEntityId = {
    owner_score: {
      "ent-ashley": 73,
    },
  };

  const defs: GraphNumericStatDefinition[] = [
    { key: "affection", defaultValue: 50, globalScope: false },
    { key: "owner_score", defaultValue: 50, globalScope: false },
  ];

  assert.equal(hasNumericSnapshot(entry, "Ashley", defs), true);
  assert.deepEqual(
    buildStatSeries([entry], "Ashley", { key: "owner_score", defaultValue: 50, globalScope: false }),
    [73],
  );
  assert.deepEqual(
    buildStatSeries([entry], "Ashley", { key: "affection", defaultValue: 50, globalScope: false }),
    [68],
  );
});

test("graph timeline helpers can target an explicit entity id when same-name entities collide", () => {
  const entry = makeTracker(1);
  entry.statistics.affection.Ashley = 41;
  entry.entityOwnerMap = {
    Ashley: {
      entityId: "ent-ashley-current",
      ownerName: "Ashley",
      canonicalName: "Ashley Current",
      aliases: ["Ash"],
      sourceKey: "camp|ashley-current",
      kind: "multi_character_alias",
    },
  };
  entry.statisticsByEntityId = {
    affection: {
      "ent-ashley-legacy": 12,
      "ent-ashley-current": 77,
    },
    trust: {},
    desire: {},
    connection: {},
    mood: {},
    lastThought: {},
  };
  entry.customStatisticsByEntityId = {
    owner_score: {
      "ent-ashley-legacy": 33,
      "ent-ashley-current": 84,
    },
  };

  assert.equal(
    hasNumericSnapshot(entry, { ownerName: "Ashley", entityId: "ent-ashley-current" }, [
      { key: "affection", defaultValue: 50, globalScope: false },
      { key: "owner_score", defaultValue: 50, globalScope: false },
    ]),
    true,
  );
  assert.deepEqual(
    buildStatSeries(
      [entry],
      { ownerName: "Ashley", entityId: "ent-ashley-current" },
      { key: "owner_score", defaultValue: 50, globalScope: false },
    ),
    [84],
  );
  assert.deepEqual(
    buildStatSeries(
      [entry],
      { ownerName: "Ashley", entityId: "ent-ashley-current" },
      { key: "affection", defaultValue: 50, globalScope: false },
    ),
    [77],
  );
});

test("selectGraphTimelineEntries keeps same-name graph history scoped to the explicit entity id", () => {
  const wrongEntity = makeTracker(1);
  wrongEntity.statisticsByEntityId = {
    affection: {
      "ent-ashley-legacy": 12,
    },
    trust: {},
    desire: {},
    connection: {},
    mood: {},
    lastThought: {},
  };
  wrongEntity.customStatisticsByEntityId = {
    owner_score: {
      "ent-ashley-legacy": 33,
    },
  };

  const correctEntity = makeTracker(2);
  correctEntity.entityOwnerMap = {
    Ashley: {
      entityId: "ent-ashley-current",
      ownerName: "Ashley",
      canonicalName: "Ashley Current",
      aliases: ["Ash"],
      sourceKey: "camp|ashley-current",
      kind: "multi_character_alias",
    },
  };
  correctEntity.statisticsByEntityId = {
    affection: {
      "ent-ashley-current": 77,
    },
    trust: {},
    desire: {},
    connection: {},
    mood: {},
    lastThought: {},
  };

  const selected = selectGraphTimelineEntries(
    [wrongEntity, correctEntity],
    { ownerName: "Ashley", entityId: "ent-ashley-current" },
    [{ key: "affection", defaultValue: 50, globalScope: false }],
  );

  assert.deepEqual(selected.map(item => item.timestamp), [2]);
});
