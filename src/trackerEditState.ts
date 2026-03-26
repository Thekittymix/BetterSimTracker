import { resolveTrackerSceneOwners } from "./entityRegistry";
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

function resolveOwnerNameFallbackFromEntityId(entityId: string): string {
  const normalizedEntityId = normalizeToken(entityId);
  if (!normalizedEntityId) return "";
  if (normalizedEntityId.startsWith("bst_mc_alias:") || normalizedEntityId.startsWith("bst_manual:")) {
    return normalizedEntityId.slice(normalizedEntityId.lastIndexOf(":") + 1);
  }
  return "";
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

  const nextActiveCharacters = removeOwner(resolveTrackerSceneOwners(null, data));
  if (active) nextActiveCharacters.push(resolvedOwnerName);

  const nextEntityResolution = data.entityResolution
    ? {
        ...data.entityResolution,
        resolvedEntities: (data.entityResolution.resolvedEntities ?? [])
          .filter(entity => {
            if (entityId) return normalizeToken(entity.entityId) !== entityId;
            if (normalizeNameKey(entity.name) === ownerNeedle) return false;
            return normalizeNameKey(resolveOwnerNameFallbackFromEntityId(entity.entityId)) !== ownerNeedle;
          })
          .map(entity => ({
            ...entity,
            aliases: entity.aliases?.length ? [...entity.aliases] : undefined,
          })),
      }
    : undefined;

  if (active && nextEntityResolution) {
    nextEntityResolution.resolvedEntities.push({
      entityId: entityId || `bst_manual:${resolvedOwnerName.toLowerCase()}`,
      kind: "st-character",
      name: resolvedOwnerName,
      avatar: null,
      aliases: snapshot?.aliases?.length ? [...snapshot.aliases] : undefined,
      inScene: true,
      inMessage: false,
    });
  }

  return {
    ...data,
    activeCharacters: Array.from(new Set(nextActiveCharacters)),
    entityResolution: nextEntityResolution,
  };
}

export function buildEditedTrackerDataSnapshot(input: BuildEditedTrackerDataSnapshotInput): TrackerData {
  const current = input.current;
  const resolvedSceneOwners = resolveTrackerSceneOwners(null, current);
  return {
    timestamp: input.timestamp,
    activeCharacters: resolvedSceneOwners.length ? resolvedSceneOwners : [...input.activeCharacters],
    entityResolution: current.entityResolution ? structuredClone(current.entityResolution) : undefined,
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

export function syncEditedTrackerEntityState(
  data: TrackerData,
  ownerName: string,
): TrackerData {
  const snapshot = resolveEditedOwnerSnapshot(data.entityOwnerMap, ownerName);
  const entityId = normalizeToken(snapshot?.entityId);
  if (!entityId) return data;

  const ownerCandidates = Array.from(new Set([
    normalizeToken(ownerName),
    normalizeToken(snapshot?.ownerName),
    normalizeToken(snapshot?.canonicalName),
    ...((snapshot?.aliases ?? []).map(alias => normalizeToken(alias))),
  ].filter(Boolean)));

  const resolveOwnerValue = <T>(byOwner: Record<string, T> | undefined): T | undefined => {
    if (!byOwner) return undefined;
    for (const ownerCandidate of ownerCandidates) {
      const value = byOwner[ownerCandidate];
      if (value !== undefined) return value;
    }
    return undefined;
  };

  const syncBucket = <T>(
    byOwner: Record<string, T> | undefined,
    byEntityId: Record<string, T> | undefined,
  ): Record<string, T> | undefined => {
    if (!byOwner && !byEntityId) return byEntityId;
    const nextByEntityId = { ...(byEntityId ?? {}) };
    const ownerValue = resolveOwnerValue(byOwner);
    if (ownerValue === undefined) {
      delete nextByEntityId[entityId];
    } else {
      nextByEntityId[entityId] = ownerValue;
    }
    return Object.keys(nextByEntityId).length ? nextByEntityId : undefined;
  };

  const nextStatisticsByEntityId = {
    affection: syncBucket(data.statistics.affection, data.statisticsByEntityId?.affection) ?? {},
    trust: syncBucket(data.statistics.trust, data.statisticsByEntityId?.trust) ?? {},
    desire: syncBucket(data.statistics.desire, data.statisticsByEntityId?.desire) ?? {},
    connection: syncBucket(data.statistics.connection, data.statisticsByEntityId?.connection) ?? {},
    mood: syncBucket(data.statistics.mood, data.statisticsByEntityId?.mood) ?? {},
    lastThought: syncBucket(data.statistics.lastThought, data.statisticsByEntityId?.lastThought) ?? {},
  };

  const syncCustomBuckets = <T>(
    byOwnerRoot: Record<string, Record<string, T>> | undefined,
    byEntityRoot: Record<string, Record<string, T>> | undefined,
  ): Record<string, Record<string, T>> | undefined => {
    if (!byOwnerRoot && !byEntityRoot) return byEntityRoot;
    const nextRoot: Record<string, Record<string, T>> = {};
    const statIds = new Set([
      ...Object.keys(byOwnerRoot ?? {}),
      ...Object.keys(byEntityRoot ?? {}),
    ]);
    for (const statId of statIds) {
      const nextBucket = syncBucket(byOwnerRoot?.[statId], byEntityRoot?.[statId]);
      if (nextBucket && Object.keys(nextBucket).length) {
        nextRoot[statId] = nextBucket;
      }
    }
    return Object.keys(nextRoot).length ? nextRoot : undefined;
  };

  return {
    ...data,
    statisticsByEntityId: nextStatisticsByEntityId,
    customStatisticsByEntityId: syncCustomBuckets(data.customStatistics, data.customStatisticsByEntityId),
    customNonNumericStatisticsByEntityId: syncCustomBuckets(data.customNonNumericStatistics, data.customNonNumericStatisticsByEntityId),
  };
}
