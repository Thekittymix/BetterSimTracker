import { normalizeCustomNonNumericValue, normalizeCustomStatKind } from "./customStatRuntime";
import type {
  CustomStatDefinition,
  CustomStatistics,
  Statistics,
  TrackerData,
  TrackerDataEntityResolution,
} from "./types";
import type { JsonExtractionResponseV1 } from "./jsonExtractionProtocol";
import type { JsonExtractionStatResponseV1 } from "./jsonExtractionProtocol";

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

function coerceText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
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

function buildBuiltInStatistics(response: JsonExtractionResponseV1): Statistics {
  const statistics = emptyStatistics();
  for (const [ownerName, rawValue] of Object.entries(response.builtInStats.affection ?? {})) {
    const value = coerceNumeric(rawValue);
    if (value !== undefined) statistics.affection[ownerName] = value;
  }
  for (const [ownerName, rawValue] of Object.entries(response.builtInStats.trust ?? {})) {
    const value = coerceNumeric(rawValue);
    if (value !== undefined) statistics.trust[ownerName] = value;
  }
  for (const [ownerName, rawValue] of Object.entries(response.builtInStats.desire ?? {})) {
    const value = coerceNumeric(rawValue);
    if (value !== undefined) statistics.desire[ownerName] = value;
  }
  for (const [ownerName, rawValue] of Object.entries(response.builtInStats.connection ?? {})) {
    const value = coerceNumeric(rawValue);
    if (value !== undefined) statistics.connection[ownerName] = value;
  }
  for (const [ownerName, rawValue] of Object.entries(response.builtInStats.mood ?? {})) {
    const value = coerceText(rawValue);
    if (value !== undefined) statistics.mood[ownerName] = value;
  }
  for (const [ownerName, rawValue] of Object.entries(response.builtInStats.lastThought ?? {})) {
    const value = coerceText(rawValue);
    if (value !== undefined) statistics.lastThought[ownerName] = value;
  }
  return statistics;
}

function buildCustomStatistics(response: JsonExtractionResponseV1): CustomStatistics {
  const output: CustomStatistics = {};
  for (const [statId, bucket] of Object.entries(response.customStats)) {
    const nextBucket: Record<string, number> = {};
    for (const [ownerName, rawValue] of Object.entries(bucket ?? {})) {
      const value = coerceNumeric(rawValue);
      if (value !== undefined) nextBucket[ownerName] = value;
    }
    output[statId] = nextBucket;
  }
  return output;
}

export function materializeTrackerDataFromJsonExtractionResponseV1(
  response: JsonExtractionResponseV1,
  options?: {
    customStatDefinitions?: CustomStatDefinition[];
    timestamp?: number;
  },
): TrackerData {
  const definitionsById = new Map((options?.customStatDefinitions ?? []).map(definition => [definition.id, definition] as const));
  const customNonNumericStatistics: NonNullable<TrackerData["customNonNumericStatistics"]> = {};

  for (const [statId, bucket] of Object.entries(response.customNonNumericStats)) {
    const definition = definitionsById.get(statId);
    const nextBucket: Record<string, string | boolean | string[]> = {};
    for (const [ownerName, rawValue] of Object.entries(bucket ?? {})) {
      const normalized = normalizeCustomNonNumericValue(
        normalizeCustomStatKind(definition?.kind),
        rawValue,
        {
          enumOptions: definition?.enumOptions,
          textMaxLength: definition?.textMaxLength,
          dateTimeMode: definition?.dateTimeMode,
          preserveExplicitEmptyArray: true,
        },
      );
      if (normalized !== undefined) nextBucket[ownerName] = normalized;
    }
    customNonNumericStatistics[statId] = nextBucket;
  }

  return {
    timestamp: options?.timestamp ?? Date.now(),
    activeCharacters: [...response.entityResolution.sceneOwners],
    entityResolution: buildEntityResolution(response),
    statistics: buildBuiltInStatistics(response),
    customStatistics: buildCustomStatistics(response),
    customNonNumericStatistics,
  };
}

export function materializeTrackerDataFromJsonExtractionStatResponseV1(
  response: JsonExtractionStatResponseV1,
  options: {
    activeCharacters: string[];
    entityResolution?: TrackerDataEntityResolution | null;
    customStatDefinitions?: CustomStatDefinition[];
    timestamp?: number;
  },
): TrackerData {
  const statistics = emptyStatistics();
  const customStatistics: CustomStatistics = {};
  const customNonNumericStatistics: NonNullable<TrackerData["customNonNumericStatistics"]> = {};
  const statId = response.statId;

  const putNumeric = (bucket: Record<string, unknown>): void => {
    for (const [ownerName, rawValue] of Object.entries(response.values)) {
      const value = coerceNumeric(rawValue);
      if (value !== undefined) bucket[ownerName] = value;
    }
  };
  const putText = (bucket: Record<string, unknown>): void => {
    for (const [ownerName, rawValue] of Object.entries(response.values)) {
      const value = coerceText(rawValue);
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
    putText(statistics.mood);
  } else if (statId === "lastThought") {
    putText(statistics.lastThought);
  } else {
    const definition = (options.customStatDefinitions ?? []).find(candidate => candidate.id === statId);
    if (normalizeCustomStatKind(definition?.kind) === "numeric") {
      const bucket: Record<string, number> = {};
      putNumeric(bucket);
      customStatistics[statId] = bucket;
    } else {
      const bucket: Record<string, string | boolean | string[]> = {};
      for (const [ownerName, rawValue] of Object.entries(response.values)) {
        const normalized = normalizeCustomNonNumericValue(
          normalizeCustomStatKind(definition?.kind),
          rawValue,
          {
            enumOptions: definition?.enumOptions,
            textMaxLength: definition?.textMaxLength,
            dateTimeMode: definition?.dateTimeMode,
            preserveExplicitEmptyArray: true,
          },
        );
        if (normalized !== undefined) bucket[ownerName] = normalized;
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
