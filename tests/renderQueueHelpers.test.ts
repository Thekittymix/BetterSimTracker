import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRenderPassSnapshot,
  computeManualPlaceholderMessageIndices,
  getCachedProjectedTrackerData,
  pruneProjectedTrackerDataCache,
  resolveDirtyRenderStart,
} from "../src/renderQueueHelpers";
import type { ProjectedTrackerDataCacheEntry, RenderPassSnapshot } from "../src/renderQueueHelpers";

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

function buildPassSnapshot(
  entries: Array<{ messageIndex: number; data: any | null; recovery?: any | null }>,
  overrides?: Partial<{
    settings: any;
    allCharacters: string[];
    isGroupChat: boolean;
    uiState: { phase: "idle" | "extracting" | "generating"; done: number; total: number; messageIndex: number | null; stepLabel: string | null };
    summaryBusyMessageIndices: Set<number>;
    isUserMessageIndex: (messageIndex: number) => boolean;
  }>,
): RenderPassSnapshot {
  return buildRenderPassSnapshot(entries, {
    settings: overrides?.settings ?? { entityTrackingMode: "dynamic_characters", collapseCardsByDefault: false },
    allCharacters: overrides?.allCharacters ?? ["Candy", "Lisa"],
    isGroupChat: overrides?.isGroupChat ?? false,
    uiState: overrides?.uiState ?? { phase: "idle", done: 0, total: 0, messageIndex: null, stepLabel: null },
    summaryBusyMessageIndices: overrides?.summaryBusyMessageIndices,
    isUserMessageIndex: overrides?.isUserMessageIndex,
  });
}

test("resolveDirtyRenderStart returns null when the render pass inputs are unchanged", () => {
  const data7 = { timestamp: 7 } as any;
  const data8 = { timestamp: 8 } as any;
  const previous = buildPassSnapshot([
    { messageIndex: 7, data: data7 },
    { messageIndex: 8, data: data8 },
  ]);
  const next = buildPassSnapshot([
    { messageIndex: 7, data: data7 },
    { messageIndex: 8, data: data8 },
  ]);

  assert.equal(resolveDirtyRenderStart(previous, next), null);
});

test("resolveDirtyRenderStart returns the changed message index when one tracked payload ref changes", () => {
  const data7 = { timestamp: 7 } as any;
  const data8 = { timestamp: 8 } as any;
  const nextData8 = { timestamp: 9 } as any;
  const previous = buildPassSnapshot([
    { messageIndex: 7, data: data7 },
    { messageIndex: 8, data: data8 },
  ]);
  const next = buildPassSnapshot([
    { messageIndex: 7, data: data7 },
    { messageIndex: 8, data: nextData8 },
  ]);

  assert.equal(resolveDirtyRenderStart(previous, next), 8);
});

test("resolveDirtyRenderStart backtracks to the previous latest tracked message when a new later entry is added", () => {
  const data9 = { timestamp: 9 } as any;
  const data10 = { timestamp: 10 } as any;
  const data11 = { timestamp: 11 } as any;
  const previous = buildPassSnapshot([
    { messageIndex: 9, data: data9 },
    { messageIndex: 10, data: data10 },
  ]);
  const next = buildPassSnapshot([
    { messageIndex: 9, data: data9 },
    { messageIndex: 10, data: data10 },
    { messageIndex: 11, data: data11 },
  ]);

  assert.equal(resolveDirtyRenderStart(previous, next), 10);
});

test("resolveDirtyRenderStart returns the earliest removed index when a tracked entry disappears", () => {
  const data7 = { timestamp: 7 } as any;
  const data8 = { timestamp: 8 } as any;
  const previous = buildPassSnapshot([
    { messageIndex: 7, data: data7 },
    { messageIndex: 8, data: data8 },
  ]);
  const next = buildPassSnapshot([
    { messageIndex: 8, data: data8 },
  ]);

  assert.equal(resolveDirtyRenderStart(previous, next), 7);
});

test("resolveDirtyRenderStart returns 0 when the global render config changes", () => {
  const data7 = { timestamp: 7 } as any;
  const previous = buildPassSnapshot([{ messageIndex: 7, data: data7 }], {
    settings: { entityTrackingMode: "dynamic_characters", showInactive: false },
  });
  const next = buildPassSnapshot([{ messageIndex: 7, data: data7 }], {
    settings: { entityTrackingMode: "dynamic_characters", showInactive: true },
  });

  assert.equal(resolveDirtyRenderStart(previous, next), 0);
});

test("resolveDirtyRenderStart marks the busy message when summary loading moves", () => {
  const data10 = { timestamp: 10 } as any;
  const previous = buildPassSnapshot([{ messageIndex: 10, data: data10 }], {
    summaryBusyMessageIndices: new Set([10]),
  });
  const next = buildPassSnapshot([{ messageIndex: 10, data: data10 }], {
    summaryBusyMessageIndices: new Set(),
  });

  assert.equal(resolveDirtyRenderStart(previous, next), 10);
});

