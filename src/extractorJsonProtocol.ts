import { buildJsonExtractionShadowDebug } from "./jsonExtractionProtocolDebug";
import { runJsonExtractionProtocolShadowTransport, type RunJsonExtractionProtocolShadowTransportInput } from "./jsonExtractionProtocolTransport";
import {
  buildProgressApply,
  buildProgressParse,
  buildProgressRequest,
} from "./extractorProgress";
import { enabledBuiltInAndTextStats, enabledCustomStats, groupCustomStatsForSequential } from "./extractorHelpers";
import type {
  BetterSimTrackerSettings,
  CustomStatDefinition,
  CustomNonNumericStatistics,
  CustomStatistics,
  DeltaDebugRecord,
  GenerateRequestMeta,
  STContext,
  StatKey,
  Statistics,
  TrackerData,
} from "./types";

type JsonShadowMeta = NonNullable<NonNullable<DeltaDebugRecord["meta"]>["jsonShadow"]>;

export interface TryExtractStatisticsViaJsonProtocolInput {
  context?: STContext | null;
  settings: BetterSimTrackerSettings;
  reason?: string;
  messageIndex?: number;
  activeCharacters: string[];
  entityResolution?: TrackerData["entityResolution"] | null;
  previousTrackerData?: TrackerData | null;
  previousStatistics?: Statistics | null;
  previousCustomStatistics?: CustomStatistics | null;
  previousCustomNonNumericStatistics?: CustomNonNumericStatistics | null;
  contextText: string;
  history: TrackerData[];
  isCancelled?: () => boolean;
  onProgress?: (done: number, total: number, label?: string) => void;
}

export type JsonProtocolExtractionAttempt =
  | { mode: "inactive" }
  | { mode: "fallback"; jsonShadowDebug: JsonShadowMeta }
  | {
      mode: "success";
      statistics: Statistics;
      customStatistics: CustomStatistics;
      customNonNumericStatistics: CustomNonNumericStatistics;
      debug: DeltaDebugRecord;
    };

function countMapValues(values: Record<string, unknown>): number {
  return Object.keys(values).length;
}

function countMapValuesByStat(values: Record<string, Record<string, unknown>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, bucket] of Object.entries(values ?? {})) {
    out[key] = Object.keys(bucket ?? {}).length;
  }
  return out;
}

function cloneNumericBucket(value: Statistics["affection"] | Statistics["trust"] | Statistics["desire"] | Statistics["connection"]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, candidate] of Object.entries(value ?? {})) {
    if (typeof candidate === "number") out[key] = candidate;
  }
  return out;
}

function cloneTextBucket(value: Statistics["mood"] | Statistics["lastThought"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, candidate] of Object.entries(value ?? {})) {
    if (typeof candidate === "string") out[key] = candidate;
  }
  return out;
}

function buildRequestMeta(
  responseMeta: GenerateRequestMeta,
  statsRequested: string[],
  attempt = 1,
): Array<GenerateRequestMeta & { statList: string[]; attempt: number; retryType: string }> {
  return [
    {
      ...responseMeta,
      statList: statsRequested,
      attempt,
      retryType: "json_protocol",
    },
  ];
}

