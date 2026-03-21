import { resolveCardLifecycleState, type CardLifecycleSnapshot } from "./cardLifecycle";
import { USER_TRACKER_KEY } from "./constants";
import {
  getEntityRegistryEntryForMessage,
  getEntityRegistryLifecycleStateForMessage,
  listEntityRegistryEntriesForMessage,
  listEntityRegistryOwnersForMessage,
  resolveTrackerOwnersForEntityIds,
  syncEntityRegistryFromRender,
} from "./entityRegistry";
import { resolveEntityTrackingMode } from "./entityResolution";
import { getRecentTrackerHistoryEntries } from "./storage";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "./types";
import {
  buildDisplayPoolWithRegistry,
  collectCharacterNamesFromTrackerData,
  mergeRegistryEntitiesIntoTargets,
  mergeRegistryOwnersIntoTargets,
  resolveRegistryOwnersFromEntries,
} from "./ui";

export function syncEntityRegistryFromTrackerData(input: {
  context: STContext;
  messageIndex: number;
  data: TrackerData;
  settings: BetterSimTrackerSettings;
  allKnownCharacters: string[];
}): boolean {
  if (resolveEntityTrackingMode(input.settings) !== "multi_character") return false;

  const userMessageEntry = Boolean(input.context.chat[input.messageIndex]?.is_user);
  const sceneOwnersFromEntityIds = resolveTrackerOwnersForEntityIds(
    input.context,
    input.data.entityResolution?.sceneEntityIds ?? [],
  );
  const sceneOwners = sceneOwnersFromEntityIds.length
    ? sceneOwnersFromEntityIds
    : input.data.entityResolution?.sceneOwners?.length
    ? input.data.entityResolution.sceneOwners
    : input.data.activeCharacters;
  const dataCharacterNames = collectCharacterNamesFromTrackerData(input.data);
  const registryEntriesForMessage = listEntityRegistryEntriesForMessage(input.context, input.messageIndex);
  const registryOwnersForMessage = registryEntriesForMessage.length > 0
    ? resolveRegistryOwnersFromEntries(registryEntriesForMessage)
    : listEntityRegistryOwnersForMessage(input.context, input.messageIndex);
  const mergedKnownTargets = mergeRegistryOwnersIntoTargets(input.allKnownCharacters, dataCharacterNames);
  const mergedWithRegistryOwners = registryEntriesForMessage.length > 0
    ? mergeRegistryEntitiesIntoTargets({
        targets: mergedKnownTargets,
        registryEntries: registryEntriesForMessage,
        resolveRegistryEntry: ownerName => getEntityRegistryEntryForMessage(input.context, ownerName, input.messageIndex),
      })
    : mergeRegistryOwnersIntoTargets(mergedKnownTargets, registryOwnersForMessage);
  const displayPool = buildDisplayPoolWithRegistry({
    entityTrackingMode: input.settings.entityTrackingMode,
    includeAllTargets: Boolean(input.context.groupId) || input.settings.showInactive,
    activeCharacters: sceneOwners,
    dataCharacterNames,
    mergedWithRegistryOwners,
  });
  const scopedDisplayPool = userMessageEntry
    ? displayPool.filter(name => String(name ?? "").trim().toLowerCase() === USER_TRACKER_KEY.toLowerCase())
    : displayPool.filter(name => String(name ?? "").trim().toLowerCase() !== USER_TRACKER_KEY.toLowerCase());
  const uniqueTargets = Array.from(new Set(scopedDisplayPool));
  if (!uniqueTargets.length) return false;

  const lifecycleSnapshots: CardLifecycleSnapshot[] = getRecentTrackerHistoryEntries(
    input.context,
    Math.max(120, input.context.chat.length + 8),
  )
    .sort((a, b) => a.messageIndex - b.messageIndex)
    .map(item => ({
      messageIndex: item.messageIndex,
      activeCharacters: [...(item.data?.activeCharacters ?? [])],
    }));

  return syncEntityRegistryFromRender({
    context: input.context,
    mode: resolveEntityTrackingMode(input.settings),
    messageIndex: input.messageIndex,
    owners: uniqueTargets,
    getLifecycleState: ownerName => resolveCardLifecycleState({
      ownerName,
      currentMessageIndex: input.messageIndex,
      currentActiveCharacters: sceneOwners,
      history: lifecycleSnapshots,
      autoArchiveInactiveCards: input.settings.autoArchiveInactiveCards,
      archiveInactiveAfterTurns: input.settings.archiveInactiveAfterTurns,
      registryState: getEntityRegistryLifecycleStateForMessage(input.context, ownerName, input.messageIndex),
    }),
  });
}
