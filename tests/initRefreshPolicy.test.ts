import test from "node:test";
import assert from "node:assert/strict";

import { shouldRunDeferredInitRefresh, type DeferredInitRefreshState } from "../src/initRefreshPolicy";

function makeState(overrides?: Partial<DeferredInitRefreshState>): DeferredInitRefreshState {
  return {
    enabled: true,
    isExtracting: false,
    chatGenerationInFlight: false,
    pendingLateRenderExtraction: false,
    latestDataMessageIndex: null,
    lastTrackableIndex: 10,
    uiPhase: "idle",
    ...overrides,
  };
}

test("shouldRunDeferredInitRefresh retries only when init is still behind the latest trackable message", () => {
  assert.equal(shouldRunDeferredInitRefresh(makeState()), true);
  assert.equal(shouldRunDeferredInitRefresh(makeState({ latestDataMessageIndex: 8 })), true);
  assert.equal(shouldRunDeferredInitRefresh(makeState({ latestDataMessageIndex: 10 })), false);
  assert.equal(shouldRunDeferredInitRefresh(makeState({ latestDataMessageIndex: 12 })), false);
});

test("shouldRunDeferredInitRefresh skips deferred retries when runtime is already busy or there is nothing trackable", () => {
  assert.equal(shouldRunDeferredInitRefresh(makeState({ enabled: false })), false);
  assert.equal(shouldRunDeferredInitRefresh(makeState({ isExtracting: true })), false);
  assert.equal(shouldRunDeferredInitRefresh(makeState({ chatGenerationInFlight: true })), false);
  assert.equal(shouldRunDeferredInitRefresh(makeState({ pendingLateRenderExtraction: true })), false);
  assert.equal(shouldRunDeferredInitRefresh(makeState({ uiPhase: "extracting" })), false);
  assert.equal(shouldRunDeferredInitRefresh(makeState({ uiPhase: "generating" })), false);
  assert.equal(shouldRunDeferredInitRefresh(makeState({ lastTrackableIndex: null })), false);
});
