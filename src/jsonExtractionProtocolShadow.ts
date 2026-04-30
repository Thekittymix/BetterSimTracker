import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "./constants";
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
  responseMode?: "tracker" | "stats" | "stat";
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
  responseMode?: "tracker" | "stats" | "stat";
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

function scopeOwnerBucket<T>(
  bucket: Record<string, T> | null | undefined,
  globalScope: boolean,
): Record<string, T> {
  if (!bucket || typeof bucket !== "object") return {};
  if (!globalScope) return { ...bucket };
  return Object.prototype.hasOwnProperty.call(bucket, GLOBAL_TRACKER_KEY)
    ? { [GLOBAL_TRACKER_KEY]: bucket[GLOBAL_TRACKER_KEY] }
    : {};
}

function scopeCurrentStateDataForJsonRequest(input: {
  currentStateData: TrackerData;
  settings: BetterSimTrackerSettings;
}): TrackerData {
  const builtInStats = enabledBuiltInAndTextStats(input.settings);
  const customNumericDefs = new Map<string, { globalScope: boolean }>();
  const customNonNumericDefs = new Map<string, { globalScope: boolean }>();
  for (const stat of enabledCustomStats(input.settings)) {
    const kind = normalizeCustomStatKind(stat.kind);
    if (kind === "numeric") {
      customNumericDefs.set(stat.id, { globalScope: Boolean(stat.globalScope) });
    } else {
      customNonNumericDefs.set(stat.id, { globalScope: Boolean(stat.globalScope) });
    }
  }

  const scopedCustomStatistics: NonNullable<TrackerData["customStatistics"]> = {};
  for (const [statId, meta] of customNumericDefs) {
    const bucket = scopeOwnerBucket(input.currentStateData.customStatistics?.[statId], meta.globalScope);
    if (Object.keys(bucket).length) {
      scopedCustomStatistics[statId] = bucket;
    }
  }

  const scopedCustomNonNumericStatistics: NonNullable<TrackerData["customNonNumericStatistics"]> = {};
  for (const [statId, meta] of customNonNumericDefs) {
    const bucket = scopeOwnerBucket(input.currentStateData.customNonNumericStatistics?.[statId], meta.globalScope);
    if (Object.keys(bucket).length) {
      scopedCustomNonNumericStatistics[statId] = bucket;
    }
  }

  const scopedStatistics: Partial<TrackerData["statistics"]> = {};
  const scopedStatisticsByEntityId: Partial<NonNullable<TrackerData["statisticsByEntityId"]>> = {};
  if (builtInStats.includes("affection")) {
    scopedStatistics.affection = { ...(input.currentStateData.statistics?.affection ?? {}) };
    scopedStatisticsByEntityId.affection = { ...(input.currentStateData.statisticsByEntityId?.affection ?? {}) };
  }
  if (builtInStats.includes("trust")) {
    scopedStatistics.trust = { ...(input.currentStateData.statistics?.trust ?? {}) };
    scopedStatisticsByEntityId.trust = { ...(input.currentStateData.statisticsByEntityId?.trust ?? {}) };
  }
  if (builtInStats.includes("desire")) {
    scopedStatistics.desire = { ...(input.currentStateData.statistics?.desire ?? {}) };
    scopedStatisticsByEntityId.desire = { ...(input.currentStateData.statisticsByEntityId?.desire ?? {}) };
  }
  if (builtInStats.includes("connection")) {
    scopedStatistics.connection = { ...(input.currentStateData.statistics?.connection ?? {}) };
    scopedStatisticsByEntityId.connection = { ...(input.currentStateData.statisticsByEntityId?.connection ?? {}) };
  }
  if (builtInStats.includes("mood")) {
    scopedStatistics.mood = { ...(input.currentStateData.statistics?.mood ?? {}) };
    scopedStatisticsByEntityId.mood = { ...(input.currentStateData.statisticsByEntityId?.mood ?? {}) };
  }
  if (builtInStats.includes("lastThought")) {
    scopedStatistics.lastThought = { ...(input.currentStateData.statistics?.lastThought ?? {}) };
    scopedStatisticsByEntityId.lastThought = { ...(input.currentStateData.statisticsByEntityId?.lastThought ?? {}) };
  }

  return {
    ...input.currentStateData,
    statistics: scopedStatistics as TrackerData["statistics"],
    statisticsByEntityId: scopedStatisticsByEntityId as TrackerData["statisticsByEntityId"],
    customStatistics: scopedCustomStatistics,
    customStatisticsByEntityId: pickRecordKeys(input.currentStateData.customStatisticsByEntityId, [...customNumericDefs.keys()]),
    customNonNumericStatistics: scopedCustomNonNumericStatistics,
    customNonNumericStatisticsByEntityId: pickRecordKeys(
      input.currentStateData.customNonNumericStatisticsByEntityId,
      [...customNonNumericDefs.entries()]
        .filter(([, meta]) => !meta.globalScope)
        .map(([statId]) => statId),
    ),
  };
}

function buildStatStageOutputContract(
  statId: string,
  settings: BetterSimTrackerSettings,
  candidateOwners: string[],
): BuildJsonExtractionRequestInput["outputContract"] {
  const customStat = (settings.customStats ?? []).find(stat => stat.id === statId);
  const isNumericBuiltInStat = ["affection", "trust", "desire", "connection"].includes(statId);
  const isNumericCustomStat = customStat !== undefined && (customStat.kind ?? "numeric") === "numeric";
  const isNumericStat = isNumericBuiltInStat || isNumericCustomStat;
  const isStructuredDateTime = customStat !== undefined
    && normalizeCustomStatKind(customStat.kind) === "date_time"
    && customStat.dateTimeMode === "structured";
  const valueOwners = customStat?.globalScope === true
    ? ["__bst_global__"]
    : uniqueStrings(candidateOwners);
  const valueSchema = isNumericStat
    ? {
        delta: "numeric change from the previous tracker value, not the final value",
        confidence: 0.8,
      }
    : {
        value: isStructuredDateTime
          ? { ofDay: "Evening" }
          : customStat?.globalScope === true
            ? "single global scene value for this stat only"
            : "value for this stat only",
        confidence: 0.8,
      };
  const values: Record<string, unknown> = {};
  for (const owner of valueOwners) {
    values[owner] = valueSchema;
  }
  return {
    requiredSections: [
      "protocolVersion",
      "responseType",
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
      values,
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
    settings: input.settings,
    outputContract: input.responseMode === "stat" && input.statId
      ? buildStatStageOutputContract(input.statId, input.settings, input.entityContext.candidateOwners)
      : undefined,
    responseContractMode: input.responseMode === "stats" ? "stats" : "tracker",
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
