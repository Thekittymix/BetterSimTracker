import type {
  STContext,
  TrackerEntityLifecycleState,
  TrackerEntityRegistry,
  TrackerEntityRegistryEntry,
} from "./types";
import { resolveCharacterIdentity, type EntityTrackingMode, type ResolvedCharacterIdentity } from "./entityResolution";
import type { CardLifecycleRegistryState } from "./cardLifecycle";

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
      };
    }
  }

  if (record.ownerToEntityId && typeof record.ownerToEntityId === "object") {
    for (const [ownerName, entityIdRaw] of Object.entries(record.ownerToEntityId as Record<string, unknown>)) {
      const entityId = normalizeToken(entityIdRaw);
      if (!entityId || !entities[entityId]) continue;
      ownerToEntityId[normalizeToken(ownerName)] = entityId;
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
    registry.ownerToEntityId[ownerName] = entityId;
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
  };
  registry.entities[entityId] = entry;
  registry.ownerToEntityId[ownerName] = entityId;
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
    const archivedAtMessageIndex = lifecycleState === "archived" ? input.messageIndex : null;
    if (entry.archivedAtMessageIndex !== archivedAtMessageIndex) {
      entry.archivedAtMessageIndex = archivedAtMessageIndex;
      changed = true;
    }
    registry.ownerToEntityId[ownerName] = entry.id;
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
  const entityId = registry.ownerToEntityId[normalizeToken(ownerName)];
  if (!entityId) return null;
  return registry.entities[entityId] ?? null;
}

export function getEntityRegistryLifecycleStateForMessage(
  context: STContext | null,
  ownerName: string,
  messageIndex: number,
): CardLifecycleRegistryState | null {
  const entry = getEntityRegistryEntryByOwnerName(context, ownerName);
  if (!entry) return null;
  const archivedAtMessageIndex = entry.archivedAtMessageIndex != null && entry.archivedAtMessageIndex <= messageIndex
    ? entry.archivedAtMessageIndex
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
  };
}

export function listEntityRegistryOwnersForMessage(
  context: STContext | null,
  messageIndex: number,
): string[] {
  const registry = readRegistry(context);
  return Object.values(registry.entities)
    .filter(entry => entry.introducedAtMessageIndex <= messageIndex)
    .filter(entry => entry.archivedAtMessageIndex == null || entry.archivedAtMessageIndex > messageIndex)
    .sort((a, b) => {
      if (a.introducedAtMessageIndex !== b.introducedAtMessageIndex) {
        return a.introducedAtMessageIndex - b.introducedAtMessageIndex;
      }
      if (a.kind !== b.kind) {
        return a.kind === "multi_character_alias" ? -1 : 1;
      }
      return a.ownerName.localeCompare(b.ownerName);
    })
    .map(entry => entry.ownerName);
}
