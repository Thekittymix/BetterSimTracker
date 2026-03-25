import test from "node:test";
import assert from "node:assert/strict";

import {
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