function buildDebugRecordFromJsonProtocolSuccess(input: {
  requestText: string;
  responseText: string;
  responseMeta: GenerateRequestMeta;
  contextText: string;
  history: TrackerData[];
  activeCharacters: string[];
  statistics: Statistics;
  customStatistics: CustomStatistics;
  customNonNumericStatistics: CustomNonNumericStatistics;
  statsRequested: string[];
  jsonShadowDebug: JsonShadowMeta;
  settingsIncludeContext: boolean;
  extractionMode?: "unified" | "sequential";
  attempts?: number;
  requests?: Array<GenerateRequestMeta & { statList: string[]; attempt: number; retryType: string }>;
}): DeltaDebugRecord {
  return {
    rawModelOutput: input.responseText,
    promptText: input.settingsIncludeContext ? input.requestText : undefined,
    contextText: input.settingsIncludeContext ? input.contextText : undefined,
    parsed: {
      confidence: {},
      deltas: {
        affection: cloneNumericBucket(input.statistics.affection),
        trust: cloneNumericBucket(input.statistics.trust),
        desire: cloneNumericBucket(input.statistics.desire),
        connection: cloneNumericBucket(input.statistics.connection),
        custom: { ...(input.customStatistics ?? {}) },
        customNonNumeric: { ...(input.customNonNumericStatistics ?? {}) },
      },
      mood: cloneTextBucket(input.statistics.mood),
      lastThought: cloneTextBucket(input.statistics.lastThought),
    },
    applied: {
      affection: cloneNumericBucket(input.statistics.affection),
      trust: cloneNumericBucket(input.statistics.trust),
      desire: cloneNumericBucket(input.statistics.desire),
      connection: cloneNumericBucket(input.statistics.connection),
      mood: cloneTextBucket(input.statistics.mood),
      lastThought: cloneTextBucket(input.statistics.lastThought),
      customStatistics: { ...(input.customStatistics ?? {}) },
      customNonNumericStatistics: { ...(input.customNonNumericStatistics ?? {}) },
    },
    meta: {
      promptChars: input.requestText.length,
      contextChars: input.contextText.length,
      historySnapshots: input.history.length,
      activeCharacters: [...input.activeCharacters],
      statsRequested: input.statsRequested,
      attempts: input.attempts ?? 1,
      extractionMode: input.extractionMode ?? "unified",
      retryUsed: false,
      firstParseHadValues: true,
      rawLength: input.responseText.length,
      parsedCounts: {
        confidence: 0,
        affection: countMapValues(input.statistics.affection ?? {}),
        trust: countMapValues(input.statistics.trust ?? {}),
        desire: countMapValues(input.statistics.desire ?? {}),
        connection: countMapValues(input.statistics.connection ?? {}),
        mood: countMapValues(input.statistics.mood ?? {}),
        lastThought: countMapValues(input.statistics.lastThought ?? {}),
        customByStat: countMapValuesByStat(input.customStatistics ?? {}),
        customNonNumericByStat: countMapValuesByStat(input.customNonNumericStatistics ?? {}),
      },
      appliedCounts: {
        affection: countMapValues(input.statistics.affection ?? {}),
        trust: countMapValues(input.statistics.trust ?? {}),
        desire: countMapValues(input.statistics.desire ?? {}),
        connection: countMapValues(input.statistics.connection ?? {}),
        mood: countMapValues(input.statistics.mood ?? {}),
        lastThought: countMapValues(input.statistics.lastThought ?? {}),
        customByStat: countMapValuesByStat(input.customStatistics ?? {}),
        customNonNumericByStat: countMapValuesByStat(input.customNonNumericStatistics ?? {}),
      },
      moodFallbackApplied: [],
      requests: input.requests ?? buildRequestMeta(input.responseMeta, input.statsRequested),
      jsonShadow: input.jsonShadowDebug,
    },
  };
}

function emptyStatistics(): Statistics {
  return {
    affection: {},
    trust: {},
    desire: {},
    connection: {},
    mood: {},
    lastThought: {},
  };
}

function mergeStatistics(target: Statistics, source: Statistics): void {
  Object.assign(target.affection, source.affection ?? {});
  Object.assign(target.trust, source.trust ?? {});
  Object.assign(target.desire, source.desire ?? {});
  Object.assign(target.connection, source.connection ?? {});
  Object.assign(target.mood, source.mood ?? {});
  Object.assign(target.lastThought, source.lastThought ?? {});
}

function mergeCustomStatistics(target: CustomStatistics, source: CustomStatistics): void {
  for (const [statId, bucket] of Object.entries(source ?? {})) {
    target[statId] = {
      ...(target[statId] ?? {}),
      ...(bucket ?? {}),
    };
  }
}

function mergeCustomNonNumericStatistics(target: CustomNonNumericStatistics, source: CustomNonNumericStatistics): void {
  for (const [statId, bucket] of Object.entries(source ?? {})) {
    target[statId] = {
      ...(target[statId] ?? {}),
      ...(bucket ?? {}),
    };
  }
}

const BUILT_IN_FLAG_BY_STAT: Record<StatKey, keyof BetterSimTrackerSettings> = {
  affection: "trackAffection",
  trust: "trackTrust",
  desire: "trackDesire",
  connection: "trackConnection",
  mood: "trackMood",
  lastThought: "trackLastThought",
};

