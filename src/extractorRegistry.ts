import { GLOBAL_TRACKER_KEY } from "./constants";
import { resolveEntityRegistryLookupValue, resolveTrackerDataLookupValue } from "./entityRegistry";
import type { STContext, TrackerData } from "./types";

export function resolvePreviousCustomNonNumericValue(
  registryContext: STContext | null,
  previousByOwner: Record<string, unknown> | null | undefined,
  trackerData: TrackerData | null | undefined,
  previousByEntityId: Record<string, unknown> | null | undefined,
  ownerName: string,
  globalScope = false,
): unknown {
  if (!previousByOwner) return undefined;
  if (globalScope) {
    return previousByOwner[GLOBAL_TRACKER_KEY]
      ?? resolveTrackerDataLookupValue({
        context: registryContext,
        data: trackerData,
        byOwner: previousByOwner,
        byEntityId: previousByEntityId,
        ownerName,
      });
  }
  return resolveTrackerDataLookupValue({
    context: registryContext,
    data: trackerData,
    byOwner: previousByOwner,
    byEntityId: previousByEntityId,
    ownerName,
  });
}
