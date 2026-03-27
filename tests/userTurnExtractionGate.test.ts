import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldAdoptInflightGenerationForUserTurn,
  isRetryableUserTurnReplayFailure,
  resolveUserTurnReplayRetryDelayMs,
  resolveUserTurnRetryDelayMs,
  shouldIssueUserTurnGateStop,
  shouldAwaitUserMessageRenderedExtraction,
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
      awaitedUserMessageRenderExtraction: false,
    }),
    true,
  );

  assert.equal(
    shouldDeferUserTurnExtraction({
      reason: USER_MESSAGE_RENDERED_RETRY_REASON,
      userTurnGateActive: true,
      chatGenerationInFlight: false,
      stopGenerationScheduled: true,
      awaitedUserMessageRenderExtraction: false,
    }),
    true,
  );

  assert.equal(
    shouldDeferUserTurnExtraction({
      reason: "USER_MESSAGE_RENDERED",
      userTurnGateActive: true,
      chatGenerationInFlight: false,
      stopGenerationScheduled: false,
      awaitedUserMessageRenderExtraction: false,
    }),
    false,
  );

  assert.equal(
    shouldDeferUserTurnExtraction({
      reason: "USER_MESSAGE_EDITED",
      userTurnGateActive: true,
      chatGenerationInFlight: true,
      stopGenerationScheduled: true,
      awaitedUserMessageRenderExtraction: false,
    }),
    false,
  );

  assert.equal(
    shouldDeferUserTurnExtraction({
      reason: "USER_MESSAGE_RENDERED",
      userTurnGateActive: true,
      chatGenerationInFlight: true,
      stopGenerationScheduled: false,
      awaitedUserMessageRenderExtraction: true,
    }),
    false,
  );
});

test("shouldAwaitUserMessageRenderedExtraction only blocks generation while rendered user-turn extraction is still in the awaited pre-AI window", () => {
  assert.equal(
    shouldAwaitUserMessageRenderedExtraction({
      reason: "USER_MESSAGE_RENDERED",
      userTurnGateActive: true,
      chatGenerationInFlight: true,
      chatGenerationSawCharacterRender: false,
    }),
    true,
  );

  assert.equal(
    shouldAwaitUserMessageRenderedExtraction({
      reason: "USER_MESSAGE_RENDERED",
      userTurnGateActive: true,
      chatGenerationInFlight: true,
      chatGenerationSawCharacterRender: true,
    }),
    false,
  );

  assert.equal(
    shouldAwaitUserMessageRenderedExtraction({
      reason: "USER_MESSAGE_RENDERED",
      userTurnGateActive: false,
      chatGenerationInFlight: true,
      chatGenerationSawCharacterRender: false,
    }),
    false,
  );

  assert.equal(
    shouldAwaitUserMessageRenderedExtraction({
      reason: USER_MESSAGE_RENDERED_RETRY_REASON,
      userTurnGateActive: true,
      chatGenerationInFlight: true,
      chatGenerationSawCharacterRender: false,
    }),
    false,
  );
});

test("shouldIssueUserTurnGateStop only allows one stop request per active gate", () => {
  assert.equal(
    shouldIssueUserTurnGateStop({
      userTurnGateActive: true,
      stopGenerationScheduled: false,
      stopAlreadyIssued: false,
    }),
    true,
  );

  assert.equal(
    shouldIssueUserTurnGateStop({
      userTurnGateActive: true,
      stopGenerationScheduled: true,
      stopAlreadyIssued: false,
    }),
    false,
  );

  assert.equal(
    shouldIssueUserTurnGateStop({
      userTurnGateActive: true,
      stopGenerationScheduled: false,
      stopAlreadyIssued: true,
    }),
    false,
  );

  assert.equal(
    shouldIssueUserTurnGateStop({
      userTurnGateActive: false,
      stopGenerationScheduled: false,
      stopAlreadyIssued: false,
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

test("shouldAdoptInflightGenerationForUserTurn only reclaims USER_MESSAGE_RENDERED generations before any AI render lands", () => {
  assert.equal(
    shouldAdoptInflightGenerationForUserTurn({
      reason: "USER_MESSAGE_RENDERED",
      chatGenerationInFlight: true,
      chatGenerationSawCharacterRender: false,
    }),
    true,
  );

  assert.equal(
    shouldAdoptInflightGenerationForUserTurn({
      reason: "USER_MESSAGE_RENDERED",
      chatGenerationInFlight: false,
      chatGenerationSawCharacterRender: false,
    }),
    false,
  );

  assert.equal(
    shouldAdoptInflightGenerationForUserTurn({
      reason: "USER_MESSAGE_RENDERED",
      chatGenerationInFlight: true,
      chatGenerationSawCharacterRender: true,
    }),
    false,
  );

  assert.equal(
    shouldAdoptInflightGenerationForUserTurn({
      reason: "USER_MESSAGE_EDITED",
      chatGenerationInFlight: true,
      chatGenerationSawCharacterRender: false,
    }),
    false,
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

test("user-turn replay retry helpers only retry transient backend failures", () => {
  assert.equal(isRetryableUserTurnReplayFailure("Proxy connection closed unexpectedly"), true);
  assert.equal(isRetryableUserTurnReplayFailure("{\"statusCode\":500,\"message\":\"Servers restarting\"}"), true);
  assert.equal(isRetryableUserTurnReplayFailure("Validation failed"), false);

  assert.equal(resolveUserTurnReplayRetryDelayMs({ retryableFailure: true, attempt: 0 }), 700);
  assert.equal(resolveUserTurnReplayRetryDelayMs({ retryableFailure: true, attempt: 1 }), 1600);
  assert.equal(resolveUserTurnReplayRetryDelayMs({ retryableFailure: true, attempt: 2 }), null);
  assert.equal(resolveUserTurnReplayRetryDelayMs({ retryableFailure: false, attempt: 0 }), null);
});
