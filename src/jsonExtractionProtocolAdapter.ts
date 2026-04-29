import { normalizeCustomNonNumericValue, normalizeCustomStatKind } from "./customStatRuntime";
import type {
  BetterSimTrackerSettings,
  CustomStatDefinition,
  CustomStatistics,
  STContext,
  Statistics,
  TrackerData,
  TrackerDataEntityResolution,
} from "./types";
import { GLOBAL_TRACKER_KEY } from "./constants";
import type { JsonExtractionResponseV1 } from "./jsonExtractionProtocol";
import type { JsonExtractionStatResponseV1, JsonExtractionStatsResponseV1 } from "./jsonExtractionProtocol";
import { applyConfidenceScaledDelta, resolveMoodWithConfidence, shouldPreserveFinalValueByConfidence as shouldPreserveFinalValueByConfidenceHelper } from "./extractorHelpers";
import { resolvePreviousTrackerLookupValue } from "./extractorRegistry";

type JsonAdapterSettings = Pick<
  BetterSimTrackerSettings,
  | "confidenceDampening"
  | "maxDeltaPerTurn"
  | "moodStickiness"
  | "defaultAffection"
  | "defaultTrust"
  | "defaultDesire"
  | "defaultConnection"
  | "defaultMood"
>;

type MaterializeJsonExtractionOptions = {
  context?: STContext | null;
  customStatDefinitions?: CustomStatDefinition[];
  settings?: JsonAdapterSettings;
  previousTrackerData?: TrackerData | null;
  previousStatistics?: Statistics | null;
  previousCustomStatistics?: CustomStatistics | null;
  previousCustomNonNumericStatistics?: NonNullable<TrackerData["customNonNumericStatistics"]> | null;
  bypassConfidenceControls?: boolean;
  timestamp?: number;
};

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

