import test from "node:test";
import assert from "node:assert/strict";

import { createLateRenderRecoveryController } from "../src/lateRenderRecovery";

test("late render recovery schedules one late-render extraction and clears pending state before poll fires", () => {
  const scheduledTimers = new Map<number, () => void>();
  const scheduledExtractions: Array<{ reason: string; messageIndex: number; delay: number }> = [];
  let nextTimerId = 1;
  let pendingState = { pending: false, startLastAiIndex: null as number | null };

  const controller = createLateRenderRecoveryController({
    timers: {
      setTimeout(fn) {
        const id = nextTimerId++;
        scheduledTimers.set(id, fn);
        return id;
      },
      clearTimeout(id) {
        scheduledTimers.delete(id);
      },
    },
    getPendingState: () => pendingState,
    setPendingState: next => {
      pendingState = next;
    },
    isGenerationInFlight: () => false,
    isExtracting: () => false,
    getCurrentLastAiIndex: () => 6,
    hasTrackableTargetAt: messageIndex => messageIndex === 6,
    onScheduleExtraction: (reason, messageIndex, delay) => {
      scheduledExtractions.push({ reason, messageIndex, delay });
    },
  });

  controller.begin(5);
  controller.handleCharacterMessageRendered();

  assert.deepEqual(scheduledExtractions, [
    { reason: "GENERATION_ENDED_LATE_RENDER", messageIndex: 6, delay: 180 },
  ]);
  assert.deepEqual(pendingState, { pending: false, startLastAiIndex: null });

  const [poll] = [...scheduledTimers.values()];
  poll?.();

  assert.equal(scheduledExtractions.length, 1);
});

test("late render recovery falls back to late-poll extraction when render never arrives", () => {
  const scheduledTimers = new Map<number, () => void>();
  const scheduledExtractions: Array<{ reason: string; messageIndex: number; delay: number }> = [];
  let nextTimerId = 1;
  let pendingState = { pending: false, startLastAiIndex: null as number | null };

  const controller = createLateRenderRecoveryController({
    timers: {
      setTimeout(fn) {
        const id = nextTimerId++;
        scheduledTimers.set(id, fn);
        return id;
      },
      clearTimeout(id) {
        scheduledTimers.delete(id);
      },
    },
    getPendingState: () => pendingState,
    setPendingState: next => {
      pendingState = next;
    },
    isGenerationInFlight: () => false,
    isExtracting: () => false,
    getCurrentLastAiIndex: () => 6,
    hasTrackableTargetAt: messageIndex => messageIndex === 6,
    onScheduleExtraction: (reason, messageIndex, delay) => {
      scheduledExtractions.push({ reason, messageIndex, delay });
    },
  });

  controller.begin(5);

  const [poll] = [...scheduledTimers.values()];
  poll?.();

  assert.deepEqual(scheduledExtractions, [
    { reason: "GENERATION_ENDED_LATE_POLL", messageIndex: 6, delay: 80 },
  ]);
  assert.deepEqual(pendingState, { pending: false, startLastAiIndex: null });
});
