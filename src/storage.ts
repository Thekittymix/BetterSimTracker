import { EXTENSION_KEY, STAT_KEYS, USER_TRACKER_KEY } from "./constants";
import { isTrackableMessage } from "./messageFilter";
import { clearManualInactiveCharacters } from "./activity";
import type {
  BetterSimTrackerSettings,
  CharacterStatMap,
  ChatMessage,
  ClearedCustomNonNumericStatistics,
  ClearedCustomStatistics,
  ClearedStatistics,
  CustomNonNumericStatistics,
  CustomStatistics,
  STContext,
  StatKey,
  Statistics,
  TrackerData,
  TrackerDataEntityOwner,
} from "./types";
import { normalizeCustomNonNumericValue } from "./customStatRuntime";
import { buildTrackerDataEntityOwnerMap, clearEntityRegistry } from "./entityRegistry";
const CHAT_STATE_KEY = `${EXTENSION_KEY}:chat`;

function createEmptyStatistics(): Statistics {
  return {
    affection: {},
    trust: {},
    desire: {},
    connection: {},
    mood: {},
    lastThought: {}
  };
}

function normalizeStatistics(raw: unknown): Statistics {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Partial<Statistics>
    : {};
  return {
    affection: { ...(record.affection ?? {}) },
    trust: { ...(record.trust ?? {}) },
    desire: { ...(record.desire ?? {}) },
    connection: { ...(record.connection ?? {}) },
    mood: { ...(record.mood ?? {}) },
    lastThought: { ...(record.lastThought ?? {}) },
  };
}

export function getTrackerDataFromMessage(message: ChatMessage): TrackerData | null {
  const raw = message.extra?.[EXTENSION_KEY];
  const data = resolveTrackerDataForSwipe(message, raw);
  if (!data) return null;
  return normalizeTrackerData(data);
}

export function resolveNormalizedTrackerActiveCharacters(
  data: { activeCharacters?: TrackerData["activeCharacters"] | null },
  resolvedSceneOwners: string[] = [],
  resolvedMessageOwners: string[] = [],
): string[] {
  const hasExplicitActiveCharacters = Array.isArray(data.activeCharacters);
  const rawActiveCharacters = hasExplicitActiveCharacters
    ? Array.from(new Set((data.activeCharacters ?? []).map(item => String(item ?? "").trim()).filter(Boolean)))
    : [];
  if (rawActiveCharacters.includes(USER_TRACKER_KEY)) {
    return rawActiveCharacters;
  }
  if (hasExplicitActiveCharacters && rawActiveCharacters.length === 0) {
    return rawActiveCharacters;
  }
  if (resolvedMessageOwners.length) {
    return [...resolvedMessageOwners];
  }
  if (resolvedSceneOwners.length) {
    return [...resolvedSceneOwners];
  }
  if (hasExplicitActiveCharacters) {
    return rawActiveCharacters;
  }
  return rawActiveCharacters;
}

function normalizeTrackerData(data: Partial<TrackerData>): TrackerData {
  const clearedStatistics = normalizeClearedStatistics(data.clearedStatistics);
  const clearedCustomStatistics = normalizeClearedOwnerBuckets(data.clearedCustomStatistics);
  const clearedCustomNonNumericStatistics = normalizeClearedOwnerBuckets(data.clearedCustomNonNumericStatistics);
  const normalizedEntityResolution = normalizeEntityResolution(data.entityResolution);
  const normalizedEntityOwnerMap = normalizeEntityOwnerMap(data.entityOwnerMap);
  const normalizedSceneOwners = normalizedEntityResolution?.sceneOwners?.length
    ? [...normalizedEntityResolution.sceneOwners]
    : resolveOwnersFromEntityIdsWithOwnerMap(normalizedEntityResolution?.sceneEntityIds, normalizedEntityOwnerMap);
  const normalizedMessageOwners = normalizedEntityResolution?.messageOwners?.length
    ? [...normalizedEntityResolution.messageOwners]
    : resolveOwnersFromEntityIdsWithOwnerMap(normalizedEntityResolution?.messageEntityIds, normalizedEntityOwnerMap);
  const hydratedEntityResolution = normalizedEntityResolution
    ? {
        ...normalizedEntityResolution,
        sceneOwners: normalizedSceneOwners,
        messageOwners: normalizedMessageOwners,
      }
    : normalizedEntityResolution;
  const normalizedActiveCharacters = resolveNormalizedTrackerActiveCharacters(
    { activeCharacters: data.activeCharacters },
    normalizedSceneOwners,
    normalizedMessageOwners,
  );
  return normalizeTrackerDataEntityBuckets({
    timestamp: Number(data.timestamp ?? Date.now()),
    activeCharacters: normalizedActiveCharacters,
    entityResolution: hydratedEntityResolution,
    statistics: {
      ...createEmptyStatistics(),
      ...(data.statistics as Statistics)
    },
    statisticsByEntityId: normalizeStatistics(data.statisticsByEntityId),
    customStatistics: normalizeCustomStatistics(data.customStatistics),
    customStatisticsByEntityId: normalizeCustomStatistics(data.customStatisticsByEntityId),
    customNonNumericStatistics: normalizeCustomNonNumericStatistics(data.customNonNumericStatistics),
    customNonNumericStatisticsByEntityId: normalizeCustomNonNumericStatistics(data.customNonNumericStatisticsByEntityId),
    clearedStatistics: pruneClearedStatistics(clearedStatistics),
    clearedCustomStatistics: pruneClearedOwnerBuckets(clearedCustomStatistics),
    clearedCustomNonNumericStatistics: pruneClearedOwnerBuckets(clearedCustomNonNumericStatistics),
    entityOwnerMap: normalizedEntityOwnerMap,
  });
}

function normalizeEntityResolution(raw: unknown): TrackerData["entityResolution"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const sceneOwners = Array.isArray(record.sceneOwners)
    ? Array.from(new Set(record.sceneOwners.map(item => String(item ?? "").trim()).filter(Boolean)))
    : [];
  const messageOwners = Array.isArray(record.messageOwners)
    ? Array.from(new Set(record.messageOwners.map(item => String(item ?? "").trim()).filter(Boolean)))
    : [];
  const sceneEntityIds = Array.isArray(record.sceneEntityIds)
    ? Array.from(new Set(record.sceneEntityIds.map(item => String(item ?? "").trim()).filter(Boolean)))
    : [];
  const messageEntityIds = Array.isArray(record.messageEntityIds)
    ? Array.from(new Set(record.messageEntityIds.map(item => String(item ?? "").trim()).filter(Boolean)))
    : [];
  const source = record.source === "model" ? "model" : "fallback";
  if (!sceneOwners.length && !messageOwners.length && !sceneEntityIds.length && !messageEntityIds.length) return undefined;
  return {
    sceneOwners,
    messageOwners,
    sceneEntityIds: sceneEntityIds.length ? sceneEntityIds : undefined,
    messageEntityIds: messageEntityIds.length ? messageEntityIds : undefined,
    source,
  };
}

