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

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeNameKey(value: unknown): string {
  return normalizeToken(value).toLowerCase();
}

function resolveEditedOwnerSnapshot(
  entityOwnerMap: TrackerData["entityOwnerMap"] | undefined,
  ownerName: string,
): NonNullable<TrackerData["entityOwnerMap"]>[string] | null {
  if (!entityOwnerMap || typeof entityOwnerMap !== "object") return null;
  const direct = entityOwnerMap[ownerName];
  if (direct) return direct;
  const ownerNeedle = normalizeNameKey(ownerName);
  if (!ownerNeedle) return null;
  for (const snapshot of Object.values(entityOwnerMap)) {
    if (!snapshot) continue;
    const candidateKeys = new Set<string>([
      normalizeNameKey(snapshot.ownerName),
      normalizeNameKey(snapshot.canonicalName),
      ...((snapshot.aliases ?? []).map(alias => normalizeNameKey(alias))),
    ]);
    if (candidateKeys.has(ownerNeedle)) return snapshot;
  }
  return null;
}

export function applyEditedTrackerActiveState(
  data: TrackerData,
  ownerName: string,
  active: boolean,
): TrackerData {
  const ownerNeedle = normalizeNameKey(ownerName);
  if (!ownerNeedle) return data;

  const snapshot = resolveEditedOwnerSnapshot(data.entityOwnerMap, ownerName);
  const resolvedOwnerName = normalizeToken(snapshot?.ownerName) || normalizeToken(ownerName);
  const entityId = normalizeToken(snapshot?.entityId);
  const removeOwner = (values: string[] | undefined): string[] =>
    (values ?? []).filter(value => normalizeNameKey(value) !== ownerNeedle);
  const removeEntity = (values: string[] | undefined): string[] | undefined => {
    if (!values) return values;
    if (!entityId) return [...values];
    return values.filter(value => normalizeToken(value) !== entityId);
  };

  const nextActiveCharacters = removeOwner(data.activeCharacters);
  if (active) nextActiveCharacters.push(resolvedOwnerName);

  const nextEntityResolution = data.entityResolution
    ? {
        ...data.entityResolution,
        sceneOwners: removeOwner(data.entityResolution.sceneOwners),
        messageOwners: removeOwner(data.entityResolution.messageOwners),
        sceneEntityIds: removeEntity(data.entityResolution.sceneEntityIds),
        messageEntityIds: removeEntity(data.entityResolution.messageEntityIds),
      }
    : undefined;

  if (active && nextEntityResolution) {
    nextEntityResolution.sceneOwners.push(resolvedOwnerName);
    if (entityId) {
      nextEntityResolution.sceneEntityIds = [...(nextEntityResolution.sceneEntityIds ?? []), entityId];
    }
  }

  return {
    ...data,
    activeCharacters: Array.from(new Set(nextActiveCharacters)),
    entityResolution: nextEntityResolution
      ? {
          ...nextEntityResolution,
          sceneOwners: Array.from(new Set(nextEntityResolution.sceneOwners)),
          messageOwners: Array.from(new Set(nextEntityResolution.messageOwners)),
          sceneEntityIds: nextEntityResolution.sceneEntityIds?.length
            ? Array.from(new Set(nextEntityResolution.sceneEntityIds))
            : undefined,
          messageEntityIds: nextEntityResolution.messageEntityIds?.length
            ? Array.from(new Set(nextEntityResolution.messageEntityIds))
            : undefined,
        }
      : nextEntityResolution,
  };
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
