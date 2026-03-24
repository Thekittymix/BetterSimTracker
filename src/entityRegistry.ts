import type {
  STContext,
  TrackerData,
  TrackerDataEntityOwner,
  TrackerEntityLifecycleState,
  TrackerEntityRegistry,
  TrackerEntityRegistryEntry,
} from "./types";
import { resolveCharacterIdentity, type EntityTrackingMode, type ResolvedCharacterIdentity } from "./entityResolution";
import type { CardLifecycleRegistryState, CardLifecycleSnapshot } from "./cardLifecycle";
import { USER_TRACKER_KEY } from "./constants";

type TrackerHistoryEntryWithMessageIndex = {
  data: TrackerData | null;
  messageIndex: number;
};

const ENTITY_REGISTRY_METADATA_KEY = "bstEntityRegistry";

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeKey(value: unknown): string {
  return normalizeToken(value).toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = normalizeToken(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function buildEntitySourceKey(sourceName: string, sourceAvatar: string | null): string {
  return `${normalizeKey(sourceAvatar ?? "")}|${normalizeKey(sourceName)}`;
}

export function buildTrackerEntityId(identity: {
  sourceName: string;
  sourceAvatar: string | null;
  ownerName: string;
  matchedBy: "source" | "alias";
}): string {
  const sourceKey = buildEntitySourceKey(identity.sourceName, identity.sourceAvatar);
  const ownerKey = normalizeKey(identity.ownerName);
  return identity.matchedBy === "alias"
    ? `bst_mc_alias:${sourceKey}:${ownerKey}`
    : `bst_owner:${sourceKey}`;
}

function isLifecycleState(value: unknown): value is TrackerEntityLifecycleState {
  return value === "active" || value === "inactive" || value === "archived";
}

function sanitizeLifecycleEvents(
  raw: unknown,
  fallbackState: TrackerEntityLifecycleState,
  introducedAtMessageIndex: number,
): Array<{ messageIndex: number; state: TrackerEntityLifecycleState }> {
  const events = Array.isArray(raw)
    ? raw.flatMap(item => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        const messageIndex = Number(record.messageIndex);
        const state = record.state;
        if (!Number.isFinite(messageIndex) || !isLifecycleState(state)) return [];
        return [{ messageIndex, state }];
      })
    : [];
  const deduped = new Map<number, TrackerEntityLifecycleState>();
  for (const event of events) {
    deduped.set(event.messageIndex, event.state);
  }
  const normalized = Array.from(deduped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([messageIndex, state]) => ({ messageIndex, state }));
  if (normalized.length) return normalized;
  return [{ messageIndex: introducedAtMessageIndex, state: fallbackState }];
}

function upsertLifecycleEvent(
  entry: TrackerEntityRegistryEntry,
  messageIndex: number,
  state: TrackerEntityLifecycleState,
): boolean {
  const existing = Array.isArray(entry.lifecycleEvents) ? [...entry.lifecycleEvents] : [];
  const deduped = new Map<number, TrackerEntityLifecycleState>();
  for (const event of existing) {
    if (!Number.isFinite(Number(event.messageIndex)) || !isLifecycleState(event.state)) continue;
    deduped.set(Number(event.messageIndex), event.state);
  }
  deduped.set(messageIndex, state);
  const next = Array.from(deduped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([eventMessageIndex, eventState]) => ({ messageIndex: eventMessageIndex, state: eventState }));
  const before = JSON.stringify(existing);
  const after = JSON.stringify(next);
  entry.lifecycleEvents = next;
  return before !== after;
}

function getLifecycleEvents(entry: TrackerEntityRegistryEntry): Array<{ messageIndex: number; state: TrackerEntityLifecycleState }> {
  if (Array.isArray(entry.lifecycleEvents) && entry.lifecycleEvents.length) {
    return entry.lifecycleEvents;
  }
  return [{ messageIndex: entry.introducedAtMessageIndex, state: entry.lifecycleState }];
}

function resolveDerivedLifecycleMetadata(entry: TrackerEntityRegistryEntry): {
  introducedAtMessageIndex: number;
  lastSeenMessageIndex: number;
  lastActiveMessageIndex: number | null;
  lifecycleState: TrackerEntityLifecycleState;
  archivedAtMessageIndex: number | null;
} {
  const events = getLifecycleEvents(entry);
  const introducedAtMessageIndex = Math.min(
    entry.introducedAtMessageIndex,
    ...events.map(event => event.messageIndex),
  );
  const lastSeenMessageIndex = Math.max(
    entry.lastSeenMessageIndex,
    ...events.map(event => event.messageIndex),
  );
  const activeEvents = events.filter(event => event.state === "active").map(event => event.messageIndex);
  const latestEvent = events[events.length - 1] ?? { messageIndex: introducedAtMessageIndex, state: entry.lifecycleState };
  return {
    introducedAtMessageIndex,
    lastSeenMessageIndex,
    lastActiveMessageIndex: activeEvents.length ? Math.max(...activeEvents) : null,
    lifecycleState: latestEvent.state,
    archivedAtMessageIndex: latestEvent.state === "archived" ? latestEvent.messageIndex : null,
  };
}

function resolveLastActiveMessageIndexAtMessage(
  entry: TrackerEntityRegistryEntry,
  messageIndex: number,
): number | null {
  let lastActiveMessageIndex: number | null = null;
  for (const event of getLifecycleEvents(entry)) {
    if (event.messageIndex > messageIndex) break;
    if (event.state === "active") {
      lastActiveMessageIndex = event.messageIndex;
    }
  }
  return lastActiveMessageIndex;
}

function resolveLifecycleStateAtMessage(
  entry: TrackerEntityRegistryEntry,
  messageIndex: number,
): { state: TrackerEntityLifecycleState; stateChangedAtMessageIndex: number | null } {
  const events = getLifecycleEvents(entry);
  let resolvedState: TrackerEntityLifecycleState = "inactive";
  let stateChangedAtMessageIndex: number | null = null;
  for (const event of events) {
    if (event.messageIndex > messageIndex) break;
    resolvedState = event.state;
    stateChangedAtMessageIndex = event.messageIndex;
  }
  return { state: resolvedState, stateChangedAtMessageIndex };
}

function sanitizeRegistry(input: unknown): TrackerEntityRegistry {
  const empty: TrackerEntityRegistry = { version: 1, entities: {}, ownerToEntityId: {} };
  if (!input || typeof input !== "object") return empty;
  const record = input as Record<string, unknown>;
  const entities: Record<string, TrackerEntityRegistryEntry> = {};
  const ownerToEntityId: Record<string, string> = {};

  if (record.entities && typeof record.entities === "object") {
    for (const [entityId, rawEntry] of Object.entries(record.entities as Record<string, unknown>)) {
      if (!rawEntry || typeof rawEntry !== "object") continue;
      const entry = rawEntry as Record<string, unknown>;
      const id = normalizeToken(entry.id) || entityId;
      const ownerName = normalizeToken(entry.ownerName);
      const canonicalName = normalizeToken(entry.canonicalName) || ownerName;
      const sourceName = normalizeToken(entry.sourceName);
      const sourceAvatar = normalizeToken(entry.sourceAvatar) || null;
      const sourceKey = normalizeToken(entry.sourceKey) || buildEntitySourceKey(sourceName, sourceAvatar);
      const aliases = Array.isArray(entry.aliases) ? uniqueStrings(entry.aliases.map(item => normalizeToken(item))) : [];
      const kind = entry.kind === "multi_character_alias" ? "multi_character_alias" : "owner";
      const introducedAtMessageIndex = entry.introducedAtMessageIndex == null
        ? 0
        : (Number.isFinite(Number(entry.introducedAtMessageIndex)) ? Number(entry.introducedAtMessageIndex) : 0);
      const lastSeenMessageIndex = entry.lastSeenMessageIndex == null
        ? introducedAtMessageIndex
        : (Number.isFinite(Number(entry.lastSeenMessageIndex)) ? Number(entry.lastSeenMessageIndex) : introducedAtMessageIndex);
      const lastActiveMessageIndex = entry.lastActiveMessageIndex == null
        ? null
        : (Number.isFinite(Number(entry.lastActiveMessageIndex)) ? Number(entry.lastActiveMessageIndex) : null);
      const lifecycleState = isLifecycleState(entry.lifecycleState) ? entry.lifecycleState : "inactive";
      const archivedAtMessageIndex = entry.archivedAtMessageIndex == null
        ? null
        : (Number.isFinite(Number(entry.archivedAtMessageIndex)) ? Number(entry.archivedAtMessageIndex) : null);
      const lifecycleEvents = sanitizeLifecycleEvents(entry.lifecycleEvents, lifecycleState, introducedAtMessageIndex);
      if (!id || !ownerName || !canonicalName || !sourceName || !sourceKey) continue;
      entities[id] = {
        id,
        ownerName,
        canonicalName,
        aliases,
        sourceName,
        sourceAvatar,
        sourceKey,
        kind,
        introducedAtMessageIndex,
        lastSeenMessageIndex,
        lastActiveMessageIndex,
        lifecycleState,
        archivedAtMessageIndex,
        lifecycleEvents,
      };
    }
  }

  if (record.ownerToEntityId && typeof record.ownerToEntityId === "object") {
    for (const [ownerName, entityIdRaw] of Object.entries(record.ownerToEntityId as Record<string, unknown>)) {
      const entityId = normalizeToken(entityIdRaw);
      if (!entityId || !entities[entityId]) continue;
      ownerToEntityId[normalizeKey(ownerName)] = entityId;
    }
  }

  for (const entry of Object.values(entities)) {
    ownerToEntityId[normalizeKey(entry.ownerName)] = entry.id;
    ownerToEntityId[normalizeKey(entry.canonicalName)] = entry.id;
    for (const alias of entry.aliases) {
      ownerToEntityId[normalizeKey(alias)] = entry.id;
    }
  }

  return { version: 1, entities, ownerToEntityId };
}

function readRegistry(context: STContext | null): TrackerEntityRegistry {
  return sanitizeRegistry(context?.chatMetadata?.[ENTITY_REGISTRY_METADATA_KEY]);
}

function writeRegistry(context: STContext, registry: TrackerEntityRegistry): void {
  if (!context.chatMetadata || typeof context.chatMetadata !== "object") {
    context.chatMetadata = {};
  }
  context.chatMetadata[ENTITY_REGISTRY_METADATA_KEY] = registry;
  context.saveMetadataDebounced?.();
}

export function clearEntityRegistry(context: STContext | null): void {
  if (!context?.chatMetadata || typeof context.chatMetadata !== "object") return;
  if (!Object.prototype.hasOwnProperty.call(context.chatMetadata, ENTITY_REGISTRY_METADATA_KEY)) return;
  delete context.chatMetadata[ENTITY_REGISTRY_METADATA_KEY];
  context.saveMetadataDebounced?.();
}

function ensureEntry(
  registry: TrackerEntityRegistry,
  identity: ResolvedCharacterIdentity,
  ownerName: string,
  messageIndex: number,
): TrackerEntityRegistryEntry {
  const entityId = buildTrackerEntityId({
    sourceName: identity.sourceName,
    sourceAvatar: identity.sourceAvatar,
    ownerName,
    matchedBy: identity.matchedBy,
  });
  const existing = registry.entities[entityId];
  if (existing) {
    registry.ownerToEntityId[normalizeKey(ownerName)] = entityId;
    return existing;
  }
  const entry: TrackerEntityRegistryEntry = {
    id: entityId,
    ownerName,
    canonicalName: identity.resolvedName,
    aliases: identity.matchedBy === "alias" ? [identity.resolvedName] : [],
    sourceName: identity.sourceName,
    sourceAvatar: identity.sourceAvatar,
    sourceKey: buildEntitySourceKey(identity.sourceName, identity.sourceAvatar),
    kind: identity.matchedBy === "alias" ? "multi_character_alias" : "owner",
    introducedAtMessageIndex: messageIndex,
    lastSeenMessageIndex: messageIndex,
    lastActiveMessageIndex: null,
    lifecycleState: "inactive",
    archivedAtMessageIndex: null,
    lifecycleEvents: [{ messageIndex, state: "inactive" }],
  };
  registry.entities[entityId] = entry;
  registry.ownerToEntityId[normalizeKey(ownerName)] = entityId;
  registry.ownerToEntityId[normalizeKey(entry.canonicalName)] = entityId;
  for (const alias of entry.aliases) {
    registry.ownerToEntityId[normalizeKey(alias)] = entityId;
  }
  return entry;
}

export function syncEntityRegistryFromRender(input: {
  context: STContext | null;
  mode: EntityTrackingMode;
  messageIndex: number;
  owners: string[];
  getLifecycleState: (ownerName: string) => TrackerEntityLifecycleState;
}): boolean {
  const context = input.context;
  if (!context || input.mode !== "multi_character" || !input.owners.length) return false;
  const registry = readRegistry(context);
  let changed = false;

  for (const rawOwnerName of input.owners) {
    const ownerName = normalizeToken(rawOwnerName);
    if (!ownerName) continue;
    const identity = resolveCharacterIdentity(context, ownerName, input.mode);
    if (!identity) continue;
    const entry = ensureEntry(registry, identity, ownerName, input.messageIndex);
    const lifecycleState = input.getLifecycleState(ownerName);
    const aliases = identity.matchedBy === "alias"
      ? uniqueStrings([...(entry.aliases ?? []), identity.resolvedName])
      : entry.aliases;
    if (entry.ownerName !== ownerName) {
      entry.ownerName = ownerName;
      changed = true;
    }
    if (entry.canonicalName !== identity.resolvedName) {
      entry.canonicalName = identity.resolvedName;
      changed = true;
    }
    if (aliases.join("\n") !== (entry.aliases ?? []).join("\n")) {
      entry.aliases = aliases;
      changed = true;
    }
    const derived = resolveDerivedLifecycleMetadata(entry);
    if (entry.introducedAtMessageIndex !== derived.introducedAtMessageIndex) {
      entry.introducedAtMessageIndex = derived.introducedAtMessageIndex;
      changed = true;
    }
    if (entry.lastSeenMessageIndex !== derived.lastSeenMessageIndex) {
      entry.lastSeenMessageIndex = derived.lastSeenMessageIndex;
      changed = true;
    }
    if (entry.lastActiveMessageIndex !== derived.lastActiveMessageIndex) {
      entry.lastActiveMessageIndex = derived.lastActiveMessageIndex;
      changed = true;
    }
    if (entry.lifecycleState !== derived.lifecycleState) {
      entry.lifecycleState = derived.lifecycleState;
      changed = true;
    }
    if (entry.archivedAtMessageIndex !== derived.archivedAtMessageIndex) {
      entry.archivedAtMessageIndex = derived.archivedAtMessageIndex;
      changed = true;
    }
    if (upsertLifecycleEvent(entry, input.messageIndex, lifecycleState)) {
      const nextDerived = resolveDerivedLifecycleMetadata(entry);
      if (entry.introducedAtMessageIndex !== nextDerived.introducedAtMessageIndex) {
        entry.introducedAtMessageIndex = nextDerived.introducedAtMessageIndex;
      }
      if (entry.lastSeenMessageIndex !== nextDerived.lastSeenMessageIndex) {
        entry.lastSeenMessageIndex = nextDerived.lastSeenMessageIndex;
      }
      if (entry.lastActiveMessageIndex !== nextDerived.lastActiveMessageIndex) {
        entry.lastActiveMessageIndex = nextDerived.lastActiveMessageIndex;
      }
      if (entry.lifecycleState !== nextDerived.lifecycleState) {
        entry.lifecycleState = nextDerived.lifecycleState;
      }
      if (entry.archivedAtMessageIndex !== nextDerived.archivedAtMessageIndex) {
        entry.archivedAtMessageIndex = nextDerived.archivedAtMessageIndex;
      }
      changed = true;
    }
    registry.ownerToEntityId[normalizeKey(ownerName)] = entry.id;
    registry.ownerToEntityId[normalizeKey(entry.canonicalName)] = entry.id;
    for (const alias of entry.aliases) {
      registry.ownerToEntityId[normalizeKey(alias)] = entry.id;
    }
  }

  if (!changed) return false;
  writeRegistry(context, registry);
  return true;
}

export function readEntityRegistry(context: STContext | null): TrackerEntityRegistry {
  return readRegistry(context);
}

export function getEntityRegistryEntryByOwnerName(
  context: STContext | null,
  ownerName: string,
): TrackerEntityRegistryEntry | null {
  const registry = readRegistry(context);
  const normalizedOwner = normalizeKey(ownerName);
  const entityId = registry.ownerToEntityId[normalizedOwner];
  if (!entityId) return null;
  return registry.entities[entityId] ?? null;
}

export function listEntityRegistryLookupNames(
  context: STContext | null,
  ownerName: string,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown): void => {
    const value = normalizeToken(raw);
    const key = normalizeKey(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    names.push(value);
  };
  push(ownerName);
  const entry = getEntityRegistryEntryByOwnerName(context, ownerName);
  if (!entry) return names;
  push(entry.ownerName);
  push(entry.canonicalName);
  for (const alias of entry.aliases ?? []) {
    push(alias);
  }
  return names;
}

export function resolveEntityRegistryLookupValue<T>(
  context: STContext | null,
  byOwner: Record<string, T> | null | undefined,
  ownerName: string,
): T | undefined {
  if (!byOwner) return undefined;
  for (const lookupName of listEntityRegistryLookupNames(context, ownerName)) {
    const value = byOwner[lookupName];
    if (value !== undefined) return value;
  }
  return undefined;
}

function listTrackerDataEntityIdsForOwner(
  context: STContext | null,
  data: TrackerData | null | undefined,
  ownerName: string,
): string[] {
  const entityIds: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown): void => {
    const value = normalizeToken(raw);
    if (!value || seen.has(value)) return;
    seen.add(value);
    entityIds.push(value);
  };

  const directEntityId = normalizeToken(data?.entityOwnerMap?.[ownerName]?.entityId);
  if (directEntityId) {
    push(directEntityId);
  }

  if (data?.entityOwnerMap && typeof data.entityOwnerMap === "object") {
    const fallbackEntityId = normalizeToken(getEntityRegistryEntryByOwnerName(context, ownerName)?.id);
    const targetEntityId = directEntityId || fallbackEntityId;
    if (targetEntityId) {
      for (const snapshot of Object.values(data.entityOwnerMap)) {
        if (normalizeToken(snapshot?.entityId) !== targetEntityId) continue;
        push(snapshot?.entityId);
      }
    }
  }

  push(getEntityRegistryEntryByOwnerName(context, ownerName)?.id);
  return entityIds;
}

