export type AutoBootstrapDecisionReason = "missing_greeting_ai" | "missing_latest_ai";

export type ResolveAutoBootstrapTargetInput = {
  enabled: boolean;
  isExtracting: boolean;
  chatGenerationInFlight: boolean;
  pendingLateRenderExtraction: boolean;
  latestTrackableIndex: number | null;
  latestDataMessageIndex: number | null;
  highestStoredMessageIndex: number | null;
  generateOnGreetingMessages: boolean;
  chatLength: number;
  isTrackableAiAt: (index: number) => boolean;
  hasTrackerAt: (index: number) => boolean;
  hasPriorTrackableUserAt: (index: number) => boolean;
};

export type ResolveAutoBootstrapTargetResult = {
  targetMessageIndex: number | null;
  reason: AutoBootstrapDecisionReason | null;
  skippedGreetingBootstrap: boolean;
};

export function resolveAutoBootstrapTarget({
  enabled,
  isExtracting,
  chatGenerationInFlight,
  pendingLateRenderExtraction,
  latestTrackableIndex,
  latestDataMessageIndex,
  highestStoredMessageIndex,
  generateOnGreetingMessages,
  chatLength,
  isTrackableAiAt,
  hasTrackerAt,
  hasPriorTrackableUserAt,
}: ResolveAutoBootstrapTargetInput): ResolveAutoBootstrapTargetResult {
  if (
    !enabled ||
    isExtracting ||
    chatGenerationInFlight ||
    pendingLateRenderExtraction ||
    latestTrackableIndex == null ||
    latestTrackableIndex < 0 ||
    latestTrackableIndex >= chatLength
  ) {
    return { targetMessageIndex: null, reason: null, skippedGreetingBootstrap: false };
  }

  if (
    highestStoredMessageIndex != null &&
    Number.isFinite(highestStoredMessageIndex) &&
    highestStoredMessageIndex > latestTrackableIndex
  ) {
    return { targetMessageIndex: null, reason: null, skippedGreetingBootstrap: false };
  }

  for (let index = 0; index <= latestTrackableIndex; index += 1) {
    if (!isTrackableAiAt(index) || hasTrackerAt(index)) continue;
    if (!hasPriorTrackableUserAt(index)) {
      if (!generateOnGreetingMessages) {
        return { targetMessageIndex: null, reason: null, skippedGreetingBootstrap: true };
      }
      return {
        targetMessageIndex: index,
        reason: "missing_greeting_ai",
        skippedGreetingBootstrap: false,
      };
    }
  }

  if (
    isTrackableAiAt(latestTrackableIndex) &&
    !hasTrackerAt(latestTrackableIndex) &&
    (latestDataMessageIndex == null || latestDataMessageIndex < latestTrackableIndex)
  ) {
    return {
      targetMessageIndex: latestTrackableIndex,
      reason: "missing_latest_ai",
      skippedGreetingBootstrap: false,
    };
  }

  return { targetMessageIndex: null, reason: null, skippedGreetingBootstrap: false };
}
