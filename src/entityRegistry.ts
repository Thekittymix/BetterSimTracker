import type {
  STContext,
  TrackerData,
  TrackerDataEntityOwner,
  TrackerEntityLifecycleState,
  TrackerEntityRegistry,
  TrackerEntityRegistryEntry,
  TrackerRegistrySyncTarget,
  TrackerResolvedEntity,
} from "./types";
import {
  isMultiCharacterEntityTrackingMode,
  resolveCharacterIdentity,
  type EntityTrackingMode,
  type ResolvedCharacterIdentity,
} from "./entityResolution";
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

function resolveOwnerNameFallbackFromEntityId(entityId: string): string {
  const normalizedEntityId = normalizeToken(entityId);
  if (!normalizedEntityId) return "";
  if (normalizedEntityId.startsWith("bst_mc_alias:")) {
    return normalizedEntityId.slice(normalizedEntityId.lastIndexOf(":") + 1);
  }
  if (normalizedEntityId.includes(USER_TRACKER_KEY)) {
    return USER_TRACKER_KEY;
  }
  return "";
}

function isTechnicalResolvedEntityName(name: string, entityId: string): boolean {
  const normalizedName = normalizeToken(name);
  const normalizedEntityId = normalizeToken(entityId);
  if (!normalizedName) return true;
  if (normalizedEntityId && normalizedName === normalizedEntityId) return true;
  return normalizedName.startsWith("bst_");
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
      const sourceName = normalizeToken(entry.sourceName) || canonicalName || ownerName;
      const sourceAvatar = normalizeToken(entry.sourceAvatar) || null;
      const kind = normalizeRegistryEntryKind(entry.kind);
      const sourceKey = normalizeToken(entry.sourceKey)
        || (kind === "narrative-entity"
          ? buildNarrativeEntitySourceKey(id, ownerName, canonicalName)
          : buildEntitySourceKey(sourceName, sourceAvatar));
      const aliases = Array.isArray(entry.aliases) ? uniqueStrings(entry.aliases.map(item => normalizeToken(item))) : [];
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
  owners?: string[];
  targets?: TrackerRegistrySyncTarget[];
  getLifecycleState?: (ownerName: string) => TrackerEntityLifecycleState;
  getLifecycleStateByTarget?: (target: TrackerRegistrySyncTarget) => TrackerEntityLifecycleState;
}): boolean {
  const context = input.context;
  const rawTargets = Array.isArray(input.targets) && input.targets.length
    ? input.targets
    : (input.owners ?? []).map(ownerName => ({ ownerName, registryEntry: null }));
  if (!context || !isMultiCharacterEntityTrackingMode(input.mode) || !rawTargets.length) return false;
  const registry = readRegistry(context);
  let changed = false;
  const seenTargetKeys = new Set<string>();

  for (const rawTarget of rawTargets) {
    const ownerName = normalizeToken(rawTarget?.ownerName ?? rawTarget?.registryEntry?.ownerName);
    if (!ownerName) continue;
    const registryEntry = rawTarget?.registryEntry ?? null;
    const targetKey = normalizeToken(registryEntry?.id) || normalizeKey(ownerName);
    if (!targetKey || seenTargetKeys.has(targetKey)) continue;
    seenTargetKeys.add(targetKey);
    const existingRegistryEntry = normalizeToken(registryEntry?.id)
      ? registry.entities[normalizeToken(registryEntry?.id)] ?? null
      : null;
    if (registryEntry?.kind === "narrative-entity" && !existingRegistryEntry) {
      continue;
    }
    const identity = existingRegistryEntry ? null : resolveCharacterIdentity(context, ownerName, input.mode);
    if (!existingRegistryEntry && !identity) continue;
    const entry = existingRegistryEntry ?? ensureEntry(registry, identity!, ownerName, input.messageIndex);
    const lifecycleState = input.getLifecycleStateByTarget
      ? input.getLifecycleStateByTarget({ ownerName, registryEntry })
      : (input.getLifecycleState?.(ownerName) ?? "inactive");
    const aliases = registryEntry
      ? uniqueStrings(registryEntry.aliases ?? [])
      : identity?.matchedBy === "alias"
        ? uniqueStrings([...(entry.aliases ?? []), identity.resolvedName])
        : entry.aliases;
    if (entry.ownerName !== ownerName) {
      entry.ownerName = ownerName;
      changed = true;
    }
    const canonicalName = normalizeToken(registryEntry?.canonicalName)
      || identity?.resolvedName
      || entry.canonicalName;
    if (entry.canonicalName !== canonicalName) {
      entry.canonicalName = canonicalName;
      changed = true;
    }
    if (registryEntry && entry.kind !== registryEntry.kind) {
      entry.kind = registryEntry.kind;
      changed = true;
    }
    const sourceName = normalizeToken(registryEntry?.sourceName)
      || identity?.sourceName
      || entry.sourceName;
    if (entry.sourceName !== sourceName) {
      entry.sourceName = sourceName;
      changed = true;
    }
    const sourceAvatar = registryEntry
      ? (registryEntry.sourceAvatar ? normalizeToken(registryEntry.sourceAvatar) || null : null)
      : identity?.sourceAvatar ?? entry.sourceAvatar;
    if (entry.sourceAvatar !== sourceAvatar) {
      entry.sourceAvatar = sourceAvatar;
      changed = true;
    }
    const sourceKey = normalizeToken(registryEntry?.sourceKey)
      || (entry.kind === "narrative-entity"
        ? buildNarrativeEntitySourceKey(entry.id, ownerName, canonicalName)
        : buildEntitySourceKey(sourceName, sourceAvatar));
    if (entry.sourceKey !== sourceKey) {
      entry.sourceKey = sourceKey;
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

export function syncNarrativeEntityRegistryFromResolvedEntities(input: {
  context: STContext | null;
  messageIndex: number;
  resolvedEntities: TrackerResolvedEntity[];
  getLifecycleState: (ownerName: string, entityId: string) => TrackerEntityLifecycleState;
}): boolean {
  const context = input.context;
  if (!context) return false;
  const narrativeEntities = (input.resolvedEntities ?? [])
    .filter(entity => entity?.kind === "narrative-entity")
    .filter(entity => normalizeToken(entity?.entityId) && normalizeToken(entity?.name));
  if (!narrativeEntities.length) return false;

  const registry = readRegistry(context);
  let changed = false;
  const seenEntityIds = new Set<string>();

  for (const entity of narrativeEntities) {
    const entityId = normalizeToken(entity.entityId);
    const ownerName = normalizeToken(entity.name);
    if (!entityId || !ownerName || seenEntityIds.has(entityId)) continue;
    seenEntityIds.add(entityId);
    const aliases = uniqueStrings(
      (entity.aliases ?? []).filter(alias => normalizeKey(alias) !== normalizeKey(ownerName)),
    );
    const sourceKey = buildNarrativeEntitySourceKey(entityId, ownerName, ownerName);
    const existing = registry.entities[entityId];
    const entry: TrackerEntityRegistryEntry = existing ?? {
      id: entityId,
      ownerName,
      canonicalName: ownerName,
      aliases,
      sourceName: ownerName,
      sourceAvatar: null,
      sourceKey,
      kind: "narrative-entity",
      introducedAtMessageIndex: input.messageIndex,
      lastSeenMessageIndex: input.messageIndex,
      lastActiveMessageIndex: null,
      lifecycleState: "inactive",
      archivedAtMessageIndex: null,
      lifecycleEvents: [{ messageIndex: input.messageIndex, state: "inactive" }],
    };
    if (!existing) {
      registry.entities[entityId] = entry;
      changed = true;
    }
    if (entry.ownerName !== ownerName) {
      entry.ownerName = ownerName;
      changed = true;
    }
    if (entry.canonicalName !== ownerName) {
      entry.canonicalName = ownerName;
      changed = true;
    }
    if (entry.kind !== "narrative-entity") {
      entry.kind = "narrative-entity";
      changed = true;
    }
    if (entry.sourceName !== ownerName) {
      entry.sourceName = ownerName;
      changed = true;
    }
    if (entry.sourceAvatar !== null) {
      entry.sourceAvatar = null;
      changed = true;
    }
    if (entry.sourceKey !== sourceKey) {
      entry.sourceKey = sourceKey;
      changed = true;
    }
    if ((entry.aliases ?? []).join("\n") !== aliases.join("\n")) {
      entry.aliases = aliases;
      changed = true;
    }
    const lifecycleState = input.getLifecycleState(ownerName, entityId);
    if (upsertLifecycleEvent(entry, input.messageIndex, lifecycleState)) {
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
    registry.ownerToEntityId[normalizeKey(ownerName)] = entityId;
    registry.ownerToEntityId[normalizeKey(entry.canonicalName)] = entityId;
    for (const alias of entry.aliases) {
      registry.ownerToEntityId[normalizeKey(alias)] = entityId;
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

export function resolveTrackerDataEntityOwnerSnapshot(
  data: TrackerData | null | undefined,
  ownerName: string,
): TrackerDataEntityOwner | null {
  if (!data?.entityOwnerMap || typeof data.entityOwnerMap !== "object") return null;
  const normalizedOwner = normalizeKey(ownerName);
  const normalizedEntityId = normalizeToken(ownerName);
  if (!normalizedOwner && !normalizedEntityId) return null;

  const direct = data.entityOwnerMap[ownerName];
  if (direct) return direct;

  for (const [snapshotOwner, snapshot] of Object.entries(data.entityOwnerMap)) {
    if (!snapshot) continue;
    if (normalizedEntityId && normalizeToken(snapshot.entityId) === normalizedEntityId) {
      return snapshot;
    }
    const lookupNames = [
      snapshotOwner,
      snapshot.ownerName,
      snapshot.canonicalName,
      ...(snapshot.aliases ?? []),
    ];
    if (lookupNames.some(candidate => normalizeKey(candidate) === normalizedOwner)) {
      return snapshot;
    }
  }
  return null;
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

  const directSnapshot = resolveTrackerDataEntityOwnerSnapshot(data, ownerName);
  const directEntityId = normalizeToken(directSnapshot?.entityId);
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
  explicitEntityIds?: string[] | null;
}): T | undefined {
  if (input.byEntityId) {
    const entityIds = Array.from(new Set([
      ...((input.explicitEntityIds ?? []).map(normalizeToken).filter(Boolean)),
      ...listTrackerDataEntityIdsForOwner(input.context, input.data, input.ownerName),
    ]));
    for (const entityId of entityIds) {
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
  const resolvedSceneOwners = resolveResolvedEntityNames(context, data, entity => entity.inScene);
  const resolvedMessageOwners = resolveResolvedEntityNames(context, data, entity => entity.inMessage);
  const hasExplicitResolverOwners =
    resolvedSceneOwners.length > 0 ||
    resolvedMessageOwners.length > 0;
  const hasExplicitEntityIdentity =
    hasExplicitResolverOwners ||
    (data.entityOwnerMap != null && Object.keys(data.entityOwnerMap).length > 0);
  for (const name of resolvedSceneOwners) push(name);
  for (const name of resolvedMessageOwners) push(name);
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

function resolveTrackerResolvedEntities(
  data: TrackerData | null | undefined,
): TrackerResolvedEntity[] {
  const explicitResolvedEntities = data?.entityResolution?.resolvedEntities ?? [];
  const out: TrackerResolvedEntity[] = [];
  const seen = new Set<string>();
  for (const entity of explicitResolvedEntities) {
    const entityId = normalizeToken(entity?.entityId);
    const name = normalizeToken(entity?.name);
    if (!entityId || !name || seen.has(entityId)) continue;
    seen.add(entityId);
    out.push({
      ...entity,
      entityId,
      name,
      avatar: normalizeToken(entity.avatar) || null,
      aliases: uniqueStrings(entity.aliases ?? []),
      inScene: Boolean(entity.inScene),
      inMessage: Boolean(entity.inMessage),
      created: Boolean(entity.created),
    });
  }
  return out;
}

function buildNarrativeEntitySourceKey(entityId: string, ownerName: string, canonicalName: string): string {
  const seed = normalizeKey(entityId) || normalizeKey(canonicalName) || normalizeKey(ownerName);
  return seed ? `narrative:${seed}` : "";
}

function normalizeRegistryEntryKind(value: unknown): TrackerEntityRegistryEntry["kind"] {
  return value === "multi_character_alias" || value === "narrative-entity"
    ? value
    : "owner";
}

function resolveOwnerNameForResolvedEntity(
  context: STContext | null,
  data: TrackerData | null | undefined,
  entity: TrackerResolvedEntity,
): string {
  const entityId = normalizeToken(entity.entityId);
  if (!entityId) return normalizeToken(entity.name);
  const fromContext = resolveTrackerOwnersForEntityIds(context, [entityId])[0];
  if (fromContext) return fromContext;
  const fromOwnerMap = resolveTrackerOwnersForEntityIdsFromOwnerMap(data, [entityId])[0];
  if (fromOwnerMap) return fromOwnerMap;
  const entityName = normalizeToken(entity.name);
  if (!isTechnicalResolvedEntityName(entityName, entityId)) return entityName;
  return resolveOwnerNameFallbackFromEntityId(entityId) || entityName;
}

function resolveResolvedEntityNames(
  context: STContext | null,
  data: TrackerData | null | undefined,
  predicate: (entity: TrackerResolvedEntity) => boolean,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entity of resolveTrackerResolvedEntities(data)) {
    if (!predicate(entity)) continue;
    const ownerName = resolveOwnerNameForResolvedEntity(context, data, entity);
    const ownerKey = normalizeKey(ownerName);
    if (!ownerKey || seen.has(ownerKey)) continue;
    seen.add(ownerKey);
    out.push(ownerName);
  }
  return out;
}

function resolveResolvedEntityIds(
  data: TrackerData | null | undefined,
  predicate: (entity: TrackerResolvedEntity) => boolean,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entity of resolveTrackerResolvedEntities(data)) {
    if (!predicate(entity)) continue;
    const entityId = normalizeToken(entity.entityId);
    if (!entityId || seen.has(entityId)) continue;
    seen.add(entityId);
    out.push(entityId);
  }
  return out;
}

export function resolveTrackerSceneOwners(
  context: STContext | null,
  data: TrackerData | null | undefined,
): string[] {
  if (!data) return [];
  const resolvedNames = resolveResolvedEntityNames(context, data, entity => entity.inScene);
  if (resolvedNames.length) return resolvedNames;
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
  if (explicitActiveCharacters.length) {
    return explicitActiveCharacters;
  }
  const resolvedMessageNames = resolveResolvedEntityNames(context, data, entity => entity.inMessage);
  if (resolvedMessageNames.length) return resolvedMessageNames;
  const resolvedSceneNames = resolveResolvedEntityNames(context, data, entity => entity.inScene);
  if (resolvedSceneNames.length) return resolvedSceneNames;
  return explicitActiveCharacters;
}

export function resolveTrackerMessageOwners(
  context: STContext | null,
  data: TrackerData | null | undefined,
): string[] {
  if (!data) return [];
  const resolvedNames = resolveResolvedEntityNames(context, data, entity => entity.inMessage);
  if (resolvedNames.length) return resolvedNames;
  return resolveTrackerSceneOwners(context, data);
}

export function resolveTrackerSceneEntityIds(
  context: STContext | null,
  data: TrackerData | null | undefined,
): string[] {
  if (!data) return [];
  const resolvedIds = resolveResolvedEntityIds(data, entity => entity.inScene);
  if (resolvedIds.length) return resolvedIds;
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
  if (explicitActiveCharacters.length) {
    const explicitIds = uniqueStrings(explicitActiveCharacters.flatMap(ownerName =>
      listTrackerDataEntityIdsForOwner(context, data, ownerName),
    ));
    if (explicitIds.length) return explicitIds;
  }
  const resolvedMessageIds = resolveResolvedEntityIds(data, entity => entity.inMessage);
  if (resolvedMessageIds.length) return resolvedMessageIds;
  const resolvedSceneIds = resolveResolvedEntityIds(data, entity => entity.inScene);
  if (resolvedSceneIds.length) return resolvedSceneIds;
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
    const direct = resolveTrackerDataEntityOwnerSnapshot(data, ownerName);
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
  explicitEntityIds?: string[] | null,
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
    [
      ...(explicitEntityIds ?? []),
      ...resolveTrackerEntityIdsForOwners(context, [ownerName]),
    ],
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
        const kindRank = (kind: TrackerEntityRegistryEntry["kind"]): number => {
          if (kind === "multi_character_alias") return 0;
          if (kind === "narrative-entity") return 1;
          return 2;
        };
        return kindRank(a.kind) - kindRank(b.kind);
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
