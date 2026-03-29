import { GLOBAL_TRACKER_KEY } from "./constants";
import type { BetterSimTrackerSettings, TrackerData } from "./types";

export type TrackerHistoryEntry = {
  data: TrackerData;
  messageIndex: number;
  timestamp: number;
};

export function hasCharacterOwnedTrackedValueForCharacter(
  data: TrackerData,
  characterName: string,
  settingsInput: BetterSimTrackerSettings,
): boolean {
  if (settingsInput.trackAffection && data.statistics.affection[characterName] !== undefined) return true;
  if (settingsInput.trackTrust && data.statistics.trust[characterName] !== undefined) return true;
  if (settingsInput.trackDesire && data.statistics.desire[characterName] !== undefined) return true;
  if (settingsInput.trackConnection && data.statistics.connection[characterName] !== undefined) return true;
  if (settingsInput.trackMood && data.statistics.mood[characterName] !== undefined) return true;
  if (settingsInput.trackLastThought && data.statistics.lastThought[characterName] !== undefined) return true;

  const customDefs = Array.isArray(settingsInput.customStats) ? settingsInput.customStats : [];
  for (const def of customDefs) {
    if (!def.track) continue;
    if (def.globalScope) continue;
    const statId = String(def.id ?? "").trim().toLowerCase();
    if (!statId) continue;
    const kind = def.kind ?? "numeric";
    if (kind === "numeric") {
      if (data.customStatistics?.[statId]?.[characterName] !== undefined) return true;
      continue;
    }
    if (data.customNonNumericStatistics?.[statId]?.[characterName] !== undefined) return true;
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

