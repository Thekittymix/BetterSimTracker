import { resolveCardLifecycleState } from "./cardLifecycle";
import {
  buildLifecycleHistorySnapshotsFromTrackerEntries,
  getEntityRegistryEntryForMessage,
  getEntityRegistryLifecycleStateForMessage,
  listEntityRegistryEntriesForMessage,
  resolveTrackerSceneEntityIds,
  resolveTrackerSceneOwners,
  syncEntityRegistryFromRender,
} from "./entityRegistry";
import { resolveEntityTrackingMode } from "./entityResolution";
import { getRecentTrackerHistoryEntries } from "./storage";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "./types";
import {
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

  const sceneOwners = resolveTrackerSceneOwners(input.context, input.data);
  const sceneEntityIds = resolveTrackerSceneEntityIds(input.context, input.data);
  const dataCharacterNames = collectCharacterNamesFromTrackerData(input.context, input.data);
  const registryEntriesForMessage = listEntityRegistryEntriesForMessage(input.context, input.messageIndex);
  const registryOwnersForMessage = resolveRegistryOwnersFromEntries(registryEntriesForMessage);
  const resolverAndDataTargets = mergeRegistryOwnersIntoTargets(sceneOwners, dataCharacterNames);
  const continuityTargets = mergeRegistryOwnersIntoTargets(resolverAndDataTargets, registryOwnersForMessage);
  const uniqueTargets = registryEntriesForMessage.length > 0
    ? mergeRegistryEntitiesIntoTargets({
        targets: continuityTargets,
        registryEntries: registryEntriesForMessage,
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

  return syncEntityRegistryFromRender({
    context: input.context,
    mode: resolveEntityTrackingMode(input.settings),
    messageIndex: input.messageIndex,
    owners: uniqueTargets,
    getLifecycleState: ownerName => resolveCardLifecycleState({
      ownerName,
      entityId: getEntityRegistryEntryForMessage(input.context, ownerName, input.messageIndex)?.id ?? null,
      currentMessageIndex: input.messageIndex,
      currentActiveCharacters: sceneOwners,
      currentActiveEntityIds: sceneEntityIds,
      history: lifecycleSnapshots,
      autoArchiveInactiveCards: input.settings.autoArchiveInactiveCards,
      archiveInactiveAfterTurns: input.settings.archiveInactiveAfterTurns,
      registryState: getEntityRegistryLifecycleStateForMessage(input.context, ownerName, input.messageIndex),
    }),
  });
}
