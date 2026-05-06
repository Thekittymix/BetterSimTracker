import {
  resolveExtractionScheduleDecision,
  type PendingExtractionSchedule,
} from "./extractionSchedulePolicy";

type TimerApi = {
  setTimeout: (fn: () => void, delay?: number) => number;
  clearTimeout: (id: number) => void;
};

export function createExtractionScheduler(input: {
  now?: () => number;
  timers: TimerApi;
  onFire: (reason: string, targetMessageIndex: number | null) => void;
  onSkip?: (reason: string, targetMessageIndex: number | null) => void;
}): {
  schedule: (reason: string, targetMessageIndex?: number, delay?: number) => void;
  cancel: () => PendingExtractionSchedule | null;
  getPendingSchedule: () => PendingExtractionSchedule | null;
} {
  const now = input.now ?? (() => Date.now());
  let extractionTimer: number | null = null;
  let pendingExtractionSchedule: PendingExtractionSchedule | null = null;

  return {
    schedule(reason: string, targetMessageIndex?: number, delay = 180): void {
      const decision = resolveExtractionScheduleDecision(
        pendingExtractionSchedule,
        {
          reason,
          targetMessageIndex: typeof targetMessageIndex === "number" ? targetMessageIndex : null,
          delay,
        },
        now(),
      );
      if (decision.action === "skip") {
        input.onSkip?.(reason, typeof targetMessageIndex === "number" ? targetMessageIndex : null);
        return;
      }
      if (extractionTimer !== null) {
        input.timers.clearTimeout(extractionTimer);
      }
      pendingExtractionSchedule = decision.nextPending;
      extractionTimer = input.timers.setTimeout(() => {
        const pending = pendingExtractionSchedule;
        extractionTimer = null;
        pendingExtractionSchedule = null;
        if (!pending) return;
        input.onFire(pending.reason, pending.targetMessageIndex);
      }, delay);
    },

    cancel(): PendingExtractionSchedule | null {
      const pending = pendingExtractionSchedule;
      if (extractionTimer !== null) {
        input.timers.clearTimeout(extractionTimer);
        extractionTimer = null;
      }
      pendingExtractionSchedule = null;
      return pending;
    },

    getPendingSchedule(): PendingExtractionSchedule | null {
      return pendingExtractionSchedule;
    },
  };
}
