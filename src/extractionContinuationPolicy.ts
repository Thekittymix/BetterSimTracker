export function shouldReplayUserTurnAfterExtraction(input: {
  userExtraction: boolean;
  retryScheduled: boolean;
  userTurnGateActive: boolean;
  extractionSucceeded: boolean;
}): boolean {
  return (
    input.userExtraction
    && !input.retryScheduled
    && input.userTurnGateActive
    && input.extractionSucceeded
  );
}
