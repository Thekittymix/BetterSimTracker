export type PendingExtractionSchedule = {
  reason: string;
  targetMessageIndex: number | null;
  dueAt: number;
};

export type NextExtractionSchedule = {
  reason: string;
  targetMessageIndex: number | null;
  delay: number;
};

export function resolveExtractionScheduleDecision(
  current: PendingExtractionSchedule | null,
  next: NextExtractionSchedule,
  now: number,
): {
  action: "schedule" | "skip" | "replace";
  nextPending: PendingExtractionSchedule;
} {
  const nextPending: PendingExtractionSchedule = {
    reason: next.reason,
    targetMessageIndex: next.targetMessageIndex,
    dueAt: now + Math.max(0, next.delay),
  };

  if (!current) {
    return { action: "schedule", nextPending };
  }

  const sameTarget = current.targetMessageIndex === nextPending.targetMessageIndex;
  if (sameTarget && current.dueAt <= nextPending.dueAt) {
    return { action: "skip", nextPending: current };
  }
  const currentHasExplicitTarget = current.targetMessageIndex != null;
  const nextHasExplicitTarget = nextPending.targetMessageIndex != null;
  if (currentHasExplicitTarget && !nextHasExplicitTarget && current.dueAt <= nextPending.dueAt) {
    return { action: "skip", nextPending: current };
  }

  return { action: "replace", nextPending };
}
