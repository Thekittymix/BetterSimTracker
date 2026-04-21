import { USER_TRACKER_KEY } from "./constants";
import { buildCharacterCardsContext } from "./characterCardContext";
import { normalizeCustomStatKind } from "./customStatRuntime";
import { getEntityRegistryEntryByOwnerName, getEntityRegistryEntryForMessage, resolveTrackerEntityIdsForOwners } from "./entityRegistry";
import { buildPromptCurrentTrackerData, enabledBuiltInAndTextStats, enabledCustomStats } from "./extractorHelpers";
import { resolveStableEntityIdForOwner } from "./entityResolution";
import { resolveSceneEntityIdsFromResolvedEntities } from "./entityResolver";
import { buildJsonExtractionRecentHistoryEntries, resolveJsonExtractionMessageSpeaker } from "./jsonExtractionProtocolHistory";
import { buildJsonExtractionRequestV1, type BuildJsonExtractionRequestInput } from "./jsonExtractionProtocolBuilder";
import { materializeTrackerDataFromJsonExtractionResponseV1 } from "./jsonExtractionProtocolAdapter";
import { compareTrackerDataParity, type JsonExtractionParityReport } from "./jsonExtractionProtocolParity";
import { parseAndValidateJsonExtractionResponseV1, type JsonExtractionRequestHistoryEntry } from "./jsonExtractionProtocol";
import type { BetterSimTrackerSettings, ChatMessage, CustomStatistics, CustomNonNumericStatistics, STContext, Statistics, TrackerData } from "./types";

export interface BuildJsonExtractionShadowRequestInput {
  context: STContext;
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
  responseMode?: "tracker" | "stat";
  statId?: string;
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
  entityContext?: BuildJsonExtractionRequestInput["entityContext"];
  historyLimit?: number;
  responseMode?: "tracker" | "stat";
  statId?: string;
}

function requireMessage(context: STContext, messageIndex: number): ChatMessage {
  const message = context.chat[messageIndex];
  if (!message) {
    throw new Error(`No chat message exists at index ${messageIndex}.`);
  }
  return message;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function mapRegistryKindToJsonKind(kind: string | null | undefined): "owner" | "multi_character_alias" | "narrative-entity" | "st-character" | "persona" {
  if (kind === "multi_character_alias") return "multi_character_alias";
  if (kind === "narrative-entity") return "narrative-entity";
  if (kind === "owner") return "owner";
  return "st-character";
}

function pickRecordKeys<T>(source: Record<string, T> | null | undefined, keys: string[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of keys) {
    if (source && Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key];
    }
  }
  return out;
}

function scopeCurrentStateDataForJsonRequest(input: {
  currentStateData: TrackerData;
  settings: BetterSimTrackerSettings;
}): TrackerData {
  const builtInStats = enabledBuiltInAndTextStats(input.settings);
  const customNumericStats: string[] = [];
  const customNonNumericStats: string[] = [];
  for (const stat of enabledCustomStats(input.settings)) {
    const kind = normalizeCustomStatKind(stat.kind);
    if (kind === "numeric") {
      customNumericStats.push(stat.id);
    } else {
      customNonNumericStats.push(stat.id);
    }
  }

  return {
    ...input.currentStateData,
    statistics: {
      affection: builtInStats.includes("affection") ? { ...(input.currentStateData.statistics?.affection ?? {}) } : {},
      trust: builtInStats.includes("trust") ? { ...(input.currentStateData.statistics?.trust ?? {}) } : {},
      desire: builtInStats.includes("desire") ? { ...(input.currentStateData.statistics?.desire ?? {}) } : {},
      connection: builtInStats.includes("connection") ? { ...(input.currentStateData.statistics?.connection ?? {}) } : {},
      mood: builtInStats.includes("mood") ? { ...(input.currentStateData.statistics?.mood ?? {}) } : {},
      lastThought: builtInStats.includes("lastThought") ? { ...(input.currentStateData.statistics?.lastThought ?? {}) } : {},
    },
    customStatistics: pickRecordKeys(input.currentStateData.customStatistics, customNumericStats),
    customNonNumericStatistics: pickRecordKeys(input.currentStateData.customNonNumericStatistics, customNonNumericStats),
  };
}