export function resolveTrackerDataLookupValue<T>(input: {
  context: STContext | null;
  data: TrackerData | null | undefined;
  byOwner: Record<string, T> | null | undefined;
  byEntityId?: Record<string, T> | null | undefined;
  ownerName: string;
}): T | undefined {
  if (input.byEntityId) {
    for (const entityId of listTrackerDataEntityIdsForOwner(input.context, input.data, input.ownerName)) {
      const direct = input.byEntityId[entityId];
      if (direct !== undefined) return direct;
    }
  }
  return resolveEntityRegistryLookupValue(input.context, input.byOwner, input.ownerName);
}

function collectTrackerDataOwnerNames(
  context: STContext | null,
  data: TrackerData,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown): void => {
    const value = normalizeToken(raw);
    const key = normalizeKey(value);
    if (!key || key === "global" || seen.has(key)) return;
    seen.add(key);
    names.push(value);
  };
  const resolverOwnersFromEntityIds = resolveTrackerOwnersForEntityIds(
    context,
    data.entityResolution?.sceneEntityIds ?? [],
  );
  const resolverMessageOwnersFromEntityIds = resolveTrackerOwnersForEntityIds(
    context,
    data.entityResolution?.messageEntityIds ?? [],
  );
  const hasExplicitResolverOwners =
    resolverOwnersFromEntityIds.length > 0 ||
    resolverMessageOwnersFromEntityIds.length > 0 ||
    Array.isArray(data.entityResolution?.sceneOwners) && data.entityResolution.sceneOwners.length > 0 ||
    Array.isArray(data.entityResolution?.messageOwners) && data.entityResolution.messageOwners.length > 0;
  const hasExplicitEntityIdentity =
    hasExplicitResolverOwners ||
    (data.entityOwnerMap != null && Object.keys(data.entityOwnerMap).length > 0);
  for (const name of resolverOwnersFromEntityIds) push(name);
  for (const name of resolverMessageOwnersFromEntityIds) push(name);
  for (const name of data.entityResolution?.sceneOwners ?? []) push(name);
  for (const name of data.entityResolution?.messageOwners ?? []) push(name);
  for (const name of Object.keys(data.entityOwnerMap ?? {})) push(name);
  if (!hasExplicitResolverOwners) {
    for (const name of data.activeCharacters ?? []) push(name);
  }
  if (hasExplicitEntityIdentity) {
    return names;
  }
  for (const bucket of Object.values(data.statistics ?? {})) {
    for (const owner of Object.keys(bucket ?? {})) push(owner);
  }
  for (const bucket of Object.values(data.customStatistics ?? {})) {
    for (const owner of Object.keys(bucket ?? {})) push(owner);
  }
  for (const bucket of Object.values(data.customNonNumericStatistics ?? {})) {
    for (const owner of Object.keys(bucket ?? {})) push(owner);
  }
  return names;
}

