import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveUserTurnRetryDelayMs,
  shouldScheduleImmediateUserTurnExtraction,
  shouldScheduleUserTurnExtractionAfterGenerationEnd,
  shouldDeferUserTurnExtraction,
  USER_MESSAGE_RENDERED_RETRY_REASON,
} from "../src/userTurnExtractionGate";

test("shouldDeferUserTurnExtraction only defers rendered user-turn extraction while generation is still settling", () => {
  assert.equal(
    shouldDeferUserTurnExtraction({
      reason: "USER_MESSAGE_RENDERED",
      userTurnGateActive: true,
      chatGenerationInFlight: true,
      stopGenerationScheduled: false,
    }),
    true,
  );

  assert.equal(
    shouldDeferUserTurnExtraction({
      reason: USER_MESSAGE_RENDERED_RETRY_REASON,
      userTurnGateActive: true,
      chatGenerationInFlight: false,
      stopGenerationScheduled: true,
    }),
    true,
  );

  assert.equal(
    shouldDeferUserTurnExtraction({
      reason: "USER_MESSAGE_RENDERED",
      userTurnGateActive: true,
      chatGenerationInFlight: false,
      stopGenerationScheduled: false,
    }),
    false,
  );

  assert.equal(
    shouldDeferUserTurnExtraction({
      reason: "USER_MESSAGE_EDITED",
      userTurnGateActive: true,
      chatGenerationInFlight: true,
      stopGenerationScheduled: true,
    }),
    false,
  );
});

test("shouldScheduleImmediateUserTurnExtraction waits for generation end when user gate adopted an inflight generation", () => {
  assert.equal(
    shouldScheduleImmediateUserTurnExtraction({
      reason: "USER_MESSAGE_RENDERED",
      adoptedInflightGeneration: true,
    }),
    false,
  );

  assert.equal(
    shouldScheduleImmediateUserTurnExtraction({
      reason: "USER_MESSAGE_RENDERED",
      adoptedInflightGeneration: false,
    }),
    true,
  );

  assert.equal(
    shouldScheduleImmediateUserTurnExtraction({
      reason: "USER_MESSAGE_EDITED",
      adoptedInflightGeneration: true,
    }),
    true,
  );
});

test("shouldScheduleUserTurnExtractionAfterGenerationEnd only resumes user-turn extraction after a gate-stopped generation with no AI render", () => {
  assert.equal(
    shouldScheduleUserTurnExtractionAfterGenerationEnd({
      userTurnGateActive: true,
      chatGenerationSawCharacterRender: false,
    }),
    true,
  );

  assert.equal(
    shouldScheduleUserTurnExtractionAfterGenerationEnd({
      userTurnGateActive: false,
      chatGenerationSawCharacterRender: false,
    }),
    false,
  );

  assert.equal(
    shouldScheduleUserTurnExtractionAfterGenerationEnd({
      userTurnGateActive: true,
      chatGenerationSawCharacterRender: true,
    }),
    false,
  );
});

test("resolveUserTurnRetryDelayMs gives user-turn extraction two delayed retries for retryable failures", () => {
  assert.equal(
    resolveUserTurnRetryDelayMs({
      reason: "USER_MESSAGE_RENDERED",
      retryableFailure: true,
      attempt: 0,
    }),
    500,
  );

  assert.equal(
    resolveUserTurnRetryDelayMs({
      reason: USER_MESSAGE_RENDERED_RETRY_REASON,
      retryableFailure: true,
      attempt: 1,
    }),
    1200,
  );

  assert.equal(
    resolveUserTurnRetryDelayMs({
      reason: USER_MESSAGE_RENDERED_RETRY_REASON,
      retryableFailure: true,
      attempt: 2,
    }),
    null,
  );

  assert.equal(
    resolveUserTurnRetryDelayMs({
      reason: "GENERATION_ENDED",
      retryableFailure: true,
      attempt: 0,
    }),
    null,
  );
});
