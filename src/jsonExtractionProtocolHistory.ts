import { resolveTrackerActiveOwners, resolveTrackerMessageOwners, resolveTrackerSceneOwners } from "./entityRegistry";
import { isTrackableMessage } from "./messageFilter";
import { getRecentTrackerHistoryEntries, getTrackerDataFromMessage } from "./storage";
import type { JsonExtractionRequestHistoryEntry, JsonExtractionRequestTrackerSnapshot } from "./jsonExtractionProtocol";
import type { ChatMessage, STContext, TrackerData } from "./types";

export interface BuildJsonExtractionRecentHistoryInput {
  context: STContext;
  beforeMessageIndex: number;
  limit: number;
}

export function resolveJsonExtractionMessageSpeaker(context: STContext, message: ChatMessage): string {
  if (message.is_user) {
    return String(context.name1 ?? "User").trim() || "User";
  }
  return String(message.name ?? context.name2 ?? "Character").trim() || "Character";
}

function buildTrackerSnapshot(
  context: STContext,
  trackerData: TrackerData | null | undefined,
): JsonExtractionRequestTrackerSnapshot | null {
  if (!trackerData) return null;
  return {
    activeOwners: resolveTrackerActiveOwners(context, trackerData),
    sceneOwners: resolveTrackerSceneOwners(context, trackerData),
    messageOwners: resolveTrackerMessageOwners(context, trackerData),
    entityResolution: trackerData.entityResolution
      ? trackerData.entityResolution as unknown as Record<string, unknown>
      : null,
  };
}

export function buildJsonExtractionRecentHistoryEntries(
  input: BuildJsonExtractionRecentHistoryInput,
): JsonExtractionRequestHistoryEntry[] {
  const { context, beforeMessageIndex, limit } = input;
  if (!Number.isFinite(beforeMessageIndex) || beforeMessageIndex <= 0 || limit <= 0) {
    return [];
  }

  const snapshotByMessageIndex = new Map<number, TrackerData>();
  const recentTrackedEntries = getRecentTrackerHistoryEntries(context, Math.max(limit * 4, limit));
  for (const entry of recentTrackedEntries) {
    if (entry.messageIndex >= beforeMessageIndex) continue;
    if (!snapshotByMessageIndex.has(entry.messageIndex)) {
      snapshotByMessageIndex.set(entry.messageIndex, entry.data);
    }
  }

  const history: JsonExtractionRequestHistoryEntry[] = [];
  for (let messageIndex = beforeMessageIndex - 1; messageIndex >= 0 && history.length < limit; messageIndex -= 1) {
    const message = context.chat[messageIndex];
    if (!isTrackableMessage(message)) continue;
    const directTrackerData = getTrackerDataFromMessage(message);
    const trackerData = directTrackerData ?? snapshotByMessageIndex.get(messageIndex) ?? null;
    history.push({
      messageIndex,
      speaker: resolveJsonExtractionMessageSpeaker(context, message),
      isUser: Boolean(message.is_user),
      isSystem: Boolean(message.is_system),
      text: String(message.mes ?? ""),
      trackerSnapshot: buildTrackerSnapshot(context, trackerData),
    });
  }

  return history;
}