export function buildTrackerDataEntityOwnerMap(
  context: STContext | null,
  data: TrackerData,
): Record<string, TrackerDataEntityOwner> | undefined {
  if (!context) return undefined;
  const registry = readRegistry(context);
  const out: Record<string, TrackerDataEntityOwner> = {};
  for (const ownerName of collectTrackerDataOwnerNames(context, data)) {
    const entityId = registry.ownerToEntityId[normalizeKey(ownerName)];
    if (!entityId) continue;
    const entry = registry.entities[entityId];
    if (!entry) continue;
    out[ownerName] = {
      entityId: entry.id,
      ownerName: entry.ownerName,
      canonicalName: entry.canonicalName,
      aliases: [...(entry.aliases ?? [])],
      sourceKey: entry.sourceKey,
      kind: entry.kind,
    };
  }
  return Object.keys(out).length ? out : undefined;
}

export function resolveTrackerEntityIdsForOwners(
  context: STContext | null,
  ownerNames: string[],
): string[] {
  if (!context || !Array.isArray(ownerNames) || !ownerNames.length) return [];
  const registry = readRegistry(context);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawOwnerName of ownerNames) {
    const ownerName = normalizeToken(rawOwnerName);
    if (!ownerName) continue;
    const entityId = registry.ownerToEntityId[normalizeKey(ownerName)];
    if (!entityId || seen.has(entityId) || !registry.entities[entityId]) continue;
    seen.add(entityId);
    out.push(entityId);
  }
  return out;
}

