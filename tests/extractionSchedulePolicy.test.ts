import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveExtractionScheduleDecision,
  type PendingExtractionSchedule,
} from "../src/extractionSchedulePolicy";

test("resolveExtractionScheduleDecision schedules when no extraction is pending", () => {
  const result = resolveExtractionScheduleDecision(null, {
    reason: "GENERATION_ENDED",
    targetMessageIndex: 10,
    delay: 2000,
  }, 1000);

  assert.equal(result.action, "schedule");
  assert.deepEqual(result.nextPending, {
    reason: "GENERATION_ENDED",
    targetMessageIndex: 10,
    dueAt: 3000,
  });
});

test("resolveExtractionScheduleDecision skips an identical pending extraction when the existing one fires sooner", () => {
  const current: PendingExtractionSchedule = {
    reason: "GENERATION_ENDED",
    targetMessageIndex: 10,
    dueAt: 2500,
  };
  const result = resolveExtractionScheduleDecision(current, {
    reason: "GENERATION_ENDED",
    targetMessageIndex: 10,
    delay: 2000,
  }, 1000);

  assert.equal(result.action, "skip");
  assert.deepEqual(result.nextPending, current);
});

test("resolveExtractionScheduleDecision replaces an identical pending extraction when the new one fires sooner", () => {
  const current: PendingExtractionSchedule = {
    reason: "GENERATION_ENDED",
    targetMessageIndex: 10,
    dueAt: 4000,
  };
  const result = resolveExtractionScheduleDecision(current, {
    reason: "GENERATION_ENDED",
    targetMessageIndex: 10,
    delay: 500,
  }, 1000);

  assert.equal(result.action, "replace");
  assert.deepEqual(result.nextPending, {
    reason: "GENERATION_ENDED",
    targetMessageIndex: 10,
    dueAt: 1500,
  });
});

test("resolveExtractionScheduleDecision keeps the earlier pending extraction for the same target even when the reason differs", () => {
  const current: PendingExtractionSchedule = {
    reason: "GENERATION_ENDED",
    targetMessageIndex: 10,
    dueAt: 3000,
  };
  const differentReason = resolveExtractionScheduleDecision(current, {
    reason: "GENERATION_ENDED_LATE_RENDER",
    targetMessageIndex: 10,
    delay: 2500,
  }, 1000);

  assert.equal(differentReason.action, "skip");
  assert.deepEqual(differentReason.nextPending, current);
});

test("resolveExtractionScheduleDecision replaces with a faster pending extraction for the same target even when the reason differs", () => {
  const current: PendingExtractionSchedule = {
    reason: "GENERATION_ENDED",
    targetMessageIndex: 10,
    dueAt: 3000,
  };
  const differentReason = resolveExtractionScheduleDecision(current, {
    reason: "GENERATION_ENDED_LATE_RENDER",
    targetMessageIndex: 10,
    delay: 180,
  }, 1000);

  assert.equal(differentReason.action, "replace");
  assert.deepEqual(differentReason.nextPending, {
    reason: "GENERATION_ENDED_LATE_RENDER",
    targetMessageIndex: 10,
    dueAt: 1180,
  });
});

test("resolveExtractionScheduleDecision still replaces a different target", () => {
  const current: PendingExtractionSchedule = {
    reason: "GENERATION_ENDED",
    targetMessageIndex: 10,
    dueAt: 3000,
  };
  const differentTarget = resolveExtractionScheduleDecision(current, {
    reason: "GENERATION_ENDED",
    targetMessageIndex: 11,
    delay: 180,
  }, 1000);

  assert.equal(differentTarget.action, "replace");
});

test("resolveExtractionScheduleDecision keeps an earlier explicit target over a later general latest-message schedule", () => {
  const current: PendingExtractionSchedule = {
    reason: "AUTO_BOOTSTRAP_MISSING_TRACKER",
    targetMessageIndex: 10,
    dueAt: 1140,
  };
  const generalLatest = resolveExtractionScheduleDecision(current, {
    reason: "GENERATION_ENDED",
    targetMessageIndex: null,
    delay: 2000,
  }, 1000);

  assert.equal(generalLatest.action, "skip");
  assert.deepEqual(generalLatest.nextPending, current);
});

test("resolveExtractionScheduleDecision replaces a general latest-message schedule with a more explicit target", () => {
  const current: PendingExtractionSchedule = {
    reason: "GENERATION_ENDED",
    targetMessageIndex: null,
    dueAt: 3000,
  };
  const explicitTarget = resolveExtractionScheduleDecision(current, {
    reason: "GENERATION_ENDED_LATE_RENDER",
    targetMessageIndex: 10,
    delay: 180,
  }, 1000);

  assert.equal(explicitTarget.action, "replace");
  assert.deepEqual(explicitTarget.nextPending, {
    reason: "GENERATION_ENDED_LATE_RENDER",
    targetMessageIndex: 10,
    dueAt: 1180,
  });
});
