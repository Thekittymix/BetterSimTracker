import { resolveCardLifecycleState } from "./cardLifecycle";
import {
  buildLifecycleHistorySnapshotsFromTrackerEntries,
  getEntityRegistryEntryForMessage,
  getEntityRegistryLifecycleStateForEntityIdForMessage,
  getEntityRegistryLifecycleStateForMessage,
  listEntityRegistryEntriesForMessage,
  readEntityRegistry,
  resolveTrackerActiveEntityIds,
  resolveTrackerActiveOwners,
  resolveTrackerSceneEntityIds,
  resolveTrackerSceneOwners,
  syncNarrativeEntityRegistryFromResolvedEntities,
  syncEntityRegistryFromRender,
} from "./entityRegistry";
import { isMultiCharacterEntityTrackingMode, resolveEntityTrackingMode } from "./entityResolution";
import { getRecentTrackerHistoryEntries } from "./storage";
import type { BetterSimTrackerSettings, STContext, TrackerData, TrackerResolvedEntity } from "./types";
import {
  collectCharacterNamesFromTrackerData,
  mergeRegistryEntitiesIntoTargets,
  mergeRegistryOwnersIntoTargets,
  resolveRegistryOwnersFromEntries,
} from "./ui";

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeKey(value: unknown): string {
  return normalizeToken(value).toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = normalizeToken(raw);
    const key = normalizeKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function collectNarrativeResolvedEntities(data: TrackerData): TrackerResolvedEntity[] {
  const out = new Map<string, TrackerResolvedEntity>();
  for (const entity of data.entityResolution?.resolvedEntities ?? []) {
    if (entity?.kind !== "narrative-entity") continue;
    const entityId = normalizeToken(entity.entityId);
    const name = normalizeToken(entity.name);
    if (!entityId || !name) continue;
    out.set(entityId, {
      ...entity,
      entityId,
      name,
      aliases: uniqueStrings(entity.aliases ?? []).filter(alias => normalizeKey(alias) !== normalizeKey(name)),
      avatar: null,
      inScene: Boolean(entity.inScene),
      inMessage: Boolean(entity.inMessage),
      created: Boolean(entity.created),
    });
  }
  for (const snapshot of Object.values(data.entityOwnerMap ?? {})) {
    if (snapshot?.kind !== "narrative-entity") continue;
    const entityId = normalizeToken(snapshot.entityId);
    const ownerName = normalizeToken(snapshot.ownerName);
    if (!entityId || !ownerName || out.has(entityId)) continue;
    out.set(entityId, {
      entityId,
      kind: "narrative-entity",
      name: ownerName,
      aliases: uniqueStrings(snapshot.aliases ?? []).filter(alias => normalizeKey(alias) !== normalizeKey(ownerName)),
      avatar: null,
      inScene: false,
      inMessage: false,
      created: false,
    });
  }
  return Array.from(out.values());
}

export function syncEntityRegistryFromTrackerData(input: {
  context: STContext;
  messageIndex: number;
  data: TrackerData;
  settings: BetterSimTrackerSettings;
  allKnownCharacters: string[];
}): boolean {
  if (!isMultiCharacterEntityTrackingMode(resolveEntityTrackingMode(input.settings))) return false;

  const sceneOwners = resolveTrackerSceneOwners(input.context, input.data);
  const activeOwners = resolveTrackerActiveOwners(input.context, input.data);
  const sceneEntityIds = resolveTrackerSceneEntityIds(input.context, input.data);
  const activeEntityIds = resolveTrackerActiveEntityIds(input.context, input.data);
  const dataCharacterNames = collectCharacterNamesFromTrackerData(input.context, input.data);
  const registryEntriesForMessage = listEntityRegistryEntriesForMessage(input.context, input.messageIndex);
  const registryOwnersForMessage = resolveRegistryOwnersFromEntries(registryEntriesForMessage);
  const registryEntriesForContinuity = Object.values(readEntityRegistry(input.context).entities);
  const registryOwnersForContinuity = resolveRegistryOwnersFromEntries(registryEntriesForContinuity);
  const resolverAndDataTargets = mergeRegistryOwnersIntoTargets(sceneOwners, dataCharacterNames);
  const continuityTargets = mergeRegistryOwnersIntoTargets(
    mergeRegistryOwnersIntoTargets(resolverAndDataTargets, registryOwnersForMessage),
    registryOwnersForContinuity,
  );
  const uniqueTargets = registryEntriesForContinuity.length > 0
    ? mergeRegistryEntitiesIntoTargets({
        targets: continuityTargets,
        registryEntries: registryEntriesForContinuity,
        resolveRegistryEntry: ownerName => getEntityRegistryEntryForMessage(input.context, ownerName, input.messageIndex),
      })
    : continuityTargets;
  if (!uniqueTargets.length) return false;

  const lifecycleSnapshots = buildLifecycleHistorySnapshotsFromTrackerEntries(
    input.context,
    getRecentTrackerHistoryEntries(
      input.context,
      Math.max(120, input.context.chat.length + 8),
    ),
  );
  const getLifecycleState = (ownerName: string, entityId?: string | null) => resolveCardLifecycleState({
    ownerName,
    entityId: entityId ?? getEntityRegistryEntryForMessage(input.context, ownerName, input.messageIndex)?.id ?? null,
    currentMessageIndex: input.messageIndex,
    currentActiveCharacters: activeOwners,
    currentActiveEntityIds: activeEntityIds,
    history: lifecycleSnapshots,
    autoArchiveInactiveCards: input.settings.autoArchiveInactiveCards,
    archiveInactiveAfterTurns: input.settings.archiveInactiveAfterTurns,
    registryState: entityId
      ? getEntityRegistryLifecycleStateForEntityIdForMessage(input.context, entityId, input.messageIndex)
      : getEntityRegistryLifecycleStateForMessage(input.context, ownerName, input.messageIndex),
  });
  const narrativeChanged = syncNarrativeEntityRegistryFromResolvedEntities({
    context: input.context,
    messageIndex: input.messageIndex,
    resolvedEntities: collectNarrativeResolvedEntities(input.data) ?? [],
    getLifecycleState: (ownerName, entityId) => getLifecycleState(ownerName, entityId),
  });

  const renderChanged = syncEntityRegistryFromRender({
    context: input.context,
    mode: resolveEntityTrackingMode(input.settings),
    messageIndex: input.messageIndex,
    owners: uniqueTargets,
    getLifecycleState: ownerName => getLifecycleState(ownerName),
  });
  return narrativeChanged || renderChanged;
}
