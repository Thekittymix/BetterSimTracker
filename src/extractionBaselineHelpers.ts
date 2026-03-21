import { GLOBAL_TRACKER_KEY } from "./constants";
import {
  listTrackerDataLookupNamesForEntityIds,
  listTrackerDataLookupNamesForOwner,
  resolveTrackerEntityIdsForOwners,
} from "./entityRegistry";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "./types";

export type TrackerHistoryEntry = {
  data: TrackerData;
  messageIndex: number;
  timestamp: number;
};

export function hasCharacterOwnedTrackedValueForCharacter(
  data: TrackerData,
  characterName: string,
  settingsInput: BetterSimTrackerSettings,
  context: STContext | null = null,
): boolean {
  const lookupNames = [
    ...listTrackerDataLookupNamesForOwner(context, data, characterName),
    ...listTrackerDataLookupNamesForEntityIds(
      context,
      data,
      resolveTrackerEntityIdsForOwners(context, [characterName]),
    ),
  ].filter((value, index, array) => array.indexOf(value) === index);
  const hasOwnerValue = <T>(bucket: Record<string, T> | null | undefined): boolean =>
    lookupNames.some(name => bucket?.[name] !== undefined);

  if (settingsInput.trackAffection && hasOwnerValue(data.statistics.affection)) return true;
  if (settingsInput.trackTrust && hasOwnerValue(data.statistics.trust)) return true;
  if (settingsInput.trackDesire && hasOwnerValue(data.statistics.desire)) return true;
  if (settingsInput.trackConnection && hasOwnerValue(data.statistics.connection)) return true;
  if (settingsInput.trackMood && hasOwnerValue(data.statistics.mood)) return true;
  if (settingsInput.trackLastThought && hasOwnerValue(data.statistics.lastThought)) return true;

  const customDefs = Array.isArray(settingsInput.customStats) ? settingsInput.customStats : [];
  for (const def of customDefs) {
    if (!def.track) continue;
    if (def.globalScope) continue;
    const statId = String(def.id ?? "").trim().toLowerCase();
    if (!statId) continue;
    const kind = def.kind ?? "numeric";
    if (kind === "numeric") {
      if (hasOwnerValue(data.customStatistics?.[statId])) return true;
      continue;
    }
    if (hasOwnerValue(data.customNonNumericStatistics?.[statId])) return true;
  }

  return false;
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

