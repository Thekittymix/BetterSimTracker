import type { STContext } from "./types";
import { resolveTrackerEntityIdsForOwners } from "./entityRegistry";

export function resolvePersistedSnapshotEntityIds(input: {
  context: STContext | null;
  persistedSceneOwners: string[];
  persistedMessageOwners: string[];
  resolvedSceneEntityIds: string[];
  resolvedMessageEntityIds: string[];
  userExtraction: boolean;
}): {
  sceneEntityIds: string[];
  messageEntityIds: string[];
} {
  const sceneEntityIds = input.resolvedSceneEntityIds.length
    ? input.resolvedSceneEntityIds
    : resolveTrackerEntityIdsForOwners(input.context, input.persistedSceneOwners);
  const messageEntityIds = input.userExtraction
    ? []
    : (input.resolvedMessageEntityIds.length
        ? input.resolvedMessageEntityIds
        : resolveTrackerEntityIdsForOwners(input.context, input.persistedMessageOwners));
  return { sceneEntityIds, messageEntityIds };
}
