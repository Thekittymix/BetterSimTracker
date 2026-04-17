import test from "node:test";
import assert from "node:assert/strict";

import { executeUserTurnReplay, type NormalizedReplayExecution } from "../src/userTurnReplayExecution";

const baseNormalizedReplay: NormalizedReplayExecution = {
  type: "normal",
  options: { automatic_trigger: true },
  dryRun: false,
  forcedAutomaticTrigger: true,
  forcedGroupCharacterId: null,
  skipReplay: false,
  skipReason: null,
};

const baseIntent = {
  type: "normal",
  options: {},
  dryRun: false,
  capturedAt: 123,
} as const;

test("user-turn replay execution resets the gate and replays exactly once on the valid path", () => {
  const events: string[] = [];
  const traces: Array<{ event: string; payload: Record<string, unknown> }> = [];

  executeUserTurnReplay({
    triggerReason: "user_extraction_complete",
    intent: baseIntent,
    replayValidation: { ok: true, reason: "ok" },
    hasGenerate: true,
    normalizedReplay: baseNormalizedReplay,
    pushTrace: (event, payload) => {
      traces.push({ event, payload });
    },
    resetGate: reason => {
      events.push(`reset:${reason}`);
    },
    onReplay: () => {
      events.push("replay");
    },
  });

  assert.deepEqual(events, ["reset:replay_start", "replay"]);
  assert.deepEqual(traces, []);
});

test("user-turn replay execution skips replay and resets the gate when validation fails or replay is unavailable", () => {
  const firstEvents: string[] = [];
  const firstTraces: Array<{ event: string; payload: Record<string, unknown> }> = [];

  executeUserTurnReplay({
    triggerReason: "user_extraction_complete",
    intent: baseIntent,
    replayValidation: { ok: false, reason: "ai_reply_already_present" },
    hasGenerate: true,
    normalizedReplay: baseNormalizedReplay,
    pushTrace: (event, payload) => {
      firstTraces.push({ event, payload });
    },
    resetGate: reason => {
      firstEvents.push(`reset:${reason}`);
    },
    onReplay: () => {
      firstEvents.push("replay");
    },
  });

  assert.deepEqual(firstEvents, ["reset:ai_reply_already_present"]);
  assert.deepEqual(firstTraces.map(trace => trace.event), ["user_gate.replay_skip"]);

  const secondEvents: string[] = [];
  executeUserTurnReplay({
    triggerReason: "user_extraction_complete",
    intent: baseIntent,
    replayValidation: { ok: true, reason: "ok" },
    hasGenerate: true,
    normalizedReplay: {
      ...baseNormalizedReplay,
      skipReplay: true,
      skipReason: "replay_guard",
    },
    pushTrace: () => undefined,
    resetGate: reason => {
      secondEvents.push(`reset:${reason}`);
    },
    onReplay: () => {
      secondEvents.push("replay");
    },
  });

  assert.deepEqual(secondEvents, ["reset:replay_guard"]);
});
