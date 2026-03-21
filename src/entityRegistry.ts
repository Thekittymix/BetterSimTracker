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

function resolveLifecycleStateAtMessage(
  entry: TrackerEntityRegistryEntry,
  messageIndex: number,
): { state: TrackerEntityLifecycleState; stateChangedAtMessageIndex: number | null } {
  const events = Array.isArray(entry.lifecycleEvents) && entry.lifecycleEvents.length
    ? entry.lifecycleEvents
    : [{ messageIndex: entry.introducedAtMessageIndex, state: entry.lifecycleState }];
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
    if (entry.lastSeenMessageIndex !== input.messageIndex) {
      entry.lastSeenMessageIndex = input.messageIndex;
      changed = true;
    }
    if (lifecycleState === "active" && entry.lastActiveMessageIndex !== input.messageIndex) {
      entry.lastActiveMessageIndex = input.messageIndex;
      changed = true;
    }
    if (entry.lifecycleState !== lifecycleState) {
      entry.lifecycleState = lifecycleState;
      changed = true;
    }
    if (upsertLifecycleEvent(entry, input.messageIndex, lifecycleState)) {
      changed = true;
    }
    const archivedAtMessageIndex = lifecycleState === "archived" ? input.messageIndex : null;
    if (entry.archivedAtMessageIndex !== archivedAtMessageIndex) {
      entry.archivedAtMessageIndex = archivedAtMessageIndex;
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

function collectTrackerDataOwnerNames(data: TrackerData): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown): void => {
    const value = normalizeToken(raw);
    const key = normalizeKey(value);
    if (!key || key === "global" || seen.has(key)) return;
    seen.add(key);
    names.push(value);
  };
  for (const name of data.activeCharacters ?? []) push(name);
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
  for (const ownerName of collectTrackerDataOwnerNames(data)) {
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

export function resolveTrackerSceneOwners(
  context: STContext | null,
  data: TrackerData | null | undefined,
): string[] {
  if (!data) return [];
  const sceneOwnersFromEntityIds = resolveTrackerOwnersForEntityIds(
    context,
    data.entityResolution?.sceneEntityIds ?? [],
  );
  if (sceneOwnersFromEntityIds.length) return sceneOwnersFromEntityIds;
  const sceneOwners = Array.isArray(data.entityResolution?.sceneOwners)
    ? uniqueStrings(data.entityResolution?.sceneOwners ?? [])
    : [];
  if (sceneOwners.length) return sceneOwners;
  return uniqueStrings(Array.isArray(data.activeCharacters) ? data.activeCharacters : []);
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

export function buildLifecycleHistorySnapshotsFromTrackerEntries(
  context: STContext | null,
  entries: TrackerHistoryEntryWithMessageIndex[],
): CardLifecycleSnapshot[] {
  return entries
    .filter((item): item is TrackerHistoryEntryWithMessageIndex & { data: TrackerData } => Boolean(item.data))
    .sort((a, b) => a.messageIndex - b.messageIndex)
    .map(item => ({
      messageIndex: item.messageIndex,
      activeCharacters: resolveTrackerSceneOwners(context, item.data),
      activeEntityIds: resolveTrackerSceneEntityIds(context, item.data),
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
  const lastActiveMessageIndex = entry.lastActiveMessageIndex != null && entry.lastActiveMessageIndex <= messageIndex
    ? entry.lastActiveMessageIndex
    : null;
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
