import type { ResolveAutoBootstrapTargetResult } from "./bootstrapTargets";
import { resolveBootstrapScheduleDecision } from "./bootstrapSchedulePolicy";

export function createBootstrapScheduler(input: {
  getScopeKey: () => string;
  onSchedule: (decision: {
    reason: string | null;
    targetMessageIndex: number;
  }) => void;
}): {
  applyDecision: (decision: ResolveAutoBootstrapTargetResult) => void;
  reset: () => void;
  getCurrentKey: () => string | null;
} {
  let currentKey: string | null = null;

  return {
    applyDecision(decision: ResolveAutoBootstrapTargetResult): void {
      const scheduleDecision = resolveBootstrapScheduleDecision({
        currentKey,
        scopeKey: input.getScopeKey(),
        decision,
      });
      currentKey = scheduleDecision.nextKey;
      if (scheduleDecision.shouldSchedule && scheduleDecision.targetMessageIndex != null) {
        input.onSchedule({
          reason: decision.reason,
          targetMessageIndex: scheduleDecision.targetMessageIndex,
        });
      }
    },

    reset(): void {
      currentKey = null;
    },

    getCurrentKey(): string | null {
      return currentKey;
    },
  };
}
