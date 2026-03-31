import { GLOBAL_TRACKER_KEY } from "./constants";
import {
  resolveTrackerDataEntityOwnerSnapshot,
  resolveTrackerDataLookupValue,
  resolveTrackerEntityIdsForOwners,
} from "./entityRegistry";
import type { STContext, TrackerData } from "./types";

export function resolvePreviousTrackerExplicitEntityIds(
  registryContext: STContext | null,
  trackerData: TrackerData | null | undefined,
  ownerName: string,
): string[] {
  const snapshotEntityId = String(resolveTrackerDataEntityOwnerSnapshot(trackerData, ownerName)?.entityId ?? "").trim();
  if (snapshotEntityId) return [snapshotEntityId];
  if (!registryContext) return [];
  return resolveTrackerEntityIdsForOwners(registryContext, [ownerName])
    .map(entityId => String(entityId ?? "").trim())
    .filter(Boolean);
}

export function resolvePreviousTrackerLookupValue<T>(
  registryContext: STContext | null,
  trackerData: TrackerData | null | undefined,
  previousByOwner: Record<string, T> | null | undefined,
  previousByEntityId: Record<string, T> | null | undefined,
  ownerName: string,
): T | undefined {
  if (!previousByOwner && !previousByEntityId) return undefined;
  return resolveTrackerDataLookupValue({
    context: registryContext,
    data: trackerData,
    byOwner: previousByOwner,
    byEntityId: previousByEntityId,
    ownerName,
    explicitEntityIds: resolvePreviousTrackerExplicitEntityIds(registryContext, trackerData, ownerName),
  });
}

export function resolvePreviousCustomNonNumericValue(
  registryContext: STContext | null,
  previousByOwner: Record<string, unknown> | null | undefined,
  trackerData: TrackerData | null | undefined,
  previousByEntityId: Record<string, unknown> | null | undefined,
  ownerName: string,
  globalScope = false,
): unknown {
  if (!previousByOwner && !previousByEntityId) return undefined;
  if (globalScope) {
    return previousByOwner?.[GLOBAL_TRACKER_KEY]
      ?? resolvePreviousTrackerLookupValue(
        registryContext,
        trackerData,
        previousByOwner,
        previousByEntityId,
        ownerName,
      );
  }
  return resolvePreviousTrackerLookupValue(
    registryContext,
    trackerData,
    previousByOwner,
    previousByEntityId,
    ownerName,
  );
}
