import test from "node:test";
import assert from "node:assert/strict";

import { createBootstrapScheduler } from "../src/bootstrapScheduler";

test("bootstrap scheduler schedules only once across repeated refreshes for the same bootstrap target", () => {
  const scheduled: Array<{ reason: string | null; targetMessageIndex: number }> = [];

  const scheduler = createBootstrapScheduler({
    getScopeKey: () => "chat:alpha",
    onSchedule: decision => {
      scheduled.push(decision);
    },
  });

  const sameDecision = {
    targetMessageIndex: 10,
    reason: "missing_latest_ai",
    skippedGreetingBootstrap: false,
  } as const;

  scheduler.applyDecision(sameDecision);
  scheduler.applyDecision(sameDecision);
  scheduler.applyDecision(sameDecision);

  assert.deepEqual(scheduled, [{ reason: "missing_latest_ai", targetMessageIndex: 10 }]);
  assert.equal(scheduler.getCurrentKey(), "chat:alpha|ai:10");
});

test("bootstrap scheduler clears dedupe when bootstrap target disappears and reschedules when a later target appears", () => {
  const scheduled: Array<{ reason: string | null; targetMessageIndex: number }> = [];

  const scheduler = createBootstrapScheduler({
    getScopeKey: () => "chat:alpha",
    onSchedule: decision => {
      scheduled.push(decision);
    },
  });

  scheduler.applyDecision({
    targetMessageIndex: 10,
    reason: "missing_latest_ai",
    skippedGreetingBootstrap: false,
  });
  scheduler.applyDecision({
    targetMessageIndex: null,
    reason: null,
    skippedGreetingBootstrap: false,
  });
  scheduler.applyDecision({
    targetMessageIndex: 12,
    reason: "missing_latest_ai",
    skippedGreetingBootstrap: false,
  });

  assert.deepEqual(scheduled, [
    { reason: "missing_latest_ai", targetMessageIndex: 10 },
    { reason: "missing_latest_ai", targetMessageIndex: 12 },
  ]);
  assert.equal(scheduler.getCurrentKey(), "chat:alpha|ai:12");
});
