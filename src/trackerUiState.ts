import { resolveTrackerSceneOwners } from "./entityRegistry";
import { resolveNormalizedTrackerActiveCharacters } from "./storage";
import type { CustomNonNumericValue, TrackerData } from "./types";

export function cloneTrackerDataForEdit(data: TrackerData): TrackerData {
  const resolvedSceneOwners = resolveTrackerSceneOwners(null, data);
  const cloneCustomNumeric: TrackerData["customStatistics"] = {};
  for (const [statId, byOwner] of Object.entries(data.customStatistics ?? {})) {
    cloneCustomNumeric[statId] = { ...(byOwner ?? {}) };
  }

  const cloneCustomNonNumeric: TrackerData["customNonNumericStatistics"] = {};
  for (const [statId, byOwner] of Object.entries(data.customNonNumericStatistics ?? {})) {
    const next: Record<string, CustomNonNumericValue> = {};
    for (const [owner, value] of Object.entries(byOwner ?? {})) {
      next[owner] = Array.isArray(value) ? [...value] : value;
    }
    cloneCustomNonNumeric[statId] = next;
  }

  return {
    timestamp: data.timestamp,
    activeCharacters: resolveNormalizedTrackerActiveCharacters(data, resolvedSceneOwners),
    entityResolution: data.entityResolution
      ? {
          sceneOwners: [...(data.entityResolution.sceneOwners ?? [])],
          messageOwners: [...(data.entityResolution.messageOwners ?? [])],
          sceneEntityIds: data.entityResolution.sceneEntityIds ? [...data.entityResolution.sceneEntityIds] : undefined,
          messageEntityIds: data.entityResolution.messageEntityIds ? [...data.entityResolution.messageEntityIds] : undefined,
          source: data.entityResolution.source,
        }
      : undefined,
    statistics: {
      affection: { ...(data.statistics.affection ?? {}) },
      trust: { ...(data.statistics.trust ?? {}) },
      desire: { ...(data.statistics.desire ?? {}) },
      connection: { ...(data.statistics.connection ?? {}) },
      mood: { ...(data.statistics.mood ?? {}) },
      lastThought: { ...(data.statistics.lastThought ?? {}) },
    },
    statisticsByEntityId: data.statisticsByEntityId ? structuredClone(data.statisticsByEntityId) : undefined,
    customStatistics: cloneCustomNumeric,
    customStatisticsByEntityId: data.customStatisticsByEntityId ? structuredClone(data.customStatisticsByEntityId) : undefined,
    customNonNumericStatistics: cloneCustomNonNumeric,
    customNonNumericStatisticsByEntityId: data.customNonNumericStatisticsByEntityId
      ? structuredClone(data.customNonNumericStatisticsByEntityId)
      : undefined,
    clearedStatistics: data.clearedStatistics ? structuredClone(data.clearedStatistics) : undefined,
    clearedCustomStatistics: data.clearedCustomStatistics ? structuredClone(data.clearedCustomStatistics) : undefined,
    clearedCustomNonNumericStatistics: data.clearedCustomNonNumericStatistics
      ? structuredClone(data.clearedCustomNonNumericStatistics)
      : undefined,
    entityOwnerMap: data.entityOwnerMap
      ? Object.fromEntries(Object.entries(data.entityOwnerMap).map(([owner, snapshot]) => [owner, { ...snapshot, aliases: [...(snapshot.aliases ?? [])] }]))
      : undefined,
  };
}
