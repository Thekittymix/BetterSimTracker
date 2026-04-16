import type { ResolveAutoBootstrapTargetResult } from "./bootstrapTargets";

export function resolveBootstrapScheduleDecision(input: {
  currentKey: string | null;
  scopeKey: string;
  decision: ResolveAutoBootstrapTargetResult;
}): {
  nextKey: string | null;
  shouldSchedule: boolean;
  targetMessageIndex: number | null;
} {
  const targetMessageIndex = input.decision.targetMessageIndex;
  if (targetMessageIndex == null) {
    return {
      nextKey: null,
      shouldSchedule: false,
      targetMessageIndex: null,
    };
  }

  const nextKey = `${input.scopeKey}|ai:${targetMessageIndex}`;
  if (input.currentKey === nextKey) {
    return {
      nextKey,
      shouldSchedule: false,
      targetMessageIndex,
    };
  }

  return {
    nextKey,
    shouldSchedule: true,
    targetMessageIndex,
  };
}
