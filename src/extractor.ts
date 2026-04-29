import { GLOBAL_TRACKER_KEY, STAT_KEYS, USER_TRACKER_KEY } from "./constants";
import { cancelActiveGenerations, generateJson } from "./generator";
import { parseCustomDeltaResponse, parseCustomValueResponse, parseUnifiedDeltaResponse } from "./parse";
import {
  DEFAULT_REPAIR_LAST_THOUGHT_TEMPLATE,
  DEFAULT_REPAIR_MOOD_TEMPLATE,
  DEFAULT_SEQUENTIAL_CUSTOM_NON_NUMERIC_PROMPT_INSTRUCTION,
  DEFAULT_SEQUENTIAL_CUSTOM_NUMERIC_PROMPT_INSTRUCTION,
  DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS,
  DEFAULT_STRICT_RETRY_TEMPLATE,
  buildSequentialCustomNonNumericPrompt,
  buildSequentialCustomNumericPrompt,
  buildSequentialPrompt,
  buildUnifiedAllStatsPrompt,
  buildUnifiedPrompt,
  moodOptions
} from "./prompts";
import { normalizeDateTimeWithMode } from "./dateTime";
import {
  applyConfidenceScaledDelta,
  buildPromptCurrentTrackerData,
  enabledBuiltInAndTextStats,
  enabledCustomStats,
  groupCustomStatsForSequential,
  resolveMoodWithConfidence,
  shouldBypassConfidenceControls,
  shouldPreserveFinalValueByConfidence,
} from "./extractorHelpers";
import { tryExtractStatisticsViaJsonProtocol } from "./extractorJsonProtocol";
import {
  buildProgressApply,
  buildProgressBaseline,
  buildProgressApplyingDefaults,
  buildProgressNoExtractionNeeded,
  buildProgressParse,
  buildProgressRequest,
  buildProgressSeedingDefaults,
  buildProgressUnifiedBatch,
  formatBuiltInProgressLabel,
  formatCustomGroupProgressLabel,
  formatCustomProgressLabel,
} from "./extractorProgress";
import { resolvePreviousCustomNonNumericValue, resolvePreviousTrackerLookupValue } from "./extractorRegistry";
import type {
  BetterSimTrackerSettings,
  CustomNonNumericValue,
  CustomNonNumericStatistics,
  CustomStatDefinition,
  CustomStatistics,
  DeltaDebugRecord,
  GenerateRequestMeta,
  STContext,
  StatKey,
  Statistics,
  TrackerData
} from "./types";

type JsonShadowDebug = NonNullable<NonNullable<DeltaDebugRecord["meta"]>["jsonShadow"]>;

export interface JsonExtractionProtocolFailureError extends Error {
  jsonShadowDebug: JsonShadowDebug;
}

export function isJsonExtractionProtocolFailure(error: unknown): error is JsonExtractionProtocolFailureError {
  return Boolean(
    error &&
    typeof error === "object" &&
    "jsonShadowDebug" in error &&
    (error as { jsonShadowDebug?: unknown }).jsonShadowDebug,
  );
}

function buildJsonExtractionFailure(errorDebug: JsonShadowDebug): JsonExtractionProtocolFailureError {
  const firstValidationError = errorDebug.validationErrors?.[0]?.trim();
  const transportError = errorDebug.transportError?.trim();
  const detail = firstValidationError || transportError || errorDebug.status;
  const message = `JSON extraction failed; legacy fallback is disabled in JSON Extraction mode.${detail ? ` ${detail}` : ""}`;
  return Object.assign(new Error(message), {
    name: "JsonExtractionProtocolFailure",
    jsonShadowDebug: errorDebug,
  });
}

function emptyStatistics(): Statistics {
  return {
    affection: {},
    trust: {},
    desire: {},
    connection: {},
    mood: {},
    lastThought: {}
  };
}

