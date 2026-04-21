import type {
  BetterSimTrackerSettings,
  CustomNonNumericStatistics,
  CustomStatDefinition,
  CustomStatistics,
  STContext,
  StatKey,
  Statistics,
  TrackerData,
} from "./types";
import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "./constants";
import { resolveTrackerEntityIdsForOwners, resolveTrackerSceneOwners } from "./entityRegistry";

export function enabledBuiltInAndTextStats(settings: BetterSimTrackerSettings): StatKey[] {
  const selected: StatKey[] = [];
  if (settings.trackAffection) selected.push("affection");
  if (settings.trackTrust) selected.push("trust");
  if (settings.trackDesire) selected.push("desire");
  if (settings.trackConnection) selected.push("connection");
  if (settings.trackMood) selected.push("mood");
  if (settings.trackLastThought) selected.push("lastThought");
  return selected;
}

export function enabledCustomStats(settings: BetterSimTrackerSettings): CustomStatDefinition[] {
  if (!Array.isArray(settings.customStats)) return [];
  return settings.customStats.filter(def => Boolean(def.track));
}

export function normalizeSequentialGroupId(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw.replace(/[^a-z0-9_\-]/g, "_").replace(/_+/g, "_").slice(0, 32);
}

export function groupCustomStatsForSequential(
  stats: CustomStatDefinition[],
  enabled: boolean,
): CustomStatDefinition[][] {
  if (!stats.length) return [];
  if (!enabled) return stats.map(stat => [stat]);
  const groupsById = new Map<string, CustomStatDefinition[]>();
  const solo: CustomStatDefinition[][] = [];
  for (const stat of stats) {
    const key = normalizeSequentialGroupId((stat as { sequentialGroup?: string }).sequentialGroup);
    if (!key) {
      solo.push([stat]);
      continue;
    }
    const bucket = groupsById.get(key) ?? [];
    bucket.push(stat);
    groupsById.set(key, bucket);
  }
  return [...groupsById.values(), ...solo];
}

export function isManualExtractionReason(reason: string): boolean {
  return reason === "manual_refresh" || reason === "manual_refresh_retry";
}

export function shouldBypassConfidenceControls(reason: string): boolean {
  return (
    isManualExtractionReason(reason)
    || reason === "USER_MESSAGE_EDITED"
    || reason === "MESSAGE_EDITED"
  );
}

export function resolveBaselineBeforeIndex(input: {
  targetMessageIndex?: number;
  lastIndex: number;
}): number {
  if (typeof input.targetMessageIndex === "number" && input.targetMessageIndex >= 0) {
    return input.targetMessageIndex;
  }
  return input.lastIndex;
}

