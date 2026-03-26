import { GLOBAL_TRACKER_KEY } from "./constants";
import { resolveTrackerDataLookupValue } from "./entityRegistry";
import type { TrackerData, TrackerGraphTarget } from "./types";

export type GraphNumericStatDefinition = {
  key: string;
  defaultValue: number;
  globalScope: boolean;
};

const BUILT_IN_NUMERIC_STAT_KEYS = new Set(["affection", "trust", "desire", "connection"]);

function normalizeLookupNames(nameOrNames: string | string[]): string[] {
  const values = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function normalizeEntityIds(values: string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

type GraphTargetSelection =
  | string
  | string[]
  | TrackerGraphTarget;

function resolveLookupNames(
  entry: TrackerData,
  nameOrNames: GraphTargetSelection | ((entry: TrackerData) => GraphTargetSelection),
): { lookupNames: string[]; entityIds: string[] } {
  const resolved = typeof nameOrNames === "function" ? nameOrNames(entry) : nameOrNames;
  if (resolved && typeof resolved === "object" && !Array.isArray(resolved)) {
    return {
      lookupNames: normalizeLookupNames(resolved.ownerName),
      entityIds: normalizeEntityIds([resolved.entityId ?? ""]),
    };
  }
  return {
    lookupNames: normalizeLookupNames(resolved),
    entityIds: [],
  };
}

function getNumericRawValue(
  entry: TrackerData,
  key: string,
  nameOrNames: GraphTargetSelection | ((entry: TrackerData) => GraphTargetSelection),
  globalScope = false,
): number | undefined {
  const { lookupNames, entityIds } = resolveLookupNames(entry, nameOrNames);
  if (!lookupNames.length) return undefined;
  if (BUILT_IN_NUMERIC_STAT_KEYS.has(key)) {
    const byOwner = entry.statistics[key as "affection" | "trust" | "desire" | "connection"];
    if (!byOwner) return undefined;
    for (const name of lookupNames) {
      const raw = resolveTrackerDataLookupValue({
        context: null,
        data: entry,
        ownerName: name,
        byOwner,
        byEntityId: entry.statisticsByEntityId?.[key as "affection" | "trust" | "desire" | "connection"],
        explicitEntityIds: entityIds,
      });
      if (raw === undefined) continue;
      return Number(raw);
    }
    return undefined;
  }

  const byOwner = entry.customStatistics?.[key];
  const byEntityId = entry.customStatisticsByEntityId?.[key];
  if (!byOwner && !byEntityId) return undefined;
  const legacyFallback = (): number | undefined => {
    if (!byOwner) return undefined;
    for (const [owner, value] of Object.entries(byOwner)) {
      if (owner === GLOBAL_TRACKER_KEY) continue;
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
  };

  const customRaw = globalScope
    ? ((byOwner?.[GLOBAL_TRACKER_KEY])
      ?? lookupNames.map(name => byOwner?.[name]).find(value => value !== undefined)
      ?? legacyFallback())
    : lookupNames
      .map(name => resolveTrackerDataLookupValue({
        context: null,
        data: entry,
        ownerName: name,
        byOwner,
        byEntityId,
        explicitEntityIds: entityIds,
      }))
      .find(value => value !== undefined);
  if (customRaw === undefined) return undefined;
  return Number(customRaw);
}

export function hasNumericSnapshot(
  entry: TrackerData,
  character: GraphTargetSelection | ((entry: TrackerData) => GraphTargetSelection),
  defs: GraphNumericStatDefinition[],
): boolean {
  for (const def of defs) {
    const raw = getNumericRawValue(entry, def.key, character, def.globalScope);
    if (raw !== undefined && !Number.isNaN(raw)) return true;
  }
  return false;
}

export function buildStatSeries(
  timeline: TrackerData[],
  character: GraphTargetSelection | ((entry: TrackerData) => GraphTargetSelection),
  def: GraphNumericStatDefinition,
): number[] {
  let carry = Math.max(0, Math.min(100, Math.round(def.defaultValue)));
  return timeline.map(item => {
    const raw = getNumericRawValue(item, def.key, character, def.globalScope);
    if (raw !== undefined && !Number.isNaN(raw)) {
      carry = Math.max(0, Math.min(100, raw));
    }
    return carry;
  });
}
