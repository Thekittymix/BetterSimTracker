import type { PendingExtractionSchedule } from "./extractionSchedulePolicy";

export type TrackerGenerationStopMode = "stop" | "disable";

export function cancelTrackerGenerationFlow(input: {
  mode: TrackerGenerationStopMode;
  activeExtractionRunId: number | null;
  cancelledExtractionRuns: Set<number>;
  cancelActiveGenerations: () => number;
  cancelPendingExtractionSchedule: () => PendingExtractionSchedule | null;
  clearPendingSwipeExtraction: () => void;
  clearLateRenderRecovery: () => void;
  resetUserTurnGate: (reason: string) => void;
  resetBootstrapScheduler?: () => void;
}): {
  canceledRunId: number | null;
  canceledRequests: number;
  pendingSchedule: PendingExtractionSchedule | null;
  userTurnGateResetReason: string;
  bootstrapSchedulerReset: boolean;
} {
  if (input.activeExtractionRunId != null) {
    input.cancelledExtractionRuns.add(input.activeExtractionRunId);
  }

  const canceledRequests = input.cancelActiveGenerations();
  const pendingSchedule = input.cancelPendingExtractionSchedule();
  input.clearPendingSwipeExtraction();
  input.clearLateRenderRecovery();

  const userTurnGateResetReason = input.mode === "disable"
    ? "extension_disabled"
    : "tracker_generation_stopped";
  input.resetUserTurnGate(userTurnGateResetReason);

  const bootstrapSchedulerReset = input.mode === "disable";
  if (bootstrapSchedulerReset) {
    input.resetBootstrapScheduler?.();
  }

  return {
    canceledRunId: input.activeExtractionRunId,
    canceledRequests,
    pendingSchedule,
    userTurnGateResetReason,
    bootstrapSchedulerReset,
  };
}
