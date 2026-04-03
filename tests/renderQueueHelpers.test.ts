import test from "node:test";
import assert from "node:assert/strict";

import {
  computeManualPlaceholderMessageIndices,
  getCachedProjectedTrackerData,
  pruneProjectedTrackerDataCache,
} from "../src/renderQueueHelpers";
import type { ProjectedTrackerDataCacheEntry } from "../src/renderQueueHelpers";

test("computeManualPlaceholderMessageIndices returns none when auto-generate is on", () => {
  const context = {
    chat: [{}, {}, {}],
  } as any;
  const result = computeManualPlaceholderMessageIndices(
    context,
    new Set<number>(),
    true,
    () => true,
  );
  assert.deepEqual(result, []);
});

test("computeManualPlaceholderMessageIndices returns only missing trackable indices", () => {
  const context = {
    chat: [{}, {}, {}, {}],
  } as any;
  const result = computeManualPlaceholderMessageIndices(
    context,
    new Set<number>([1, 3]),
    false,
    (_ctx, index) => index % 2 === 0,
  );
  assert.deepEqual(result, [0, 2]);
});

test("getCachedProjectedTrackerData reuses the projected entry when message, raw data, and mode are unchanged", () => {
  const cache = new Map();
  const message = { name: "Seraphina" } as any;
  const rawData = { timestamp: 1, activeCharacters: ["Seraphina"] } as any;
  let builds = 0;

  const first = getCachedProjectedTrackerData(cache, {
    messageIndex: 3,
    messageRef: message,
    rawData,
    entityTrackingMode: "dynamic_characters",
    build: () => {
      builds += 1;
      return { ...rawData, projected: true } as any;
    },
  });
  const second = getCachedProjectedTrackerData(cache, {
    messageIndex: 3,
    messageRef: message,
    rawData,
    entityTrackingMode: "dynamic_characters",
    build: () => {
      builds += 1;
      return { ...rawData, projected: "new" } as any;
    },
  });

  assert.equal(builds, 1);
  assert.equal(second, first);
});

test("getCachedProjectedTrackerData invalidates when message ref, raw data ref, or mode changes", () => {
  const cache = new Map();
  const message = { name: "Seraphina" } as any;
  const nextMessage = { name: "Seraphina", mes: "new" } as any;
  const rawData = { timestamp: 1, activeCharacters: ["Seraphina"] } as any;
  const nextRawData = { timestamp: 2, activeCharacters: ["Seraphina"] } as any;
  let builds = 0;

  getCachedProjectedTrackerData(cache, {
    messageIndex: 3,
    messageRef: message,
    rawData,
    entityTrackingMode: "dynamic_characters",
    build: () => {
      builds += 1;
      return { ...rawData } as any;
    },
  });
  getCachedProjectedTrackerData(cache, {
    messageIndex: 3,
    messageRef: nextMessage,
    rawData,
    entityTrackingMode: "dynamic_characters",
    build: () => {
      builds += 1;
      return { ...rawData, withMessage: true } as any;
    },
  });
  getCachedProjectedTrackerData(cache, {
    messageIndex: 3,
    messageRef: nextMessage,
    rawData: nextRawData,
    entityTrackingMode: "dynamic_characters",
    build: () => {
      builds += 1;
      return { ...nextRawData } as any;
    },
  });
  getCachedProjectedTrackerData(cache, {
    messageIndex: 3,
    messageRef: nextMessage,
    rawData: nextRawData,
    entityTrackingMode: "standard",
    build: () => {
      builds += 1;
      return { ...nextRawData, mode: "standard" } as any;
    },
  });

  assert.equal(builds, 4);
});

test("pruneProjectedTrackerDataCache removes entries outside the live chat window", () => {
  const makeEntry = (timestamp: number): ProjectedTrackerDataCacheEntry => ({
    messageRef: { mes: "", name: "Test", is_user: false, is_system: false } as any,
    rawDataRef: { timestamp } as any,
    projectedData: { timestamp } as any,
    entityTrackingMode: "dynamic_characters",
    projectOwnerScopedCustomNonNumeric: true,
  });
  const cache = new Map<number, ProjectedTrackerDataCacheEntry>([
    [0, makeEntry(1)],
    [2, makeEntry(2)],
    [5, makeEntry(3)],
  ]);

  pruneProjectedTrackerDataCache(cache, 3);

  assert.deepEqual([...cache.keys()], [0, 2]);
});

