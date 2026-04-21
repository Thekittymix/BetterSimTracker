import { buildJsonExtractionShadowRequestFromContext } from "./jsonExtractionProtocolShadow";
import type { BetterSimTrackerSettings, CustomStatistics, CustomNonNumericStatistics, STContext, Statistics, TrackerData } from "./types";

export interface BuildJsonExtractionShadowRequestForRunInput {
  context: STContext;
  reason: string;
  messageIndex: number;
  settings: BetterSimTrackerSettings;
  activeCharacters: string[];
  entityResolution?: TrackerData["entityResolution"] | null;
  previousTrackerData?: TrackerData | null;
  previousStatistics?: Statistics | null;
  previousCustomStatistics?: CustomStatistics | null;
  previousCustomNonNumericStatistics?: CustomNonNumericStatistics | null;
  historyLimit?: number;
  responseMode?: "tracker" | "stats" | "stat";
  statId?: string;
}

function isRetrackReason(reason: string): boolean {
  return reason === "manual_refresh"
    || reason === "manual_refresh_retry"
    || reason === "SWIPE_GENERATION_ENDED"
    || reason === "USER_MESSAGE_RENDERED"
    || reason === "USER_MESSAGE_EDITED"
    || reason === "MESSAGE_EDITED"
    || reason === "AUTO_BOOTSTRAP_MISSING_TRACKER"
    || reason === "BOOTSTRAP_CONTINUE";
}

export function buildJsonExtractionShadowRequestForExtractionRun(
  input: BuildJsonExtractionShadowRequestForRunInput,
): ReturnType<typeof buildJsonExtractionShadowRequestFromContext> {
  const message = input.context.chat[input.messageIndex];
  if (!message) {
    throw new Error(`No chat message exists at index ${input.messageIndex}.`);
  }
  return buildJsonExtractionShadowRequestFromContext({
    context: input.context,
    messageIndex: input.messageIndex,
    settings: input.settings,
    task: {
      mode: message.is_user ? "user_turn" : "ai_turn",
      messageIndex: input.messageIndex,
      retrack: isRetrackReason(input.reason),
      swipeRetrack: input.reason === "SWIPE_GENERATION_ENDED",
      entityTrackingMode: input.settings.entityTrackingMode,
      includeCharacterCards: Boolean(input.settings.includeCharacterCardsInPrompt),
      includeActivatedLorebook: Boolean(input.settings.includeLorebookInExtraction),
    },
    activeCharacters: input.activeCharacters,
    entityResolution: input.entityResolution,
    previousTrackerData: input.previousTrackerData,
    previousStatistics: input.previousStatistics,
    previousCustomStatistics: input.previousCustomStatistics,
    previousCustomNonNumericStatistics: input.previousCustomNonNumericStatistics,
    historyLimit: input.historyLimit,
    responseMode: input.responseMode,
    statId: input.statId,
  });
}