function normalizeEntityOwnerMap(raw: unknown): TrackerData["entityOwnerMap"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: NonNullable<TrackerData["entityOwnerMap"]> = {};
  for (const [ownerName, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const entityId = String(record.entityId ?? "").trim();
    const normalizedOwnerName = String(record.ownerName ?? ownerName).trim();
    const canonicalName = String(record.canonicalName ?? "").trim() || normalizedOwnerName;
    const sourceKey = String(record.sourceKey ?? "").trim();
    const kind = record.kind === "multi_character_alias" ? "multi_character_alias" : "owner";
    if (!entityId || !normalizedOwnerName || !canonicalName || !sourceKey) continue;
    const aliases = Array.isArray(record.aliases)
      ? Array.from(new Set(record.aliases.map(item => String(item ?? "").trim()).filter(Boolean)))
      : [];
    out[ownerName] = {
      entityId,
      ownerName: normalizedOwnerName,
      canonicalName,
      aliases,
      sourceKey,
      kind,
    };
  }
  return Object.keys(out).length ? out : undefined;
}

function normalizeClearedOwnerMap(raw: unknown): Record<string, true> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, true> = {};
  for (const [owner, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value) continue;
    const key = String(owner ?? "").trim();
    if (!key) continue;
    out[key] = true;
  }
  return out;
}

function buildEntityOwnerProjection(
  entityOwnerMap: TrackerData["entityOwnerMap"] | undefined,
): {
  ownerToTarget: Record<string, string>;
  targetToEntity: Record<string, string>;
  mergedEntityOwnerMap?: TrackerData["entityOwnerMap"];
} {
  if (!entityOwnerMap || typeof entityOwnerMap !== "object") {
    return { ownerToTarget: {}, targetToEntity: {}, mergedEntityOwnerMap: undefined };
  }
  const ownerToTarget: Record<string, string> = {};
  const targetToEntity: Record<string, string> = {};
  const byEntityId = new Map<string, NonNullable<TrackerData["entityOwnerMap"]>[string]>();
  for (const [snapshotOwner, snapshot] of Object.entries(entityOwnerMap)) {
    if (!snapshot) continue;
    const entityId = String(snapshot.entityId ?? "").trim();
    const ownerName = String(snapshot.ownerName ?? snapshotOwner).trim();
    const canonicalName = String(snapshot.canonicalName ?? ownerName).trim() || ownerName;
    if (!entityId || !ownerName) continue;
    const targetOwner = ownerName;
    targetToEntity[targetOwner] = entityId;
    ownerToTarget[snapshotOwner] = targetOwner;
    ownerToTarget[ownerName] = targetOwner;
    ownerToTarget[canonicalName] = targetOwner;
    for (const alias of snapshot.aliases ?? []) {
      if (alias) ownerToTarget[alias] = targetOwner;
    }
    const existing = byEntityId.get(entityId);
    if (!existing) {
      byEntityId.set(entityId, {
        entityId,
        ownerName: targetOwner,
        canonicalName,
        aliases: Array.from(new Set((snapshot.aliases ?? []).filter(Boolean))),
        sourceKey: snapshot.sourceKey,
        kind: snapshot.kind,
      });
      continue;
    }
    existing.ownerName = targetOwner;
    existing.canonicalName = canonicalName || existing.canonicalName;
    existing.aliases = Array.from(new Set([...(existing.aliases ?? []), ...(snapshot.aliases ?? [])].filter(Boolean)));
    existing.sourceKey = snapshot.sourceKey || existing.sourceKey;
    existing.kind = snapshot.kind;
  }
  const mergedEntityOwnerMap = Object.fromEntries(
    Array.from(byEntityId.values()).map(snapshot => [snapshot.ownerName, snapshot]),
  );
  return {
    ownerToTarget,
    targetToEntity,
    mergedEntityOwnerMap: Object.keys(mergedEntityOwnerMap).length ? mergedEntityOwnerMap : undefined,
  };
}

