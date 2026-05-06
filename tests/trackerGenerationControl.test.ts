import test from "node:test";
import assert from "node:assert/strict";

import { cancelTrackerGenerationFlow } from "../src/trackerGenerationControl";

test("cancelTrackerGenerationFlow stop cancels active and queued tracker work without resetting bootstrap scheduler", () => {
  const cancelledExtractionRuns = new Set<number>();
  const calls = {
    clearPendingSwipeExtraction: 0,
    clearLateRenderRecovery: 0,
    resetUserTurnGate: [] as string[],
    resetBootstrapScheduler: 0,
  };

  const result = cancelTrackerGenerationFlow({
    mode: "stop",
    activeExtractionRunId: 42,
    cancelledExtractionRuns,
    cancelActiveGenerations: () => 3,
    cancelPendingExtractionSchedule: () => ({
      reason: "GENERATION_ENDED",
      targetMessageIndex: 8,
      dueAt: 1500,
    }),
    clearPendingSwipeExtraction: () => {
      calls.clearPendingSwipeExtraction += 1;
    },
    clearLateRenderRecovery: () => {
      calls.clearLateRenderRecovery += 1;
    },
    resetUserTurnGate: reason => {
      calls.resetUserTurnGate.push(reason);
    },
    resetBootstrapScheduler: () => {
      calls.resetBootstrapScheduler += 1;
    },
  });

  assert.deepEqual([...cancelledExtractionRuns], [42]);
  assert.equal(result.canceledRunId, 42);
  assert.equal(result.canceledRequests, 3);
  assert.deepEqual(result.pendingSchedule, {
    reason: "GENERATION_ENDED",
    targetMessageIndex: 8,
    dueAt: 1500,
  });
  assert.equal(result.userTurnGateResetReason, "tracker_generation_stopped");
  assert.equal(result.bootstrapSchedulerReset, false);
  assert.equal(calls.clearPendingSwipeExtraction, 1);
  assert.equal(calls.clearLateRenderRecovery, 1);
  assert.deepEqual(calls.resetUserTurnGate, ["tracker_generation_stopped"]);
  assert.equal(calls.resetBootstrapScheduler, 0);
});

test("cancelTrackerGenerationFlow disable also resets bootstrap scheduling state", () => {
  const cancelledExtractionRuns = new Set<number>();
  let resetBootstrapSchedulerCalls = 0;

  const result = cancelTrackerGenerationFlow({
    mode: "disable",
    activeExtractionRunId: null,
    cancelledExtractionRuns,
    cancelActiveGenerations: () => 0,
    cancelPendingExtractionSchedule: () => null,
    clearPendingSwipeExtraction: () => undefined,
    clearLateRenderRecovery: () => undefined,
    resetUserTurnGate: () => undefined,
    resetBootstrapScheduler: () => {
      resetBootstrapSchedulerCalls += 1;
    },
  });

  assert.deepEqual([...cancelledExtractionRuns], []);
  assert.equal(result.canceledRunId, null);
  assert.equal(result.canceledRequests, 0);
  assert.equal(result.pendingSchedule, null);
  assert.equal(result.userTurnGateResetReason, "extension_disabled");
  assert.equal(result.bootstrapSchedulerReset, true);
  assert.equal(resetBootstrapSchedulerCalls, 1);
});