function buildJsonProtocolScopedSettings(input: {
  base: BetterSimTrackerSettings;
  builtInStats?: StatKey[];
  customStats?: CustomStatDefinition[];
}): BetterSimTrackerSettings {
  const builtInSet = new Set(input.builtInStats ?? []);
  return {
    ...input.base,
    trackAffection: builtInSet.has("affection"),
    trackTrust: builtInSet.has("trust"),
    trackDesire: builtInSet.has("desire"),
    trackConnection: builtInSet.has("connection"),
    trackMood: builtInSet.has("mood"),
    trackLastThought: builtInSet.has("lastThought"),
    customStats: (input.customStats ?? []).map(stat => ({
      ...stat,
      track: true,
    })),
  };
}

type JsonProtocolRequestPlanItem = {
  label: string;
  statsRequested: string[];
  settings: BetterSimTrackerSettings;
  responseMode: "tracker" | "stat";
  statId?: string;
};

function buildJsonProtocolRequestPlan(settings: BetterSimTrackerSettings): JsonProtocolRequestPlanItem[] {
  if (!settings.sequentialExtraction) {
    return [{
      label: "extraction",
      statsRequested: [
        ...enabledBuiltInAndTextStats(settings),
        ...enabledCustomStats(settings).map(stat => stat.id),
      ],
      settings,
      responseMode: "tracker",
    }];
  }

  const builtInItems = enabledBuiltInAndTextStats(settings).map(stat => ({
    label: stat,
    statsRequested: [stat],
    settings: buildJsonProtocolScopedSettings({
      base: settings,
      builtInStats: [stat],
    }),
    responseMode: "stat" as const,
    statId: stat,
  }));
  const customItems = groupCustomStatsForSequential(
    enabledCustomStats(settings),
    settings.enableSequentialStatGroups,
  ).map(group => ({
    label: group.length === 1
      ? (group[0]?.label || group[0]?.id || "custom")
      : `custom group ${group.map(stat => stat.id).join("+")}`,
    statsRequested: group.map(stat => stat.id),
    settings: buildJsonProtocolScopedSettings({
      base: settings,
      customStats: group,
    }),
    responseMode: group.length === 1 ? "stat" as const : "tracker" as const,
    statId: group.length === 1 ? group[0]?.id : undefined,
  }));
  return [...builtInItems, ...customItems];
}

