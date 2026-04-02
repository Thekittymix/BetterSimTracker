import {
  getChatStateLatestTrackerData,
  getLatestTrackerDataWithIndex,
  getLatestTrackerDataWithIndexBefore,
  getLocalLatestTrackerData,
  getMetadataLatestTrackerData,
  getRecentTrackerHistoryEntries,
  mergeTrackerDataChronologically,
  resolveNormalizedTrackerActiveCharacters,
} from "./storage";
import { resolveTrackerMessageOwners, resolveTrackerSceneOwners } from "./entityRegistry";
import { isTrackableMessage } from "./messageFilter";
import type { STContext, TrackerData } from "./types";

export type StoredTrackerSource = "message" | "chatState" | "metadata" | "local" | "none";

export function buildMergedPromptMacroData(
  context: STContext,
  preferred: TrackerData | null,
  options?: { beforeMessageIndexExclusive?: number | null },
): TrackerData | null {
  const beforeMessageIndexExclusive = options?.beforeMessageIndexExclusive ?? null;
  const historyEntries = getRecentTrackerHistoryEntries(context, Math.max(120, context.chat.length + 8))
    .filter(entry => beforeMessageIndexExclusive == null || entry.messageIndex < beforeMessageIndexExclusive);
  const entries: Array<{
    data: TrackerData;
    timestamp: number;
    messageIndex: number | null;
    preferred: boolean;
  }> = historyEntries.map(entry => ({
    data: entry.data,
    timestamp: Number(entry.data.timestamp ?? entry.timestamp ?? 0),
    messageIndex: entry.messageIndex,
    preferred: false,
  }));

  if (preferred) {
    entries.push({
      data: preferred,
      timestamp: Number(preferred.timestamp ?? 0),
      messageIndex: null,
      preferred: true,
    });
  }

  entries.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a.messageIndex == null && b.messageIndex != null) return 1;
    if (a.messageIndex != null && b.messageIndex == null) return -1;
    if (a.messageIndex != null && b.messageIndex != null && a.messageIndex !== b.messageIndex) {
      return a.messageIndex - b.messageIndex;
    }
    return Number(a.preferred) - Number(b.preferred);
  });

  if (!entries.length) {
    return preferred ? { ...preferred } : null;
  }

  const merged = mergeTrackerDataChronologically(entries.map(entry => entry.data));
  if (!merged) {
    return preferred ? { ...preferred } : null;
  }

  const preferredResolvedSceneOwners = preferred
    ? resolveTrackerSceneOwners(context, preferred)
    : [];
  const preferredResolvedMessageOwners = preferred
    ? resolveTrackerMessageOwners(context, preferred)
    : [];
  const preferredActiveCharacters = preferred
    ? resolveNormalizedTrackerActiveCharacters(preferred, preferredResolvedSceneOwners, preferredResolvedMessageOwners)
    : [];

  return {
    ...merged,
    entityResolution: merged.entityResolution ? structuredClone(merged.entityResolution) : merged.entityResolution,
    activeCharacters: preferredActiveCharacters.length ? preferredActiveCharacters : merged.activeCharacters,
  };
}

export function resolveLatestStoredTrackerData(
  context: STContext,
  lastTrackableIndex: number | null,
): { source: StoredTrackerSource; data: TrackerData | null; messageIndex: number | null } {
  return resolveLatestStoredTrackerDataInternal(context, {
    preferredLastTrackableIndex: lastTrackableIndex,
    beforeMessageIndexExclusive: null,
  });
}

export function resolveLatestStoredTrackerDataBefore(
  context: STContext,
  beforeMessageIndexExclusive: number,
): { source: StoredTrackerSource; data: TrackerData | null; messageIndex: number | null } {
  return resolveLatestStoredTrackerDataInternal(context, {
    preferredLastTrackableIndex: beforeMessageIndexExclusive - 1,
    beforeMessageIndexExclusive,
  });
}

function resolveLatestStoredTrackerDataInternal(
  context: STContext,
  input: {
    preferredLastTrackableIndex: number | null;
    beforeMessageIndexExclusive: number | null;
  },
): { source: StoredTrackerSource; data: TrackerData | null; messageIndex: number | null } {
  const { preferredLastTrackableIndex, beforeMessageIndexExclusive } = input;
  const latestEntry = getLatestTrackerDataWithIndex(context);
  const chatStateEntry = getChatStateLatestTrackerData(context);
  const metadataEntry = getMetadataLatestTrackerData(context);
  const localEntry = getLocalLatestTrackerData(context);

  const isEntryBeforeExclusive = (entry: { data: TrackerData; messageIndex: number } | null): boolean => {
    if (!entry) return false;
    if (beforeMessageIndexExclusive == null) return true;
    return entry.messageIndex < beforeMessageIndexExclusive;
  };
  const isEntrySafeForCurrentLastAi = (entry: { data: TrackerData; messageIndex: number } | null): boolean => {
    if (!entry) return false;
    if (preferredLastTrackableIndex == null) return false;
    if (entry.messageIndex !== preferredLastTrackableIndex) return false;
    if (entry.messageIndex < 0 || entry.messageIndex >= context.chat.length) return false;
    if (!isEntryBeforeExclusive(entry)) return false;
    return isTrackableMessage(context.chat[entry.messageIndex]);
  };
  const isEntrySafeForAnyChatMessage = (entry: { data: TrackerData; messageIndex: number } | null): boolean => {
    if (!entry) return false;
    if (entry.messageIndex < 0 || entry.messageIndex >= context.chat.length) return false;
    if (!isEntryBeforeExclusive(entry)) return false;
    return isTrackableMessage(context.chat[entry.messageIndex]);
  };

  if (isEntrySafeForAnyChatMessage(latestEntry)) {
    return { source: "message", data: latestEntry!.data, messageIndex: latestEntry!.messageIndex };
  }
  const latestBeforeEntry = beforeMessageIndexExclusive != null
    ? getLatestTrackerDataWithIndexBefore(context, beforeMessageIndexExclusive)
    : null;
  if (isEntrySafeForAnyChatMessage(latestBeforeEntry)) {
    return { source: "message", data: latestBeforeEntry!.data, messageIndex: latestBeforeEntry!.messageIndex };
  }
  if (isEntrySafeForCurrentLastAi(chatStateEntry)) {
    return { source: "chatState", data: chatStateEntry!.data, messageIndex: chatStateEntry!.messageIndex };
  }
  if (isEntrySafeForCurrentLastAi(metadataEntry)) {
    return { source: "metadata", data: metadataEntry!.data, messageIndex: metadataEntry!.messageIndex };
  }
  if (isEntrySafeForCurrentLastAi(localEntry)) {
    return { source: "local", data: localEntry!.data, messageIndex: localEntry!.messageIndex };
  }
  return { source: "none", data: null, messageIndex: null };
}
