import type {
  ClearedCustomNonNumericStatistics,
  ClearedCustomStatistics,
  ClearedStatistics,
  CustomNonNumericStatistics,
  CustomStatistics,
  Statistics,
  TrackerData,
} from "./types";

interface BuildEditedTrackerDataSnapshotInput {
  current: TrackerData;
  timestamp: number;
  activeCharacters: string[];
  statistics: Statistics;
  customStatistics?: CustomStatistics;
  customNonNumericStatistics?: CustomNonNumericStatistics;
  clearedStatistics?: ClearedStatistics;
  clearedCustomStatistics?: ClearedCustomStatistics;
  clearedCustomNonNumericStatistics?: ClearedCustomNonNumericStatistics;
}

export function buildEditedTrackerDataSnapshot(input: BuildEditedTrackerDataSnapshotInput): TrackerData {
  const current = input.current;
  return {
    timestamp: input.timestamp,
    activeCharacters: [...input.activeCharacters],
    entityResolution: current.entityResolution
      ? {
          sceneOwners: [...(current.entityResolution.sceneOwners ?? [])],
          messageOwners: [...(current.entityResolution.messageOwners ?? [])],
          sceneEntityIds: current.entityResolution.sceneEntityIds ? [...current.entityResolution.sceneEntityIds] : undefined,
          messageEntityIds: current.entityResolution.messageEntityIds ? [...current.entityResolution.messageEntityIds] : undefined,
          source: current.entityResolution.source,
        }
      : undefined,
    statistics: input.statistics,
    statisticsByEntityId: current.statisticsByEntityId ? structuredClone(current.statisticsByEntityId) : undefined,
    customStatistics: input.customStatistics,
    customStatisticsByEntityId: current.customStatisticsByEntityId ? structuredClone(current.customStatisticsByEntityId) : undefined,
    customNonNumericStatistics: input.customNonNumericStatistics,
    customNonNumericStatisticsByEntityId: current.customNonNumericStatisticsByEntityId
      ? structuredClone(current.customNonNumericStatisticsByEntityId)
      : undefined,
    clearedStatistics: input.clearedStatistics,
    clearedCustomStatistics: input.clearedCustomStatistics,
    clearedCustomNonNumericStatistics: input.clearedCustomNonNumericStatistics,
    entityOwnerMap: current.entityOwnerMap ? structuredClone(current.entityOwnerMap) : undefined,
  };
}
