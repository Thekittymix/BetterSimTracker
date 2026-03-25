import { resolveTrackerEntityIdsForOwners } from "./entityRegistry";
import { resolveStableEntityIdForOwner, type EntityTrackingMode } from "./entityResolution";
import type {
  CustomNonNumericStatistics,
  CustomStatistics,
  STContext,
  Statistics,
} from "./types";

function buildEntityScopedRecord<T>(
  byOwner: Record<string, T> | null | undefined,
  targetToEntity: Record<string, string>,
): Record<string, T> | undefined {
  if (!byOwner || typeof byOwner !== "object") return undefined;
  const out: Record<string, T> = {};
  for (const [owner, value] of Object.entries(byOwner)) {
    const entityId = targetToEntity[owner];
    if (!entityId) continue;
    out[entityId] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function buildTargetToEntityMap(
  context: STContext | null,
  ownerNames: string[],
  explicitEntityIds?: string[] | null,
  entityTrackingMode: EntityTrackingMode = "standard",
): Record<string, string> {
  const owners = ownerNames
    .map(name => String(name ?? "").trim())
    .filter(Boolean);
  const entityIds = (explicitEntityIds ?? [])
    .map(id => String(id ?? "").trim())
    .filter(Boolean);

  const out: Record<string, string> = {};
  for (let i = 0; i < owners.length; i += 1) {
    const owner = owners[i];
    const explicit = entityIds[i];
    if (explicit) {
      out[owner] = explicit;
      continue;
    }
    const resolved = resolveTrackerEntityIdsForOwners(context, [owner])[0]
      ?? resolveStableEntityIdForOwner(context, owner, entityTrackingMode);
    if (resolved) {
      out[owner] = resolved;
    }
  }
  return out;
}

export function buildEntityScopedStatisticsBuckets(
  statistics: Statistics,
  targetToEntity: Record<string, string>,
): Statistics | undefined {
  const next: Statistics = {
    affection: buildEntityScopedRecord(statistics.affection ?? {}, targetToEntity) ?? {},
    trust: buildEntityScopedRecord(statistics.trust ?? {}, targetToEntity) ?? {},
    desire: buildEntityScopedRecord(statistics.desire ?? {}, targetToEntity) ?? {},
    connection: buildEntityScopedRecord(statistics.connection ?? {}, targetToEntity) ?? {},
    mood: buildEntityScopedRecord(statistics.mood ?? {}, targetToEntity) ?? {},
    lastThought: buildEntityScopedRecord(statistics.lastThought ?? {}, targetToEntity) ?? {},
  };
  return Object.values(next).some(bucket => Object.keys(bucket).length) ? next : undefined;
}

export function buildEntityScopedCustomStatisticsBuckets(
  customStatistics: CustomStatistics | undefined,
  targetToEntity: Record<string, string>,
): CustomStatistics | undefined {
  if (!customStatistics) return undefined;
  const out: CustomStatistics = {};
  for (const [statId, bucket] of Object.entries(customStatistics)) {
    const nextBucket = buildEntityScopedRecord(bucket, targetToEntity);
    if (nextBucket && Object.keys(nextBucket).length) {
      out[statId] = nextBucket;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function buildEntityScopedCustomNonNumericStatisticsBuckets(
  customNonNumericStatistics: CustomNonNumericStatistics | undefined,
  targetToEntity: Record<string, string>,
): CustomNonNumericStatistics | undefined {
  if (!customNonNumericStatistics) return undefined;
  const out: CustomNonNumericStatistics = {};
  for (const [statId, bucket] of Object.entries(customNonNumericStatistics)) {
    const nextBucket = buildEntityScopedRecord(bucket, targetToEntity);
    if (nextBucket && Object.keys(nextBucket).length) {
      out[statId] = nextBucket;
    }
  }
  return Object.keys(out).length ? out : undefined;
}
