import { buildJsonExtractionShadowDebug } from "./jsonExtractionProtocolDebug";
import { runJsonExtractionProtocolShadowTransport, type RunJsonExtractionProtocolShadowTransportInput } from "./jsonExtractionProtocolTransport";
import {
  buildProgressApply,
  buildProgressParse,
  buildProgressRequest,
} from "./extractorProgress";
import { enabledBuiltInAndTextStats, enabledCustomStats } from "./extractorHelpers";
import type {
  BetterSimTrackerSettings,
  CustomNonNumericStatistics,
  CustomStatistics,
  DeltaDebugRecord,
  GenerateRequestMeta,
  STContext,
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
): Array<GenerateRequestMeta & { statList: string[]; attempt: number; retryType: string }> {
  return [
    {
      ...responseMeta,
      statList: statsRequested,
      attempt: 1,
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
      attempts: 1,
      extractionMode: "unified",
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
      requests: buildRequestMeta(input.responseMeta, input.statsRequested),
      jsonShadow: input.jsonShadowDebug,
    },
  };
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
  input.onProgress?.(0, 3, buildProgressRequest("JSON Protocol"));

  try {
    const transportResult = await runTransport({
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
    });
    if (input.isCancelled?.()) {
      throw new DOMException("Request aborted by user", "AbortError");
    }
    if (!transportResult.ok) {
      const jsonShadowDebug = buildJsonExtractionShadowDebug({
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

    input.onProgress?.(1, 3, buildProgressParse("JSON Protocol"));
    input.onProgress?.(2, 3, buildProgressApply("JSON Protocol"));
    const statistics = transportResult.trackerData.statistics;
    const customStatistics = transportResult.trackerData.customStatistics ?? {};
    const customNonNumericStatistics = transportResult.trackerData.customNonNumericStatistics ?? {};
    const jsonShadowDebug = buildJsonExtractionShadowDebug({
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
      requestTextOverride: transportResult.requestText,
      rawJsonResponse: transportResult.responseText,
      responseMeta: transportResult.responseMeta,
    });
    input.onProgress?.(3, 3, "Finalizing");

    return {
      mode: "success",
      statistics,
      customStatistics,
      customNonNumericStatistics,
      debug: buildDebugRecordFromJsonProtocolSuccess({
        requestText: transportResult.requestText,
        responseText: transportResult.responseText,
        responseMeta: transportResult.responseMeta,
        contextText: input.contextText,
        history: input.history,
        activeCharacters: input.activeCharacters,
        statistics,
        customStatistics,
        customNonNumericStatistics,
        statsRequested,
        jsonShadowDebug,
        settingsIncludeContext: input.settings.includeContextInDiagnostics,
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
