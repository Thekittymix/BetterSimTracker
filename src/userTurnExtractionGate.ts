export const USER_MESSAGE_RENDERED_RETRY_REASON = "USER_MESSAGE_RENDERED_RETRY";

export function isUserMessageRenderedRetryReason(reason: string): boolean {
  return reason === USER_MESSAGE_RENDERED_RETRY_REASON;
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
