import test from "node:test";
import assert from "node:assert/strict";

import { shouldQueueRenderAfterRefresh, type RefreshRenderSnapshot } from "../src/refreshRenderPolicy";

function makeSnapshot(overrides?: Partial<RefreshRenderSnapshot>): RefreshRenderSnapshot {
  return {
    settingsRef: {} as object,
    latestDataRef: {} as object,
    latestDataMessageIndex: 10,
    lastTrackableIndex: 10,
    source: "history",
    recoveryKey: "",
    uiPhase: "idle",
    uiMessageIndex: 10,
    allCharactersKey: "Candy|Lisa",
    chatLength: 11,
    groupId: null,
    characterId: "1",
    ...overrides,
  };
}

test("shouldQueueRenderAfterRefresh returns false when refresh-visible inputs are unchanged", () => {
  const settingsRef = {};
  const dataRef = {};
  const previous = makeSnapshot({ settingsRef, latestDataRef: dataRef });
  const next = makeSnapshot({ settingsRef, latestDataRef: dataRef });

  assert.equal(shouldQueueRenderAfterRefresh(previous, next), false);
});

test("shouldQueueRenderAfterRefresh returns true when any render-relevant refresh input changes", () => {
  const base = makeSnapshot();
  assert.equal(shouldQueueRenderAfterRefresh(base, makeSnapshot({ latestDataMessageIndex: 11 })), true);
  assert.equal(shouldQueueRenderAfterRefresh(base, makeSnapshot({ source: "fallback" })), true);
  assert.equal(shouldQueueRenderAfterRefresh(base, makeSnapshot({ recoveryKey: "1:error" })), true);
  assert.equal(shouldQueueRenderAfterRefresh(base, makeSnapshot({ uiPhase: "extracting" })), true);
  assert.equal(shouldQueueRenderAfterRefresh(base, makeSnapshot({ allCharactersKey: "Candy|Lisa|Marylyn" })), true);
});

