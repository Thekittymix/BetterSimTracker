export function resolveExtractionFailurePolicy(input: {
  reason: string;
  message: string;
  hadTrackerAtStart: boolean;
  isUserExtraction: boolean;
}): {
  shouldRetry: boolean;
  retryReason: string | null;
  shouldSetRecovery: boolean;
  shouldResetUserTurnGate: boolean;
  retryKind: "empty_generator_output" | "retryable_api_failure" | null;
} {
  const message = String(input.message ?? "");
  const isEmptyOutputError = /(?:^|\s)(?:Generator|Active runtime request) returned empty output/i.test(message);
  const isRetryableApiFailure = /(api request failed|failed to fetch|network\s+error|timeout|http\s+5\d\d|status\s*code\s*5\d\d)/i.test(message);
  const shouldRetryFailure = isEmptyOutputError || isRetryableApiFailure;
  const canAutoRetryReason =
    input.reason === "manual_refresh"
    || input.reason === "AUTO_BOOTSTRAP_MISSING_TRACKER"
    || input.reason === "AUTO_BOOTSTRAP_MISSING_TRACKER_CONTINUE";

  if (
    canAutoRetryReason
    && input.reason !== "manual_refresh_retry"
    && shouldRetryFailure
  ) {
    const retryReason =
      input.reason === "manual_refresh"
        ? "manual_refresh_retry"
        : input.reason === "AUTO_BOOTSTRAP_MISSING_TRACKER"
          ? "AUTO_BOOTSTRAP_MISSING_TRACKER_CONTINUE"
          : "manual_refresh_retry";
    return {
      shouldRetry: true,
      retryReason,
      shouldSetRecovery: false,
      shouldResetUserTurnGate: false,
      retryKind: isEmptyOutputError ? "empty_generator_output" : "retryable_api_failure",
    };
  }

  return {
    shouldRetry: false,
    retryReason: null,
    shouldSetRecovery: !input.hadTrackerAtStart,
    shouldResetUserTurnGate: input.isUserExtraction,
    retryKind: null,
  };
}
