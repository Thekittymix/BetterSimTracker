import test from "node:test";
import assert from "node:assert/strict";

import { resolveExtractionFailurePolicy } from "../src/extractionFailurePolicy";

test("manual refresh API failure schedules exactly one retry", () => {
  const next = resolveExtractionFailurePolicy({
    reason: "manual_refresh",
    message: "API request failed with status code 502",
    hadTrackerAtStart: true,
    isUserExtraction: true,
  });

  assert.deepEqual(next, {
    shouldRetry: true,
    retryReason: "manual_refresh_retry",
    shouldSetRecovery: false,
    shouldResetUserTurnGate: false,
    retryKind: "retryable_api_failure",
  });
});

test("manual refresh retry failure stops retrying and resets the user turn gate", () => {
  const next = resolveExtractionFailurePolicy({
    reason: "manual_refresh_retry",
    message: "API request failed with status code 502",
    hadTrackerAtStart: false,
    isUserExtraction: true,
  });

  assert.deepEqual(next, {
    shouldRetry: false,
    retryReason: null,
    shouldSetRecovery: true,
    shouldResetUserTurnGate: true,
    retryKind: null,
  });
});

test("empty generator output is treated as a retryable first-pass extraction failure", () => {
  const next = resolveExtractionFailurePolicy({
    reason: "AUTO_BOOTSTRAP_MISSING_TRACKER",
    message: "Generator returned empty output",
    hadTrackerAtStart: false,
    isUserExtraction: false,
  });

  assert.deepEqual(next, {
    shouldRetry: true,
    retryReason: "AUTO_BOOTSTRAP_MISSING_TRACKER_CONTINUE",
    shouldSetRecovery: false,
    shouldResetUserTurnGate: false,
    retryKind: "empty_generator_output",
  });
});

test("final non-user extraction failure does not reset the user turn gate", () => {
  const next = resolveExtractionFailurePolicy({
    reason: "GENERATION_ENDED",
    message: "API request failed with status code 503",
    hadTrackerAtStart: false,
    isUserExtraction: false,
  });

  assert.deepEqual(next, {
    shouldRetry: false,
    retryReason: null,
    shouldSetRecovery: true,
    shouldResetUserTurnGate: false,
    retryKind: null,
  });
});
