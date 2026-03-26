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
}): TrackerData {
  const activeCharacters = normalizeList(input.activeCharacters);
  const activeEntityIds = normalizeList(input.activeEntityIds);
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
        created: Boolean(entity.created),
      })),
      source: input.source,
      unresolvedMentions: input.unresolvedMentions?.length ? [...input.unresolvedMentions] : undefined,
    },
    statistics: input.statistics,
    statisticsByEntityId: buildEntityScopedStatisticsBuckets(input.statistics, targetToEntity),
    customStatistics: input.customStatistics,
    customStatisticsByEntityId: buildEntityScopedCustomStatisticsBuckets(input.customStatistics, targetToEntity),
    customNonNumericStatistics: input.customNonNumericStatistics,
    customNonNumericStatisticsByEntityId: buildEntityScopedCustomNonNumericStatisticsBuckets(input.customNonNumericStatistics, targetToEntity),
  };
}