export function buildPromptCurrentTrackerData(input: {
  activeCharacters: string[];
  entityResolution?: TrackerData["entityResolution"] | null;
  previousTrackerData?: TrackerData | null;
  previousStatistics?: Statistics | null;
  previousCustomStatistics?: CustomStatistics | null;
  previousCustomNonNumericStatistics?: CustomNonNumericStatistics | null;
}): TrackerData {
  const {
    activeCharacters,
    entityResolution,
    previousTrackerData,
    previousStatistics,
    previousCustomStatistics,
    previousCustomNonNumericStatistics,
  } = input;

  return {
    ...(previousTrackerData ?? {
      timestamp: Date.now(),
      activeCharacters: [...activeCharacters],
      statistics: {
        affection: {},
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      customStatistics: {},
      customNonNumericStatistics: {},
    }),
    activeCharacters: [...activeCharacters],
    entityResolution: entityResolution ?? previousTrackerData?.entityResolution,
    statistics: previousStatistics ?? {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: previousCustomStatistics ?? {},
    customNonNumericStatistics: previousCustomNonNumericStatistics ?? {},
  };
}

export function buildNoActiveContinuityTrackerData(input: {
  context?: STContext | null;
  previousTrackerData?: TrackerData | null;
  latestSceneTrackerData?: TrackerData | null;
  source?: NonNullable<TrackerData["entityResolution"]>["source"];
  timestamp?: number;
}): TrackerData | null {
  const previous = input.previousTrackerData;
  if (!previous) return null;
  const latestSceneTrackerData = input.latestSceneTrackerData ?? null;
  const latestResolver = latestSceneTrackerData?.entityResolution;

  const statistics: Statistics = {
    affection: { ...(previous.statistics?.affection ?? {}) },
    trust: { ...(previous.statistics?.trust ?? {}) },
    desire: { ...(previous.statistics?.desire ?? {}) },
    connection: { ...(previous.statistics?.connection ?? {}) },
    mood: { ...(previous.statistics?.mood ?? {}) },
    lastThought: { ...(previous.statistics?.lastThought ?? {}) },
  };
  if (latestSceneTrackerData?.statistics) {
    for (const ownerKey of [USER_TRACKER_KEY, GLOBAL_TRACKER_KEY]) {
      for (const statKey of ["affection", "trust", "desire", "connection", "mood", "lastThought"] as const) {
        if (Object.prototype.hasOwnProperty.call(latestSceneTrackerData.statistics[statKey] ?? {}, ownerKey)) {
          const value = latestSceneTrackerData.statistics[statKey]?.[ownerKey];
          if (value == null || value === "") {
            delete statistics[statKey][ownerKey];
          } else {
            statistics[statKey][ownerKey] = value as never;
          }
        }
      }
    }
  }

  const customStatistics: CustomStatistics = {};
  const allNumericCustomStatIds = new Set([
    ...Object.keys(previous.customStatistics ?? {}),
    ...Object.keys(latestSceneTrackerData?.customStatistics ?? {}),
  ]);
  for (const statId of allNumericCustomStatIds) {
    const mergedBucket = {
      ...(previous.customStatistics?.[statId] ?? {}),
    };
    if (latestSceneTrackerData?.customStatistics?.[statId]) {
      for (const ownerKey of [USER_TRACKER_KEY, GLOBAL_TRACKER_KEY]) {
        if (Object.prototype.hasOwnProperty.call(latestSceneTrackerData.customStatistics[statId], ownerKey)) {
          const value = latestSceneTrackerData.customStatistics[statId]?.[ownerKey];
          if (value == null) {
            delete mergedBucket[ownerKey];
          } else {
            mergedBucket[ownerKey] = value;
          }
        }
      }
    }
    if (Object.keys(mergedBucket).length) {
      customStatistics[statId] = mergedBucket;
    }
  }

  const customNonNumericStatistics: CustomNonNumericStatistics = {};
  const allNonNumericCustomStatIds = new Set([
    ...Object.keys(previous.customNonNumericStatistics ?? {}),
    ...Object.keys(latestSceneTrackerData?.customNonNumericStatistics ?? {}),
  ]);
  for (const statId of allNonNumericCustomStatIds) {
    const mergedBucket = {
      ...(previous.customNonNumericStatistics?.[statId] ?? {}),
    };
    if (latestSceneTrackerData?.customNonNumericStatistics?.[statId]) {
      for (const ownerKey of [USER_TRACKER_KEY, GLOBAL_TRACKER_KEY]) {
        if (Object.prototype.hasOwnProperty.call(latestSceneTrackerData.customNonNumericStatistics[statId], ownerKey)) {
          const value = latestSceneTrackerData.customNonNumericStatistics[statId]?.[ownerKey];
          if (value == null) {
            delete mergedBucket[ownerKey];
          } else {
            mergedBucket[ownerKey] = Array.isArray(value)
              ? [...value]
              : value;
          }
        }
      }
    }
    if (Object.keys(mergedBucket).length) {
      customNonNumericStatistics[statId] = mergedBucket;
    }
  }

  return {
    ...previous,
    timestamp: input.timestamp ?? Date.now(),
    activeCharacters: [],
    entityResolution: {
      resolvedEntities: latestResolver
        ? (latestResolver.resolvedEntities ?? [])
            .filter(entity => entity.inScene)
            .map(entity => ({
              ...entity,
              aliases: entity.aliases?.length ? [...entity.aliases] : undefined,
              inMessage: false,
            }))
        : (previous.entityResolution?.resolvedEntities?.length
            ? previous.entityResolution.resolvedEntities
                .filter(entity => entity.inScene)
                .map(entity => ({
                  ...entity,
                  aliases: entity.aliases?.length ? [...entity.aliases] : undefined,
                  inMessage: false,
                }))
            : resolveTrackerSceneOwners(input.context ?? null, previous).map(ownerName => ({
                entityId: resolveTrackerEntityIdsForOwners(input.context ?? null, [ownerName])[0]
                  ?? `bst_legacy:${ownerName.toLowerCase()}`,
                kind: "st-character" as const,
                name: ownerName,
                avatar: null,
                inScene: true,
                inMessage: false,
              }))),
      source: input.source ?? previous.entityResolution?.source ?? "fallback",
    },
    statistics,
    customStatistics,
    customNonNumericStatistics,
  };
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

export function selectNoActiveContinuityTrackerEntry(input: {
  context?: STContext | null;
  entries: Array<{ data: TrackerData; messageIndex: number }>;
  userExtraction: boolean;
}): { data: TrackerData; messageIndex: number } | null {
  const ordered = [...(input.entries ?? [])].sort((a, b) => a.messageIndex - b.messageIndex);
  if (!ordered.length) return null;
  if (input.userExtraction) {
    return ordered[ordered.length - 1] ?? null;
  }
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const candidate = ordered[i];
    const owners = resolveTrackerSceneOwners(input.context ?? null, candidate.data).filter(owner => {
      const value = String(owner ?? "").trim();
      return value && value !== USER_TRACKER_KEY && value !== GLOBAL_TRACKER_KEY;
    });
    if (owners.length > 0) {
      return candidate;
    }
  }
  return ordered[ordered.length - 1] ?? null;
}

export function applyConfidenceScaledDelta(input: {
  previousValue: number;
  delta: number;
  confidence: number;
  confidenceDampening: number;
  maxDeltaPerTurn: number;
  bypassConfidenceControls?: boolean;
}): number {
  const clamp = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));
  const conf = Math.max(0, Math.min(1, Number(input.confidence) || 0));
  const damp = input.bypassConfidenceControls
    ? 0
    : Math.max(0, Math.min(1, Number(input.confidenceDampening) || 0));
  const scale = (1 - damp) + conf * damp;
  const limit = Math.max(1, Math.round(Number(input.maxDeltaPerTurn) || 15));
  const bounded = Math.max(-limit, Math.min(limit, Number(input.delta) || 0));
  const scaledDelta = Math.round(bounded * scale);
  return clamp(Number(input.previousValue) + scaledDelta);
}

export function resolveMoodWithConfidence(input: {
  previousMood: string;
  nextMood: string;
  confidence: number;
  moodStickiness: number;
  bypassConfidenceControls?: boolean;
}): string {
  if (input.bypassConfidenceControls) return input.nextMood;
  const conf = Math.max(0, Math.min(1, Number(input.confidence) || 0));
  const stick = Math.max(0, Math.min(1, Number(input.moodStickiness) || 0));
  return conf < stick ? input.previousMood : input.nextMood;
}

export function shouldPreserveFinalValueByConfidence(input: {
  previousValue: unknown;
  confidence: number;
  confidenceThreshold: number;
  bypassConfidenceControls?: boolean;
}): boolean {
  if (input.bypassConfidenceControls) return false;
  if (input.previousValue === undefined || input.previousValue === null || input.previousValue === "") return false;
  const confidence = Math.max(0, Math.min(1, Number(input.confidence) || 0));
  const threshold = Math.max(0, Math.min(1, Number(input.confidenceThreshold) || 0));
  return confidence < threshold;
}
