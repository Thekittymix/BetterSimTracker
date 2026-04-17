import { buildPromptCurrentTrackerData, enabledBuiltInAndTextStats } from "./extractorHelpers";
import { buildJsonExtractionRecentHistoryEntries, resolveJsonExtractionMessageSpeaker } from "./jsonExtractionProtocolHistory";
import { buildJsonExtractionRequestV1, type BuildJsonExtractionRequestInput } from "./jsonExtractionProtocolBuilder";
import { materializeTrackerDataFromJsonExtractionResponseV1 } from "./jsonExtractionProtocolAdapter";
import { compareTrackerDataParity, type JsonExtractionParityReport } from "./jsonExtractionProtocolParity";
import { parseAndValidateJsonExtractionResponseV1, type JsonExtractionRequestHistoryEntry } from "./jsonExtractionProtocol";
import type { BetterSimTrackerSettings, ChatMessage, CustomStatistics, CustomNonNumericStatistics, STContext, Statistics, TrackerData } from "./types";

export interface BuildJsonExtractionShadowRequestInput {
  settings: BetterSimTrackerSettings;
  task: BuildJsonExtractionRequestInput["task"];
  message: BuildJsonExtractionRequestInput["message"];
  activeCharacters: string[];
  entityResolution?: TrackerData["entityResolution"] | null;
  previousTrackerData?: TrackerData | null;
  previousStatistics?: Statistics | null;
  previousCustomStatistics?: CustomStatistics | null;
  previousCustomNonNumericStatistics?: CustomNonNumericStatistics | null;
  recentHistory: JsonExtractionRequestHistoryEntry[];
  entityContext: BuildJsonExtractionRequestInput["entityContext"];
}

export interface BuildJsonExtractionShadowRequestFromContextInput {
  context: STContext;
  messageIndex: number;
  settings: BetterSimTrackerSettings;
  task: BuildJsonExtractionRequestInput["task"];
  activeCharacters: string[];
  entityResolution?: TrackerData["entityResolution"] | null;
  previousTrackerData?: TrackerData | null;
  previousStatistics?: Statistics | null;
  previousCustomStatistics?: CustomStatistics | null;
  previousCustomNonNumericStatistics?: CustomNonNumericStatistics | null;
  entityContext: BuildJsonExtractionRequestInput["entityContext"];
  historyLimit?: number;
}

function requireMessage(context: STContext, messageIndex: number): ChatMessage {
  const message = context.chat[messageIndex];
  if (!message) {
    throw new Error(`No chat message exists at index ${messageIndex}.`);
  }
  return message;
}

export function buildJsonExtractionShadowRequest(
  input: BuildJsonExtractionShadowRequestInput,
): ReturnType<typeof buildJsonExtractionRequestV1> {
  const currentStateData = buildPromptCurrentTrackerData({
    activeCharacters: input.activeCharacters,
    entityResolution: input.entityResolution,
    previousTrackerData: input.previousTrackerData,
    previousStatistics: input.previousStatistics,
    previousCustomStatistics: input.previousCustomStatistics,
    previousCustomNonNumericStatistics: input.previousCustomNonNumericStatistics,
  });

  return buildJsonExtractionRequestV1({
    task: input.task,
    message: input.message,
    recentHistory: input.recentHistory,
    currentState: {
      latestRelevantSnapshot: currentStateData as unknown as Record<string, unknown>,
      builtInStats: currentStateData.statistics,
      customStats: currentStateData.customStatistics ?? {},
      customNonNumericStats: currentStateData.customNonNumericStatistics ?? {},
    },
    entityContext: input.entityContext,
    enabledBuiltInStats: enabledBuiltInAndTextStats(input.settings),
    settings: {
      customStats: input.settings.customStats,
    },
  });
}

export function buildJsonExtractionShadowRequestFromContext(
  input: BuildJsonExtractionShadowRequestFromContextInput,
): ReturnType<typeof buildJsonExtractionRequestV1> {
  const message = requireMessage(input.context, input.messageIndex);
  return buildJsonExtractionShadowRequest({
    settings: input.settings,
    task: input.task,
    message: {
      speaker: resolveJsonExtractionMessageSpeaker(input.context, message),
      isUser: Boolean(message.is_user),
      isSystem: Boolean(message.is_system),
      text: String(message.mes ?? ""),
    },
    activeCharacters: input.activeCharacters,
    entityResolution: input.entityResolution,
    previousTrackerData: input.previousTrackerData,
    previousStatistics: input.previousStatistics,
    previousCustomStatistics: input.previousCustomStatistics,
    previousCustomNonNumericStatistics: input.previousCustomNonNumericStatistics,
    recentHistory: buildJsonExtractionRecentHistoryEntries({
      context: input.context,
      beforeMessageIndex: input.messageIndex,
      limit: input.historyLimit ?? 6,
    }),
    entityContext: input.entityContext,
  });
}

export interface RunJsonExtractionShadowParityInput {
  settings: BetterSimTrackerSettings;
  rawResponse: string;
  expectedTrackerData: TrackerData;
  timestamp?: number;
}

export function runJsonExtractionShadowParity(
  input: RunJsonExtractionShadowParityInput,
): { ok: true; parity: JsonExtractionParityReport; trackerData: TrackerData }
  | { ok: false; errors: string[] } {
  const parsed = parseAndValidateJsonExtractionResponseV1(input.rawResponse);
  if (!parsed.ok) {
    return {
      ok: false,
      errors: parsed.errors.map(error => `${error.path}: ${error.message}`),
    };
  }
  const trackerData = materializeTrackerDataFromJsonExtractionResponseV1(parsed.value, {
    customStatDefinitions: input.settings.customStats,
    timestamp: input.timestamp,
  });
  return {
    ok: true,
    trackerData,
    parity: compareTrackerDataParity(input.expectedTrackerData, trackerData),
  };
}
