type TimerApi = {
  setTimeout: (fn: () => void, delay?: number) => number;
  clearTimeout: (id: number) => void;
};

type PendingState = {
  pending: boolean;
  startLastAiIndex: number | null;
};

export function createLateRenderRecoveryController(input: {
  timers: TimerApi;
  getPendingState: () => PendingState;
  setPendingState: (next: PendingState) => void;
  isGenerationInFlight: () => boolean;
  isExtracting: () => boolean;
  getCurrentLastAiIndex: () => number | null;
  hasTrackableTargetAt: (messageIndex: number) => boolean;
  onScheduleExtraction: (reason: "GENERATION_ENDED_LATE_RENDER" | "GENERATION_ENDED_LATE_POLL", messageIndex: number, delay: number) => void;
}): {
  begin: (startLastAiIndex: number | null) => void;
  clear: () => void;
  handleCharacterMessageRendered: () => void;
} {
  let pollTimer: number | null = null;

  const clearTimer = (): void => {
    if (pollTimer !== null) {
      input.timers.clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const clear = (): void => {
    clearTimer();
    input.setPendingState({ pending: false, startLastAiIndex: null });
  };

  const handlePoll = (): void => {
    pollTimer = null;
    const state = input.getPendingState();
    if (!state.pending || input.isGenerationInFlight() || input.isExtracting()) return;
    const currentLastAi = input.getCurrentLastAiIndex();
    const hasNewAiMessage =
      currentLastAi != null &&
      (state.startLastAiIndex == null || currentLastAi > state.startLastAiIndex);
    const hasTrackableTarget =
      hasNewAiMessage &&
      currentLastAi != null &&
      input.hasTrackableTargetAt(currentLastAi);
    if (hasTrackableTarget && currentLastAi != null) {
      input.onScheduleExtraction("GENERATION_ENDED_LATE_POLL", currentLastAi, 80);
      clear();
    }
  };

  return {
    begin(startLastAiIndex: number | null): void {
      clearTimer();
      input.setPendingState({ pending: true, startLastAiIndex });
      pollTimer = input.timers.setTimeout(handlePoll, 700);
    },

    clear,

    handleCharacterMessageRendered(): void {
      const state = input.getPendingState();
      if (!state.pending || input.isGenerationInFlight()) return;
      const currentLastAi = input.getCurrentLastAiIndex();
      const hasTrackableTarget =
        currentLastAi != null &&
        input.hasTrackableTargetAt(currentLastAi);
      if (hasTrackableTarget && currentLastAi != null) {
        input.onScheduleExtraction("GENERATION_ENDED_LATE_RENDER", currentLastAi, 180);
      }
      clear();
    },
  };
}