function buildStatStageOutputContract(statId: string): BuildJsonExtractionRequestInput["outputContract"] {
  return {
    requiredSections: [
      "result",
      "statId",
      "values",
    ],
    responseSchema: {
      protocolVersion: "bst.extract.v1",
      responseType: "stat_extraction_result",
      result: {
        status: "ok",
      },
      statId,
      values: {
        "Owner display name": "value for this stat only",
      },
    },
  };
}

function buildJsonExtractionContextSources(input: BuildJsonExtractionShadowRequestInput): BuildJsonExtractionRequestInput["contextSources"] {
  const resolvedEntities = input.entityResolution?.resolvedEntities ?? [];
  const sceneEntityIds = resolvedEntities.length
    ? resolveSceneEntityIdsFromResolvedEntities(resolvedEntities)
    : resolveTrackerEntityIdsForOwners(input.context, input.activeCharacters);
  const preferredCharacterName = input.task.mode === "user_turn"
    ? undefined
    : String(input.message.speaker ?? "").trim() || undefined;
  return {
    characterCards: input.settings.includeCharacterCardsInPrompt
      ? buildCharacterCardsContext(
          input.context,
          input.activeCharacters,
          sceneEntityIds,
          input.settings.entityTrackingMode,
          preferredCharacterName,
        )
      : "",
    activatedLorebook: "",
  };
}

export function buildJsonExtractionEntityContextFromContext(
  input: Pick<BuildJsonExtractionShadowRequestFromContextInput, "context" | "messageIndex" | "settings" | "activeCharacters" | "previousTrackerData">,
): BuildJsonExtractionRequestInput["entityContext"] {
  const candidateOwners = uniqueStrings(input.activeCharacters);
  const candidateEntities = candidateOwners.map(ownerName => {
    if (ownerName === USER_TRACKER_KEY) {
      return {
        entityId: resolveStableEntityIdForOwner(input.context, ownerName, input.settings.entityTrackingMode),
        ownerName,
        kind: "persona" as const,
        aliases: [ownerName],
      };
    }
    const registryEntry = getEntityRegistryEntryForMessage(input.context, ownerName, input.messageIndex)
      ?? getEntityRegistryEntryByOwnerName(input.context, ownerName);
    return {
      entityId: registryEntry?.id || resolveStableEntityIdForOwner(input.context, ownerName, input.settings.entityTrackingMode),
      ownerName,
      kind: mapRegistryKindToJsonKind(registryEntry?.kind),
      aliases: uniqueStrings([
        ownerName,
        registryEntry?.canonicalName ?? "",
        ...(registryEntry?.aliases ?? []),
      ]),
    };
  });
  return {
    candidateOwners,
    candidateEntities,
    currentEntityOwnerMap: input.previousTrackerData?.entityOwnerMap
      ? input.previousTrackerData.entityOwnerMap as unknown as Record<string, unknown>
      : {},
  };
}

export function buildJsonExtractionShadowRequest(
  input: BuildJsonExtractionShadowRequestInput,
): ReturnType<typeof buildJsonExtractionRequestV1> {
  const currentStateData = scopeCurrentStateDataForJsonRequest({
    settings: input.settings,
    currentStateData: buildPromptCurrentTrackerData({
      activeCharacters: input.activeCharacters,
      entityResolution: input.entityResolution,
      previousTrackerData: input.previousTrackerData,
      previousStatistics: input.previousStatistics,
      previousCustomStatistics: input.previousCustomStatistics,
      previousCustomNonNumericStatistics: input.previousCustomNonNumericStatistics,
    }),
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
    contextSources: buildJsonExtractionContextSources(input),
    entityContext: input.entityContext,
    enabledBuiltInStats: enabledBuiltInAndTextStats(input.settings),
    settings: {
      customStats: input.settings.customStats,
    },
    outputContract: input.responseMode === "stat" && input.statId
      ? buildStatStageOutputContract(input.statId)
      : undefined,
  });
}

export function buildJsonExtractionShadowRequestFromContext(
  input: BuildJsonExtractionShadowRequestFromContextInput,
): ReturnType<typeof buildJsonExtractionRequestV1> {
  const message = requireMessage(input.context, input.messageIndex);
  return buildJsonExtractionShadowRequest({
    context: input.context,
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
    entityContext: input.entityContext ?? buildJsonExtractionEntityContextFromContext(input),
    responseMode: input.responseMode,
    statId: input.statId,
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
