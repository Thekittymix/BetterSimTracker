import { GLOBAL_TRACKER_KEY } from "./constants";
import {
  listTrackerDataLookupNamesForEntityIds,
  resolveTrackerDataLookupValue,
} from "./entityRegistry";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "./types";

type TrackerSelectionInput = {
  ownerNames: string[];
  entityIds?: string[] | null;
};

export function hasTrackedValueForSelection(
  data: TrackerData,
  selection: TrackerSelectionInput,
  settingsInput: BetterSimTrackerSettings,
  context: STContext | null = null,
): boolean {
  const ownerNames = Array.from(new Set(
    (selection.ownerNames ?? [])
      .map(name => String(name ?? "").trim())
      .filter(Boolean),
  ));
  const entityIds = Array.from(new Set(
    (selection.entityIds ?? [])
      .map(id => String(id ?? "").trim())
      .filter(Boolean),
  ));
  const entityLookupNames = listTrackerDataLookupNamesForEntityIds(context, data, entityIds);
  const hasOwnerValue = <T>(input: {
    byOwner: Record<string, T> | null | undefined;
    byEntityId?: Record<string, T> | null | undefined;
  }): boolean => {
    if (input.byEntityId) {
      for (const entityId of entityIds) {
        if (input.byEntityId[entityId] !== undefined) return true;
      }
    }
    for (const ownerName of ownerNames) {
      if (resolveTrackerDataLookupValue({
        context,
        data,
        byOwner: input.byOwner,
        byEntityId: input.byEntityId,
        ownerName,
      }) !== undefined) {
        return true;
      }
    }
    return entityLookupNames.some(name => input.byOwner?.[name] !== undefined);
  };

  if (settingsInput.trackAffection && hasOwnerValue({ byOwner: data.statistics.affection, byEntityId: data.statisticsByEntityId?.affection })) return true;
  if (settingsInput.trackTrust && hasOwnerValue({ byOwner: data.statistics.trust, byEntityId: data.statisticsByEntityId?.trust })) return true;
  if (settingsInput.trackDesire && hasOwnerValue({ byOwner: data.statistics.desire, byEntityId: data.statisticsByEntityId?.desire })) return true;
  if (settingsInput.trackConnection && hasOwnerValue({ byOwner: data.statistics.connection, byEntityId: data.statisticsByEntityId?.connection })) return true;
  if (settingsInput.trackMood && hasOwnerValue({ byOwner: data.statistics.mood, byEntityId: data.statisticsByEntityId?.mood })) return true;
  if (settingsInput.trackLastThought && hasOwnerValue({ byOwner: data.statistics.lastThought, byEntityId: data.statisticsByEntityId?.lastThought })) return true;

  const customDefs = Array.isArray(settingsInput.customStats) ? settingsInput.customStats : [];
  for (const def of customDefs) {
    if (!def.track) continue;
    const statId = String(def.id ?? "").trim().toLowerCase();
    if (!statId) continue;
    const kind = def.kind ?? "numeric";
    const globalScope = Boolean(def.globalScope);
    if (kind === "numeric") {
      if (globalScope && data.customStatistics?.[statId]?.[GLOBAL_TRACKER_KEY] !== undefined) return true;
      if (hasOwnerValue({ byOwner: data.customStatistics?.[statId], byEntityId: data.customStatisticsByEntityId?.[statId] })) return true;
      continue;
    }
    if (globalScope && data.customNonNumericStatistics?.[statId]?.[GLOBAL_TRACKER_KEY] !== undefined) return true;
    if (hasOwnerValue({ byOwner: data.customNonNumericStatistics?.[statId], byEntityId: data.customNonNumericStatisticsByEntityId?.[statId] })) return true;
  }

  return false;
}

export function hasTrackedValueForOwner(
  data: TrackerData,
  ownerName: string,
  settingsInput: BetterSimTrackerSettings,
  context: STContext | null = null,
): boolean {
  return hasTrackedValueForSelection(
    data,
    { ownerNames: [ownerName] },
    settingsInput,
    context,
  );
}
