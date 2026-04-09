import test from "node:test";
import assert from "node:assert/strict";

import { shouldReplayUserTurnAfterExtraction } from "../src/extractionContinuationPolicy";

test("user-turn replay continues only after a successful user extraction", () => {
  assert.equal(
    shouldReplayUserTurnAfterExtraction({
      userExtraction: true,
      retryScheduled: false,
      userTurnGateActive: true,
      extractionSucceeded: true,
    }),
    true,
  );
});

test("user-turn replay does not continue after a failed extraction", () => {
  assert.equal(
    shouldReplayUserTurnAfterExtraction({
      userExtraction: true,
      retryScheduled: false,
      userTurnGateActive: true,
      extractionSucceeded: false,
    }),
    false,
  );
});

test("user-turn replay does not continue when a retry was scheduled", () => {
  assert.equal(
    shouldReplayUserTurnAfterExtraction({
      userExtraction: true,
      retryScheduled: true,
      userTurnGateActive: true,
      extractionSucceeded: true,
    }),
    false,
  );
});

test("user-turn replay stays off for non-user extractions or inactive gates", () => {
  assert.equal(
    shouldReplayUserTurnAfterExtraction({
      userExtraction: false,
      retryScheduled: false,
      userTurnGateActive: true,
      extractionSucceeded: true,
    }),
    false,
  );
  assert.equal(
    shouldReplayUserTurnAfterExtraction({
      userExtraction: true,
      retryScheduled: false,
      userTurnGateActive: false,
      extractionSucceeded: true,
    }),
    false,
  );
});
