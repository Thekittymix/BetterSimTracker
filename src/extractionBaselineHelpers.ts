import { GLOBAL_TRACKER_KEY } from "./constants";
import {
  listTrackerDataLookupNamesForEntityIds,
  listTrackerDataLookupNamesForOwnerWithEntityFallback,
  resolveTrackerDataLookupValue,
} from "./entityRegistry";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "./types";

export type TrackerHistoryEntry = {
  data: TrackerData;
  messageIndex: number;
  timestamp: number;
};

type TrackerSelectionInput = {
  ownerNames: string[];
  entityIds?: string[] | null;
};

export function hasCharacterOwnedTrackedValueForSelection(
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
  const lookupNames = Array.from(new Set([
    ...ownerNames.flatMap(ownerName => listTrackerDataLookupNamesForOwnerWithEntityFallback(context, data, ownerName)),
    ...listTrackerDataLookupNamesForEntityIds(context, data, entityIds),
  ]));
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
    return lookupNames.some(name => input.byOwner?.[name] !== undefined);
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
    if (def.globalScope) continue;
    const statId = String(def.id ?? "").trim().toLowerCase();
    if (!statId) continue;
    const kind = def.kind ?? "numeric";
    if (kind === "numeric") {
      if (hasOwnerValue({ byOwner: data.customStatistics?.[statId], byEntityId: data.customStatisticsByEntityId?.[statId] })) return true;
      continue;
    }
    if (hasOwnerValue({ byOwner: data.customNonNumericStatistics?.[statId], byEntityId: data.customNonNumericStatisticsByEntityId?.[statId] })) return true;
  }

  return false;
}

export function hasCharacterOwnedTrackedValueForCharacter(
  data: TrackerData,
  characterName: string,
  settingsInput: BetterSimTrackerSettings,
  context: STContext | null = null,
): boolean {
  return hasCharacterOwnedTrackedValueForSelection(
    data,
    { ownerNames: [characterName] },
    settingsInput,
    context,
  );
}

export function selectLatestRelevantHistoryEntry(
  entries: TrackerHistoryEntry[],
  beforeIndex: number,
  predicate: (data: TrackerData) => boolean,
  messageIndexPredicate?: (messageIndex: number) => boolean,
): TrackerHistoryEntry | null {
  const relevant = entries
    .filter(entry => entry.messageIndex < beforeIndex)
    .filter(entry => (messageIndexPredicate ? messageIndexPredicate(entry.messageIndex) : true))
    .filter(entry => predicate(entry.data));

  if (!relevant.length) return null;

  relevant.sort((a, b) => {
    if (a.messageIndex !== b.messageIndex) return b.messageIndex - a.messageIndex;
    return b.timestamp - a.timestamp;
  });

  return relevant[0] ?? null;
}

export function overlayLatestGlobalCustomStats(
  base: TrackerData,
  latest: TrackerData | null,
  settingsInput: BetterSimTrackerSettings,
): TrackerData {
  if (!latest) return base;
  const customDefs = Array.isArray(settingsInput.customStats) ? settingsInput.customStats : [];
  const globalDefs = customDefs.filter(def => Boolean(def.track) && Boolean(def.globalScope));
  if (!globalDefs.length) return base;

  const next: TrackerData = {
    ...base,
    customStatistics: { ...(base.customStatistics ?? {}) },
    customNonNumericStatistics: { ...(base.customNonNumericStatistics ?? {}) },
  };
  const nextCustomNumeric = next.customStatistics ?? (next.customStatistics = {});
  const nextCustomNonNumeric = next.customNonNumericStatistics ?? (next.customNonNumericStatistics = {});

  for (const def of globalDefs) {
    const statId = String(def.id ?? "").trim().toLowerCase();
    if (!statId) continue;
    const kind = def.kind ?? "numeric";
    if (kind === "numeric") {
      const raw = latest.customStatistics?.[statId]?.[GLOBAL_TRACKER_KEY];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        const byOwner = { ...(nextCustomNumeric[statId] ?? {}) };
        byOwner[GLOBAL_TRACKER_KEY] = raw;
        nextCustomNumeric[statId] = byOwner;
      }
      continue;
    }
    const raw = latest.customNonNumericStatistics?.[statId]?.[GLOBAL_TRACKER_KEY];
    if (raw !== undefined) {
      const byOwner = { ...(nextCustomNonNumeric[statId] ?? {}) };
      byOwner[GLOBAL_TRACKER_KEY] = raw;
      nextCustomNonNumeric[statId] = byOwner;
    }
  }

  return next;
}

