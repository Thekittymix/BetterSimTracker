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
    ...ownerNames.flatMap(ownerName => listTrackerDataLookupNamesForOwnerWithEntityFallback(context, data, ownerName, entityIds)),
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
        explicitEntityIds: entityIds,
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

export function overlayLatestOwnerScopedContinuity(
  base: TrackerData,
  latest: TrackerData | null,
  ownerKeys: string[],
): TrackerData {
  if (!latest) return base;
  const owners = Array.from(new Set((ownerKeys ?? []).map(owner => String(owner ?? "").trim()).filter(Boolean)));
  if (!owners.length) return base;

  const next: TrackerData = {
    ...base,
    statistics: {
      affection: { ...(base.statistics?.affection ?? {}) },
      trust: { ...(base.statistics?.trust ?? {}) },
      desire: { ...(base.statistics?.desire ?? {}) },
      connection: { ...(base.statistics?.connection ?? {}) },
      mood: { ...(base.statistics?.mood ?? {}) },
      lastThought: { ...(base.statistics?.lastThought ?? {}) },
    },
    customStatistics: { ...(base.customStatistics ?? {}) },
    customNonNumericStatistics: { ...(base.customNonNumericStatistics ?? {}) },
  };

  for (const statKey of ["affection", "trust", "desire", "connection", "mood", "lastThought"] as const) {
    const latestBucket = latest.statistics?.[statKey] ?? {};
    const nextBucket = next.statistics[statKey];
    for (const ownerKey of owners) {
      if (!Object.prototype.hasOwnProperty.call(latestBucket, ownerKey)) continue;
      const value = latestBucket[ownerKey];
      if (value == null || value === "") {
        delete nextBucket[ownerKey];
      } else {
        nextBucket[ownerKey] = value as never;
      }
    }
  }

  const numericStatIds = new Set([
    ...Object.keys(base.customStatistics ?? {}),
    ...Object.keys(latest.customStatistics ?? {}),
  ]);
  for (const statId of numericStatIds) {
    const nextBucket = { ...(next.customStatistics?.[statId] ?? {}) };
    const latestBucket = latest.customStatistics?.[statId] ?? {};
    for (const ownerKey of owners) {
      if (!Object.prototype.hasOwnProperty.call(latestBucket, ownerKey)) continue;
      const value = latestBucket[ownerKey];
      if (value == null) {
        delete nextBucket[ownerKey];
      } else {
        nextBucket[ownerKey] = value;
      }
    }
    if (Object.keys(nextBucket).length) {
      next.customStatistics![statId] = nextBucket;
    } else {
      delete next.customStatistics![statId];
    }
  }

  const nonNumericStatIds = new Set([
    ...Object.keys(base.customNonNumericStatistics ?? {}),
    ...Object.keys(latest.customNonNumericStatistics ?? {}),
  ]);
  for (const statId of nonNumericStatIds) {
    const nextBucket = { ...(next.customNonNumericStatistics?.[statId] ?? {}) };
    const latestBucket = latest.customNonNumericStatistics?.[statId] ?? {};
    for (const ownerKey of owners) {
      if (!Object.prototype.hasOwnProperty.call(latestBucket, ownerKey)) continue;
      const value = latestBucket[ownerKey];
      if (value == null) {
        delete nextBucket[ownerKey];
      } else {
        nextBucket[ownerKey] = Array.isArray(value)
          ? [...value]
          : value;
      }
    }
    if (Object.keys(nextBucket).length) {
      next.customNonNumericStatistics![statId] = nextBucket;
    } else {
      delete next.customNonNumericStatistics![statId];
    }
  }

  return next;
}

export function restoreMissingCharacterContinuityFromMergedHistory(input: {
  base: TrackerData | null;
  merged: TrackerData | null;
  activeOwners: string[];
  activeEntityIds?: string[] | null;
  settingsInput: BetterSimTrackerSettings;
  context?: STContext | null;
}): TrackerData | null {
  const { base, merged, activeOwners, activeEntityIds, settingsInput, context = null } = input;
  if (!base || !merged) return base;

  const missingOwners: string[] = [];
  for (const [index, ownerName] of activeOwners.entries()) {
    const owner = String(ownerName ?? "").trim();
    if (!owner) continue;
    const entityId = String(activeEntityIds?.[index] ?? "").trim();
    const selection = {
      ownerNames: [owner],
      entityIds: entityId ? [entityId] : [],
    };
    const hasBaseValue = hasCharacterOwnedTrackedValueForSelection(
      base,
      selection,
      settingsInput,
      context,
    );
    if (hasBaseValue) continue;
    const hasMergedValue = hasCharacterOwnedTrackedValueForSelection(
      merged,
      selection,
      settingsInput,
      context,
    );
    if (!hasMergedValue) continue;
    missingOwners.push(owner);
  }

  if (!missingOwners.length) return base;
  return overlayLatestOwnerScopedContinuity(base, merged, missingOwners);
}

