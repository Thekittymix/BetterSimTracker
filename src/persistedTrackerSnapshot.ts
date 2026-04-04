import {
  buildEntityScopedCustomNonNumericStatisticsBuckets,
  buildEntityScopedCustomStatisticsBuckets,
  buildEntityScopedStatisticsBuckets,
  buildTargetToEntityMap,
} from "./entityScopedBuckets";
import type {
  CustomNonNumericStatistics,
  CustomStatistics,
  STContext,
  Statistics,
  TrackerData,
  TrackerResolvedEntity,
} from "./types";
import type { EntityTrackingMode } from "./entityResolution";

function normalizeList(values: string[] | null | undefined): string[] {
  return Array.from(new Set((values ?? []).map(value => String(value ?? "").trim()).filter(Boolean)));
}

function filterStatisticsToActiveOwners(
  statistics: Statistics,
  activeOwners: string[],
): Statistics {
  const allowed = new Set(activeOwners.map(owner => String(owner ?? "").trim()).filter(Boolean));
  const filterBucket = (bucket: Record<string, unknown> | undefined): Record<string, unknown> => {
    if (!bucket || typeof bucket !== "object") return {};
    const out: Record<string, unknown> = {};
    for (const [owner, value] of Object.entries(bucket)) {
      if (allowed.has(String(owner ?? "").trim())) {
        out[owner] = value;
      }
    }
    return out;
  };
  return {
    affection: filterBucket(statistics.affection),
    trust: filterBucket(statistics.trust),
    desire: filterBucket(statistics.desire),
    connection: filterBucket(statistics.connection),
    mood: filterBucket(statistics.mood),
    lastThought: filterBucket(statistics.lastThought),
  } as Statistics;
}

function filterCustomStatisticsToActiveOwners(
  customStatistics: CustomStatistics | undefined,
  activeOwners: string[],
  globalStatIds?: Iterable<string>,
): CustomStatistics | undefined {
  if (!customStatistics) return undefined;
  const allowed = new Set(activeOwners.map(owner => String(owner ?? "").trim()).filter(Boolean));
  const globals = new Set(Array.from(globalStatIds ?? [], statId => String(statId ?? "").trim().toLowerCase()).filter(Boolean));
  const out: CustomStatistics = {};
  for (const [statId, bucket] of Object.entries(customStatistics)) {
    const normalizedStatId = String(statId ?? "").trim().toLowerCase();
    const keepGlobal = globals.has(normalizedStatId);
    const filtered: Record<string, number> = {};
    for (const [owner, value] of Object.entries(bucket ?? {})) {
      const ownerKey = String(owner ?? "").trim();
      if (!allowed.has(ownerKey) && !(keepGlobal && ownerKey === "__bst_global__")) continue;
      filtered[ownerKey] = Number(value);
    }
    if (Object.keys(filtered).length) {
      out[statId] = filtered;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function filterCustomNonNumericStatisticsToActiveOwners(
  customNonNumericStatistics: CustomNonNumericStatistics | undefined,
  activeOwners: string[],
  globalStatIds?: Iterable<string>,
): CustomNonNumericStatistics | undefined {
  if (!customNonNumericStatistics) return undefined;
  const allowed = new Set(activeOwners.map(owner => String(owner ?? "").trim()).filter(Boolean));
  const globals = new Set(Array.from(globalStatIds ?? [], statId => String(statId ?? "").trim().toLowerCase()).filter(Boolean));
  const out: CustomNonNumericStatistics = {};
  for (const [statId, bucket] of Object.entries(customNonNumericStatistics)) {
    const normalizedStatId = String(statId ?? "").trim().toLowerCase();
    const keepGlobal = globals.has(normalizedStatId);
    const filtered: Record<string, string | boolean | string[]> = {};
    for (const [owner, value] of Object.entries(bucket ?? {})) {
      const ownerKey = String(owner ?? "").trim();
      if (!allowed.has(ownerKey) && !(keepGlobal && ownerKey === "__bst_global__")) continue;
      filtered[ownerKey] = value;
    }
    if (Object.keys(filtered).length) {
      out[statId] = filtered;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function buildPersistedTrackerSnapshot(input: {
  context: STContext | null;
  timestamp?: number;
  activeCharacters: string[];
  activeEntityIds?: string[] | null;
  explicitTargetToEntity?: Record<string, string> | null;
  entityTrackingMode: EntityTrackingMode;
  resolvedEntities: TrackerResolvedEntity[];
  source: "model" | "fallback";
  unresolvedMentions?: string[] | undefined;
  statistics: Statistics;
  customStatistics?: CustomStatistics;
  customNonNumericStatistics?: CustomNonNumericStatistics;
  globalCustomStatisticIds?: Iterable<string>;
  globalCustomNonNumericStatisticIds?: Iterable<string>;
}): TrackerData {
  const activeCharacters = normalizeList(input.activeCharacters);
  const activeEntityIds = normalizeList(input.activeEntityIds);
  const filteredStatistics = filterStatisticsToActiveOwners(input.statistics, activeCharacters);
  const filteredCustomStatistics = filterCustomStatisticsToActiveOwners(
    input.customStatistics,
    activeCharacters,
    input.globalCustomStatisticIds,
  );
  const filteredCustomNonNumericStatistics = filterCustomNonNumericStatisticsToActiveOwners(
    input.customNonNumericStatistics,
    activeCharacters,
    input.globalCustomNonNumericStatisticIds,
  );
  const targetToEntity = {
    ...buildTargetToEntityMap(
      input.context,
      activeCharacters,
      activeEntityIds,
      input.entityTrackingMode,
    ),
    ...(input.explicitTargetToEntity ?? {}),
  };
  return {
    timestamp: input.timestamp ?? Date.now(),
    activeCharacters,
    entityResolution: {
      resolvedEntities: input.resolvedEntities.map(entity => ({
        ...entity,
        aliases: entity.aliases?.length ? [...entity.aliases] : undefined,
        ...(entity.sceneEvidence?.length ? { sceneEvidence: [...entity.sceneEvidence] } : {}),
        ...(entity.messageEvidence?.length ? { messageEvidence: [...entity.messageEvidence] } : {}),
        ...(typeof entity.sceneConfidence === "number" ? { sceneConfidence: entity.sceneConfidence } : {}),
        ...(typeof entity.messageConfidence === "number" ? { messageConfidence: entity.messageConfidence } : {}),
        created: Boolean(entity.created),
      })),
      source: input.source,
      unresolvedMentions: input.unresolvedMentions?.length ? [...input.unresolvedMentions] : undefined,
    },
    statistics: filteredStatistics,
    statisticsByEntityId: buildEntityScopedStatisticsBuckets(filteredStatistics, targetToEntity),
    customStatistics: filteredCustomStatistics,
    customStatisticsByEntityId: buildEntityScopedCustomStatisticsBuckets(filteredCustomStatistics, targetToEntity),
    customNonNumericStatistics: filteredCustomNonNumericStatistics,
    customNonNumericStatisticsByEntityId: buildEntityScopedCustomNonNumericStatisticsBuckets(filteredCustomNonNumericStatistics, targetToEntity),
  };
}