export function resolveTrackerOwnersForEntityIds(
  context: STContext | null,
  entityIds: string[],
): string[] {
  if (!context || !Array.isArray(entityIds) || !entityIds.length) return [];
  const registry = readRegistry(context);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawEntityId of entityIds) {
    const entityId = normalizeToken(rawEntityId);
    const entry = entityId ? registry.entities[entityId] : null;
    const ownerName = normalizeToken(entry?.ownerName);
    const ownerKey = normalizeKey(ownerName);
    if (!ownerKey || seen.has(ownerKey)) continue;
    seen.add(ownerKey);
    out.push(ownerName);
  }
  return out;
}

function resolveTrackerOwnersForEntityIdsFromOwnerMap(
  data: TrackerData | null | undefined,
  entityIds: string[],
): string[] {
  if (!data?.entityOwnerMap || typeof data.entityOwnerMap !== "object" || !Array.isArray(entityIds) || !entityIds.length) {
    return [];
  }
  const wanted = new Set(entityIds.map(normalizeToken).filter(Boolean));
  if (!wanted.size) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [snapshotOwner, snapshot] of Object.entries(data.entityOwnerMap)) {
    const entityId = normalizeToken(snapshot?.entityId);
    if (!entityId || !wanted.has(entityId)) continue;
    const ownerName = normalizeToken(snapshot?.ownerName) || normalizeToken(snapshotOwner);
    const ownerKey = normalizeKey(ownerName);
    if (!ownerKey || seen.has(ownerKey)) continue;
    seen.add(ownerKey);
    out.push(ownerName);
  }
  return out;
}

