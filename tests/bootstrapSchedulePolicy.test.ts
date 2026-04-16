import test from "node:test";
import assert from "node:assert/strict";

import { resolveBootstrapScheduleDecision } from "../src/bootstrapSchedulePolicy";

test("resolveBootstrapScheduleDecision schedules once for a new bootstrap target and dedupes repeated refreshes for the same target", () => {
  const first = resolveBootstrapScheduleDecision({
    currentKey: null,
    scopeKey: "chat:alpha",
    decision: {
      targetMessageIndex: 10,
      reason: "missing_latest_ai",
      skippedGreetingBootstrap: false,
    },
  });
  const second = resolveBootstrapScheduleDecision({
    currentKey: first.nextKey,
    scopeKey: "chat:alpha",
    decision: {
      targetMessageIndex: 10,
      reason: "missing_latest_ai",
      skippedGreetingBootstrap: false,
    },
  });

  assert.deepEqual(first, {
    nextKey: "chat:alpha|ai:10",
    shouldSchedule: true,
    targetMessageIndex: 10,
  });
  assert.deepEqual(second, {
    nextKey: "chat:alpha|ai:10",
    shouldSchedule: false,
    targetMessageIndex: 10,
  });
});

test("resolveBootstrapScheduleDecision resets dedupe key when bootstrap target disappears and reschedules when a different target appears", () => {
  const cleared = resolveBootstrapScheduleDecision({
    currentKey: "chat:alpha|ai:10",
    scopeKey: "chat:alpha",
    decision: {
      targetMessageIndex: null,
      reason: null,
      skippedGreetingBootstrap: false,
    },
  });
  const nextTarget = resolveBootstrapScheduleDecision({
    currentKey: cleared.nextKey,
    scopeKey: "chat:alpha",
    decision: {
      targetMessageIndex: 12,
      reason: "missing_latest_ai",
      skippedGreetingBootstrap: false,
    },
  });

  assert.deepEqual(cleared, {
    nextKey: null,
    shouldSchedule: false,
    targetMessageIndex: null,
  });
  assert.deepEqual(nextTarget, {
    nextKey: "chat:alpha|ai:12",
    shouldSchedule: true,
    targetMessageIndex: 12,
  });
});
