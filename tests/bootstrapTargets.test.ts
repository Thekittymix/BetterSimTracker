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
    generateOnGreetingMessages: true,
    chatLength: 3,
    isTrackableAiAt: index => index === 0 || index === 2,
    hasTrackerAt: index => index === 2,
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
    generateOnGreetingMessages: false,
    chatLength: 3,
    isTrackableAiAt: index => index === 0 || index === 2,
    hasTrackerAt: index => index === 2,
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
    generateOnGreetingMessages: true,
    chatLength: 5,
    isTrackableAiAt: index => index === 2 || index === 4,
    hasTrackerAt: index => index === 2,
    hasPriorTrackableUserAt: () => true,
  });

  assert.deepEqual(result, {
    targetMessageIndex: 4,
    reason: "missing_latest_ai",
    skippedGreetingBootstrap: false,
  });
});