export async function tryExtractStatisticsViaJsonProtocol(
  input: TryExtractStatisticsViaJsonProtocolInput,
  runTransport: (
    input: RunJsonExtractionProtocolShadowTransportInput,
  ) => Promise<Awaited<ReturnType<typeof runJsonExtractionProtocolShadowTransport>>> = runJsonExtractionProtocolShadowTransport,
): Promise<JsonProtocolExtractionAttempt> {
  if (input.settings.extractionProtocolMode !== "json") {
    return { mode: "inactive" };
  }
  if (!input.context || typeof input.messageIndex !== "number" || !input.reason) {
    return { mode: "inactive" };
  }

  const statsRequested = [
    ...enabledBuiltInAndTextStats(input.settings),
    ...enabledCustomStats(input.settings).map(stat => stat.id),
  ];
  const requestPlan = buildJsonProtocolRequestPlan(input.settings);
  const progressTotal = Math.max(1, requestPlan.length * 3);

  try {
    const statistics = emptyStatistics();
    const customStatistics: CustomStatistics = {};
    const customNonNumericStatistics: CustomNonNumericStatistics = {};
    const requestTexts: string[] = [];
    const responseTexts: string[] = [];
    const requestMetas: Array<GenerateRequestMeta & { statList: string[]; attempt: number; retryType: string }> = [];
    let lastJsonShadowDebug: JsonShadowMeta | null = null;
    let lastResponseMeta: GenerateRequestMeta | null = null;

    for (let index = 0; index < requestPlan.length; index += 1) {
      const planItem = requestPlan[index];
      const progressBase = index * 3;
      input.onProgress?.(progressBase, progressTotal, buildProgressRequest(planItem.label));
      const transportResult = await runTransport({
        context: input.context,
        reason: input.reason,
        messageIndex: input.messageIndex,
        settings: planItem.settings,
        activeCharacters: input.activeCharacters,
        entityResolution: input.entityResolution,
        previousTrackerData: input.previousTrackerData,
        previousStatistics: input.previousStatistics,
        previousCustomStatistics: input.previousCustomStatistics,
        previousCustomNonNumericStatistics: input.previousCustomNonNumericStatistics,
        responseMode: planItem.responseMode,
        statId: planItem.statId,
      });
      if (input.isCancelled?.()) {
        throw new DOMException("Request aborted by user", "AbortError");
      }
      if (!transportResult.ok) {
        const jsonShadowDebug = buildJsonExtractionShadowDebug({
          context: input.context,
          reason: input.reason,
          messageIndex: input.messageIndex,
          settings: planItem.settings,
          activeCharacters: input.activeCharacters,
          entityResolution: input.entityResolution,
          previousTrackerData: input.previousTrackerData,
          previousStatistics: input.previousStatistics,
          previousCustomStatistics: input.previousCustomStatistics,
          previousCustomNonNumericStatistics: input.previousCustomNonNumericStatistics,
          responseMode: planItem.responseMode,
          statId: planItem.statId,
          requestTextOverride: transportResult.requestText,
          rawJsonResponse: transportResult.responseText,
          responseMeta: transportResult.responseMeta,
        });
        return {
          mode: "fallback",
          jsonShadowDebug: {
            ...jsonShadowDebug,
            status: "response_invalid",
            validationErrors: transportResult.errors,
          },
        };
      }

      input.onProgress?.(progressBase + 1, progressTotal, buildProgressParse(planItem.label));
      mergeStatistics(statistics, transportResult.trackerData.statistics);
      mergeCustomStatistics(customStatistics, transportResult.trackerData.customStatistics ?? {});
      mergeCustomNonNumericStatistics(customNonNumericStatistics, transportResult.trackerData.customNonNumericStatistics ?? {});
      input.onProgress?.(progressBase + 2, progressTotal, buildProgressApply(planItem.label));
      requestTexts.push(transportResult.requestText);
      responseTexts.push(transportResult.responseText);
      lastResponseMeta = transportResult.responseMeta;
      requestMetas.push({
        ...transportResult.responseMeta,
        statList: planItem.statsRequested,
        attempt: index + 1,
        retryType: "json_protocol",
      });
      lastJsonShadowDebug = buildJsonExtractionShadowDebug({
        context: input.context,
        reason: input.reason,
        messageIndex: input.messageIndex,
        settings: planItem.settings,
        activeCharacters: input.activeCharacters,
        entityResolution: input.entityResolution,
        previousTrackerData: input.previousTrackerData,
        previousStatistics: input.previousStatistics,
        previousCustomStatistics: input.previousCustomStatistics,
        previousCustomNonNumericStatistics: input.previousCustomNonNumericStatistics,
        responseMode: planItem.responseMode,
        statId: planItem.statId,
        requestTextOverride: transportResult.requestText,
        rawJsonResponse: transportResult.responseText,
        responseMeta: transportResult.responseMeta,
      });
    }
    input.onProgress?.(progressTotal, progressTotal, "Finalizing");
    const responseMeta = lastResponseMeta ?? {
      profileId: "json_protocol",
      promptChars: requestTexts.join("").length,
      maxTokens: input.settings.maxTokensOverride || 0,
      durationMs: 0,
      outputChars: responseTexts.join("").length,
      timestamp: Date.now(),
    };
    const jsonShadowDebug = lastJsonShadowDebug ?? {
      status: "response_valid",
      protocolVersion: "bst.extract.v1",
    };

    return {
      mode: "success",
      statistics,
      customStatistics,
      customNonNumericStatistics,
      debug: buildDebugRecordFromJsonProtocolSuccess({
        requestText: requestTexts.join("\n\n--- JSON EXTRACTION REQUEST ---\n\n"),
        responseText: responseTexts.join("\n\n--- JSON EXTRACTION RESPONSE ---\n\n"),
        responseMeta,
        contextText: input.contextText,
        history: input.history,
        activeCharacters: input.activeCharacters,
        statistics,
        customStatistics,
        customNonNumericStatistics,
        statsRequested,
        jsonShadowDebug,
        settingsIncludeContext: input.settings.includeContextInDiagnostics,
        extractionMode: input.settings.sequentialExtraction ? "sequential" : "unified",
        attempts: requestPlan.length,
        requests: requestMetas,
      }),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return {
      mode: "fallback",
      jsonShadowDebug: buildJsonExtractionShadowDebug({
        context: input.context,
        reason: input.reason,
        messageIndex: input.messageIndex,
        settings: input.settings,
        activeCharacters: input.activeCharacters,
        entityResolution: input.entityResolution,
        previousTrackerData: input.previousTrackerData,
        previousStatistics: input.previousStatistics,
        previousCustomStatistics: input.previousCustomStatistics,
        previousCustomNonNumericStatistics: input.previousCustomNonNumericStatistics,
        transportError: error,
      }),
    };
  }
}
