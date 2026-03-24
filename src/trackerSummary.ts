import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "./constants";
import { resolveTrackerDataLookupValue, resolveTrackerSceneOwners } from "./entityRegistry";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "./types";

export function collectSummaryCharacters(context: STContext | null, data: TrackerData): string[];
export function collectSummaryCharacters(data: TrackerData): string[];
export function collectSummaryCharacters(
  contextOrData: STContext | null | TrackerData,
  maybeData?: TrackerData,
): string[] {
  const context = maybeData ? (contextOrData as STContext | null) : null;
  const data = maybeData ?? (contextOrData as TrackerData);
  const names = new Set<string>();
  const preferredOwners = resolveTrackerSceneOwners(context, data);
  for (const name of preferredOwners.length ? preferredOwners : (data.activeCharacters ?? [])) {
    if (typeof name === "string" && name.trim()) names.add(name.trim());
  }
  const addKeys = (map: Record<string, unknown> | undefined): void => {
    if (!map || typeof map !== "object") return;
    for (const key of Object.keys(map)) {
      const normalized = key.trim();
      if (!normalized || normalized === GLOBAL_TRACKER_KEY) continue;
      names.add(normalized);
    }
  };
  const hasExplicitEntityIdentity = preferredOwners.length > 0
    || (data.entityOwnerMap != null && Object.keys(data.entityOwnerMap).length > 0);
  if (hasExplicitEntityIdentity) {
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }
  addKeys(data.statistics.affection);
  addKeys(data.statistics.trust);
  addKeys(data.statistics.desire);
  addKeys(data.statistics.connection);
  addKeys(data.statistics.mood);
  for (const statValues of Object.values(data.customStatistics ?? {})) {
    addKeys(statValues as Record<string, unknown>);
  }
  for (const statValues of Object.values(data.customNonNumericStatistics ?? {})) {
    addKeys(statValues as Record<string, unknown>);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function describeBand(value: number, low: string, medium: string, high: string): string {
  if (value <= 30) return low;
  if (value <= 60) return medium;
  return high;
}

function buildCustomLabelMap(currentSettings: BetterSimTrackerSettings): Map<string, string> {
  const customLabelMap = new Map<string, string>();
  for (const stat of currentSettings.customStats ?? []) {
    const id = String(stat.id ?? "").trim().toLowerCase();
    if (!id) continue;
    customLabelMap.set(id, String(stat.label ?? id).trim() || id);
  }
  return customLabelMap;
}

export function buildSummaryTrackerStateLines(
  context: STContext | null,
  data: TrackerData,
  currentSettings: BetterSimTrackerSettings,
  userDisplayName = "User",
): string {
  const customLabelMap = buildCustomLabelMap(currentSettings);

  const builtInStats: Array<{ key: "affection" | "trust" | "desire" | "connection"; label: string }> = [
    { key: "affection", label: "affection" },
    { key: "trust", label: "trust" },
    { key: "desire", label: "desire" },
    { key: "connection", label: "connection" },
  ];

  const lines = collectSummaryCharacters(context, data).map(name => {
    const displayName = name === USER_TRACKER_KEY ? userDisplayName : name;
    const parts: string[] = [];
    const mood = String(resolveTrackerDataLookupValue({
      context,
      data,
      byOwner: data.statistics.mood,
      byEntityId: data.statisticsByEntityId?.mood,
      ownerName: name,
    }) ?? "").trim().replace(/\s+/g, " ");
    if (mood) {
      parts.push(`mood=${mood}`);
    }
    const lastThought = String(resolveTrackerDataLookupValue({
      context,
      data,
      byOwner: data.statistics.lastThought,
      byEntityId: data.statisticsByEntityId?.lastThought,
      ownerName: name,
    }) ?? "").trim().replace(/\s+/g, " ");
    if (lastThought) {
      parts.push(`lastThought="${lastThought.slice(0, 180)}"`);
    }

    for (const { key, label } of builtInStats) {
      const raw = resolveTrackerDataLookupValue({
        context,
        data,
        byOwner: data.statistics[key],
        byEntityId: data.statisticsByEntityId?.[key],
        ownerName: name,
      });
      const value = Number(raw);
      if (raw === undefined || Number.isNaN(value)) continue;
      parts.push(`${label}=${Math.max(0, Math.min(100, Math.round(value)))}`);
    }

    for (const [statId, byCharacter] of Object.entries(data.customStatistics ?? {})) {
      const raw = resolveTrackerDataLookupValue({
        context,
        data,
        byOwner: byCharacter,
        byEntityId: data.customStatisticsByEntityId?.[statId],
        ownerName: name,
      });
      const value = Number(raw);
      if (raw === undefined || Number.isNaN(value)) continue;
      const label = (customLabelMap.get(statId) ?? statId).replace(/\s+/g, "_").toLowerCase();
      parts.push(`${label}=${Math.max(0, Math.min(100, Math.round(value)))}`);
    }
    for (const [statId, byCharacter] of Object.entries(data.customNonNumericStatistics ?? {})) {
      const raw = resolveTrackerDataLookupValue({
        context,
        data,
        byOwner: byCharacter,
        byEntityId: data.customNonNumericStatisticsByEntityId?.[statId],
        ownerName: name,
      });
      if (raw === undefined) continue;
      const label = (customLabelMap.get(statId) ?? statId).replace(/\s+/g, "_").toLowerCase();
      if (typeof raw === "boolean") {
        parts.push(`${label}=${raw ? "true" : "false"}`);
      } else {
        const text = String(raw ?? "").trim().replace(/\s+/g, " ");
        if (!text) continue;
        parts.push(`${label}="${text.slice(0, 120)}"`);
      }
    }

    return `- ${displayName}: ${parts.length ? parts.join(", ") : "no tracked values"}`;
  });

  return lines.length ? lines.join("\n") : "- no tracked values are available";
}

export function buildFallbackSummaryProse(
  context: STContext | null,
  data: TrackerData,
  currentSettings: BetterSimTrackerSettings,
): string {
  const names = collectSummaryCharacters(context, data);
  if (!names.length) {
    return "The current relationship state is quiet and there are no meaningful tracked shifts yet.";
  }
  const customLabelMap = buildCustomLabelMap(currentSettings);

  const sentences = names.map(name => {
    const displayName = name === USER_TRACKER_KEY ? (currentSettings.enableUserTracking ? "User" : name) : name;
    const affection = Number(resolveTrackerDataLookupValue({
      context,
      data,
      byOwner: data.statistics.affection,
      byEntityId: data.statisticsByEntityId?.affection,
      ownerName: name,
    }) ?? currentSettings.defaultAffection);
    const trust = Number(resolveTrackerDataLookupValue({
      context,
      data,
      byOwner: data.statistics.trust,
      byEntityId: data.statisticsByEntityId?.trust,
      ownerName: name,
    }) ?? currentSettings.defaultTrust);
    const desire = Number(resolveTrackerDataLookupValue({
      context,
      data,
      byOwner: data.statistics.desire,
      byEntityId: data.statisticsByEntityId?.desire,
      ownerName: name,
    }) ?? currentSettings.defaultDesire);
    const connection = Number(resolveTrackerDataLookupValue({
      context,
      data,
      byOwner: data.statistics.connection,
      byEntityId: data.statisticsByEntityId?.connection,
      ownerName: name,
    }) ?? currentSettings.defaultConnection);
    const mood = String(resolveTrackerDataLookupValue({
      context,
      data,
      byOwner: data.statistics.mood,
      byEntityId: data.statisticsByEntityId?.mood,
      ownerName: name,
    }) ?? currentSettings.defaultMood).trim();

    const warmth = describeBand(affection, "guarded warmth", "measured warmth", "clear warmth");
    const safety = describeBand(trust, "careful trust", "steady trust", "strong trust");
    const bond = describeBand(connection, "distant", "steady", "close");
    const tension = describeBand(desire, "without notable romantic tension", "with mild romantic tension", "with noticeable romantic tension");

    const customBits: string[] = [];
    for (const [statId, byCharacter] of Object.entries(data.customStatistics ?? {})) {
      const raw = Number(resolveTrackerDataLookupValue({
        context,
        data,
        byOwner: byCharacter,
        byEntityId: data.customStatisticsByEntityId?.[statId],
        ownerName: name,
      }));
      if (Number.isNaN(raw)) continue;
      const label = customLabelMap.get(statId) ?? statId;
      const tone = describeBand(raw, "low", "moderate", "high");
      customBits.push(`${label} feels ${tone}`);
      if (customBits.length >= 2) break;
    }
    if (customBits.length < 2) {
      for (const [statId, byCharacter] of Object.entries(data.customNonNumericStatistics ?? {})) {
        const raw = resolveTrackerDataLookupValue({
          context,
          data,
          byOwner: byCharacter,
          byEntityId: data.customNonNumericStatisticsByEntityId?.[statId],
          ownerName: name,
        });
        if (raw === undefined) continue;
        const label = customLabelMap.get(statId) ?? statId;
        if (typeof raw === "boolean") {
          customBits.push(`${label} is ${raw ? "active" : "inactive"}`);
        } else {
          const text = String(raw ?? "").trim().replace(/\s+/g, " ");
          if (!text) continue;
          customBits.push(`${label} is "${text.slice(0, 60)}"`);
        }
        if (customBits.length >= 2) break;
      }
    }

    const customClause = customBits.length ? ` ${displayName}'s custom-state cues suggest ${customBits.join(" and ")}.` : "";
    const moodClause = mood ? `${displayName} currently feels ${mood.toLowerCase()}. ` : "";
    return `${moodClause}${displayName} shows ${warmth} toward the user, ${safety}, and a ${bond} overall bond, ${tension}.${customClause}`;
  });

  return sentences.join(" ");
}
