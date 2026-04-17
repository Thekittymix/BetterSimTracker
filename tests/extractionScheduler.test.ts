import test from "node:test";
import assert from "node:assert/strict";

import { createExtractionScheduler } from "../src/extractionScheduler";

test("extraction scheduler keeps only one pending same-target extraction and fires the surviving request", () => {
  const scheduled = new Map<number, () => void>();
  const fired: Array<{ reason: string; targetMessageIndex: number | null }> = [];
  const skipped: Array<{ reason: string; targetMessageIndex: number | null }> = [];
  let nextId = 1;

  const scheduler = createExtractionScheduler({
    now: () => 1000,
    timers: {
      setTimeout(fn) {
        const id = nextId++;
        scheduled.set(id, fn);
        return id;
      },
      clearTimeout(id) {
        scheduled.delete(id);
      },
    },
    onFire: (reason, targetMessageIndex) => {
      fired.push({ reason, targetMessageIndex });
    },
    onSkip: (reason, targetMessageIndex) => {
      skipped.push({ reason, targetMessageIndex });
    },
  });

  scheduler.schedule("GENERATION_ENDED", 10, 2000);
  scheduler.schedule("GENERATION_ENDED_LATE_RENDER", 10, 2500);

  assert.equal(scheduled.size, 1);
  assert.deepEqual(skipped, [{ reason: "GENERATION_ENDED_LATE_RENDER", targetMessageIndex: 10 }]);

  const [fire] = [...scheduled.values()];
  fire();

  assert.deepEqual(fired, [{ reason: "GENERATION_ENDED", targetMessageIndex: 10 }]);
  assert.equal(scheduler.getPendingSchedule(), null);
});

test("extraction scheduler replaces a general pending latest-message request with a faster explicit target", () => {
  const scheduled = new Map<number, () => void>();
  const fired: Array<{ reason: string; targetMessageIndex: number | null }> = [];
  let nextId = 1;

  const scheduler = createExtractionScheduler({
    now: () => 1000,
    timers: {
      setTimeout(fn) {
        const id = nextId++;
        scheduled.set(id, fn);
        return id;
      },
      clearTimeout(id) {
        scheduled.delete(id);
      },
    },
    onFire: (reason, targetMessageIndex) => {
      fired.push({ reason, targetMessageIndex });
    },
  });

  scheduler.schedule("GENERATION_ENDED", undefined, 2000);
  scheduler.schedule("GENERATION_ENDED_LATE_RENDER", 10, 180);

  assert.equal(scheduled.size, 1);
  assert.deepEqual(scheduler.getPendingSchedule(), {
    reason: "GENERATION_ENDED_LATE_RENDER",
    targetMessageIndex: 10,
    dueAt: 1180,
  });

  const [fire] = [...scheduled.values()];
  fire();

  assert.deepEqual(fired, [{ reason: "GENERATION_ENDED_LATE_RENDER", targetMessageIndex: 10 }]);
});