function coerceNumeric(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : (typeof value === "string" ? Number(value) : NaN);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function extractValueCell(rawValue: unknown): unknown {
  return isRecord(rawValue) && Object.prototype.hasOwnProperty.call(rawValue, "value")
    ? rawValue.value
    : rawValue;
}

function extractDeltaCell(rawValue: unknown): number | undefined {
  if (!isRecord(rawValue)) return undefined;
  const rawDelta = rawValue.delta;
  const delta = typeof rawDelta === "number" ? rawDelta : (typeof rawDelta === "string" ? Number(rawDelta) : NaN);
  return Number.isFinite(delta) ? delta : undefined;
}

function extractConfidenceCell(rawValue: unknown): number {
  if (!isRecord(rawValue)) return 0.8;
  const rawConfidence = rawValue.confidence;
  const confidence = typeof rawConfidence === "number"
    ? rawConfidence
    : (typeof rawConfidence === "string" ? Number(rawConfidence) : NaN);
  if (!Number.isFinite(confidence)) return 0.8;
  return Math.max(0, Math.min(1, confidence));
}

function applyJsonNumericDelta(input: {
  previousValue: number;
  rawValue: unknown;
  settings?: JsonAdapterSettings;
  maxDeltaOverride?: number;
  bypassConfidenceControls?: boolean;
}): number | undefined {
  const delta = extractDeltaCell(input.rawValue);
  if (delta === undefined) return coerceNumeric(extractValueCell(input.rawValue));
  const fallbackLimit = Math.max(1, Math.round(input.settings?.maxDeltaPerTurn || 15));
  const limit = Math.max(1, Math.round(Number(input.maxDeltaOverride ?? fallbackLimit) || fallbackLimit));
  return applyConfidenceScaledDelta({
    previousValue: input.previousValue,
    delta,
    confidence: extractConfidenceCell(input.rawValue),
    confidenceDampening: input.settings?.confidenceDampening ?? 0,
    maxDeltaPerTurn: limit,
    bypassConfidenceControls: input.bypassConfidenceControls,
  });
}

function buildEntityResolution(response: JsonExtractionResponseV1): TrackerDataEntityResolution {
  return {
    source: "model",
    resolvedEntities: response.entityResolution.resolvedEntities.map(entity => ({
      entityId: entity.entityId,
      kind: entity.kind === "owner" || entity.kind === "multi_character_alias"
        ? "st-character"
        : entity.kind,
      name: entity.ownerName,
      aliases: entity.aliases,
      inScene: entity.inScene,
      inMessage: entity.inMessage,
    })),
  };
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

function buildActiveCharacters(response: JsonExtractionResponseV1): string[] {
  const fromResolved = response.entityResolution.resolvedEntities
    .filter(entity => entity.inScene)
    .map(entity => entity.ownerName);
  return uniqueStrings([...response.entityResolution.sceneOwners, ...fromResolved]);
}

function previousBuiltInNumericValue(
  stat: "affection" | "trust" | "desire" | "connection",
  ownerName: string,
  options?: MaterializeJsonExtractionOptions,
): number {
  const previousByOwner = options?.previousStatistics?.[stat] as Record<string, number> | undefined;
  const previousByEntityId = options?.previousTrackerData?.statisticsByEntityId?.[stat] as Record<string, number> | undefined;
  const fallback = stat === "affection"
    ? options?.settings?.defaultAffection
    : stat === "trust"
      ? options?.settings?.defaultTrust
      : stat === "desire"
        ? options?.settings?.defaultDesire
        : options?.settings?.defaultConnection;
  return Number(
    resolvePreviousTrackerLookupValue(
      options?.context ?? null,
      options?.previousTrackerData,
      previousByOwner,
      previousByEntityId,
      ownerName,
    )
    ?? fallback
    ?? 50,
  );
}

function shouldPreservePreviousFinalValue(input: {
  rawValue: unknown;
  previousValue: unknown;
  settings?: JsonAdapterSettings;
  bypassConfidenceControls?: boolean;
}): boolean {
  return shouldPreserveFinalValueByConfidenceHelper({
    previousValue: input.previousValue,
    confidence: extractConfidenceCell(input.rawValue),
    confidenceThreshold: input.settings?.moodStickiness ?? 0,
    bypassConfidenceControls: input.bypassConfidenceControls,
  });
}

function buildBuiltInStatistics(
  response: Pick<JsonExtractionResponseV1, "builtInStats">,
  options?: MaterializeJsonExtractionOptions,
): Statistics {
  const statistics = emptyStatistics();
  for (const [ownerName, rawValue] of Object.entries(response.builtInStats.affection ?? {})) {
    const value = applyJsonNumericDelta({
      previousValue: previousBuiltInNumericValue("affection", ownerName, options),
      rawValue,
      settings: options?.settings,
      bypassConfidenceControls: options?.bypassConfidenceControls,
    });
    if (value !== undefined) statistics.affection[ownerName] = value;
  }
  for (const [ownerName, rawValue] of Object.entries(response.builtInStats.trust ?? {})) {
    const value = applyJsonNumericDelta({
      previousValue: previousBuiltInNumericValue("trust", ownerName, options),
      rawValue,
      settings: options?.settings,
      bypassConfidenceControls: options?.bypassConfidenceControls,
    });
    if (value !== undefined) statistics.trust[ownerName] = value;
  }
  for (const [ownerName, rawValue] of Object.entries(response.builtInStats.desire ?? {})) {
    const value = applyJsonNumericDelta({
      previousValue: previousBuiltInNumericValue("desire", ownerName, options),
      rawValue,
      settings: options?.settings,
      bypassConfidenceControls: options?.bypassConfidenceControls,
    });
    if (value !== undefined) statistics.desire[ownerName] = value;
  }
  for (const [ownerName, rawValue] of Object.entries(response.builtInStats.connection ?? {})) {
    const value = applyJsonNumericDelta({
      previousValue: previousBuiltInNumericValue("connection", ownerName, options),
      rawValue,
      settings: options?.settings,
      bypassConfidenceControls: options?.bypassConfidenceControls,
    });
    if (value !== undefined) statistics.connection[ownerName] = value;
  }
  for (const [ownerName, rawValue] of Object.entries(response.builtInStats.mood ?? {})) {
    const value = coerceText(extractValueCell(rawValue));
    if (value !== undefined) {
      const previousMood = String(
        resolvePreviousTrackerLookupValue(
          options?.context ?? null,
          options?.previousTrackerData,
          options?.previousStatistics?.mood,
          options?.previousTrackerData?.statisticsByEntityId?.mood,
          ownerName,
        )
        ?? options?.settings?.defaultMood
        ?? "Neutral",
      );
      statistics.mood[ownerName] = resolveMoodWithConfidence({
        previousMood,
        nextMood: value,
        confidence: extractConfidenceCell(rawValue),
        moodStickiness: options?.settings?.moodStickiness ?? 0,
        bypassConfidenceControls: options?.bypassConfidenceControls,
      });
    }
  }
  for (const [ownerName, rawValue] of Object.entries(response.builtInStats.lastThought ?? {})) {
    const value = coerceText(extractValueCell(rawValue));
    if (value !== undefined) {
      const previousThought = resolvePreviousTrackerLookupValue(
        options?.context ?? null,
        options?.previousTrackerData,
        options?.previousStatistics?.lastThought,
        options?.previousTrackerData?.statisticsByEntityId?.lastThought,
        ownerName,
      );
      statistics.lastThought[ownerName] = shouldPreservePreviousFinalValue({
        rawValue,
        previousValue: previousThought,
        settings: options?.settings,
        bypassConfidenceControls: options?.bypassConfidenceControls,
      })
        ? String(previousThought)
        : value;
    }
  }
  return statistics;
}

function assignScopedValue<T>(
  bucket: Record<string, T>,
  definition: CustomStatDefinition | undefined,
  ownerName: string,
  value: T,
): void {
  const targetOwner = definition?.globalScope === true ? GLOBAL_TRACKER_KEY : ownerName;
  if (
    definition?.globalScope === true
    && Object.prototype.hasOwnProperty.call(bucket, targetOwner)
    && ownerName !== GLOBAL_TRACKER_KEY
  ) {
    return;
  }
  bucket[targetOwner] = value;
}

function buildCustomStatistics(
  response: Pick<JsonExtractionResponseV1, "customStats">,
  definitionsById?: Map<string, CustomStatDefinition>,
  options?: MaterializeJsonExtractionOptions,
): CustomStatistics {
  const output: CustomStatistics = {};
  for (const [statId, bucket] of Object.entries(response.customStats)) {
    const definition = definitionsById?.get(statId);
    const nextBucket: Record<string, number> = {};
    for (const [ownerName, rawValue] of Object.entries(bucket ?? {})) {
      const previousBucket = options?.previousCustomStatistics?.[statId];
      const previousValue = Number(
        definition?.globalScope === true
          ? (
              previousBucket?.[GLOBAL_TRACKER_KEY]
              ?? previousBucket?.[ownerName]
              ?? definition.defaultValue
            )
          : (
              resolvePreviousTrackerLookupValue(
                options?.context ?? null,
                options?.previousTrackerData,
                previousBucket,
                options?.previousTrackerData?.customStatisticsByEntityId?.[statId],
                ownerName,
              )
              ?? definition?.defaultValue
              ?? 0
            ),
      );
      const value = applyJsonNumericDelta({
        previousValue,
        rawValue,
        settings: options?.settings,
        maxDeltaOverride: definition?.maxDeltaPerTurn,
        bypassConfidenceControls: options?.bypassConfidenceControls,
      });
      if (value !== undefined) assignScopedValue(nextBucket, definition, ownerName, value);
    }
    output[statId] = nextBucket;
  }
  return output;
}

function buildCustomNonNumericStatistics(
  response: Pick<JsonExtractionResponseV1, "customNonNumericStats">,
  definitionsById: Map<string, CustomStatDefinition>,
  options?: MaterializeJsonExtractionOptions,
): NonNullable<TrackerData["customNonNumericStatistics"]> {
  const customNonNumericStatistics: NonNullable<TrackerData["customNonNumericStatistics"]> = {};

  for (const [statId, bucket] of Object.entries(response.customNonNumericStats)) {
    const definition = definitionsById.get(statId);
    const nextBucket: Record<string, string | boolean | string[]> = {};
    for (const [ownerName, rawValue] of Object.entries(bucket ?? {})) {
      const previousBucket = options?.previousTrackerData?.customNonNumericStatisticsByEntityId?.[statId];
      const previousByOwner = options?.previousCustomNonNumericStatistics?.[statId];
      const previousValue = definition?.globalScope === true
        ? previousByOwner?.[GLOBAL_TRACKER_KEY] ?? previousByOwner?.[ownerName]
        : resolvePreviousTrackerLookupValue(
            options?.context ?? null,
            options?.previousTrackerData,
            previousByOwner,
            previousBucket,
            ownerName,
          );
      const normalized = normalizeCustomNonNumericValue(
        normalizeCustomStatKind(definition?.kind),
        extractValueCell(rawValue),
        {
          enumOptions: definition?.enumOptions,
          textMaxLength: definition?.textMaxLength,
          dateTimeMode: definition?.dateTimeMode,
          previousValue,
          preserveExplicitEmptyArray: true,
        },
      );
      if (normalized === undefined) continue;
      const value = shouldPreservePreviousFinalValue({
        rawValue,
        previousValue,
        settings: options?.settings,
        bypassConfidenceControls: options?.bypassConfidenceControls,
      })
        ? previousValue
        : normalized;
      if (value !== undefined) assignScopedValue(nextBucket, definition, ownerName, value as string | boolean | string[]);
    }
    customNonNumericStatistics[statId] = nextBucket;
  }

  return customNonNumericStatistics;
}

export function materializeTrackerDataFromJsonExtractionResponseV1(
  response: JsonExtractionResponseV1,
  options?: MaterializeJsonExtractionOptions,
): TrackerData {
  const definitionsById = new Map((options?.customStatDefinitions ?? []).map(definition => [definition.id, definition] as const));

  return {
    timestamp: options?.timestamp ?? Date.now(),
    activeCharacters: buildActiveCharacters(response),
    entityResolution: buildEntityResolution(response),
    statistics: buildBuiltInStatistics(response, options),
    customStatistics: buildCustomStatistics(response, definitionsById, options),
    customNonNumericStatistics: buildCustomNonNumericStatistics(response, definitionsById, options),
  };
}

export function materializeTrackerDataFromJsonExtractionStatsResponseV1(
  response: JsonExtractionStatsResponseV1,
  options: {
    activeCharacters: string[];
    entityResolution?: TrackerDataEntityResolution | null;
  } & MaterializeJsonExtractionOptions,
): TrackerData {
  const definitionsById = new Map((options.customStatDefinitions ?? []).map(definition => [definition.id, definition] as const));

  return {
    timestamp: options.timestamp ?? Date.now(),
    activeCharacters: [...options.activeCharacters],
    entityResolution: options.entityResolution ?? undefined,
    statistics: buildBuiltInStatistics(response, options),
    customStatistics: buildCustomStatistics(response, definitionsById, options),
    customNonNumericStatistics: buildCustomNonNumericStatistics(response, definitionsById, options),
  };
}

export function materializeTrackerDataFromJsonExtractionStatResponseV1(
  response: JsonExtractionStatResponseV1,
  options: {
    activeCharacters: string[];
    entityResolution?: TrackerDataEntityResolution | null;
  } & MaterializeJsonExtractionOptions,
): TrackerData {
  const statistics = emptyStatistics();
  const customStatistics: CustomStatistics = {};
  const customNonNumericStatistics: NonNullable<TrackerData["customNonNumericStatistics"]> = {};
  const statId = response.statId;

  const putNumeric = (bucket: Record<string, unknown>): void => {
    for (const [ownerName, rawValue] of Object.entries(response.values)) {
      const value = applyJsonNumericDelta({
        previousValue: previousBuiltInNumericValue(statId as "affection" | "trust" | "desire" | "connection", ownerName, options),
        rawValue,
        settings: options.settings,
        bypassConfidenceControls: options.bypassConfidenceControls,
      });
      if (value !== undefined) bucket[ownerName] = value;
    }
  };
  const putText = (bucket: Record<string, unknown>): void => {
    for (const [ownerName, rawValue] of Object.entries(response.values)) {
      const value = coerceText(extractValueCell(rawValue));
      if (value !== undefined) bucket[ownerName] = value;
    }
  };

  if (statId === "affection") {
    putNumeric(statistics.affection);
  } else if (statId === "trust") {
    putNumeric(statistics.trust);
  } else if (statId === "desire") {
    putNumeric(statistics.desire);
  } else if (statId === "connection") {
    putNumeric(statistics.connection);
  } else if (statId === "mood") {
    for (const [ownerName, rawValue] of Object.entries(response.values)) {
      const value = coerceText(extractValueCell(rawValue));
      if (value === undefined) continue;
      const previousMood = String(
        resolvePreviousTrackerLookupValue(
          options.context ?? null,
          options.previousTrackerData,
          options.previousStatistics?.mood,
          options.previousTrackerData?.statisticsByEntityId?.mood,
          ownerName,
        )
        ?? options.settings?.defaultMood
        ?? "Neutral",
      );
      statistics.mood[ownerName] = resolveMoodWithConfidence({
        previousMood,
        nextMood: value,
        confidence: extractConfidenceCell(rawValue),
        moodStickiness: options.settings?.moodStickiness ?? 0,
        bypassConfidenceControls: options.bypassConfidenceControls,
      });
    }
  } else if (statId === "lastThought") {
    for (const [ownerName, rawValue] of Object.entries(response.values)) {
      const value = coerceText(extractValueCell(rawValue));
      if (value === undefined) continue;
      const previousThought = resolvePreviousTrackerLookupValue(
        options.context ?? null,
        options.previousTrackerData,
        options.previousStatistics?.lastThought,
        options.previousTrackerData?.statisticsByEntityId?.lastThought,
        ownerName,
      );
      statistics.lastThought[ownerName] = shouldPreservePreviousFinalValue({
        rawValue,
        previousValue: previousThought,
        settings: options.settings,
        bypassConfidenceControls: options.bypassConfidenceControls,
      })
        ? String(previousThought)
        : value;
    }
  } else {
    const definition = (options.customStatDefinitions ?? []).find(candidate => candidate.id === statId);
    if (normalizeCustomStatKind(definition?.kind) === "numeric") {
      const bucket: Record<string, number> = {};
      for (const [ownerName, rawValue] of Object.entries(response.values)) {
        const previousBucket = options.previousCustomStatistics?.[statId];
        const previousValue = Number(
          definition?.globalScope === true
            ? (
                previousBucket?.[GLOBAL_TRACKER_KEY]
                ?? previousBucket?.[ownerName]
                ?? definition.defaultValue
              )
            : (
                resolvePreviousTrackerLookupValue(
                  options.context ?? null,
                  options.previousTrackerData,
                  previousBucket,
                  options.previousTrackerData?.customStatisticsByEntityId?.[statId],
                  ownerName,
                )
                ?? definition?.defaultValue
                ?? 0
              ),
        );
        const value = applyJsonNumericDelta({
          previousValue,
          rawValue,
          settings: options.settings,
          maxDeltaOverride: definition?.maxDeltaPerTurn,
          bypassConfidenceControls: options.bypassConfidenceControls,
        });
        if (value !== undefined) assignScopedValue(bucket, definition, ownerName, value);
      }
      customStatistics[statId] = bucket;
    } else {
      const bucket: Record<string, string | boolean | string[]> = {};
      for (const [ownerName, rawValue] of Object.entries(response.values)) {
        const previousByOwner = options.previousCustomNonNumericStatistics?.[statId];
        const previousByEntityId = options.previousTrackerData?.customNonNumericStatisticsByEntityId?.[statId];
        const previousValue = definition?.globalScope === true
          ? previousByOwner?.[GLOBAL_TRACKER_KEY] ?? previousByOwner?.[ownerName]
          : resolvePreviousTrackerLookupValue(
              options.context ?? null,
              options.previousTrackerData,
              previousByOwner,
              previousByEntityId,
              ownerName,
            );
        const normalized = normalizeCustomNonNumericValue(
          normalizeCustomStatKind(definition?.kind),
          extractValueCell(rawValue),
          {
            enumOptions: definition?.enumOptions,
            textMaxLength: definition?.textMaxLength,
            dateTimeMode: definition?.dateTimeMode,
            previousValue,
            preserveExplicitEmptyArray: true,
          },
        );
        if (normalized === undefined) continue;
        const value = shouldPreservePreviousFinalValue({
          rawValue,
          previousValue,
          settings: options.settings,
          bypassConfidenceControls: options.bypassConfidenceControls,
        })
          ? previousValue
          : normalized;
        if (value !== undefined) assignScopedValue(bucket, definition, ownerName, value as string | boolean | string[]);
      }
      customNonNumericStatistics[statId] = bucket;
    }
  }

  return {
    timestamp: options.timestamp ?? Date.now(),
    activeCharacters: [...options.activeCharacters],
    entityResolution: options.entityResolution ?? undefined,
    statistics,
    customStatistics,
    customNonNumericStatistics,
  };
}
