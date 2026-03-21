import test from "node:test";
import assert from "node:assert/strict";

import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "../src/constants";
import {
  getNumericRawValue,
  orderOwnerCardStats,
  resolveCurrentBuiltInTextValue,
  resolveCurrentNonNumericRawValue,
  resolveCurrentNumericRawValue,
  resolveNonNumericValue,
} from "../src/ui";
import type { TrackerData } from "../src/types";

type TestNonNumericDef = {
  id: string;
  label: string;
  kind: "array" | "date_time";
  track: boolean;
  trackCharacters: boolean;
  trackUser: boolean;
  globalScope: boolean;
  showOnCard: boolean;
  showInGraph: boolean;
  includeInInjection: boolean;
  enumOptions: string[];
  booleanTrueLabel: string;
  booleanFalseLabel: string;
  textMaxLength: number;
  dateTimeMode: "timestamp";
  defaultValue: string | string[];
};

function makeTracker(): TrackerData {
  return {
    timestamp: 1,
    activeCharacters: ["Seraphina", USER_TRACKER_KEY],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {
      shared_score: {
        [GLOBAL_TRACKER_KEY]: 88,
      },
      owner_score: {
        [GLOBAL_TRACKER_KEY]: 66,
        Seraphina: 42,
      },
    },
    customNonNumericStatistics: {
      scene_date_time: {
        [GLOBAL_TRACKER_KEY]: "2026-03-10 12:00",
      },
      clothes: {
        [GLOBAL_TRACKER_KEY]: ["global robe"],
        [USER_TRACKER_KEY]: ["t-shirt", "jeans"],
      },
    },
  };
}

test("owner-scoped numeric UI lookup does not fall back to global value", () => {
  const data = makeTracker();
  assert.equal(getNumericRawValue(data, "owner_score", USER_TRACKER_KEY, false), undefined);
  assert.equal(getNumericRawValue(data, "owner_score", "Seraphina", false), 42);
  assert.equal(getNumericRawValue(data, "shared_score", USER_TRACKER_KEY, true), 88);
});

test("owner-scoped numeric UI lookup respects explicit clears", () => {
  const data = makeTracker();
  data.clearedCustomStatistics = {
    owner_score: {
      Seraphina: true,
    },
  };
  assert.equal(getNumericRawValue(data, "owner_score", "Seraphina", false), undefined);
});

test("owner-scoped non-numeric UI lookup does not fall back to global value", () => {
  const data = makeTracker();
  const ownerDef: TestNonNumericDef = {
    id: "clothes",
    label: "Clothes",
    kind: "array" as const,
    track: true,
    trackCharacters: true,
    trackUser: true,
    globalScope: false,
    showOnCard: true,
    showInGraph: false,
    includeInInjection: true,
    enumOptions: [] as string[],
    booleanTrueLabel: "On",
    booleanFalseLabel: "Off",
    textMaxLength: 100,
    dateTimeMode: "timestamp" as const,
    defaultValue: [],
  };
  const globalDef: TestNonNumericDef = {
    ...ownerDef,
    id: "scene_date_time",
    label: "Scene Date/Time",
    kind: "date_time" as const,
    globalScope: true,
    defaultValue: "",
  };
  assert.deepEqual(resolveNonNumericValue(data, ownerDef as never, USER_TRACKER_KEY), ["t-shirt", "jeans"]);
  assert.deepEqual(resolveNonNumericValue(data, ownerDef as never, "Seraphina"), []);
  assert.equal(resolveNonNumericValue(data, globalDef as never, USER_TRACKER_KEY), "2026-03-10 12:00");
});

test("registry-aware current numeric lookup can read alias state stored under canonical owner", () => {
  const data = makeTracker();
  data.customStatistics = {
    owner_score: {
      Ashley: 61,
    },
  };

  assert.equal(
    resolveCurrentNumericRawValue(data, "owner_score", "Ash", {
      globalScope: false,
      registryEntry: {
        ownerName: "Ash",
        canonicalName: "Ashley",
        aliases: ["Ash"],
        kind: "multi_character_alias",
      },
    }),
    61,
  );
});

test("registry-aware current non-numeric lookup can read alias state stored under canonical owner", () => {
  const data = makeTracker();
  data.customNonNumericStatistics = {
    clothes: {
      Ashley: ["camp hoodie", "shorts"],
    },
  };

  assert.deepEqual(
    resolveCurrentNonNumericRawValue(data, "clothes", "Ash", {
      globalScope: false,
      registryEntry: {
        ownerName: "Ash",
        canonicalName: "Ashley",
        aliases: ["Ash"],
        kind: "multi_character_alias",
      },
    }),
    ["camp hoodie", "shorts"],
  );
});

test("registry-aware current built-in text lookup can read alias mood stored under canonical owner", () => {
  const data = makeTracker();
  data.statistics.mood = {
    Ashley: "Hopeful",
  };

  assert.equal(
    resolveCurrentBuiltInTextValue(data, "mood", "Ash", {
      ownerName: "Ash",
      canonicalName: "Ashley",
      aliases: ["Ash"],
      kind: "multi_character_alias",
    }),
    "Hopeful",
  );
});

test("orderOwnerCardStats applies configured display order to user and character card stat lists", () => {
  const orderedNumeric = orderOwnerCardStats(
    [
      { key: "trust" },
      { key: "affection" },
      { key: "connection" },
    ],
    ["connection", "affection"],
    def => String(def.key).trim().toLowerCase(),
  );
  assert.deepEqual(orderedNumeric.map(def => def.key), ["connection", "affection", "trust"]);

  const orderedNonNumeric = orderOwnerCardStats(
    [
      { id: "pose" },
      { id: "clothes" },
      { id: "physicality" },
    ],
    ["physicality", "clothes"],
    def => String(def.id).trim().toLowerCase(),
  );
  assert.deepEqual(orderedNonNumeric.map(def => def.id), ["physicality", "clothes", "pose"]);
});