export function resolveTrackerSceneOwners(
  context: STContext | null,
  data: TrackerData | null | undefined,
): string[] {
  if (!data) return [];
  const sceneEntityIds = data.entityResolution?.sceneEntityIds ?? [];
  const sceneOwnersFromEntityIds = resolveTrackerOwnersForEntityIds(context, sceneEntityIds);
  if (sceneOwnersFromEntityIds.length) return sceneOwnersFromEntityIds;
  const sceneOwnersFromOwnerMap = resolveTrackerOwnersForEntityIdsFromOwnerMap(data, sceneEntityIds);
  if (sceneOwnersFromOwnerMap.length) return sceneOwnersFromOwnerMap;
  const sceneOwners = Array.isArray(data.entityResolution?.sceneOwners)
    ? uniqueStrings(data.entityResolution?.sceneOwners ?? [])
    : [];
  if (sceneOwners.length) return sceneOwners;
  return uniqueStrings(Array.isArray(data.activeCharacters) ? data.activeCharacters : []);
}

export function resolveTrackerActiveOwners(
  context: STContext | null,
  data: TrackerData | null | undefined,
): string[] {
  if (!data) return [];
  const explicitActiveCharacters = Array.isArray(data.activeCharacters)
    ? uniqueStrings(data.activeCharacters)
    : [];
  if (explicitActiveCharacters.includes(USER_TRACKER_KEY)) {
    return explicitActiveCharacters;
  }
  if (Array.isArray(data.activeCharacters) && explicitActiveCharacters.length === 0) {
    return [];
  }
  const sceneEntityIds = data.entityResolution?.sceneEntityIds ?? [];
  const sceneOwnersFromEntityIds = resolveTrackerOwnersForEntityIds(context, sceneEntityIds);
  if (sceneOwnersFromEntityIds.length) return sceneOwnersFromEntityIds;
  const sceneOwnersFromOwnerMap = resolveTrackerOwnersForEntityIdsFromOwnerMap(data, sceneEntityIds);
  if (sceneOwnersFromOwnerMap.length) return sceneOwnersFromOwnerMap;
  const sceneOwners = Array.isArray(data.entityResolution?.sceneOwners)
    ? uniqueStrings(data.entityResolution?.sceneOwners ?? [])
    : [];
  return sceneOwners.length ? sceneOwners : explicitActiveCharacters;
}

