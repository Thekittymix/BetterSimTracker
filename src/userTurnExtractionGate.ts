export const USER_MESSAGE_RENDERED_RETRY_REASON = "USER_MESSAGE_RENDERED_RETRY";

export function isUserMessageRenderedRetryReason(reason: string): boolean {
  return reason === USER_MESSAGE_RENDERED_RETRY_REASON;
}

export function shouldScheduleImmediateUserTurnExtraction(input: {
  reason: string;
  adoptedInflightGeneration: boolean;
}): boolean {
  if (input.reason !== "USER_MESSAGE_RENDERED") return true;
  return !input.adoptedInflightGeneration;
}

export function shouldScheduleUserTurnExtractionAfterGenerationEnd(input: {
  userTurnGateActive: boolean;
  chatGenerationSawCharacterRender: boolean;
}): boolean {
  return input.userTurnGateActive && !input.chatGenerationSawCharacterRender;
}

export function resolveUserTurnRetryDelayMs(input: {
  reason: string;
  retryableFailure: boolean;
  attempt: number;
}): number | null {
  if (!input.retryableFailure) return null;
  if (input.reason !== "USER_MESSAGE_RENDERED" && input.reason !== USER_MESSAGE_RENDERED_RETRY_REASON) {
    return null;
  }
  if (input.attempt < 1) return 500;
  if (input.attempt < 2) return 1200;
  return null;
}

export function shouldDeferUserTurnExtraction(input: {
  reason: string;
  userTurnGateActive: boolean;
  chatGenerationInFlight: boolean;
  stopGenerationScheduled: boolean;
}): boolean {
  if (!input.userTurnGateActive) return false;
  if (input.reason !== "USER_MESSAGE_RENDERED" && input.reason !== USER_MESSAGE_RENDERED_RETRY_REASON) {
    return false;
  }
  return input.chatGenerationInFlight || input.stopGenerationScheduled;
}

export function shouldIssueUserTurnGateStop(input: {
  userTurnGateActive: boolean;
  stopGenerationScheduled: boolean;
  stopAlreadyIssued: boolean;
}): boolean {
  return input.userTurnGateActive && !input.stopGenerationScheduled && !input.stopAlreadyIssued;
}

export function isRetryableUserTurnReplayFailure(message: string): boolean {
  return /(api request failed|failed to fetch|network\s+error|timeout|http\s+5\d\d|statuscode\":5\d\d|proxy connection closed unexpectedly|servers restarting)/i
    .test(String(message ?? ""));
}

export function resolveUserTurnReplayRetryDelayMs(input: {
  retryableFailure: boolean;
  attempt: number;
}): number | null {
  if (!input.retryableFailure) return null;
  if (input.attempt < 1) return 700;
  if (input.attempt < 2) return 1600;
  return null;
}
