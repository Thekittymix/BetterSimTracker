import assert from "node:assert/strict";
import test from "node:test";

import {
  createRenderHistoryLookupCache,
  type UiNonNumericStatDefinition,
} from "../src/ui";
import type { TrackerData } from "../src/types";

function makeTrackerData(timestamp: number): TrackerData {
  return {
    timestamp,
    activeCharacters: ["Ashley"],
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

const arrayDef: UiNonNumericStatDefinition = {
  id: "clothes",
  label: "Clothes",
  kind: "array",
  defaultValue: [],
  enumOptions: [],
  booleanTrueLabel: "yes",
  booleanFalseLabel: "no",
  textMaxLength: 200,
  dateTimeMode: "timestamp",
  trackCharacters: true,
  trackUser: true,
  globalScope: false,
  showOnCard: true,
  includeInInjection: true,
  color: "#ffffff",
};

test("createRenderHistoryLookupCache memoizes repeated numeric lookups for the same query", () => {
  const previous = makeTrackerData(100);
  previous.statistics.affection.Ashley = 61;
  let resolverCalls = 0;

  const cache = createRenderHistoryLookupCache(
    [{ messageIndex: 0, data: previous }],
    {
      resolveLookupNamesForOwnerInData: () => {
        resolverCalls += 1;
        return ["Ashley"];
      },
      isNumericGlobalScope: () => false,
    },
  );

  const first = cache.findPreviousDataWithNumericStat(1, "affection", "Ashley");
  const second = cache.findPreviousDataWithNumericStat(1, "affection", "Ashley");

  assert.equal(first?.value, 61);
  assert.equal(second?.value, 61);
  assert.equal(resolverCalls, 1);
});

test("createRenderHistoryLookupCache keeps non-numeric value cache scoped to the specific TrackerData object", () => {
  const firstData = makeTrackerData(200);
  firstData.customNonNumericStatistics = {
    clothes: {
      AliasA: ["red dress"],
    },
  };
  const secondData = makeTrackerData(200);
  secondData.customNonNumericStatistics = {
    clothes: {
      AliasB: ["blue coat"],
    },
  };

  const cache = createRenderHistoryLookupCache([], {
    resolveLookupNamesForOwnerInData: data => {
      if (data === firstData) return ["AliasA"];
      if (data === secondData) return ["AliasB"];
      return ["Ashley"];
    },
    isNumericGlobalScope: () => false,
  });

  const first = cache.resolvePreviousNonNumericValue(firstData, arrayDef, "Ashley", 3);
  const second = cache.resolvePreviousNonNumericValue(secondData, arrayDef, "Ashley", 3);

  assert.deepEqual(first, ["red dress"]);
  assert.deepEqual(second, ["blue coat"]);
});

test("createRenderHistoryLookupCache keeps built-in text value cache scoped to the specific TrackerData object", () => {
  const firstData = makeTrackerData(300);
  firstData.statistics.mood = { AliasA: "Happy" };
  const secondData = makeTrackerData(300);
  secondData.statistics.mood = { AliasB: "Angry" };

  const cache = createRenderHistoryLookupCache([], {
    resolveLookupNamesForOwnerInData: data => {
      if (data === firstData) return ["AliasA"];
      if (data === secondData) return ["AliasB"];
      return ["Ashley"];
    },
    isNumericGlobalScope: () => false,
  });

  const first = cache.resolvePreviousBuiltInTextValue(firstData, "mood", "Ashley", 4);
  const second = cache.resolvePreviousBuiltInTextValue(secondData, "mood", "Ashley", 4);

  assert.equal(first, "Happy");
  assert.equal(second, "Angry");
});

test("createRenderHistoryLookupCache memoizes repeated built-in text history scans for the same query", () => {
  const previous = makeTrackerData(400);
  previous.statistics.lastThought = { Ashley: "Stay calm." };
  let resolverCalls = 0;

  const cache = createRenderHistoryLookupCache(
    [{ messageIndex: 1, data: previous }],
    {
      resolveLookupNamesForOwnerInData: () => {
        resolverCalls += 1;
        return ["Ashley"];
      },
      isNumericGlobalScope: () => false,
    },
  );

  const first = cache.findPreviousDataWithBuiltInTextStat("lastThought", 2, "Ashley");
  const second = cache.findPreviousDataWithBuiltInTextStat("lastThought", 2, "Ashley");

  assert.equal(first, previous);
  assert.equal(second, previous);
  assert.equal(resolverCalls, 1);
});