export function resolveTrackerMessageOwners(
  context: STContext | null,
  data: TrackerData | null | undefined,
): string[] {
  if (!data) return [];
  const messageEntityIds = data.entityResolution?.messageEntityIds ?? [];
  const messageOwnersFromEntityIds = resolveTrackerOwnersForEntityIds(context, messageEntityIds);
  if (messageOwnersFromEntityIds.length) return messageOwnersFromEntityIds;
  const messageOwnersFromOwnerMap = resolveTrackerOwnersForEntityIdsFromOwnerMap(data, messageEntityIds);
  if (messageOwnersFromOwnerMap.length) return messageOwnersFromOwnerMap;
  const messageOwners = Array.isArray(data.entityResolution?.messageOwners)
    ? uniqueStrings(data.entityResolution?.messageOwners ?? [])
    : [];
  if (messageOwners.length) return messageOwners;
  return resolveTrackerSceneOwners(context, data);
}

export function resolveTrackerSceneEntityIds(
  context: STContext | null,
  data: TrackerData | null | undefined,
): string[] {
  if (!data) return [];
  const explicit = uniqueStrings(data.entityResolution?.sceneEntityIds ?? []);
  if (explicit.length) return explicit;
  const sceneOwners = Array.isArray(data.entityResolution?.sceneOwners)
    ? uniqueStrings(data.entityResolution?.sceneOwners ?? [])
    : [];
  if (sceneOwners.length) return resolveTrackerEntityIdsForOwners(context, sceneOwners);
  const activeCharacters = Array.isArray(data.activeCharacters) ? uniqueStrings(data.activeCharacters) : [];
  return resolveTrackerEntityIdsForOwners(context, activeCharacters);
}