function hasAnyValues(values: Record<string, unknown>): boolean {
  return Object.keys(values).length > 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasParsedValues(parsed: ReturnType<typeof parseUnifiedDeltaResponse>): boolean {
  return (
    hasAnyValues(parsed.confidence) ||
    hasAnyValues(parsed.deltas.affection) ||
    hasAnyValues(parsed.deltas.trust) ||
    hasAnyValues(parsed.deltas.desire) ||
    hasAnyValues(parsed.deltas.connection) ||
    hasAnyValues(parsed.mood) ||
    hasAnyValues(parsed.lastThought)
  );
}

function hasValuesForRequestedBuiltInAndTextStats(
  parsed: ReturnType<typeof parseUnifiedDeltaResponse>,
  stats: StatKey[],
): boolean {
  for (const stat of stats) {
    if (stat === "affection" && hasAnyValues(parsed.deltas.affection)) return true;
    if (stat === "trust" && hasAnyValues(parsed.deltas.trust)) return true;
    if (stat === "desire" && hasAnyValues(parsed.deltas.desire)) return true;
    if (stat === "connection" && hasAnyValues(parsed.deltas.connection)) return true;
    if (stat === "mood" && hasAnyValues(parsed.mood)) return true;
    if (stat === "lastThought" && hasAnyValues(parsed.lastThought)) return true;
  }
  return false;
}

function hasCoverageForAllRequestedBuiltInAndTextStats(
  parsed: ReturnType<typeof parseUnifiedDeltaResponse>,
  stats: StatKey[],
): boolean {
  if (!stats.length) return true;
  for (const stat of stats) {
    if (stat === "affection" && !hasAnyValues(parsed.deltas.affection)) return false;
    if (stat === "trust" && !hasAnyValues(parsed.deltas.trust)) return false;
    if (stat === "desire" && !hasAnyValues(parsed.deltas.desire)) return false;
    if (stat === "connection" && !hasAnyValues(parsed.deltas.connection)) return false;
    if (stat === "mood" && !hasAnyValues(parsed.mood)) return false;
    if (stat === "lastThought" && !hasAnyValues(parsed.lastThought)) return false;
  }
  return true;
}

type ScopeResolutionDebug = {
  globalScope: boolean;
  resolvedFrom: "global" | "owner" | "legacy_fallback" | "global_fallback" | "entity_lookup" | "none";
  value: unknown;
  ownerValue?: unknown;
  globalValue?: unknown;
  legacyFallbackOwner?: string;
};

function resolveScopedDebugValue(
  registryContext: STContext | null,
  trackerData: TrackerData | null | undefined,
  byOwner: Record<string, unknown> | null | undefined,
  byEntityId: Record<string, unknown> | null | undefined,
  ownerName: string,
  globalScope?: boolean,
): ScopeResolutionDebug {
  const ownerValue = byOwner?.[ownerName];
  const globalValue = byOwner?.[GLOBAL_TRACKER_KEY];
  const legacyEntries = Object.entries(byOwner ?? {}).filter(([owner, value]) => owner !== GLOBAL_TRACKER_KEY && value !== undefined);
  const legacyFirst = legacyEntries.length ? legacyEntries[0] : null;
  const resolvedValue = resolvePreviousCustomNonNumericValue(
    registryContext,
    byOwner,
    trackerData,
    byEntityId,
    ownerName,
    Boolean(globalScope),
  );

  if (globalScope) {
    if (globalValue !== undefined && resolvedValue === globalValue) {
      return { globalScope: true, resolvedFrom: "global", value: resolvedValue, ownerValue, globalValue };
    }
    if (ownerValue !== undefined && resolvedValue === ownerValue) {
      return { globalScope: true, resolvedFrom: "owner", value: resolvedValue, ownerValue, globalValue };
    }
    if (legacyFirst && resolvedValue === legacyFirst[1]) {
      return {
        globalScope: true,
        resolvedFrom: "legacy_fallback",
        value: resolvedValue,
        ownerValue,
        globalValue,
        legacyFallbackOwner: legacyFirst[0],
      };
    }
    if (resolvedValue !== undefined) {
      return { globalScope: true, resolvedFrom: "entity_lookup", value: resolvedValue, ownerValue, globalValue };
    }
    return { globalScope: true, resolvedFrom: "none", value: undefined, ownerValue, globalValue };
  }

  if (ownerValue !== undefined && resolvedValue === ownerValue) {
    return { globalScope: false, resolvedFrom: "owner", value: resolvedValue, ownerValue, globalValue };
  }
  if (globalValue !== undefined && resolvedValue === globalValue) {
    return { globalScope: false, resolvedFrom: "global_fallback", value: resolvedValue, ownerValue, globalValue };
  }
  if (resolvedValue !== undefined) {
    return { globalScope: false, resolvedFrom: "entity_lookup", value: resolvedValue, ownerValue, globalValue };
  }
  return { globalScope: false, resolvedFrom: "none", value: undefined, ownerValue, globalValue };
}

function renderTemplate(template: string, values: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

function buildStrictJsonRetryPrompt(basePrompt: string): string {
  return renderTemplate(DEFAULT_STRICT_RETRY_TEMPLATE, { basePrompt });
}

function buildStatRepairRetryPrompt(basePrompt: string, stat: StatKey): string {
  if (stat === "mood") {
    return renderTemplate(DEFAULT_REPAIR_MOOD_TEMPLATE, { basePrompt, moodOptions: moodOptions.join(", ") });
  }
  if (stat === "lastThought") {
    return renderTemplate(DEFAULT_REPAIR_LAST_THOUGHT_TEMPLATE, { basePrompt });
  }
  return buildStrictJsonRetryPrompt(basePrompt);
}

function countMapValues(values: Record<string, unknown>): number {
  return Object.keys(values).length;
}

function countMapValuesByStat(values: Record<string, Record<string, unknown>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, map] of Object.entries(values)) {
    out[key] = Object.keys(map ?? {}).length;
  }
  return out;
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

function normalizeNameForCompare(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeTextForComparison(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeDebugText(value: string): string {
  return String(value ?? "")
    .replace(/\u2011/g, "-")
    .replace(/\u2012/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u201C/g, "\"")
    .replace(/\u201D/g, "\"")
    .replace(/â€“/g, "-")
    .replace(/â€”/g, "-")
    .replace(/â€‘/g, "-")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, "\"")
    .replace(/â€/g, "\"")
    .replace(/Â/g, "");
}

function resolveScopedStatOwnerKey(statDef: CustomStatDefinition, ownerName: string): string {
  return statDef.globalScope ? GLOBAL_TRACKER_KEY : ownerName;
}

function resolveLegacyNumericFallback(
  map: Record<string, number> | undefined,
): number | undefined {
  if (!map) return undefined;
  for (const [owner, value] of Object.entries(map)) {
    if (owner === GLOBAL_TRACKER_KEY) continue;
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function resolveLegacyNonNumericFallback(
  map: Record<string, CustomNonNumericValue> | undefined,
): CustomNonNumericValue | undefined {
  if (!map) return undefined;
  for (const [owner, value] of Object.entries(map)) {
    if (owner === GLOBAL_TRACKER_KEY) continue;
    if (value !== undefined) return value;
  }
  return undefined;
}

export async function extractStatisticsParallel(input: {
  context?: STContext | null;
  reason?: string;
  messageIndex?: number;
  settings: BetterSimTrackerSettings;
  userName: string;
  activeCharacters: string[];
  entityResolution?: TrackerData["entityResolution"] | null;
  preferredCharacterName?: string;
  contextText: string;
  previousTrackerData?: TrackerData | null;
  previousStatistics: Statistics | null;
  previousCustomStatistics?: CustomStatistics | null;
  previousCustomStatisticsRaw?: CustomStatistics | null;
  previousCustomNonNumericStatistics?: CustomNonNumericStatistics | null;
  hasPriorTrackerData?: boolean;
  history: TrackerData[];
  isCancelled?: () => boolean;
  onProgress?: (done: number, total: number, label?: string) => void;
  isOwnerStatEnabled?: (ownerName: string, statId: string) => boolean;
  bypassConfidenceControls?: boolean;
}): Promise<{
  statistics: Statistics;
  customStatistics: CustomStatistics;
  customNonNumericStatistics: CustomNonNumericStatistics;
  debug: DeltaDebugRecord | null;
}> {
  const {
    context,
    settings,
    userName,
    activeCharacters,
    entityResolution,
    preferredCharacterName,
    contextText,
    previousTrackerData,
    previousStatistics,
    previousCustomStatistics,
    previousCustomStatisticsRaw,
    previousCustomNonNumericStatistics,
    hasPriorTrackerData,
    history,
    onProgress,
    isOwnerStatEnabled,
    bypassConfidenceControls = false,
  } = input;
  const registryContext = context ?? null;
  const builtInAndTextStats = enabledBuiltInAndTextStats(settings).filter(stat =>
    activeCharacters.some(name => isOwnerStatEnabled?.(name, stat) !== false),
  );
  const customStats = enabledCustomStats(settings).filter(stat =>
    activeCharacters.some(name => isOwnerStatEnabled?.(name, stat.id) !== false),
  );
  const builtInPrivateStats = builtInAndTextStats.filter(stat => stat === "lastThought" && settings.lastThoughtPrivate);
  const builtInPublicStats = builtInAndTextStats.filter(stat => !builtInPrivateStats.includes(stat));
  const customPrivateStats = customStats.filter(stat => Boolean(stat.privateToOwner));
  const customPublicStats = customStats.filter(stat => !stat.privateToOwner);
  const customPublicGroups = groupCustomStatsForSequential(customPublicStats, settings.enableSequentialStatGroups);
  const customPrivateGroups = groupCustomStatsForSequential(customPrivateStats, settings.enableSequentialStatGroups);
  const output = emptyStatistics();
  const outputCustom: CustomStatistics = {};
  const outputCustomNonNumeric: CustomNonNumericStatistics = {};
  const promptCurrentData = buildPromptCurrentTrackerData({
    activeCharacters,
    entityResolution,
    previousTrackerData,
    previousStatistics,
    previousCustomStatistics,
    previousCustomNonNumericStatistics,
  });
  let debugRecord: DeltaDebugRecord | null = null;
  let jsonProtocolFallbackDebug: NonNullable<NonNullable<DeltaDebugRecord["meta"]>["jsonShadow"]> | null = null;
  let cancelled = false;
  let terminalError: unknown = null;
  const normalizedUserName = String(userName ?? "").trim();
  const nonUserActiveNames = activeCharacters
    .filter(name => name !== USER_TRACKER_KEY)
    .map(normalizeNameForCompare);
  const resolveUserPromptCharacterName = (): string => {
    const candidates = [
      normalizedUserName,
      "User",
      normalizedUserName ? `${normalizedUserName} (User)` : "",
      "User Persona",
    ]
      .map(item => item.trim())
      .filter(Boolean);
    for (const candidate of candidates) {
      const normalized = normalizeNameForCompare(candidate);
      if (!normalized) continue;
      if (!nonUserActiveNames.includes(normalized)) {
        return candidate;
      }
    }
    return "User";
  };
  const userPromptCharacterName = activeCharacters.includes(USER_TRACKER_KEY)
    ? resolveUserPromptCharacterName()
    : "";
  const promptCharacterAliases: Record<string, string> = {};
  if (userPromptCharacterName) {
    promptCharacterAliases[userPromptCharacterName] = USER_TRACKER_KEY;
    promptCharacterAliases["User"] = USER_TRACKER_KEY;
    if (normalizedUserName) {
      promptCharacterAliases[normalizedUserName] = USER_TRACKER_KEY;
    }
  }
  const applyPromptCharacterAliases = (prompt: string): string => {
    if (!userPromptCharacterName || userPromptCharacterName === USER_TRACKER_KEY) return prompt;
    return prompt.split(USER_TRACKER_KEY).join(userPromptCharacterName);
  };

  const isAbortError = (error: unknown): boolean => {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    const raw = typeof error === "string"
      ? error
      : error && typeof error === "object"
        ? [
            String((error as Record<string, unknown>).name ?? ""),
            String((error as Record<string, unknown>).message ?? ""),
            String((((error as Record<string, unknown>).meta as Record<string, unknown> | undefined)?.error ?? "")),
          ].join(" ")
        : "";
    const normalized = raw.toLowerCase();
    return normalized.includes("abort") || normalized.includes("cancel");
  };
  const checkCancelled = (): void => {
    if (cancelled || input.isCancelled?.()) {
      cancelled = true;
      throw new DOMException("Request aborted by user", "AbortError");
    }
  };
  const registerTerminalError = (error: unknown): void => {
    if (terminalError || isAbortError(error)) return;
    terminalError = error;
    cancelActiveGenerations();
  };

  if ((!builtInAndTextStats.length && !customStats.length) || !activeCharacters.length) {
    return {
      statistics: output,
      customStatistics: outputCustom,
      customNonNumericStatistics: outputCustomNonNumeric,
      debug: debugRecord
    };
  }

  const unifiedBatchCount = (() => {
    if (settings.sequentialExtraction) return 0;
    const hasPublicBatch = builtInPublicStats.length > 0 || customPublicStats.length > 0;
    const hasPrivateBatch = builtInPrivateStats.length > 0 || customPrivateStats.length > 0;
    const privateBatches = hasPrivateBatch ? activeCharacters.length : 0;
    return (hasPublicBatch ? 1 : 0) + privateBatches;
  })();
  const sequentialStatPasses =
    builtInPublicStats.length +
    customPublicGroups.length +
    (builtInPrivateStats.length * activeCharacters.length) +
    (customPrivateGroups.length > 0 ? customPrivateGroups.length * activeCharacters.length : 0);
  const progressTotal = settings.sequentialExtraction
    ? Math.max(1, sequentialStatPasses * 3)
    : Math.max(1, unifiedBatchCount * 3);
  onProgress?.(0, progressTotal, buildProgressBaseline());

  if (settings.extractionProtocolMode === "json") {
    const jsonProtocolAttempt = await tryExtractStatisticsViaJsonProtocol({
      context,
      reason: input.reason,
      messageIndex: input.messageIndex,
      settings,
      activeCharacters,
      entityResolution,
      previousTrackerData,
      previousStatistics,
      previousCustomStatistics,
      previousCustomNonNumericStatistics,
      contextText,
      history,
      isCancelled: input.isCancelled,
      onProgress,
    });
    if (jsonProtocolAttempt.mode === "success") {
      return {
        statistics: jsonProtocolAttempt.statistics,
        customStatistics: jsonProtocolAttempt.customStatistics,
        customNonNumericStatistics: jsonProtocolAttempt.customNonNumericStatistics,
        debug: jsonProtocolAttempt.debug,
      };
    }
    if (jsonProtocolAttempt.mode === "fallback") {
      throw buildJsonExtractionFailure(jsonProtocolAttempt.jsonShadowDebug);
    }
  }

  try {
    const applyDelta = (prev: number, delta: number, confidence: number, maxDeltaOverride?: number): number => {
      const fallbackLimit = Math.max(1, Math.round(settings.maxDeltaPerTurn || 15));
      const limit = Math.max(1, Math.round(Number(maxDeltaOverride ?? fallbackLimit) || fallbackLimit));
      return applyConfidenceScaledDelta({
        previousValue: prev,
        delta,
        confidence,
        confidenceDampening: settings.confidenceDampening,
        maxDeltaPerTurn: limit,
        bypassConfidenceControls,
      });
    };

    const applied = {
      affection: {} as Record<string, number>,
      trust: {} as Record<string, number>,
      desire: {} as Record<string, number>,
      connection: {} as Record<string, number>,
      mood: {} as Record<string, string>,
      lastThought: {} as Record<string, string>,
      customStatistics: {} as Record<string, Record<string, number>>,
      customNonNumericStatistics: {} as Record<string, Record<string, CustomNonNumericValue>>,
    };
    const moodFallbackApplied = new Set<string>();
    const parsed = {
      confidence: {} as Record<string, number>,
      deltas: {
        affection: {} as Record<string, number>,
        trust: {} as Record<string, number>,
        desire: {} as Record<string, number>,
        connection: {} as Record<string, number>,
        custom: {} as Record<string, Record<string, number>>,
        customNonNumeric: {} as Record<string, Record<string, CustomNonNumericValue>>,
      },
      mood: {} as Record<string, string>,
      lastThought: {} as Record<string, string>,
    };

    const shouldPreserveFinalValue = (confidence: number, previousValue: unknown): boolean => {
      return shouldPreserveFinalValueByConfidence({
        confidence,
        previousValue,
        confidenceThreshold: settings.moodStickiness,
        bypassConfidenceControls,
      });
    };

    const applyParsedForBuiltInOrTextStat = (
      stat: StatKey,
      parsedOne: ReturnType<typeof parseUnifiedDeltaResponse>,
    ): void => {
      for (const [name, value] of Object.entries(parsedOne.confidence)) {
        parsed.confidence[name] = value;
      }
      for (const name of activeCharacters) {
        if (isOwnerStatEnabled?.(name, stat) === false) continue;
        const confidence = parsedOne.confidence[name] ?? 0.8;
        if (stat === "affection" && parsedOne.deltas.affection[name] !== undefined) {
          parsed.deltas.affection[name] = parsedOne.deltas.affection[name];
          const prevAffection = Number(
            resolvePreviousTrackerLookupValue(
              registryContext,
              previousTrackerData,
              previousStatistics?.affection,
              previousTrackerData?.statisticsByEntityId?.affection,
              name,
            )
            ?? settings.defaultAffection,
          );
          const next = applyDelta(prevAffection, parsedOne.deltas.affection[name], confidence);
          output.affection[name] = next;
          applied.affection[name] = next;
        }
        if (stat === "trust" && parsedOne.deltas.trust[name] !== undefined) {
          parsed.deltas.trust[name] = parsedOne.deltas.trust[name];
          const prevTrust = Number(
            resolvePreviousTrackerLookupValue(
              registryContext,
              previousTrackerData,
              previousStatistics?.trust,
              previousTrackerData?.statisticsByEntityId?.trust,
              name,
            )
            ?? settings.defaultTrust,
          );
          const next = applyDelta(prevTrust, parsedOne.deltas.trust[name], confidence);
          output.trust[name] = next;
          applied.trust[name] = next;
        }
        if (stat === "desire" && parsedOne.deltas.desire[name] !== undefined) {
          parsed.deltas.desire[name] = parsedOne.deltas.desire[name];
          const prevDesire = Number(
            resolvePreviousTrackerLookupValue(
              registryContext,
              previousTrackerData,
              previousStatistics?.desire,
              previousTrackerData?.statisticsByEntityId?.desire,
              name,
            )
            ?? settings.defaultDesire,
          );
          const next = applyDelta(prevDesire, parsedOne.deltas.desire[name], confidence);
          output.desire[name] = next;
          applied.desire[name] = next;
        }
        if (stat === "connection" && parsedOne.deltas.connection[name] !== undefined) {
          parsed.deltas.connection[name] = parsedOne.deltas.connection[name];
          const prevConnection = Number(
            resolvePreviousTrackerLookupValue(
              registryContext,
              previousTrackerData,
              previousStatistics?.connection,
              previousTrackerData?.statisticsByEntityId?.connection,
              name,
            )
            ?? settings.defaultConnection,
          );
          const next = applyDelta(prevConnection, parsedOne.deltas.connection[name], confidence);
          output.connection[name] = next;
          applied.connection[name] = next;
        }
        if (stat === "mood" && parsedOne.mood[name] !== undefined) {
          parsed.mood[name] = parsedOne.mood[name];
          const prevMood = String(
            resolvePreviousTrackerLookupValue(
              registryContext,
              previousTrackerData,
              previousStatistics?.mood,
              previousTrackerData?.statisticsByEntityId?.mood,
              name,
            )
            ?? settings.defaultMood,
          );
          output.mood[name] = resolveMoodWithConfidence({
            previousMood: prevMood,
            nextMood: parsedOne.mood[name],
            confidence,
            moodStickiness: settings.moodStickiness,
            bypassConfidenceControls,
          });
          applied.mood[name] = output.mood[name] as string;
        }
        if (stat === "lastThought" && parsedOne.lastThought[name] !== undefined) {
          parsed.lastThought[name] = parsedOne.lastThought[name];
          const previousThought = resolvePreviousTrackerLookupValue(
            registryContext,
            previousTrackerData,
            previousStatistics?.lastThought,
            previousTrackerData?.statisticsByEntityId?.lastThought,
            name,
          );
          const nextThought = shouldPreserveFinalValue(confidence, previousThought)
            ? String(previousThought)
            : parsedOne.lastThought[name];
          output.lastThought[name] = nextThought;
          applied.lastThought[name] = nextThought;
        }
      }
      if (stat === "mood") {
        for (const name of activeCharacters) {
          if (isOwnerStatEnabled?.(name, stat) === false) continue;
          if (output.mood[name] !== undefined) continue;
          const prevMood = String(
            resolvePreviousTrackerLookupValue(
              registryContext,
              previousTrackerData,
              previousStatistics?.mood,
              previousTrackerData?.statisticsByEntityId?.mood,
              name,
            )
            ?? settings.defaultMood,
          );
          output.mood[name] = prevMood;
          applied.mood[name] = prevMood;
          moodFallbackApplied.add(name);
        }
      }
    };

    const applyParsedForCustomStat = (
      statDef: CustomStatDefinition,
      parsedOne: ReturnType<typeof parseCustomDeltaResponse>,
      requestCharacters: string[],
    ): void => {
      const statId = statDef.id;
      if (!parsed.deltas.custom[statId]) parsed.deltas.custom[statId] = {};
      if (!applied.customStatistics[statId]) applied.customStatistics[statId] = {};
      if (!outputCustom[statId]) outputCustom[statId] = {};
      for (const [name, value] of Object.entries(parsedOne.confidence)) {
        parsed.confidence[name] = value;
      }
      if (statDef.globalScope) {
        const sourceName = requestCharacters.find(name => parsedOne.delta[name] !== undefined);
        if (!sourceName) return;
        const delta = parsedOne.delta[sourceName];
        if (delta === undefined) return;
        const confidence = parsedOne.confidence[sourceName] ?? 0.8;
        const byOwner = previousCustomStatistics?.[statId];
        const prevValue = Number(
          byOwner?.[GLOBAL_TRACKER_KEY]
          ?? byOwner?.[sourceName]
          ?? resolveLegacyNumericFallback(byOwner)
          ?? statDef.defaultValue,
        );
        const next = applyDelta(prevValue, delta, confidence, statDef.maxDeltaPerTurn);
        parsed.deltas.custom[statId][GLOBAL_TRACKER_KEY] = delta;
        outputCustom[statId][GLOBAL_TRACKER_KEY] = next;
        applied.customStatistics[statId][GLOBAL_TRACKER_KEY] = next;
        return;
      }
      for (const name of requestCharacters) {
        if (isOwnerStatEnabled?.(name, statId) === false) continue;
        const delta = parsedOne.delta[name];
        if (delta === undefined) continue;
        parsed.deltas.custom[statId][name] = delta;
        const confidence = parsedOne.confidence[name] ?? 0.8;
        const prevValue = Number(
          resolvePreviousTrackerLookupValue(
            registryContext,
            previousTrackerData,
            previousCustomStatistics?.[statId],
            previousTrackerData?.customStatisticsByEntityId?.[statId],
            name,
          )
          ?? statDef.defaultValue,
        );
        const next = applyDelta(prevValue, delta, confidence, statDef.maxDeltaPerTurn);
        outputCustom[statId][name] = next;
        applied.customStatistics[statId][name] = next;
      }
    };

    const applyParsedForCustomNonNumericStat = (
      statDef: CustomStatDefinition,
      parsedOne: ReturnType<typeof parseCustomValueResponse>,
      requestCharacters: string[],
    ): void => {
      const statId = statDef.id;
      if (!parsed.deltas.customNonNumeric) parsed.deltas.customNonNumeric = {};
      if (!parsed.deltas.customNonNumeric[statId]) parsed.deltas.customNonNumeric[statId] = {};
      if (!applied.customNonNumericStatistics[statId]) applied.customNonNumericStatistics[statId] = {};
      if (!outputCustomNonNumeric[statId]) outputCustomNonNumeric[statId] = {};
      for (const [name, value] of Object.entries(parsedOne.confidence)) {
        parsed.confidence[name] = value;
      }
      if (statDef.globalScope) {
        const sourceName = parsedOne.value[GLOBAL_TRACKER_KEY] !== undefined
          ? GLOBAL_TRACKER_KEY
          : requestCharacters.find(name => parsedOne.value[name] !== undefined);
        if (!sourceName) return;
        const value = parsedOne.value[sourceName];
        if (value === undefined) return;
        const previousByOwner = previousCustomNonNumericStatistics?.[statId];
        const previousValue = (previousByOwner?.[GLOBAL_TRACKER_KEY] ?? previousByOwner?.[sourceName]) as CustomNonNumericValue | undefined;
        const confidence = parsedOne.confidence[sourceName] ?? 0.8;
        const next: CustomNonNumericValue | undefined = shouldPreserveFinalValue(confidence, previousValue)
          ? previousValue
          : value;
        if (next === undefined) return;
        parsed.deltas.customNonNumeric[statId][GLOBAL_TRACKER_KEY] = next;
        outputCustomNonNumeric[statId][GLOBAL_TRACKER_KEY] = next;
        applied.customNonNumericStatistics[statId][GLOBAL_TRACKER_KEY] = next;
        return;
      }
      for (const name of requestCharacters) {
        if (isOwnerStatEnabled?.(name, statId) === false) continue;
        const value = parsedOne.value[name];
        if (value === undefined) continue;
        const previousValue = resolvePreviousCustomNonNumericValue(
          registryContext,
          previousCustomNonNumericStatistics?.[statId] ?? null,
          previousTrackerData,
          previousTrackerData?.customNonNumericStatisticsByEntityId?.[statId] ?? null,
          name,
          false,
        ) as CustomNonNumericValue | undefined;
        const confidence = parsedOne.confidence[name] ?? 0.8;
        const next: CustomNonNumericValue | undefined = shouldPreserveFinalValue(confidence, previousValue)
          ? previousValue
          : value;
        if (next === undefined) continue;
        parsed.deltas.customNonNumeric[statId][name] = next;
        outputCustomNonNumeric[statId][name] = next;
        applied.customNonNumericStatistics[statId][name] = next;
      }
    };

    const seedCustomStatDefaultsForNames = (
      statDef: CustomStatDefinition,
      names: string[],
    ): void => {
      if (!names.length) return;
      const statId = statDef.id;
      if (!applied.customStatistics[statId]) applied.customStatistics[statId] = {};
      if (!outputCustom[statId]) outputCustom[statId] = {};
      if (statDef.globalScope) {
        const seedKey = GLOBAL_TRACKER_KEY;
        const byOwner = previousCustomStatistics?.[statId];
        const seedValue = clamp(Number(
          byOwner?.[seedKey]
          ?? byOwner?.[names[0]]
          ?? resolveLegacyNumericFallback(byOwner)
          ?? statDef.defaultValue,
        ));
        outputCustom[statId][seedKey] = seedValue;
        applied.customStatistics[statId][seedKey] = seedValue;
        return;
      }
      for (const name of names) {
        if (isOwnerStatEnabled?.(name, statId) === false) continue;
        const seedValue = clamp(Number(
          resolvePreviousTrackerLookupValue(
            registryContext,
            previousTrackerData,
            previousCustomStatistics?.[statId],
            previousTrackerData?.customStatisticsByEntityId?.[statId],
            name,
          )
          ?? statDef.defaultValue,
        ));
        outputCustom[statId][name] = seedValue;
        applied.customStatistics[statId][name] = seedValue;
      }
    };

    const seedCustomNonNumericStatDefaultsForNames = (
      statDef: CustomStatDefinition,
      names: string[],
    ): void => {
      if (!names.length) return;
      const statId = statDef.id;
      if (!applied.customNonNumericStatistics[statId]) applied.customNonNumericStatistics[statId] = {};
      if (!outputCustomNonNumeric[statId]) outputCustomNonNumeric[statId] = {};
      const kind = statDef.kind ?? "numeric";
      if (statDef.globalScope) {
        const seedKey = GLOBAL_TRACKER_KEY;
        let seedValue: CustomNonNumericValue;
        const byOwner = previousCustomNonNumericStatistics?.[statId];
        const previous =
          byOwner?.[seedKey]
          ?? byOwner?.[names[0]]
          ?? resolveLegacyNonNumericFallback(byOwner);
        if (previous !== undefined) {
          if (Array.isArray(previous)) {
            const seen = new Set<string>();
            const normalized: string[] = [];
            for (const item of previous) {
              const clean = String(item ?? "").trim();
              if (!clean || seen.has(clean)) continue;
              seen.add(clean);
              normalized.push(clean);
              if (normalized.length >= 20) break;
            }
            seedValue = normalized;
          } else {
            seedValue = previous;
          }
        } else if (kind === "array") {
          const defaults = Array.isArray(statDef.defaultValue) ? statDef.defaultValue : [];
          const seen = new Set<string>();
          const normalized: string[] = [];
          for (const item of defaults) {
            const clean = String(item ?? "").trim();
            if (!clean || seen.has(clean)) continue;
            seen.add(clean);
            normalized.push(clean);
            if (normalized.length >= 20) break;
          }
          seedValue = normalized;
        } else if (kind === "boolean") {
          seedValue = typeof statDef.defaultValue === "boolean" ? statDef.defaultValue : false;
        } else {
          seedValue = String(statDef.defaultValue ?? "").trim();
        }
        outputCustomNonNumeric[statId][seedKey] = seedValue;
        applied.customNonNumericStatistics[statId][seedKey] = seedValue;
        return;
      }
      for (const name of names) {
        if (isOwnerStatEnabled?.(name, statId) === false) continue;
        let seedValue: CustomNonNumericValue;
        const previous = resolvePreviousTrackerLookupValue(
          registryContext,
          previousTrackerData,
          previousCustomNonNumericStatistics?.[statId],
          previousTrackerData?.customNonNumericStatisticsByEntityId?.[statId],
          name,
        );
        if (previous !== undefined) {
          if (Array.isArray(previous)) {
            const seen = new Set<string>();
            const normalized: string[] = [];
            for (const item of previous) {
              const clean = String(item ?? "").trim();
              if (!clean || seen.has(clean)) continue;
              seen.add(clean);
              normalized.push(clean);
              if (normalized.length >= 20) break;
            }
            seedValue = normalized;
          } else {
            seedValue = previous;
          }
        } else if (kind === "array") {
          const defaults = Array.isArray(statDef.defaultValue) ? statDef.defaultValue : [];
          const seen = new Set<string>();
          const normalized: string[] = [];
          for (const item of defaults) {
            const clean = String(item ?? "").trim();
            if (!clean || seen.has(clean)) continue;
            seen.add(clean);
            normalized.push(clean);
            if (normalized.length >= 20) break;
          }
          seedValue = normalized;
        } else if (kind === "boolean") {
          seedValue = typeof statDef.defaultValue === "boolean" ? statDef.defaultValue : false;
        } else {
          seedValue = String(statDef.defaultValue ?? "").trim();
        }
        outputCustomNonNumeric[statId][name] = seedValue;
        applied.customNonNumericStatistics[statId][name] = seedValue;
      }
    };

    const splitCustomCharactersByBaseline = (
      statId: string,
      kind: "numeric" | "non_numeric",
      statDef?: CustomStatDefinition,
      names: string[] = activeCharacters,
    ): { existing: string[]; firstRunSeedOnly: string[] } => {
      const hasPrior = Boolean(hasPriorTrackerData);
      // On first tracker in a chat, custom stats must be extracted from current context,
      // not seed-only from defaults.
      if (!hasPrior) {
        return { existing: [...names], firstRunSeedOnly: [] };
      }
      // For user-side extraction, custom stats should be inferred immediately
      // from the current user turn instead of being seed-only.
      if (names.length === 1 && names[0] === USER_TRACKER_KEY) {
        return { existing: [...names], firstRunSeedOnly: [] };
      }
      const rawMap = kind === "numeric"
        ? (previousCustomStatisticsRaw?.[statId] ?? {})
        : (previousCustomNonNumericStatistics?.[statId] ?? {});
      if (statDef?.globalScope) {
        const hasGlobal = rawMap[GLOBAL_TRACKER_KEY] !== undefined;
        const hasLegacyOwner = Object.entries(rawMap).some(([owner, value]) =>
          owner !== GLOBAL_TRACKER_KEY && value !== undefined,
        );
        return hasGlobal
          ? { existing: [...names], firstRunSeedOnly: [] }
          : hasLegacyOwner
            ? { existing: [...names], firstRunSeedOnly: [] }
            : { existing: [], firstRunSeedOnly: [...names] };
      }
      const existing: string[] = [];
      const firstRunSeedOnly: string[] = [];
      for (const name of names) {
        const previousValue = resolvePreviousTrackerLookupValue(
          registryContext,
          previousTrackerData,
          rawMap as Record<string, unknown>,
          kind === "numeric"
            ? previousTrackerData?.customStatisticsByEntityId?.[statId]
            : previousTrackerData?.customNonNumericStatisticsByEntityId?.[statId],
          name,
        );
        if (hasPrior && previousValue !== undefined) {
          existing.push(name);
        } else {
          firstRunSeedOnly.push(name);
        }
      }
      return { existing, firstRunSeedOnly };
    };

    let attempts = 0;
    let requestSeq = 0;
    let retryUsed = false;
    let firstParseHadValues = true;
    const rawBlocks: Array<{ label: string; raw: string }> = [];
    const promptBlocks: Array<{ label: string; prompt: string }> = [];
  const requestMetas: Array<GenerateRequestMeta & { statList: string[]; attempt: number; retryType: string }> = [];

  const buildScopeResolutionDebug = () => {
    const active = [...activeCharacters];
    const customDefs = customStats.filter(stat => (stat.kind ?? "numeric") !== "numeric");
    const currentByStat: Record<string, Record<string, ScopeResolutionDebug>> = {};
    for (const statDef of customDefs) {
      const statId = statDef.id;
      const sourceByOwner = previousCustomNonNumericStatistics?.[statId] as Record<string, unknown> | undefined;
      const sourceByEntityId = previousTrackerData?.customNonNumericStatisticsByEntityId?.[statId] as Record<string, unknown> | undefined;
      const byOwner: Record<string, ScopeResolutionDebug> = {};
      for (const owner of active) {
        byOwner[owner] = resolveScopedDebugValue(
          registryContext,
          previousTrackerData,
          sourceByOwner,
          sourceByEntityId,
          owner,
          Boolean(statDef.globalScope),
        );
      }
      currentByStat[statId] = byOwner;
    }

    const historyRows = history.slice(0, 3).map((entry, idx) => {
      const byStat: Record<string, Record<string, ScopeResolutionDebug>> = {};
      for (const statDef of customDefs) {
        const statId = statDef.id;
        const sourceByOwner = entry.customNonNumericStatistics?.[statId] as Record<string, unknown> | undefined;
        const sourceByEntityId = entry.customNonNumericStatisticsByEntityId?.[statId] as Record<string, unknown> | undefined;
        const byOwner: Record<string, ScopeResolutionDebug> = {};
        for (const owner of active) {
          byOwner[owner] = resolveScopedDebugValue(
            registryContext,
            entry,
            sourceByOwner,
            sourceByEntityId,
            owner,
            Boolean(statDef.globalScope),
          );
        }
        byStat[statId] = byOwner;
      }
      return {
        snapshotIndex: idx,
        messageIndex: (entry as { messageIndex?: number }).messageIndex ?? -1,
        byStat,
      };
    });

    return {
      current: currentByStat,
      history: historyRows,
    };
  };
    let progressDone = 0;
  const tickProgress = (label?: string): void => {
      if (terminalError) return;
      progressDone = Math.min(progressTotal, progressDone + 1);
      onProgress?.(progressDone, progressTotal, label);
    };
    const callGenerate = async (
      prompt: string,
      statList: string[],
      retryType: string,
    ): Promise<{ text: string; meta: GenerateRequestMeta }> => {
      const retryDelaysMs = [350, 1200];
      let lastError: unknown = null;
      for (let attemptIndex = 0; attemptIndex <= retryDelaysMs.length; attemptIndex += 1) {
        attempts += 1;
        requestSeq += 1;
        const attemptNo = requestSeq;
        try {
          checkCancelled();
          if (terminalError) throw terminalError;
          const response = await generateJson(prompt, settings);
          checkCancelled();
          if (terminalError) throw terminalError;
          const type = attemptIndex === 0 ? retryType : `${retryType}_transport_retry_${attemptIndex}`;
          requestMetas.push({ ...response.meta, statList, attempt: attemptNo, retryType: type });
          return response;
        } catch (error) {
          if (isAbortError(error) || input.isCancelled?.()) {
            cancelled = true;
            throw new DOMException("Request aborted by user", "AbortError");
          }
          lastError = error;
          if (attemptIndex >= retryDelaysMs.length) {
            registerTerminalError(error);
            throw error;
          }
          // Some providers transiently reject immediate follow-up requests after main generation.
          await wait(retryDelaysMs[attemptIndex]);
          checkCancelled();
        }
      }
      throw (lastError ?? new Error("Generation failed"));
    };

    const getSequentialTemplate = (stat: StatKey): string => {
      if (stat === "affection") return settings.promptTemplateSequentialAffection || DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS.affection;
      if (stat === "trust") return settings.promptTemplateSequentialTrust || DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS.trust;
      if (stat === "desire") return settings.promptTemplateSequentialDesire || DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS.desire;
      if (stat === "connection") return settings.promptTemplateSequentialConnection || DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS.connection;
      if (stat === "mood") return settings.promptTemplateSequentialMood || DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS.mood;
      return settings.promptTemplateSequentialLastThought || DEFAULT_SEQUENTIAL_PROMPT_INSTRUCTIONS.lastThought;
    };

    const getSequentialProtocolTemplate = (stat: StatKey): string => {
      if (stat === "affection") return settings.promptProtocolSequentialAffection;
      if (stat === "trust") return settings.promptProtocolSequentialTrust;
      if (stat === "desire") return settings.promptProtocolSequentialDesire;
      if (stat === "connection") return settings.promptProtocolSequentialConnection;
      if (stat === "mood") return settings.promptProtocolSequentialMood;
      return settings.promptProtocolSequentialLastThought;
    };

    const shouldTreatCustomTextShortValueAsPlaceholder = (
      statDef: CustomStatDefinition,
      characterName: string,
      value: string,
    ): boolean => {
      if (settings.sequentialExtraction) return false;
      if ((statDef.kind ?? "numeric") !== "text_short") return false;
      const previousValue = resolvePreviousCustomNonNumericValue(
        registryContext,
        previousCustomNonNumericStatistics?.[statDef.id] ?? null,
        previousTrackerData,
        previousTrackerData?.customNonNumericStatisticsByEntityId?.[statDef.id] ?? null,
        characterName,
        Boolean(statDef.globalScope),
      );
      if (typeof previousValue !== "string") return false;

      const nextNorm = normalizeTextForComparison(value);
      if (!nextNorm) return false;
      const prevNorm = normalizeTextForComparison(previousValue);
      if (prevNorm && prevNorm === nextNorm) return false;

      const labelNorm = normalizeTextForComparison(statDef.label || statDef.id);
      const idNorm = normalizeTextForComparison(statDef.id);
      const defaultNorm = normalizeTextForComparison(
        typeof statDef.defaultValue === "string" ? statDef.defaultValue : "",
      );

      if (nextNorm === labelNorm || nextNorm === idNorm) return true;
      if (defaultNorm && (defaultNorm === labelNorm || defaultNorm === idNorm) && nextNorm === defaultNorm) {
        return true;
      }
      return false;
    };

    const sanitizeParsedCustomNonNumeric = (
      statDef: CustomStatDefinition,
      requestCharacters: string[],
      parsedOne: ReturnType<typeof parseCustomValueResponse>,
    ): ReturnType<typeof parseCustomValueResponse> => {
      const kind = statDef.kind ?? "numeric";
      if (kind === "array") {
        const next = {
          confidence: { ...(parsedOne.confidence ?? {}) },
          value: { ...(parsedOne.value ?? {}) },
        };
        const toArrayItems = (raw: unknown): string[] => {
          const source = Array.isArray(raw)
            ? raw
            : typeof raw === "string"
              ? raw.split(/\r?\n|[,;]+/g)
              : [];
          const textMaxLength = Math.max(20, Math.min(200, Math.round(Number(statDef.textMaxLength) || 120)));
          const items: string[] = [];
          const seen = new Set<string>();
          for (const item of source) {
            const cleaned = String(item ?? "")
              .trim()
              .replace(/\s+/g, " ")
              .replace(/^[\s\-–—*•·\u2022\u25E6]+/, "")
              .replace(/^\s*\d+[\.\)]\s+/, "")
              .slice(0, textMaxLength);
            if (!cleaned) continue;
            const key = cleaned.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            items.push(cleaned);
            if (items.length >= 20) break;
          }
          return items;
        };
        const namesToCheck = statDef.globalScope && next.value[GLOBAL_TRACKER_KEY] !== undefined
          ? [GLOBAL_TRACKER_KEY]
          : requestCharacters;
        for (const name of namesToCheck) {
          const candidateRaw = next.value[name];
          if (candidateRaw === undefined) continue;
          const candidate = toArrayItems(candidateRaw);
          const previousByOwner = previousCustomNonNumericStatistics?.[statDef.id];
          const previousRaw = resolvePreviousCustomNonNumericValue(
            registryContext,
            previousByOwner ?? null,
            previousTrackerData,
            previousTrackerData?.customNonNumericStatisticsByEntityId?.[statDef.id] ?? null,
            name,
            Boolean(statDef.globalScope),
          );
          const previous = toArrayItems(previousRaw);
          const confidenceRaw = Number(next.confidence[name]);
          const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0.8;
          const isDestructiveDrop = previous.length > 0
            && candidate.length < previous.length
            && (candidate.length === 0 || candidate.length <= Math.floor(previous.length / 2));
          // For weak-model responses, preserve prior array state when change is overly destructive.
          if (isDestructiveDrop && confidence < 0.35) {
            if (previous.length > 0) {
              next.value[name] = previous;
            } else {
              delete next.value[name];
            }
            continue;
          }
          next.value[name] = candidate;
        }
        return next;
      }
      if (kind === "date_time") {
        const next = {
          confidence: { ...(parsedOne.confidence ?? {}) },
          value: { ...(parsedOne.value ?? {}) },
        };
        const mode = statDef.dateTimeMode === "structured" ? "structured" : "timestamp";
        for (const name of requestCharacters) {
          const candidate = next.value[name];
          const previousByOwner = previousCustomNonNumericStatistics?.[statDef.id];
          const previous = resolvePreviousCustomNonNumericValue(
            registryContext,
            previousByOwner ?? null,
            previousTrackerData,
            previousTrackerData?.customNonNumericStatisticsByEntityId?.[statDef.id] ?? null,
            name,
            Boolean(statDef.globalScope),
          );
          const normalized = normalizeDateTimeWithMode(candidate, mode, previous);
          if (!normalized) {
            delete next.value[name];
            continue;
          }
          const previousNormalized = normalizeDateTimeWithMode(previous, mode);
          if (mode === "structured" && previousNormalized && normalized < previousNormalized) {
            next.value[name] = previousNormalized;
            continue;
          }
          next.value[name] = normalized;
        }
        return next;
      }
      if (settings.sequentialExtraction || kind !== "text_short") return parsedOne;
      const next = {
        confidence: { ...(parsedOne.confidence ?? {}) },
        value: { ...(parsedOne.value ?? {}) },
      };
      for (const name of requestCharacters) {
        const candidate = next.value[name];
        if (typeof candidate !== "string") continue;
        if (shouldTreatCustomTextShortValueAsPlaceholder(statDef, name, candidate)) {
          delete next.value[name];
        }
      }
      return next;
    };

    const runOneBuiltInOrTextRequest = async (
      statList: StatKey[],
      requestCharacters: string[] = activeCharacters,
    ): Promise<{ prompt: string; raw: string; parsedOne: ReturnType<typeof parseUnifiedDeltaResponse> }> => {
      checkCancelled();
      const progressLabel = formatBuiltInProgressLabel(statList);
      const builtPrompt = settings.sequentialExtraction && statList.length === 1
        ? buildSequentialPrompt(
            statList[0],
            userName,
            requestCharacters,
            contextText,
            previousStatistics,
            history,
            settings.maxDeltaPerTurn,
            getSequentialTemplate(statList[0]),
            getSequentialProtocolTemplate(statList[0]),
            preferredCharacterName,
            settings.includeCharacterCardsInPrompt,
            settings.includeLorebookInExtraction,
            {
              trackAffection: settings.trackAffection,
              trackTrust: settings.trackTrust,
              trackDesire: settings.trackDesire,
              trackConnection: settings.trackConnection,
              trackMood: settings.trackMood,
              trackLastThought: statList.includes("lastThought") && settings.trackLastThought,
            },
            context,
            promptCurrentData,
          )
        : buildUnifiedPrompt(
            statList,
            userName,
            requestCharacters,
            contextText,
            previousStatistics,
            history,
            settings.maxDeltaPerTurn,
            settings.promptTemplateUnified,
            settings.promptProtocolUnified,
            preferredCharacterName,
            settings.includeCharacterCardsInPrompt,
            settings.includeLorebookInExtraction,
            context,
            promptCurrentData,
          );
      const prompt = applyPromptCharacterAliases(builtPrompt);
      tickProgress(buildProgressRequest(progressLabel));
      let rawResponse = await callGenerate(prompt, statList, "initial");
      checkCancelled();
      let raw = rawResponse.text;
      tickProgress(buildProgressParse(progressLabel));
      let parsedOne = parseUnifiedDeltaResponse(raw, requestCharacters, statList, settings.maxDeltaPerTurn, promptCharacterAliases);
      const firstHasValues = hasParsedValues(parsedOne);
      firstParseHadValues = firstParseHadValues && firstHasValues;
      const hasRequestedCoverage = (candidate: ReturnType<typeof parseUnifiedDeltaResponse>): boolean =>
        settings.sequentialExtraction || statList.length <= 1
          ? hasValuesForRequestedBuiltInAndTextStats(candidate, statList)
          : hasCoverageForAllRequestedBuiltInAndTextStats(candidate, statList);
      let retriesLeft = Math.max(0, Math.min(4, settings.maxRetriesPerStat));
      if (!hasRequestedCoverage(parsedOne) && retriesLeft > 0 && settings.strictJsonRepair) {
        const retryPrompt = buildStrictJsonRetryPrompt(prompt);
        retryUsed = true;
        retriesLeft -= 1;
        const retryResponse = await callGenerate(retryPrompt, statList, "strict");
        checkCancelled();
        const retryParsed = parseUnifiedDeltaResponse(
          retryResponse.text,
          requestCharacters,
          statList,
          settings.maxDeltaPerTurn,
          promptCharacterAliases,
        );
        if (hasRequestedCoverage(retryParsed)) {
          raw = retryResponse.text;
          parsedOne = retryParsed;
        }
      }
      if (
        statList.length === 1 &&
        !hasRequestedCoverage(parsedOne) &&
        retriesLeft > 0 &&
        settings.strictJsonRepair
      ) {
        const repairPrompt = buildStatRepairRetryPrompt(prompt, statList[0]);
        retryUsed = true;
        retriesLeft -= 1;
        const repairResponse = await callGenerate(repairPrompt, statList, "repair");
        checkCancelled();
        const repairParsed = parseUnifiedDeltaResponse(
          repairResponse.text,
          requestCharacters,
          statList,
          settings.maxDeltaPerTurn,
          promptCharacterAliases,
        );
        if (hasRequestedCoverage(repairParsed)) {
          raw = repairResponse.text;
          parsedOne = repairParsed;
        }
      }
      while (!hasRequestedCoverage(parsedOne) && retriesLeft > 0 && settings.strictJsonRepair) {
        const strictPrompt = buildStrictJsonRetryPrompt(prompt);
        retryUsed = true;
        retriesLeft -= 1;
        const strictResponse = await callGenerate(strictPrompt, statList, "strict_loop");
        checkCancelled();
        const strictParsed = parseUnifiedDeltaResponse(
          strictResponse.text,
          requestCharacters,
          statList,
          settings.maxDeltaPerTurn,
          promptCharacterAliases,
        );
        if (hasRequestedCoverage(strictParsed)) {
          raw = strictResponse.text;
          parsedOne = strictParsed;
          break;
        }
      }
      tickProgress(buildProgressApply(progressLabel));
      return { prompt, raw, parsedOne };
    };

    const runOneCustomRequest = async (
      statDef: CustomStatDefinition,
      requestCharacters: string[],
    ): Promise<{
      prompt: string;
      raw: string;
      parsedNumeric?: ReturnType<typeof parseCustomDeltaResponse>;
      parsedNonNumeric?: ReturnType<typeof parseCustomValueResponse>;
    }> => {
      checkCancelled();
      const label = statDef.label || statDef.id;
      const progressLabel = formatCustomProgressLabel(statDef);
      const statId = statDef.id;
      const kind = statDef.kind ?? "numeric";
      const builtPrompt = kind === "numeric"
        ? buildSequentialCustomNumericPrompt({
          context,
          statId,
          statLabel: label,
          statDescription: statDef.description,
          statDefault: Number(statDef.defaultValue),
          maxDeltaPerTurn: statDef.maxDeltaPerTurn ?? settings.maxDeltaPerTurn,
          userName,
          characters: requestCharacters,
          contextText,
          current: previousStatistics,
          currentData: promptCurrentData,
          currentCustom: previousCustomStatistics ?? {},
          history,
          template: (statDef.promptOverride ?? statDef.sequentialPromptTemplate)
            || settings.promptTemplateSequentialCustomNumeric
            || DEFAULT_SEQUENTIAL_CUSTOM_NUMERIC_PROMPT_INSTRUCTION,
          protocolTemplate: settings.promptProtocolSequentialCustomNumeric,
          preferredCharacterName,
          includeCharacterCardsInPrompt: settings.includeCharacterCardsInPrompt,
          includeLorebookInExtraction: settings.includeLorebookInExtraction,
          builtInTracking: {
            trackAffection: settings.trackAffection,
            trackTrust: settings.trackTrust,
            trackDesire: settings.trackDesire,
            trackConnection: settings.trackConnection,
            trackMood: settings.trackMood,
          },
        })
        : buildSequentialCustomNonNumericPrompt({
          context,
          statId,
          statKind: kind,
          globalScope: statDef.globalScope,
          statLabel: label,
          statDescription: statDef.description,
          statDefault: kind === "boolean"
            ? (typeof statDef.defaultValue === "boolean" ? statDef.defaultValue : false)
            : kind === "array"
              ? (Array.isArray(statDef.defaultValue) ? statDef.defaultValue : [])
              : String(statDef.defaultValue ?? ""),
          enumOptions: statDef.enumOptions,
          textMaxLength: statDef.textMaxLength,
          dateTimeMode: statDef.dateTimeMode === "structured" ? "structured" : "timestamp",
          booleanTrueLabel: statDef.booleanTrueLabel,
          booleanFalseLabel: statDef.booleanFalseLabel,
          userName,
          characters: requestCharacters,
          contextText,
          current: previousStatistics,
          currentData: promptCurrentData,
          currentCustomNonNumeric: previousCustomNonNumericStatistics ?? {},
          history,
          template: (statDef.promptOverride ?? statDef.sequentialPromptTemplate)
            || settings.promptTemplateSequentialCustomNonNumeric
            || DEFAULT_SEQUENTIAL_CUSTOM_NON_NUMERIC_PROMPT_INSTRUCTION,
          protocolTemplate: settings.promptProtocolSequentialCustomNonNumeric,
          preferredCharacterName,
          includeCharacterCardsInPrompt: settings.includeCharacterCardsInPrompt,
          includeLorebookInExtraction: settings.includeLorebookInExtraction,
          builtInTracking: {
            trackAffection: settings.trackAffection,
            trackTrust: settings.trackTrust,
            trackDesire: settings.trackDesire,
            trackConnection: settings.trackConnection,
            trackMood: settings.trackMood,
          },
        });
      const prompt = applyPromptCharacterAliases(builtPrompt);
      tickProgress(buildProgressRequest(progressLabel));
      let rawResponse = await callGenerate(prompt, [statId], "initial");
      checkCancelled();
      let raw = rawResponse.text;
      tickProgress(buildProgressParse(progressLabel));
      let parsedNumeric = kind === "numeric"
        ? parseCustomDeltaResponse(
          raw,
          requestCharacters,
          statId,
          statDef.maxDeltaPerTurn ?? settings.maxDeltaPerTurn,
          promptCharacterAliases,
        )
        : undefined;
      let parsedNonNumeric = kind === "numeric"
        ? undefined
        : parseCustomValueResponse(raw, requestCharacters, statId, kind, {
          enumOptions: statDef.enumOptions,
          textMaxLength: statDef.textMaxLength,
          globalScope: Boolean(statDef.globalScope),
        }, promptCharacterAliases);
      if (kind !== "numeric" && parsedNonNumeric) {
        parsedNonNumeric = sanitizeParsedCustomNonNumeric(statDef, requestCharacters, parsedNonNumeric);
      }
      const firstHasValues = kind === "numeric"
        ? hasAnyValues(parsedNumeric?.delta ?? {})
        : hasAnyValues(parsedNonNumeric?.value ?? {});
      firstParseHadValues = firstParseHadValues && firstHasValues;
      let retriesLeft = Math.max(0, Math.min(4, settings.maxRetriesPerStat));
      while (
        !(kind === "numeric"
          ? hasAnyValues(parsedNumeric?.delta ?? {})
          : hasAnyValues(parsedNonNumeric?.value ?? {})) &&
        retriesLeft > 0 &&
        settings.strictJsonRepair
      ) {
        const strictPrompt = buildStrictJsonRetryPrompt(prompt);
        retryUsed = true;
        retriesLeft -= 1;
        const strictResponse = await callGenerate(strictPrompt, [statId], "strict_loop");
        checkCancelled();
        if (kind === "numeric") {
          const strictParsed = parseCustomDeltaResponse(
            strictResponse.text,
            requestCharacters,
            statId,
            statDef.maxDeltaPerTurn ?? settings.maxDeltaPerTurn,
            promptCharacterAliases,
          );
          if (hasAnyValues(strictParsed.delta)) {
            raw = strictResponse.text;
            parsedNumeric = strictParsed;
            break;
          }
        } else {
          const strictParsed = parseCustomValueResponse(strictResponse.text, requestCharacters, statId, kind, {
            enumOptions: statDef.enumOptions,
            textMaxLength: statDef.textMaxLength,
            globalScope: Boolean(statDef.globalScope),
          }, promptCharacterAliases);
          const sanitizedStrictParsed = sanitizeParsedCustomNonNumeric(statDef, requestCharacters, strictParsed);
          if (hasAnyValues(sanitizedStrictParsed.value)) {
            raw = strictResponse.text;
            parsedNonNumeric = sanitizedStrictParsed;
            break;
          }
        }
      }
      tickProgress(buildProgressApply(progressLabel));
      return { prompt, raw, parsedNumeric, parsedNonNumeric };
    };

    if (!settings.sequentialExtraction) {
      const runUnifiedBatch = async (
        batchLabel: string,
        requestCharacters: string[],
        batchBuiltInStats: StatKey[],
        batchCustomStats: CustomStatDefinition[],
      ): Promise<void> => {
        type UnifiedCustomPlan = {
          statDef: CustomStatDefinition;
          kind: "numeric" | "non_numeric";
          existing: string[];
        };
        const customPlans: UnifiedCustomPlan[] = batchCustomStats.map(statDef => {
          const kind = (statDef.kind ?? "numeric") === "numeric" ? "numeric" : "non_numeric";
          const split = splitCustomCharactersByBaseline(statDef.id, kind, statDef, requestCharacters);
          if (kind === "numeric") {
            seedCustomStatDefaultsForNames(statDef, split.firstRunSeedOnly);
          } else {
            seedCustomNonNumericStatDefaultsForNames(statDef, split.firstRunSeedOnly);
          }
          return {
            statDef,
            kind,
            existing: split.existing,
          };
        });

        const parseUnifiedAllFromRaw = (
          raw: string,
        ): {
          builtIn: ReturnType<typeof parseUnifiedDeltaResponse>;
          customNumeric: Record<string, ReturnType<typeof parseCustomDeltaResponse>>;
          customNonNumeric: Record<string, ReturnType<typeof parseCustomValueResponse>>;
        } => {
          const builtIn = parseUnifiedDeltaResponse(
            raw,
            requestCharacters,
            batchBuiltInStats,
            settings.maxDeltaPerTurn,
            promptCharacterAliases,
          );
          const customNumeric: Record<string, ReturnType<typeof parseCustomDeltaResponse>> = {};
          const customNonNumeric: Record<string, ReturnType<typeof parseCustomValueResponse>> = {};
          for (const plan of customPlans) {
            if (!plan.existing.length) continue;
            if (plan.kind === "numeric") {
              customNumeric[plan.statDef.id] = parseCustomDeltaResponse(
                raw,
                plan.existing,
                plan.statDef.id,
                plan.statDef.maxDeltaPerTurn ?? settings.maxDeltaPerTurn,
                promptCharacterAliases,
              );
              continue;
            }
            const parsedValue = parseCustomValueResponse(
              raw,
              plan.existing,
              plan.statDef.id,
              plan.statDef.kind === "enum_single" || plan.statDef.kind === "boolean" || plan.statDef.kind === "text_short" || plan.statDef.kind === "array" || plan.statDef.kind === "date_time"
                ? plan.statDef.kind
                : "text_short",
              {
                enumOptions: plan.statDef.enumOptions,
                textMaxLength: plan.statDef.textMaxLength,
                globalScope: Boolean(plan.statDef.globalScope),
              },
              promptCharacterAliases,
            );
            customNonNumeric[plan.statDef.id] = sanitizeParsedCustomNonNumeric(plan.statDef, plan.existing, parsedValue);
          }
          return { builtIn, customNumeric, customNonNumeric };
        };

        const hasUnifiedAllCoverage = (
          parsedAll: {
            builtIn: ReturnType<typeof parseUnifiedDeltaResponse>;
            customNumeric: Record<string, ReturnType<typeof parseCustomDeltaResponse>>;
            customNonNumeric: Record<string, ReturnType<typeof parseCustomValueResponse>>;
          },
        ): boolean => {
          const builtInCovered = batchBuiltInStats.length <= 1
            ? hasValuesForRequestedBuiltInAndTextStats(parsedAll.builtIn, batchBuiltInStats)
            : hasCoverageForAllRequestedBuiltInAndTextStats(parsedAll.builtIn, batchBuiltInStats);
          if (!builtInCovered && batchBuiltInStats.length > 0) return false;
          for (const plan of customPlans) {
            if (!plan.existing.length) continue;
            if (plan.kind === "numeric") {
              if (!hasAnyValues(parsedAll.customNumeric[plan.statDef.id]?.delta ?? {})) return false;
            } else {
              if (!hasAnyValues(parsedAll.customNonNumeric[plan.statDef.id]?.value ?? {})) return false;
            }
          }
          return true;
        };

        const shouldRequestUnifiedAll = batchBuiltInStats.length > 0 || customPlans.some(plan => plan.existing.length > 0);
        if (!shouldRequestUnifiedAll) {
          tickProgress(buildProgressSeedingDefaults(batchLabel));
          tickProgress(buildProgressNoExtractionNeeded(batchLabel));
          tickProgress(buildProgressApplyingDefaults(batchLabel));
          return;
        }

        const allRequestedStats = [
          ...batchBuiltInStats,
          ...batchCustomStats.map(stat => stat.id),
        ];
        const builtPrompt = buildUnifiedAllStatsPrompt({
          context,
          stats: batchBuiltInStats,
          customStats: batchCustomStats,
          userName,
          characters: requestCharacters,
          contextText,
          current: previousStatistics,
          currentData: promptCurrentData,
          currentCustom: previousCustomStatistics ?? {},
          currentCustomNonNumeric: previousCustomNonNumericStatistics ?? {},
          history,
          maxDeltaPerTurn: settings.maxDeltaPerTurn,
          template: settings.promptTemplateUnified,
          preferredCharacterName,
          includeCharacterCardsInPrompt: settings.includeCharacterCardsInPrompt,
          includeLorebookInExtraction: settings.includeLorebookInExtraction,
          builtInTracking: {
            trackAffection: settings.trackAffection,
            trackTrust: settings.trackTrust,
            trackDesire: settings.trackDesire,
            trackConnection: settings.trackConnection,
            trackMood: settings.trackMood,
          },
        });
        const prompt = applyPromptCharacterAliases(builtPrompt);
        tickProgress(buildProgressRequest(buildProgressUnifiedBatch(batchLabel)));
        const response = await callGenerate(prompt, allRequestedStats, "initial");
        checkCancelled();
        let raw = response.text;
        tickProgress(buildProgressParse(buildProgressUnifiedBatch(batchLabel)));
        let parsedAll = parseUnifiedAllFromRaw(raw);
        const hasAnyCustomValues = Object.values(parsedAll.customNumeric).some(item => hasAnyValues(item.delta))
          || Object.values(parsedAll.customNonNumeric).some(item => hasAnyValues(item.value));
        firstParseHadValues = firstParseHadValues && (hasParsedValues(parsedAll.builtIn) || hasAnyCustomValues);
        let retriesLeft = Math.max(0, Math.min(4, settings.maxRetriesPerStat));
        while (!hasUnifiedAllCoverage(parsedAll) && retriesLeft > 0 && settings.strictJsonRepair) {
          retryUsed = true;
          retriesLeft -= 1;
          const strictPrompt = buildStrictJsonRetryPrompt(prompt);
          const strictResponse = await callGenerate(strictPrompt, allRequestedStats, "strict_loop");
          checkCancelled();
          const strictParsedAll = parseUnifiedAllFromRaw(strictResponse.text);
          if (hasUnifiedAllCoverage(strictParsedAll)) {
            raw = strictResponse.text;
            parsedAll = strictParsedAll;
            break;
          }
        }
        tickProgress(buildProgressApply(buildProgressUnifiedBatch(batchLabel)));
        rawBlocks.push({ label: batchLabel, raw });
        promptBlocks.push({ label: batchLabel, prompt });
        for (const stat of batchBuiltInStats) {
          applyParsedForBuiltInOrTextStat(stat, parsedAll.builtIn);
        }
        for (const plan of customPlans) {
          if (!plan.existing.length) continue;
          if (plan.kind === "numeric") {
            const parsedOne = parsedAll.customNumeric[plan.statDef.id];
            if (parsedOne) applyParsedForCustomStat(plan.statDef, parsedOne, plan.existing);
          } else {
            const parsedOne = parsedAll.customNonNumeric[plan.statDef.id];
            if (parsedOne) applyParsedForCustomNonNumericStat(plan.statDef, parsedOne, plan.existing);
          }
        }
      };

      if (builtInPublicStats.length > 0 || customPublicStats.length > 0) {
        await runUnifiedBatch("unified", activeCharacters, builtInPublicStats, customPublicStats);
      }
      if (builtInPrivateStats.length > 0 || customPrivateStats.length > 0) {
        for (const owner of activeCharacters) {
          await runUnifiedBatch(`unified-private:${owner}`, [owner], builtInPrivateStats, customPrivateStats);
        }
      }
    } else {
      const builtInQueue = [...builtInPublicStats];
      const builtInWorkers = Math.max(1, Math.min(settings.maxConcurrentCalls || 1, 8, builtInQueue.length || 1));
      const runBuiltInWorker = async (): Promise<void> => {
        while (builtInQueue.length) {
          checkCancelled();
          const stat = builtInQueue.shift();
          if (!stat) return;
          const one = await runOneBuiltInOrTextRequest([stat]);
          checkCancelled();
          if (terminalError) throw terminalError;
          rawBlocks.push({ label: stat, raw: one.raw });
          promptBlocks.push({ label: stat, prompt: one.prompt });
          applyParsedForBuiltInOrTextStat(stat, one.parsedOne);
        }
      };
      await Promise.all(Array.from({ length: builtInWorkers }, () => runBuiltInWorker()));

      const buildGroupedCustomTemplate = (group: CustomStatDefinition[]): string => {
        const lines: string[] = [
          `- Update only these custom stats in one response: ${group.map(stat => stat.id).join(", ")}.`,
          "- Keep updates conservative and realistic.",
          "- For array kind, prefer item-level maintenance (add/remove/edit) over full rewrites unless context clearly resets.",
        ];
        for (const stat of group) {
          const base = (stat.promptOverride ?? stat.sequentialPromptTemplate ?? "").trim();
          if (!base) continue;
          const rendered = base
            .replaceAll("{{statId}}", stat.id)
            .replaceAll("{{statLabel}}", stat.label || stat.id)
            .replaceAll("{{statDescription}}", stat.description ?? "");
          lines.push(`- ${stat.id}:`);
          for (const row of rendered.split(/\r?\n/g).map(item => item.trim()).filter(Boolean)) {
            lines.push(`  ${row}`);
          }
        }
        return lines.join("\n");
      };

      const runCustomGroupRequest = async (
        group: CustomStatDefinition[],
        requestCharacters: string[],
        labelPrefix: string,
      ): Promise<void> => {
        if (!group.length) return;
        if (group.length === 1) {
          const statDef = group[0];
          const kind = (statDef.kind ?? "numeric") === "numeric" ? "numeric" : "non_numeric";
          const split = splitCustomCharactersByBaseline(statDef.id, kind, statDef, requestCharacters);
          if (kind === "numeric") {
            seedCustomStatDefaultsForNames(statDef, split.firstRunSeedOnly);
          } else {
            seedCustomNonNumericStatDefaultsForNames(statDef, split.firstRunSeedOnly);
          }
          if (!split.existing.length) {
            const label = statDef.label || statDef.id;
            tickProgress(`Seeding ${formatCustomProgressLabel(statDef)}`);
            tickProgress(buildProgressNoExtractionNeeded(formatCustomProgressLabel(statDef)));
            tickProgress(buildProgressApply(formatCustomProgressLabel(statDef)));
            return;
          }
          const one = await runOneCustomRequest(statDef, split.existing);
          checkCancelled();
          rawBlocks.push({ label: `${labelPrefix}:${statDef.id}`, raw: one.raw });
          promptBlocks.push({ label: `${labelPrefix}:${statDef.id}`, prompt: one.prompt });
          if ((statDef.kind ?? "numeric") === "numeric") {
            if (one.parsedNumeric) applyParsedForCustomStat(statDef, one.parsedNumeric, split.existing);
          } else {
            if (one.parsedNonNumeric) applyParsedForCustomNonNumericStat(statDef, one.parsedNonNumeric, split.existing);
          }
          return;
        }

        const splitByStat = new Map<string, ReturnType<typeof splitCustomCharactersByBaseline>>();
        let hasAnyExisting = false;
        for (const statDef of group) {
          const kind = (statDef.kind ?? "numeric") === "numeric" ? "numeric" : "non_numeric";
          const split = splitCustomCharactersByBaseline(statDef.id, kind, statDef, requestCharacters);
          splitByStat.set(statDef.id, split);
          if (kind === "numeric") {
            seedCustomStatDefaultsForNames(statDef, split.firstRunSeedOnly);
          } else {
            seedCustomNonNumericStatDefaultsForNames(statDef, split.firstRunSeedOnly);
          }
          if (split.existing.length > 0) hasAnyExisting = true;
        }
        if (!hasAnyExisting) {
          const label = group.map(stat => stat.label || stat.id).join(", ");
          tickProgress(`Seeding ${formatCustomGroupProgressLabel(group)}`);
          tickProgress(buildProgressNoExtractionNeeded(formatCustomGroupProgressLabel(group)));
          tickProgress(buildProgressApply(formatCustomGroupProgressLabel(group)));
          return;
        }

        const statsForRequest = group.map(stat => stat.id);
        const requestTemplate = buildGroupedCustomTemplate(group);
        const builtPrompt = buildUnifiedAllStatsPrompt({
          context,
          stats: [],
          customStats: group,
          userName,
          characters: requestCharacters,
          contextText,
          current: previousStatistics,
          currentData: promptCurrentData,
          currentCustom: previousCustomStatistics ?? {},
          currentCustomNonNumeric: previousCustomNonNumericStatistics ?? {},
          history,
          maxDeltaPerTurn: settings.maxDeltaPerTurn,
          template: requestTemplate,
          preferredCharacterName,
          includeCharacterCardsInPrompt: settings.includeCharacterCardsInPrompt,
          includeLorebookInExtraction: settings.includeLorebookInExtraction,
          builtInTracking: {
            trackAffection: settings.trackAffection,
            trackTrust: settings.trackTrust,
            trackDesire: settings.trackDesire,
            trackConnection: settings.trackConnection,
            trackMood: settings.trackMood,
          },
          customOnlyMode: true,
        });
        const prompt = applyPromptCharacterAliases(builtPrompt);
        const groupLabel = group.map(stat => stat.id).join("+");
        const groupProgressLabel = formatCustomGroupProgressLabel(group);
        tickProgress(buildProgressRequest(groupProgressLabel));
        let response = await callGenerate(prompt, statsForRequest, "initial");
        checkCancelled();
        let raw = response.text;
        tickProgress(buildProgressParse(groupProgressLabel));
        const parseGroup = (rawText: string): {
          numeric: Record<string, ReturnType<typeof parseCustomDeltaResponse>>;
          nonNumeric: Record<string, ReturnType<typeof parseCustomValueResponse>>;
        } => {
          const numeric: Record<string, ReturnType<typeof parseCustomDeltaResponse>> = {};
          const nonNumeric: Record<string, ReturnType<typeof parseCustomValueResponse>> = {};
          for (const statDef of group) {
            const split = splitByStat.get(statDef.id);
            const requestNames = split?.existing ?? requestCharacters;
            if (!requestNames.length) continue;
            const kind = (statDef.kind ?? "numeric") === "numeric" ? "numeric" : "non_numeric";
            if (kind === "numeric") {
              numeric[statDef.id] = parseCustomDeltaResponse(
                rawText,
                requestNames,
                statDef.id,
                statDef.maxDeltaPerTurn ?? settings.maxDeltaPerTurn,
                promptCharacterAliases,
              );
            } else {
              const parsedValue = parseCustomValueResponse(
                rawText,
                requestNames,
                statDef.id,
                statDef.kind === "enum_single" || statDef.kind === "boolean" || statDef.kind === "text_short" || statDef.kind === "array" || statDef.kind === "date_time"
                  ? statDef.kind
                  : "text_short",
                {
                  enumOptions: statDef.enumOptions,
                  textMaxLength: statDef.textMaxLength,
                  globalScope: Boolean(statDef.globalScope),
                },
                promptCharacterAliases,
              );
              nonNumeric[statDef.id] = sanitizeParsedCustomNonNumeric(statDef, requestNames, parsedValue);
            }
          }
          return { numeric, nonNumeric };
        };

        let parsedGroup = parseGroup(raw);
        const hasCoverage = (candidate: { numeric: Record<string, ReturnType<typeof parseCustomDeltaResponse>>; nonNumeric: Record<string, ReturnType<typeof parseCustomValueResponse>> }): boolean =>
          group.every(statDef => {
            const split = splitByStat.get(statDef.id);
            if (!split?.existing?.length) return true;
            const kind = (statDef.kind ?? "numeric") === "numeric" ? "numeric" : "non_numeric";
            if (kind === "numeric") return hasAnyValues(candidate.numeric[statDef.id]?.delta ?? {});
            return hasAnyValues(candidate.nonNumeric[statDef.id]?.value ?? {});
          });
        let retriesLeft = Math.max(0, Math.min(4, settings.maxRetriesPerStat));
        while (!hasCoverage(parsedGroup) && retriesLeft > 0 && settings.strictJsonRepair) {
          retryUsed = true;
          retriesLeft -= 1;
          const strictPrompt = buildStrictJsonRetryPrompt(prompt);
          response = await callGenerate(strictPrompt, statsForRequest, "strict_loop");
          checkCancelled();
          const strictParsed = parseGroup(response.text);
          if (hasCoverage(strictParsed)) {
            raw = response.text;
            parsedGroup = strictParsed;
            break;
          }
        }
        tickProgress(buildProgressApply(groupProgressLabel));
        rawBlocks.push({ label: `${labelPrefix}:${groupLabel}`, raw });
        promptBlocks.push({ label: `${labelPrefix}:${groupLabel}`, prompt });
        for (const statDef of group) {
          const split = splitByStat.get(statDef.id);
          const requestNames = split?.existing ?? [];
          if (!requestNames.length) continue;
          const kind = (statDef.kind ?? "numeric") === "numeric" ? "numeric" : "non_numeric";
          if (kind === "numeric") {
            const parsedOne = parsedGroup.numeric[statDef.id];
            if (parsedOne) applyParsedForCustomStat(statDef, parsedOne, requestNames);
          } else {
            const parsedOne = parsedGroup.nonNumeric[statDef.id];
            if (parsedOne) applyParsedForCustomNonNumericStat(statDef, parsedOne, requestNames);
          }
        }
      };

      const customQueue = [...customPublicGroups];
      const customWorkers = Math.max(1, Math.min(settings.maxConcurrentCalls || 1, 8, customQueue.length || 1));
      const runCustomWorker = async (): Promise<void> => {
        while (customQueue.length) {
          checkCancelled();
          const group = customQueue.shift();
          if (!group?.length) return;
          await runCustomGroupRequest(group, activeCharacters, "custom");
          if (terminalError) throw terminalError;
        }
      };
      await Promise.all(Array.from({ length: customWorkers }, () => runCustomWorker()));

      for (const owner of activeCharacters) {
        for (const stat of builtInPrivateStats) {
          checkCancelled();
          const one = await runOneBuiltInOrTextRequest([stat], [owner]);
          checkCancelled();
          if (terminalError) throw terminalError;
          rawBlocks.push({ label: `${stat}:${owner}`, raw: one.raw });
          promptBlocks.push({ label: `${stat}:${owner}`, prompt: one.prompt });
          applyParsedForBuiltInOrTextStat(stat, one.parsedOne);
        }
      }

      for (const group of customPrivateGroups) {
        for (const owner of activeCharacters) {
          checkCancelled();
          await runCustomGroupRequest(group, [owner], `custom:${owner}`);
          if (terminalError) throw terminalError;
        }
      }
    }

    const rawOutputAggregate = rawBlocks.map(item => `--- ${item.label} ---\n${normalizeDebugText(item.raw)}`).join("\n\n");
    const promptAggregate = promptBlocks.map(item => `--- ${item.label} ---\n${normalizeDebugText(item.prompt)}`).join("\n\n");

    debugRecord = {
      rawModelOutput: rawOutputAggregate,
      promptText: settings.includeContextInDiagnostics ? promptAggregate : undefined,
      contextText: settings.includeContextInDiagnostics ? contextText : undefined,
      parsed,
      applied,
      meta: {
        promptChars: promptAggregate.length,
        contextChars: contextText.length,
        historySnapshots: history.length,
        activeCharacters: [...activeCharacters],
        statsRequested: [
          ...builtInAndTextStats,
          ...customStats.map(stat => stat.id),
        ],
        attempts,
        extractionMode: settings.sequentialExtraction ? "sequential" : "unified",
        retryUsed,
        firstParseHadValues,
        rawLength: rawOutputAggregate.length,
        parsedCounts: {
          confidence: countMapValues(parsed.confidence),
          affection: countMapValues(parsed.deltas.affection),
          trust: countMapValues(parsed.deltas.trust),
          desire: countMapValues(parsed.deltas.desire),
          connection: countMapValues(parsed.deltas.connection),
          mood: countMapValues(parsed.mood),
          lastThought: countMapValues(parsed.lastThought),
          customByStat: countMapValuesByStat(parsed.deltas.custom),
          customNonNumericByStat: countMapValuesByStat(parsed.deltas.customNonNumeric ?? {}),
        },
        appliedCounts: {
          affection: countMapValues(applied.affection),
          trust: countMapValues(applied.trust),
          desire: countMapValues(applied.desire),
          connection: countMapValues(applied.connection),
          mood: countMapValues(applied.mood),
          lastThought: countMapValues(applied.lastThought),
          customByStat: countMapValuesByStat(applied.customStatistics),
          customNonNumericByStat: countMapValuesByStat(applied.customNonNumericStatistics ?? {}),
        },
        moodFallbackApplied: Array.from(moodFallbackApplied),
        requests: requestMetas,
        scopeResolution: buildScopeResolutionDebug(),
        jsonShadow: jsonProtocolFallbackDebug ?? undefined,
      }
    };
  } catch (error) {
    if (terminalError && isAbortError(error)) {
      console.error("[BetterSimTracker] Unified extraction failed:", terminalError);
      throw terminalError;
    }
    if (isAbortError(error)) {
      cancelled = true;
    } else {
      console.error("[BetterSimTracker] Unified extraction failed:", error);
      throw error;
    }
  } finally {
    onProgress?.(progressTotal, progressTotal, "Finalizing");
  }

  if (terminalError) {
    throw terminalError;
  }
  if (cancelled) {
    throw new DOMException("Request aborted by user", "AbortError");
  }

  for (const key of STAT_KEYS) {
    if (!output[key]) output[key] = {};
  }

  return {
    statistics: output,
    customStatistics: outputCustom,
    customNonNumericStatistics: outputCustomNonNumeric,
    debug: debugRecord
  };
}