function remapOwnerRecord<T>(
  byOwner: Record<string, T> | undefined,
  ownerToTarget: Record<string, string>,
): Record<string, T> | undefined {
  if (!byOwner || typeof byOwner !== "object") return undefined;
  const out: Record<string, T> = {};
  for (const [owner, value] of Object.entries(byOwner)) {
    const targetOwner = ownerToTarget[owner] || owner;
    out[targetOwner] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function buildEntityScopedRecord<T>(
  byOwner: Record<string, T> | undefined,
  targetToEntity: Record<string, string>,
): Record<string, T> | undefined {
  if (!byOwner || typeof byOwner !== "object") return undefined;
  const out: Record<string, T> = {};
  for (const [owner, value] of Object.entries(byOwner)) {
    const entityId = targetToEntity[owner];
    if (!entityId) continue;
    out[entityId] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function resolveOwnersFromEntityIdsWithOwnerMap(
  entityIds: string[] | undefined,
  entityOwnerMap: TrackerData["entityOwnerMap"] | undefined,
): string[] {
  if (!Array.isArray(entityIds) || !entityIds.length || !entityOwnerMap || typeof entityOwnerMap !== "object") {
    return [];
  }
  const ownerByEntityId = new Map<string, string>();
  for (const [snapshotOwner, snapshot] of Object.entries(entityOwnerMap)) {
    const entityId = String(snapshot?.entityId ?? "").trim();
    const ownerName = String(snapshot?.ownerName ?? snapshotOwner).trim();
    if (!entityId || !ownerName || ownerByEntityId.has(entityId)) continue;
    ownerByEntityId.set(entityId, ownerName);
  }
  return Array.from(new Set(
    entityIds
      .map(entityId => ownerByEntityId.get(String(entityId ?? "").trim()) ?? "")
      .filter(Boolean),
  ));
}

function buildEntityScopedStatistics(
  statistics: Statistics,
  targetToEntity: Record<string, string>,
): Statistics | undefined {
  const next: Statistics = {
    affection: buildEntityScopedRecord(statistics.affection ?? {}, targetToEntity) ?? {},
    trust: buildEntityScopedRecord(statistics.trust ?? {}, targetToEntity) ?? {},
    desire: buildEntityScopedRecord(statistics.desire ?? {}, targetToEntity) ?? {},
    connection: buildEntityScopedRecord(statistics.connection ?? {}, targetToEntity) ?? {},
    mood: buildEntityScopedRecord(statistics.mood ?? {}, targetToEntity) ?? {},
    lastThought: buildEntityScopedRecord(statistics.lastThought ?? {}, targetToEntity) ?? {},
  };
  return Object.values(next).some(bucket => Object.keys(bucket).length) ? next : undefined;
}

function buildEntityScopedCustomStatistics(
  customStatistics: CustomStatistics | undefined,
  targetToEntity: Record<string, string>,
): CustomStatistics | undefined {
  if (!customStatistics) return undefined;
  const out: CustomStatistics = {};
  for (const [statId, bucket] of Object.entries(customStatistics)) {
    const nextBucket = buildEntityScopedRecord(bucket, targetToEntity);
    if (nextBucket && Object.keys(nextBucket).length) out[statId] = nextBucket;
  }
  return Object.keys(out).length ? out : undefined;
}

function buildEntityScopedCustomNonNumericStatistics(
  customNonNumericStatistics: CustomNonNumericStatistics | undefined,
  targetToEntity: Record<string, string>,
): CustomNonNumericStatistics | undefined {
  if (!customNonNumericStatistics) return undefined;
  const out: CustomNonNumericStatistics = {};
  for (const [statId, bucket] of Object.entries(customNonNumericStatistics)) {
    const nextBucket = buildEntityScopedRecord(bucket, targetToEntity);
    if (nextBucket && Object.keys(nextBucket).length) out[statId] = nextBucket;
  }
  return Object.keys(out).length ? out : undefined;
}

function remapClearedOwnerBuckets<T extends ClearedCustomStatistics | ClearedCustomNonNumericStatistics>(
  raw: T | undefined,
  ownerToTarget: Record<string, string>,
): T | undefined {
  if (!raw) return undefined;
  const out: Record<string, Record<string, true>> = {};
  for (const [statId, owners] of Object.entries(raw)) {
    const nextOwners: Record<string, true> = {};
    for (const owner of Object.keys(owners ?? {})) {
      nextOwners[ownerToTarget[owner] || owner] = true;
    }
    if (Object.keys(nextOwners).length) out[statId] = nextOwners;
  }
  return Object.keys(out).length ? (out as T) : undefined;
}

function normalizeTrackerDataEntityBuckets(data: TrackerData): TrackerData {
  const { ownerToTarget, targetToEntity, mergedEntityOwnerMap } = buildEntityOwnerProjection(data.entityOwnerMap);
  if (!Object.keys(ownerToTarget).length) {
    return {
      ...data,
      statisticsByEntityId: normalizeStatistics(data.statisticsByEntityId),
      customStatisticsByEntityId: normalizeCustomStatistics(data.customStatisticsByEntityId),
      customNonNumericStatisticsByEntityId: normalizeCustomNonNumericStatistics(data.customNonNumericStatisticsByEntityId),
    };
  }
  const remapStatBucket = (bucket: CharacterStatMap): CharacterStatMap => remapOwnerRecord(bucket, ownerToTarget) ?? {};
  const remappedStatistics: Statistics = {
    affection: remapStatBucket(data.statistics.affection ?? {}),
    trust: remapStatBucket(data.statistics.trust ?? {}),
    desire: remapStatBucket(data.statistics.desire ?? {}),
    connection: remapStatBucket(data.statistics.connection ?? {}),
    mood: remapStatBucket(data.statistics.mood ?? {}),
    lastThought: remapStatBucket(data.statistics.lastThought ?? {}),
  };
  const remappedCustomStatistics = Object.fromEntries(
    Object.entries(data.customStatistics ?? {}).map(([statId, bucket]) => [statId, remapOwnerRecord(bucket, ownerToTarget) ?? {}]),
  );
  const remappedCustomNonNumericStatistics = Object.fromEntries(
    Object.entries(data.customNonNumericStatistics ?? {}).map(([statId, bucket]) => [statId, remapOwnerRecord(bucket, ownerToTarget) ?? {}]),
  );
  const derivedStatisticsByEntityId = buildEntityScopedStatistics(remappedStatistics, targetToEntity);
  const derivedCustomStatisticsByEntityId = buildEntityScopedCustomStatistics(remappedCustomStatistics, targetToEntity);
  const derivedCustomNonNumericStatisticsByEntityId = buildEntityScopedCustomNonNumericStatistics(remappedCustomNonNumericStatistics, targetToEntity);
  const statisticsByEntityId = mergeStatisticsWithFallback(
    derivedStatisticsByEntityId ?? createEmptyStatistics(),
    normalizeStatistics(data.statisticsByEntityId),
  );
  const customStatisticsByEntityId = mergeCustomStatisticsWithFallback(
    derivedCustomStatisticsByEntityId,
    normalizeCustomStatistics(data.customStatisticsByEntityId),
  );
  const customNonNumericStatisticsByEntityId = mergeCustomNonNumericStatisticsWithFallback(
    derivedCustomNonNumericStatisticsByEntityId,
    normalizeCustomNonNumericStatistics(data.customNonNumericStatisticsByEntityId),
  );
  const remappedEntityResolution = data.entityResolution
    ? {
        sceneOwners: Array.from(new Set((data.entityResolution.sceneOwners ?? []).map(owner => ownerToTarget[owner] || owner))),
        messageOwners: Array.from(new Set((data.entityResolution.messageOwners ?? []).map(owner => ownerToTarget[owner] || owner))),
        sceneEntityIds: Array.from(new Set(data.entityResolution.sceneEntityIds ?? [])),
        messageEntityIds: Array.from(new Set(data.entityResolution.messageEntityIds ?? [])),
        source: data.entityResolution.source,
      }
    : undefined;
  const remappedActiveCharacters = resolveNormalizedTrackerActiveCharacters(
    {
      activeCharacters: Array.isArray(data.activeCharacters)
        ? Array.from(new Set(data.activeCharacters.map(owner => ownerToTarget[owner] || owner)))
        : data.activeCharacters,
    },
    remappedEntityResolution?.sceneOwners ?? [],
    remappedEntityResolution?.messageOwners ?? [],
  );
  return {
    ...data,
    activeCharacters: remappedActiveCharacters,
    entityResolution: remappedEntityResolution,
    statistics: remappedStatistics,
    statisticsByEntityId,
    customStatistics: remappedCustomStatistics,
    customStatisticsByEntityId,
    customNonNumericStatistics: remappedCustomNonNumericStatistics,
    customNonNumericStatisticsByEntityId,
    clearedStatistics: data.clearedStatistics
      ? Object.fromEntries(
          Object.entries(data.clearedStatistics).map(([statId, owners]) => [statId, remapOwnerRecord(owners, ownerToTarget) ?? {}]),
        ) as ClearedStatistics
      : undefined,
    clearedCustomStatistics: remapClearedOwnerBuckets(data.clearedCustomStatistics, ownerToTarget),
    clearedCustomNonNumericStatistics: remapClearedOwnerBuckets(data.clearedCustomNonNumericStatistics, ownerToTarget),
    entityOwnerMap: mergedEntityOwnerMap,
  };
}

function mergeEntityOwnerMapsChronologically(
  entries: TrackerData[],
): TrackerData["entityOwnerMap"] | undefined {
  const byEntityId = new Map<string, TrackerDataEntityOwner>();
  for (const entry of entries) {
    const { mergedEntityOwnerMap } = buildEntityOwnerProjection(entry.entityOwnerMap);
    for (const snapshot of Object.values(mergedEntityOwnerMap ?? {})) {
      const existing = byEntityId.get(snapshot.entityId);
      if (!existing) {
        byEntityId.set(snapshot.entityId, { ...snapshot, aliases: [...(snapshot.aliases ?? [])] });
        continue;
      }
      byEntityId.set(snapshot.entityId, {
        ...existing,
        ...snapshot,
        aliases: Array.from(new Set([...(existing.aliases ?? []), ...(snapshot.aliases ?? [])].filter(Boolean))),
      });
    }
  }
  const out = Object.fromEntries(Array.from(byEntityId.values()).map(snapshot => [snapshot.ownerName, snapshot]));
  return Object.keys(out).length ? out : undefined;
}

function normalizeClearedStatistics(raw: unknown): ClearedStatistics {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ClearedStatistics = {};
  for (const [statId, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(statId ?? "").trim();
    if (!key) continue;
    const owners = normalizeClearedOwnerMap(value);
    if (Object.keys(owners).length) out[key as StatKey] = owners;
  }
  return out;
}

function normalizeClearedOwnerBuckets<T extends ClearedCustomStatistics | ClearedCustomNonNumericStatistics>(raw: unknown): T {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {} as T;
  const out: Record<string, Record<string, true>> = {};
  for (const [statId, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(statId ?? "").trim().toLowerCase();
    if (!key) continue;
    const owners = normalizeClearedOwnerMap(value);
    if (Object.keys(owners).length) out[key] = owners;
  }
  return out as T;
}

function cloneClearedStatistics(raw: ClearedStatistics | null | undefined): ClearedStatistics {
  const out: ClearedStatistics = {};
  for (const [statId, value] of Object.entries(raw ?? {})) {
    const owners = normalizeClearedOwnerMap(value);
    if (Object.keys(owners).length) out[statId as StatKey] = owners;
  }
  return out;
}

function cloneClearedOwnerBuckets<T extends ClearedCustomStatistics | ClearedCustomNonNumericStatistics>(raw: T | null | undefined): T {
  const out: Record<string, Record<string, true>> = {};
  for (const [statId, value] of Object.entries(raw ?? {})) {
    const owners = normalizeClearedOwnerMap(value);
    if (Object.keys(owners).length) out[statId] = owners;
  }
  return out as T;
}

function applyClearsToStatistics(
  statistics: Statistics,
  cleared: ClearedStatistics | undefined,
): Statistics {
  const out: Statistics = {
    affection: { ...(statistics.affection ?? {}) },
    trust: { ...(statistics.trust ?? {}) },
    desire: { ...(statistics.desire ?? {}) },
    connection: { ...(statistics.connection ?? {}) },
    mood: { ...(statistics.mood ?? {}) },
    lastThought: { ...(statistics.lastThought ?? {}) },
  };
  for (const [statId, owners] of Object.entries(cleared ?? {})) {
    const bucket = out[statId as StatKey];
    if (!bucket) continue;
    for (const owner of Object.keys(owners ?? {})) {
      delete bucket[owner];
    }
  }
  return out;
}

function applyClearsToCustomStatistics(
  custom: CustomStatistics | undefined,
  cleared: ClearedCustomStatistics | undefined,
): CustomStatistics {
  const out: CustomStatistics = {};
  for (const [statId, values] of Object.entries(custom ?? {})) {
    out[statId] = { ...(values ?? {}) };
  }
  for (const [statId, owners] of Object.entries(cleared ?? {})) {
    if (!out[statId]) continue;
    for (const owner of Object.keys(owners ?? {})) {
      delete out[statId][owner];
    }
    if (!Object.keys(out[statId]).length) delete out[statId];
  }
  return out;
}

function applyClearsToCustomNonNumericStatistics(
  custom: CustomNonNumericStatistics | undefined,
  cleared: ClearedCustomNonNumericStatistics | undefined,
): CustomNonNumericStatistics {
  const out: CustomNonNumericStatistics = {};
  for (const [statId, values] of Object.entries(custom ?? {})) {
    const next: Record<string, string | boolean | string[]> = {};
    for (const [owner, value] of Object.entries(values ?? {})) {
      next[owner] = Array.isArray(value) ? [...value] : value;
    }
    out[statId] = next;
  }
  for (const [statId, owners] of Object.entries(cleared ?? {})) {
    if (!out[statId]) continue;
    for (const owner of Object.keys(owners ?? {})) {
      delete out[statId][owner];
    }
    if (!Object.keys(out[statId]).length) delete out[statId];
  }
  return out;
}

function normalizeCustomStatistics(raw: unknown): CustomStatistics {
  if (!raw || typeof raw !== "object") return {};
  const out: CustomStatistics = {};
  for (const [statId, values] of Object.entries(raw as Record<string, unknown>)) {
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    const statKey = String(statId ?? "").trim().toLowerCase();
    if (!statKey) continue;
    const byCharacter: Record<string, number> = {};
    for (const [characterName, value] of Object.entries(values as Record<string, unknown>)) {
      const n = Number(value);
      if (Number.isNaN(n)) continue;
      byCharacter[characterName] = Math.max(0, Math.min(100, Math.round(n)));
    }
    if (Object.keys(byCharacter).length > 0) {
      out[statKey] = byCharacter;
    }
  }
  return out;
}

function normalizeCustomNonNumericStatistics(raw: unknown): CustomNonNumericStatistics {
  if (!raw || typeof raw !== "object") return {};
  const out: CustomNonNumericStatistics = {};
  for (const [statId, values] of Object.entries(raw as Record<string, unknown>)) {
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    const statKey = String(statId ?? "").trim().toLowerCase();
    if (!statKey) continue;
    const byCharacter: Record<string, string | boolean | string[]> = {};
    for (const [characterName, value] of Object.entries(values as Record<string, unknown>)) {
      if (typeof value === "boolean") {
        byCharacter[characterName] = value;
        continue;
      }
      if (Array.isArray(value)) {
        const items = normalizeCustomNonNumericValue("array", value, { textMaxLength: 200 });
        if (!Array.isArray(items)) continue;
        // Preserve explicit empty arrays as a real value.
        // This is required to represent "cleared array stat" and to prevent
        // fallback logic from reviving stale previous items.
        byCharacter[characterName] = items;
        continue;
      }
      if (typeof value === "string") {
        const cleaned = normalizeCustomNonNumericValue("text_short", value, { textMaxLength: 200 });
        if (typeof cleaned !== "string") continue;
        if (!cleaned) continue;
        byCharacter[characterName] = cleaned;
      }
    }
    if (Object.keys(byCharacter).length > 0) {
      out[statKey] = byCharacter;
    }
  }
  return out;
}

function isTrackerPayload(raw: unknown): raw is Partial<TrackerData> {
  if (!raw || typeof raw !== "object") return false;
  const data = raw as Partial<TrackerData>;
  const hasResolverSceneIdentity = Boolean(
    Array.isArray(data.entityResolution?.sceneEntityIds) && data.entityResolution.sceneEntityIds.length
    || Array.isArray(data.entityResolution?.sceneOwners) && data.entityResolution.sceneOwners.length,
  );
  if (!data.statistics) return false;
  if (!data.activeCharacters && !hasResolverSceneIdentity) return false;
  return true;
}

function resolveTrackerDataForSwipe(message: ChatMessage, raw: unknown): Partial<TrackerData> | null {
  if (!raw || typeof raw !== "object") return null;
  if (isTrackerPayload(raw)) {
    return raw;
  }

  const storage = raw as Record<string, unknown>;
  const swipeId = Number(message.swipe_id ?? 0);
  const swipeKey = String(Number.isNaN(swipeId) ? 0 : swipeId);

  const exact = storage[swipeKey];
  if (isTrackerPayload(exact)) return exact;
  // Do not fall back to another swipe entry when the current swipe has no tracker payload.
  // This prevents reusing stale tracker data from a different swipe variant.
  if (swipeKey === "0") {
    const zero = storage["0"];
    if (isTrackerPayload(zero)) return zero;
  }
  return null;
}

export function getLatestTrackerData(context: STContext): TrackerData | null {
  for (let i = context.chat.length - 1; i >= 0; i -= 1) {
    const found = getTrackerDataFromMessage(context.chat[i]);
    if (found) return found;
  }
  return null;
}

export function getLatestTrackerDataWithIndex(context: STContext): { data: TrackerData; messageIndex: number } | null {
  for (let i = context.chat.length - 1; i >= 0; i -= 1) {
    const found = getTrackerDataFromMessage(context.chat[i]);
    if (found) {
      return { data: found, messageIndex: i };
    }
  }
  return null;
}

export function getLatestTrackerDataWithIndexBefore(
  context: STContext,
  beforeIndex: number,
): { data: TrackerData; messageIndex: number } | null {
  if (context.chat.length === 0 || beforeIndex <= 0) {
    return null;
  }
  const start = Math.min(beforeIndex - 1, context.chat.length - 1);
  for (let i = start; i >= 0; i -= 1) {
    const found = getTrackerDataFromMessage(context.chat[i]);
    if (found) {
      return { data: found, messageIndex: i };
    }
  }
  return null;
}

function getScopeKey(context: STContext): string {
  const shortHash = (input: string): string => {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };
  const readString = (value: unknown): string => String(value ?? "").trim();
  const readObjectString = (obj: unknown, key: string): string => {
    if (!obj || typeof obj !== "object") return "";
    return readString((obj as Record<string, unknown>)[key]);
  };
  const resolveChatScopeId = (): string => {
    const anyContext = context as unknown as Record<string, unknown>;
    const direct = [
      readString(anyContext.chatId),
      readString(anyContext.chat_id),
      readString(anyContext.chatName),
      readString(anyContext.chat_name),
      readString(anyContext.chatFileName),
      readString(anyContext.chat_file_name),
    ].find(Boolean);
    if (direct) return direct;

    const meta = (anyContext.chatMetadata ?? anyContext.chat_metadata) as unknown;
    const metadataId = [
      readObjectString(meta, "chatId"),
      readObjectString(meta, "chat_id"),
      readObjectString(meta, "main_chat"),
      readObjectString(meta, "name"),
      readObjectString(meta, "file_name"),
    ].find(Boolean);
    if (metadataId) return metadataId;

    const firstMessage = (Array.isArray(context.chat) && context.chat.length > 0)
      ? (context.chat[0] as unknown as Record<string, unknown>)
      : null;
    if (firstMessage) {
      const seed = [
        readString(firstMessage.send_date),
        readString(firstMessage.created_at),
        readString(firstMessage.time),
        readString(firstMessage.name),
        readString(firstMessage.mes).slice(0, 120),
      ].filter(Boolean).join("|");
      if (seed) return `derived:${shortHash(seed)}`;
    }
    return "nochat";
  };

  const anyContext = context as unknown as Record<string, unknown>;
  const chatId = resolveChatScopeId();
  const target = context.groupId ? `group:${context.groupId}` : `char:${String(context.characterId ?? "unknown")}`;
  return `${chatId}|${target}`;
}

const HISTORY_LIMIT = 120;
const LATEST_BY_SCOPE_KEY = `${EXTENSION_KEY}:latestByScope`;

type SnapshotEntry = { data: TrackerData; timestamp: number; messageIndex?: number };

type SnapshotStore = {
  latest?: { data: TrackerData; messageIndex: number; timestamp: number };
  history: SnapshotEntry[];
};

type ChatStateStore = {
  latest?: { data: TrackerData; messageIndex: number; timestamp: number };
  history: SnapshotEntry[];
};

function normalizeStore(raw: unknown): SnapshotStore {
  if (!raw || typeof raw !== "object") return { history: [] };
  const parsed = raw as Partial<SnapshotStore>;
  if (!Array.isArray(parsed.history)) {
    return { latest: parsed.latest, history: [] };
  }
  return { latest: parsed.latest, history: parsed.history };
}

function getStoreKey(context: STContext): string {
  return `${EXTENSION_KEY}:history:${getScopeKey(context)}`;
}

function readLatestByScopeMap(): Record<string, { data: TrackerData; messageIndex: number; timestamp: number }> {
  try {
    const raw = localStorage.getItem(LATEST_BY_SCOPE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { data: TrackerData; messageIndex: number; timestamp: number }>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeLatestByScopeMap(map: Record<string, { data: TrackerData; messageIndex: number; timestamp: number }>): void {
  try {
    localStorage.setItem(LATEST_BY_SCOPE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function readStore(context: STContext): SnapshotStore {
  const key = getStoreKey(context);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { history: [] };
    return normalizeStore(JSON.parse(raw));
  } catch {
    return { history: [] };
  }
}

function writeStore(context: STContext, store: SnapshotStore): void {
  const key = getStoreKey(context);
  try {
    localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // ignore
  }
}

function readMetadataStore(context: STContext): SnapshotStore {
  try {
    const raw = context.chatMetadata?.[EXTENSION_KEY];
    return normalizeStore(raw);
  } catch {
    return { history: [] };
  }
}

function writeMetadataStore(context: STContext, store: SnapshotStore): void {
  try {
    if (!context.chatMetadata) {
      context.chatMetadata = {};
    }
    context.chatMetadata[EXTENSION_KEY] = store;
    context.saveMetadataDebounced?.();
  } catch {
    // ignore
  }
}

function readChatStateStore(context: STContext): ChatStateStore {
  const firstMessage = context.chat?.[0];
  if (!firstMessage?.extra) return { history: [] };
  const raw = firstMessage.extra[CHAT_STATE_KEY];
  return normalizeStore(raw);
}

function writeChatStateStore(context: STContext, store: ChatStateStore): void {
  const firstMessage = context.chat?.[0];
  if (!firstMessage) return;
  if (!firstMessage.extra) {
    firstMessage.extra = {};
  }
  firstMessage.extra[CHAT_STATE_KEY] = store;
}

function rebuildPersistedTrackerStores(context: STContext): void {
  const entries: Array<{ data: TrackerData; timestamp: number; messageIndex: number }> = [];
  for (let i = 0; i < context.chat.length; i += 1) {
    const message = context.chat[i];
    if (!isTrackableMessage(message)) continue;
    const data = getTrackerDataFromMessage(message);
    if (!data) continue;
    entries.push({
      data,
      timestamp: Number(data.timestamp ?? Date.now()),
      messageIndex: i,
    });
  }

  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
  const latest = sorted[0]
    ? {
        data: sorted[0].data,
        messageIndex: sorted[0].messageIndex,
        timestamp: sorted[0].timestamp,
      }
    : undefined;
  const store: SnapshotStore = {
    latest,
    history: sorted.slice(0, HISTORY_LIMIT).map(entry => ({
      data: entry.data,
      timestamp: entry.timestamp,
      messageIndex: entry.messageIndex,
    })),
  };

  writeStore(context, store);
  writeMetadataStore(context, store);
  writeChatStateStore(context, store);

  const scope = getScopeKey(context);
  const latestByScope = readLatestByScopeMap();
  if (latest) {
    latestByScope[scope] = latest;
  } else if (Object.prototype.hasOwnProperty.call(latestByScope, scope)) {
    delete latestByScope[scope];
  }
  writeLatestByScopeMap(latestByScope);
}

export function saveTrackerSnapshot(
  context: STContext,
  data: TrackerData,
  messageIndex: number,
): void {
  const timestamp = Date.now();
  const push = (store: SnapshotStore): SnapshotStore => {
    const next: SnapshotStore = {
      ...store,
      latest: { data, messageIndex, timestamp },
      history: [
        { data, timestamp, messageIndex },
        ...store.history.filter(item => item.data.timestamp !== data.timestamp)
      ].slice(0, HISTORY_LIMIT)
    };
    return next;
  };

  writeStore(context, push(readStore(context)));
  writeMetadataStore(context, push(readMetadataStore(context)));
  writeChatStateStore(context, push(readChatStateStore(context)));

  const scope = getScopeKey(context);
  const latestByScope = readLatestByScopeMap();
  latestByScope[scope] = { data, messageIndex, timestamp };
  writeLatestByScopeMap(latestByScope);
}

export function getChatStateLatestTrackerData(context: STContext): { data: TrackerData; messageIndex: number } | null {
  const store = readChatStateStore(context);
  if (!store.latest?.data) return null;
  return {
    data: store.latest.data,
    messageIndex: Number(store.latest.messageIndex ?? -1)
  };
}

export function getMetadataLatestTrackerData(context: STContext): { data: TrackerData; messageIndex: number } | null {
  const metadata = readMetadataStore(context);
  if (!metadata.latest?.data) return null;
  return {
    data: metadata.latest.data,
    messageIndex: Number(metadata.latest.messageIndex ?? -1)
  };
}

export function getLocalLatestTrackerData(context: STContext): { data: TrackerData; messageIndex: number } | null {
  const scoped = readStore(context);
  if (scoped.latest?.data) {
    return { data: scoped.latest.data, messageIndex: Number(scoped.latest.messageIndex ?? -1) };
  }

  const scope = getScopeKey(context);
  const latestByScope = readLatestByScopeMap();
  const scopeEntry = latestByScope[scope];
  if (!scopeEntry?.data) return null;
  return { data: scopeEntry.data, messageIndex: Number(scopeEntry.messageIndex ?? -1) };
}

export function getRecentTrackerHistory(context: STContext, limit: number): TrackerData[] {
  const fromChat: Array<{ data: TrackerData; timestamp: number; messageIndex?: number }> = [];
  for (let i = context.chat.length - 1; i >= 0 && fromChat.length < limit; i -= 1) {
    const found = getTrackerDataFromMessage(context.chat[i]);
    if (found) fromChat.push({ data: found, timestamp: found.timestamp, messageIndex: i });
  }

  if (fromChat.length >= limit) return fromChat.slice(0, limit).map(item => item.data);

  const localStore = readStore(context);
  const metadataStore = readMetadataStore(context);
  const chatStateStore = readChatStateStore(context);
  const combinedHistory = [...chatStateStore.history, ...metadataStore.history, ...localStore.history];

  const byMessageIndex = new Map<number, SnapshotEntry>();
  for (const entry of fromChat) {
    if (entry.messageIndex != null) {
      byMessageIndex.set(entry.messageIndex, entry);
    }
  }

  for (const entry of combinedHistory) {
    if (!entry?.data) continue;
    if (entry.messageIndex == null) continue;
    if (entry.messageIndex < 0 || entry.messageIndex >= context.chat.length) continue;
    const message = context.chat[entry.messageIndex];
    if (!isTrackableMessage(message)) continue;
    const existing = byMessageIndex.get(entry.messageIndex);
    if (!existing || entry.timestamp > existing.timestamp) {
      byMessageIndex.set(entry.messageIndex, entry);
    }
  }

  const merged: SnapshotEntry[] = [
    ...byMessageIndex.values()
  ].sort((a, b) => b.timestamp - a.timestamp);

  return merged.slice(0, limit).map(item => item.data);
}

export function getRecentTrackerHistoryEntries(
  context: STContext,
  limit: number,
): Array<{ data: TrackerData; timestamp: number; messageIndex: number }> {
  type HistoryEntry = { data: TrackerData; timestamp: number; messageIndex: number };
  const entries: HistoryEntry[] = [];
  for (let i = context.chat.length - 1; i >= 0 && entries.length < limit; i -= 1) {
    const found = getTrackerDataFromMessage(context.chat[i]);
    if (found) {
      entries.push({ data: found, timestamp: found.timestamp, messageIndex: i });
    }
  }

  if (entries.length >= limit) return entries.slice(0, limit);

  const localStore = readStore(context);
  const metadataStore = readMetadataStore(context);
  const chatStateStore = readChatStateStore(context);
  const combinedHistory = [...chatStateStore.history, ...metadataStore.history, ...localStore.history];

  const byMessageIndex = new Map<number, HistoryEntry>();
  for (const entry of entries) {
    byMessageIndex.set(entry.messageIndex, entry);
  }

  for (const entry of combinedHistory) {
    if (!entry?.data) continue;
    if (entry.messageIndex == null) continue;
    if (entry.messageIndex < 0 || entry.messageIndex >= context.chat.length) continue;
    const message = context.chat[entry.messageIndex];
    if (!isTrackableMessage(message)) continue;
    const existing = byMessageIndex.get(entry.messageIndex);
    if (!existing || entry.timestamp > existing.timestamp) {
      byMessageIndex.set(entry.messageIndex, {
        data: entry.data,
        timestamp: entry.timestamp,
        messageIndex: entry.messageIndex
      });
    }
  }

  const merged = [...byMessageIndex.values()].sort((a, b) => b.timestamp - a.timestamp);
  return merged.slice(0, limit);
}

export function writeTrackerDataToLastMessage(
  context: STContext,
  data: TrackerData,
): void {
  const lastIndex = context.chat.length - 1;
  writeTrackerDataToMessage(context, data, lastIndex);
}

export function writeTrackerDataToMessage(
  context: STContext,
  data: TrackerData,
  messageIndex: number,
): void {
  if (messageIndex < 0 || messageIndex >= context.chat.length) return;
  const message = context.chat[messageIndex];
  if (!message.extra) {
    message.extra = {};
  }
  const swipeId = Number(message.swipe_id ?? 0);
  const swipeKey = String(Number.isNaN(swipeId) ? 0 : swipeId);
  const existing = message.extra[EXTENSION_KEY];

  const swipeStorage: Record<string, TrackerData> = {};
  if (existing && typeof existing === "object") {
    if (isTrackerPayload(existing)) {
      swipeStorage["0"] = normalizeTrackerData(existing);
    } else {
      for (const [key, value] of Object.entries(existing as Record<string, unknown>)) {
        if (isTrackerPayload(value)) {
          swipeStorage[key] = normalizeTrackerData(value);
        }
      }
    }
  }

  const enriched: TrackerData = {
    ...data,
    entityOwnerMap: buildTrackerDataEntityOwnerMap(context, data) ?? data.entityOwnerMap,
  };
  swipeStorage[swipeKey] = normalizeTrackerData(enriched);
  message.extra[EXTENSION_KEY] = swipeStorage;
  saveTrackerSnapshot(context, swipeStorage[swipeKey], messageIndex);
}

export function clearTrackerDataForMessage(
  context: STContext,
  messageIndex: number,
): void {
  if (messageIndex < 0 || messageIndex >= context.chat.length) return;
  const message = context.chat[messageIndex];
  if (!message.extra || !Object.prototype.hasOwnProperty.call(message.extra, EXTENSION_KEY)) {
    rebuildPersistedTrackerStores(context);
    return;
  }

  const raw = message.extra[EXTENSION_KEY];
  if (isTrackerPayload(raw)) {
    delete message.extra[EXTENSION_KEY];
    rebuildPersistedTrackerStores(context);
    return;
  }

  if (raw && typeof raw === "object") {
    const swipeId = Number(message.swipe_id ?? 0);
    const swipeKey = String(Number.isNaN(swipeId) ? 0 : swipeId);
    const next: Record<string, TrackerData> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (key === swipeKey) continue;
      if (isTrackerPayload(value)) {
        next[key] = normalizeTrackerData(value);
      }
    }
    if (Object.keys(next).length) {
      message.extra[EXTENSION_KEY] = next;
    } else {
      delete message.extra[EXTENSION_KEY];
    }
  } else {
    delete message.extra[EXTENSION_KEY];
  }

  rebuildPersistedTrackerStores(context);
}

export function mergeStatisticsWithFallback(
  incoming: Statistics,
  previous: Statistics | null,
  settings?: BetterSimTrackerSettings,
): Statistics {
  const merged = createEmptyStatistics();
  const enabled = settings
    ? (() => {
        const list: StatKey[] = [];
        if (settings.trackAffection) list.push("affection");
        if (settings.trackTrust) list.push("trust");
        if (settings.trackDesire) list.push("desire");
        if (settings.trackConnection) list.push("connection");
        if (settings.trackMood) list.push("mood");
        if (settings.trackLastThought) list.push("lastThought");
        return new Set<StatKey>(list);
      })()
    : null;

  for (const stat of STAT_KEYS) {
    const nextValues = incoming[stat] ?? {};
    const prevValues = previous?.[stat] ?? {};
    merged[stat] = enabled && !enabled.has(stat)
      ? { ...nextValues }
      : { ...prevValues, ...nextValues };
  }

  return merged;
}

export function mergeCustomStatisticsWithFallback(
  incoming: CustomStatistics | undefined,
  previous: CustomStatistics | null | undefined,
): CustomStatistics {
  const next = normalizeCustomStatistics(incoming);
  const prev = normalizeCustomStatistics(previous);
  const merged: CustomStatistics = {};
  const allKeys = new Set<string>([
    ...Object.keys(prev),
    ...Object.keys(next),
  ]);
  for (const key of allKeys) {
    const prevValues = prev[key] ?? {};
    const nextValues = next[key] ?? {};
    const combined = { ...prevValues, ...nextValues };
    if (Object.keys(combined).length > 0) {
      merged[key] = combined;
    }
  }
  return merged;
}

export function mergeCustomNonNumericStatisticsWithFallback(
  incoming: CustomNonNumericStatistics | undefined,
  previous: CustomNonNumericStatistics | null | undefined,
): CustomNonNumericStatistics {
  const next = normalizeCustomNonNumericStatistics(incoming);
  const prev = normalizeCustomNonNumericStatistics(previous);
  const merged: CustomNonNumericStatistics = {};
  const allKeys = new Set<string>([
    ...Object.keys(prev),
    ...Object.keys(next),
  ]);
  for (const key of allKeys) {
    const prevValues = prev[key] ?? {};
    const nextValues = next[key] ?? {};
    const combined = { ...prevValues, ...nextValues };
    if (Object.keys(combined).length > 0) {
      merged[key] = combined;
    }
  }
  return merged;
}

export function mergeClearedStatisticsWithFallback(
  incoming: ClearedStatistics | undefined,
  previous: ClearedStatistics | null | undefined,
): ClearedStatistics {
  const next = cloneClearedStatistics(incoming);
  const prev = cloneClearedStatistics(previous);
  const merged: ClearedStatistics = {};
  const allKeys = new Set<string>([
    ...Object.keys(prev),
    ...Object.keys(next),
  ]);
  for (const key of allKeys) {
    const combined = { ...(prev[key as StatKey] ?? {}), ...(next[key as StatKey] ?? {}) };
    if (Object.keys(combined).length > 0) {
      merged[key as StatKey] = combined;
    }
  }
  return merged;
}

export function mergeClearedOwnerBucketsWithFallback<T extends ClearedCustomStatistics | ClearedCustomNonNumericStatistics>(
  incoming: T | undefined,
  previous: T | null | undefined,
): T {
  const next = cloneClearedOwnerBuckets(incoming) as Record<string, Record<string, true>>;
  const prev = cloneClearedOwnerBuckets(previous) as Record<string, Record<string, true>>;
  const merged: Record<string, Record<string, true>> = {};
  const allKeys = new Set<string>([
    ...Object.keys(prev),
    ...Object.keys(next),
  ]);
  for (const key of allKeys) {
    const combined = { ...(prev[key] ?? {}), ...(next[key] ?? {}) };
    if (Object.keys(combined).length > 0) {
      merged[key] = combined;
    }
  }
  return merged as T;
}

function pruneClearedStatistics(raw: ClearedStatistics | undefined): ClearedStatistics | undefined {
  if (!raw) return undefined;
  const out: ClearedStatistics = {};
  for (const [statId, owners] of Object.entries(raw)) {
    if (!owners || !Object.keys(owners).length) continue;
    out[statId as StatKey] = owners;
  }
  return Object.keys(out).length ? out : undefined;
}

function pruneClearedOwnerBuckets<T extends ClearedCustomStatistics | ClearedCustomNonNumericStatistics>(raw: T | undefined): T | undefined {
  if (!raw) return undefined;
  const out: Record<string, Record<string, true>> = {};
  for (const [statId, owners] of Object.entries(raw)) {
    if (!owners || !Object.keys(owners).length) continue;
    out[statId] = owners;
  }
  return Object.keys(out).length ? (out as T) : undefined;
}

export function mergeTrackerDataChronologically(entries: TrackerData[]): TrackerData | null {
  if (!entries.length) return null;
  const sorted = [...entries]
    .map(entry => normalizeTrackerDataEntityBuckets(entry))
    .sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0));
  let mergedStatistics: Statistics | null = null;
  let mergedStatisticsByEntityId: Statistics | null = null;
  let mergedCustomStatistics: CustomStatistics | null = null;
  let mergedCustomStatisticsByEntityId: CustomStatistics | null = null;
  let mergedCustomNonNumericStatistics: CustomNonNumericStatistics | null = null;
  let mergedCustomNonNumericStatisticsByEntityId: CustomNonNumericStatistics | null = null;
  let mergedClearedStatistics: ClearedStatistics | null = null;
  let mergedClearedCustomStatistics: ClearedCustomStatistics | null = null;
  let mergedClearedCustomNonNumericStatistics: ClearedCustomNonNumericStatistics | null = null;
  let mergedEntityResolution: TrackerData["entityResolution"];
  let mergedTimestamp = 0;
  let fallbackActiveCharacters: string[] | null = null;

  for (const entry of sorted) {
    mergedStatistics = mergeStatisticsWithFallback(entry.statistics, mergedStatistics, undefined);
    mergedStatisticsByEntityId = mergeStatisticsWithFallback(
      entry.statisticsByEntityId ?? createEmptyStatistics(),
      mergedStatisticsByEntityId,
      undefined,
    );
    mergedCustomStatistics = mergeCustomStatisticsWithFallback(entry.customStatistics, mergedCustomStatistics);
    mergedCustomStatisticsByEntityId = mergeCustomStatisticsWithFallback(
      entry.customStatisticsByEntityId,
      mergedCustomStatisticsByEntityId,
    );
    mergedCustomNonNumericStatistics = mergeCustomNonNumericStatisticsWithFallback(
      entry.customNonNumericStatistics,
      mergedCustomNonNumericStatistics,
    );
    mergedCustomNonNumericStatisticsByEntityId = mergeCustomNonNumericStatisticsWithFallback(
      entry.customNonNumericStatisticsByEntityId,
      mergedCustomNonNumericStatisticsByEntityId,
    );
    mergedClearedStatistics = mergeClearedStatisticsWithFallback(entry.clearedStatistics, mergedClearedStatistics);
    mergedClearedCustomStatistics = mergeClearedOwnerBucketsWithFallback(entry.clearedCustomStatistics, mergedClearedCustomStatistics);
    mergedClearedCustomNonNumericStatistics = mergeClearedOwnerBucketsWithFallback(
      entry.clearedCustomNonNumericStatistics,
      mergedClearedCustomNonNumericStatistics,
    );
    mergedStatistics = applyClearsToStatistics(mergedStatistics ?? createEmptyStatistics(), mergedClearedStatistics);
    mergedCustomStatistics = applyClearsToCustomStatistics(mergedCustomStatistics ?? {}, mergedClearedCustomStatistics);
    mergedCustomNonNumericStatistics = applyClearsToCustomNonNumericStatistics(
      mergedCustomNonNumericStatistics ?? {},
      mergedClearedCustomNonNumericStatistics,
    );
    mergedTimestamp = Math.max(mergedTimestamp, Number(entry.timestamp ?? 0));
    if (entry.entityResolution) {
      mergedEntityResolution = {
        source: entry.entityResolution.source,
        sceneOwners: [...(entry.entityResolution.sceneOwners ?? [])],
        messageOwners: [...(entry.entityResolution.messageOwners ?? [])],
        sceneEntityIds: [...(entry.entityResolution.sceneEntityIds ?? [])],
        messageEntityIds: [...(entry.entityResolution.messageEntityIds ?? [])],
      };
      const messageOwners = (entry.entityResolution.messageOwners ?? []).map(name => String(name ?? "").trim()).filter(Boolean);
      if (messageOwners.length) {
        fallbackActiveCharacters = messageOwners;
      } else {
        const sceneOwners = (entry.entityResolution.sceneOwners ?? []).map(name => String(name ?? "").trim()).filter(Boolean);
        if (sceneOwners.length) {
          fallbackActiveCharacters = sceneOwners;
        }
      }
    } else if (Array.isArray(entry.activeCharacters) && entry.activeCharacters.length) {
      fallbackActiveCharacters = entry.activeCharacters.map(name => String(name ?? "").trim()).filter(Boolean);
    }
  }

  const mergedEntityOwnerMap = mergeEntityOwnerMapsChronologically(sorted);
  const hydratedSceneOwners = mergedEntityResolution?.sceneOwners?.length
    ? [...mergedEntityResolution.sceneOwners]
    : resolveOwnersFromEntityIdsWithOwnerMap(mergedEntityResolution?.sceneEntityIds, mergedEntityOwnerMap);
  const hydratedMessageOwners = mergedEntityResolution?.messageOwners?.length
    ? [...mergedEntityResolution.messageOwners]
    : resolveOwnersFromEntityIdsWithOwnerMap(mergedEntityResolution?.messageEntityIds, mergedEntityOwnerMap);
  const hydratedEntityResolution = mergedEntityResolution
    ? {
        ...mergedEntityResolution,
        sceneOwners: hydratedSceneOwners,
        messageOwners: hydratedMessageOwners.length
          ? hydratedMessageOwners
          : (hydratedSceneOwners.length ? hydratedSceneOwners : mergedEntityResolution.messageOwners),
      }
    : mergedEntityResolution;
  const normalizedFallbackActiveCharacters = resolveNormalizedTrackerActiveCharacters(
    { activeCharacters: fallbackActiveCharacters },
    hydratedSceneOwners,
    hydratedMessageOwners,
  );

  return normalizeTrackerDataEntityBuckets({
    timestamp: mergedTimestamp || Date.now(),
    activeCharacters: normalizedFallbackActiveCharacters,
    entityResolution: hydratedEntityResolution,
    statistics: mergedStatistics ?? createEmptyStatistics(),
    statisticsByEntityId: mergedStatisticsByEntityId ?? createEmptyStatistics(),
    customStatistics: mergedCustomStatistics ?? {},
    customStatisticsByEntityId: mergedCustomStatisticsByEntityId ?? {},
    customNonNumericStatistics: mergedCustomNonNumericStatistics ?? {},
    customNonNumericStatisticsByEntityId: mergedCustomNonNumericStatisticsByEntityId ?? {},
    clearedStatistics: pruneClearedStatistics(mergedClearedStatistics ?? undefined),
    clearedCustomStatistics: pruneClearedOwnerBuckets(mergedClearedCustomStatistics ?? undefined),
    clearedCustomNonNumericStatistics: pruneClearedOwnerBuckets(mergedClearedCustomNonNumericStatistics ?? undefined),
    entityOwnerMap: mergedEntityOwnerMap,
  });
}

export function clearTrackerDataForCurrentChat(context: STContext): void {
  for (const message of context.chat) {
    if (!message.extra) continue;
    delete message.extra[EXTENSION_KEY];
  }

  const firstMessage = context.chat?.[0];
  if (firstMessage?.extra) {
    delete firstMessage.extra[CHAT_STATE_KEY];
  }

  if (context.chatMetadata && Object.prototype.hasOwnProperty.call(context.chatMetadata, EXTENSION_KEY)) {
    delete context.chatMetadata[EXTENSION_KEY];
    context.saveMetadataDebounced?.();
  }
  clearEntityRegistry(context);
  clearManualInactiveCharacters(context);

  const scopeKey = getStoreKey(context);
  try {
    localStorage.removeItem(scopeKey);
  } catch {
    // ignore
  }

  try {
    const scope = getScopeKey(context);
    const map = readLatestByScopeMap();
    if (Object.prototype.hasOwnProperty.call(map, scope)) {
      delete map[scope];
      writeLatestByScopeMap(map);
    }
  } catch {
    // ignore
  }
}
