import test from "node:test";
import assert from "node:assert/strict";

import { resolveAutoBootstrapTarget } from "../src/bootstrapTargets";

test("resolveAutoBootstrapTarget prioritizes a missing greeting AI tracker before later AI messages", () => {
  const result = resolveAutoBootstrapTarget({
    enabled: true,
    isExtracting: false,
    chatGenerationInFlight: false,
    pendingLateRenderExtraction: false,
    latestTrackableIndex: 2,
    latestDataMessageIndex: 2,
    highestStoredMessageIndex: 2,
    generateOnGreetingMessages: true,
    chatLength: 3,
    isTrackableAiAt: index => index === 0 || index === 2,
    hasTrackerAt: index => index === 2,
    hasStoppedRecoveryAt: () => false,
    hasPriorTrackableUserAt: index => index > 0,
  });

  assert.deepEqual(result, {
    targetMessageIndex: 0,
    reason: "missing_greeting_ai",
    skippedGreetingBootstrap: false,
  });
});

test("resolveAutoBootstrapTarget can skip missing greeting bootstrap when greeting generation is disabled", () => {
  const result = resolveAutoBootstrapTarget({
    enabled: true,
    isExtracting: false,
    chatGenerationInFlight: false,
    pendingLateRenderExtraction: false,
    latestTrackableIndex: 2,
    latestDataMessageIndex: 2,
    highestStoredMessageIndex: 2,
    generateOnGreetingMessages: false,
    chatLength: 3,
    isTrackableAiAt: index => index === 0 || index === 2,
    hasTrackerAt: index => index === 2,
    hasStoppedRecoveryAt: () => false,
    hasPriorTrackableUserAt: index => index > 0,
  });

  assert.deepEqual(result, {
    targetMessageIndex: null,
    reason: null,
    skippedGreetingBootstrap: true,
  });
});

test("resolveAutoBootstrapTarget falls back to the latest missing AI tracker when no greeting bootstrap is pending", () => {
  const result = resolveAutoBootstrapTarget({
    enabled: true,
    isExtracting: false,
    chatGenerationInFlight: false,
    pendingLateRenderExtraction: false,
    latestTrackableIndex: 4,
    latestDataMessageIndex: 2,
    highestStoredMessageIndex: 4,
    generateOnGreetingMessages: true,
    chatLength: 5,
    isTrackableAiAt: index => index === 2 || index === 4,
    hasTrackerAt: index => index === 2,
    hasStoppedRecoveryAt: () => false,
    hasPriorTrackableUserAt: () => true,
  });

  assert.deepEqual(result, {
    targetMessageIndex: 4,
    reason: "missing_latest_ai",
    skippedGreetingBootstrap: false,
  });
});

test("resolveAutoBootstrapTarget does not backfill a greeting while stored trackers are ahead of partial hydration", () => {
  const result = resolveAutoBootstrapTarget({
    enabled: true,
    isExtracting: false,
    chatGenerationInFlight: false,
    pendingLateRenderExtraction: false,
    latestTrackableIndex: 0,
    latestDataMessageIndex: null,
    highestStoredMessageIndex: 6,
    generateOnGreetingMessages: true,
    chatLength: 1,
    isTrackableAiAt: index => index === 0,
    hasTrackerAt: () => false,
    hasStoppedRecoveryAt: () => false,
    hasPriorTrackableUserAt: () => false,
  });

  assert.deepEqual(result, {
    targetMessageIndex: null,
    reason: null,
    skippedGreetingBootstrap: false,
  });
});

test("resolveAutoBootstrapTarget does not reschedule a missing AI message that has a stopped recovery", () => {
  const result = resolveAutoBootstrapTarget({
    enabled: true,
    isExtracting: false,
    chatGenerationInFlight: false,
    pendingLateRenderExtraction: false,
    latestTrackableIndex: 4,
    latestDataMessageIndex: 2,
    highestStoredMessageIndex: 4,
    generateOnGreetingMessages: true,
    chatLength: 5,
    isTrackableAiAt: index => index === 2 || index === 4,
    hasTrackerAt: index => index === 2,
    hasStoppedRecoveryAt: index => index === 4,
    hasPriorTrackableUserAt: () => true,
  });

  assert.deepEqual(result, {
    targetMessageIndex: null,
    reason: null,
    skippedGreetingBootstrap: false,
  });
});