export function resolveTrackerActiveEntityIds(
  context: STContext | null,
  data: TrackerData | null | undefined,
): string[] {
  if (!data) return [];
  const explicitActiveCharacters = Array.isArray(data.activeCharacters)
    ? uniqueStrings(data.activeCharacters)
    : [];
  if (explicitActiveCharacters.includes(USER_TRACKER_KEY)) {
    return resolveTrackerEntityIdsForOwners(context, explicitActiveCharacters);
  }
  if (Array.isArray(data.activeCharacters) && explicitActiveCharacters.length === 0) {
    return [];
  }
  const explicitSceneEntityIds = uniqueStrings(data.entityResolution?.sceneEntityIds ?? []);
  if (explicitSceneEntityIds.length) return explicitSceneEntityIds;
  const sceneOwners = Array.isArray(data.entityResolution?.sceneOwners)
    ? uniqueStrings(data.entityResolution?.sceneOwners ?? [])
    : [];
  if (sceneOwners.length) return resolveTrackerEntityIdsForOwners(context, sceneOwners);
  return resolveTrackerEntityIdsForOwners(context, explicitActiveCharacters);
}

export function buildLifecycleHistorySnapshotsFromTrackerEntries(
  context: STContext | null,
  entries: TrackerHistoryEntryWithMessageIndex[],
): CardLifecycleSnapshot[] {
  return entries
    .filter((item): item is TrackerHistoryEntryWithMessageIndex & { data: TrackerData } => Boolean(item.data))
    .sort((a, b) => a.messageIndex - b.messageIndex)
    .map(item => ({
      messageIndex: item.messageIndex,
      activeCharacters: resolveTrackerActiveOwners(context, item.data),
      activeEntityIds: resolveTrackerActiveEntityIds(context, item.data),
    }));
}

export function listTrackerDataLookupNamesForOwner(
  context: STContext | null,
  data: TrackerData | null | undefined,
  ownerName: string,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown): void => {
    const value = normalizeToken(raw);
    const key = normalizeKey(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    names.push(value);
  };
  push(ownerName);
  if (data?.entityOwnerMap && typeof data.entityOwnerMap === "object") {
    const direct = data.entityOwnerMap[ownerName];
    const fallbackEntityId = getEntityRegistryEntryByOwnerName(context, ownerName)?.id ?? null;
    const targetEntityId = direct?.entityId ?? fallbackEntityId;
    if (targetEntityId) {
      for (const [snapshotOwner, snapshot] of Object.entries(data.entityOwnerMap)) {
        if (snapshot?.entityId !== targetEntityId) continue;
        push(snapshotOwner);
        push(snapshot.ownerName);
        push(snapshot.canonicalName);
        for (const alias of snapshot.aliases ?? []) push(alias);
      }
    }
  }
  for (const lookupName of listEntityRegistryLookupNames(context, ownerName)) {
    push(lookupName);
  }
  return names;
}

export function listTrackerDataLookupNamesForEntityIds(
  context: STContext | null,
  data: TrackerData | null | undefined,
  entityIds: string[],
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown): void => {
    const value = normalizeToken(raw);
    const key = normalizeKey(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    names.push(value);
  };

  const registry = readRegistry(context);
  const wanted = new Set(
    (entityIds ?? [])
      .map(normalizeToken)
      .filter(Boolean),
  );
  if (!wanted.size) return names;

  if (data?.entityOwnerMap && typeof data.entityOwnerMap === "object") {
    for (const [snapshotOwner, snapshot] of Object.entries(data.entityOwnerMap)) {
      if (!snapshot || !wanted.has(normalizeToken(snapshot.entityId))) continue;
      push(snapshotOwner);
      push(snapshot.ownerName);
      push(snapshot.canonicalName);
      for (const alias of snapshot.aliases ?? []) push(alias);
    }
  }

  for (const entityId of wanted) {
    const entry = registry.entities[entityId];
    if (!entry) continue;
    push(entry.ownerName);
    push(entry.canonicalName);
    for (const alias of entry.aliases ?? []) push(alias);
  }

  return names;
}

export function listTrackerDataLookupNamesForOwnerWithEntityFallback(
  context: STContext | null,
  data: TrackerData | null | undefined,
  ownerName: string,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown): void => {
    const value = normalizeToken(raw);
    const key = normalizeKey(value);
    if (!key || seen.has(key)) return;
    seen.add(key);
    names.push(value);
  };

  for (const name of listTrackerDataLookupNamesForOwner(context, data, ownerName)) push(name);
  for (const name of listTrackerDataLookupNamesForEntityIds(
    context,
    data,
    resolveTrackerEntityIdsForOwners(context, [ownerName]),
  )) push(name);

  return names;
}

export function getEntityRegistryEntryForMessage(
  context: STContext | null,
  ownerName: string,
  messageIndex: number,
): TrackerEntityRegistryEntry | null {
  const entry = getEntityRegistryEntryByOwnerName(context, ownerName);
  if (!entry) return null;
  if (entry.introducedAtMessageIndex > messageIndex) return null;
  if (resolveLifecycleStateAtMessage(entry, messageIndex).state === "archived") return null;
  return entry;
}

export function getEntityRegistryEntryByEntityIdForMessage(
  context: STContext | null,
  entityId: string,
  messageIndex: number,
): TrackerEntityRegistryEntry | null {
  const registry = readRegistry(context);
  const normalizedEntityId = normalizeToken(entityId);
  if (!normalizedEntityId) return null;
  const entry = registry.entities[normalizedEntityId];
  if (!entry) return null;
  if (entry.introducedAtMessageIndex > messageIndex) return null;
  if (resolveLifecycleStateAtMessage(entry, messageIndex).state === "archived") return null;
  return entry;
}

export function listEntityRegistryEntriesForMessage(
  context: STContext | null,
  messageIndex: number,
): TrackerEntityRegistryEntry[] {
  const registry = readRegistry(context);
  return Object.values(registry.entities)
    .filter(entry => entry.introducedAtMessageIndex <= messageIndex)
    .filter(entry => resolveLifecycleStateAtMessage(entry, messageIndex).state !== "archived")
    .sort((a, b) => {
      if (a.introducedAtMessageIndex !== b.introducedAtMessageIndex) {
        return a.introducedAtMessageIndex - b.introducedAtMessageIndex;
      }
      if (a.kind !== b.kind) {
        return a.kind === "multi_character_alias" ? -1 : 1;
      }
      return a.ownerName.localeCompare(b.ownerName);
    });
}

export function getEntityRegistryLifecycleStateForMessage(
  context: STContext | null,
  ownerName: string,
  messageIndex: number,
): CardLifecycleRegistryState | null {
  const entry = getEntityRegistryEntryByOwnerName(context, ownerName);
  if (!entry) return null;
  return getEntityRegistryLifecycleStateForEntityIdForMessage(context, entry.id, messageIndex);
}

export function getEntityRegistryLifecycleStateForEntityIdForMessage(
  context: STContext | null,
  entityId: string,
  messageIndex: number,
): CardLifecycleRegistryState | null {
  const registry = readRegistry(context);
  const normalizedEntityId = normalizeToken(entityId);
  if (!normalizedEntityId) return null;
  const entry = registry.entities[normalizedEntityId];
  if (!entry) return null;
  if (entry.introducedAtMessageIndex > messageIndex) return null;
  const lifecycleAtMessage = resolveLifecycleStateAtMessage(entry, messageIndex);
  const archivedAtMessageIndex = lifecycleAtMessage.state === "archived"
    ? lifecycleAtMessage.stateChangedAtMessageIndex
    : null;
  const lastActiveMessageIndex = resolveLastActiveMessageIndexAtMessage(entry, messageIndex);
  const lifecycleState: CardLifecycleRegistryState["lifecycleState"] = archivedAtMessageIndex != null
    ? "archived"
    : "inactive";
  return {
    lastActiveMessageIndex,
    lifecycleState,
    archivedAtMessageIndex,
    introducedAtMessageIndex: entry.introducedAtMessageIndex,
  };
}

export function listEntityRegistryOwnersForMessage(
  context: STContext | null,
  messageIndex: number,
): string[] {
  return listEntityRegistryEntriesForMessage(context, messageIndex).map(entry => entry.ownerName);
}
