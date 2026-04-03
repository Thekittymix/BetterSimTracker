import type { BetterSimTrackerSettings, ChatMessage, STContext, TrackerData } from "./types";

export function computeManualPlaceholderMessageIndices(
  context: STContext | null,
  existingMessageIndices: Set<number>,
  autoGenerateTracker: boolean,
  isTrackableAtIndex: (context: STContext, messageIndex: number) => boolean,
): number[] {
  if (!context || autoGenerateTracker) return [];
  const out: number[] = [];
  for (let i = 0; i < context.chat.length; i += 1) {
    if (existingMessageIndices.has(i)) continue;
    if (!isTrackableAtIndex(context, i)) continue;
    out.push(i);
  }
  return out;
}

export type ProjectedTrackerDataCacheEntry = {
  messageRef: ChatMessage | null | undefined;
  rawDataRef: TrackerData;
  projectedData: TrackerData;
  entityTrackingMode: BetterSimTrackerSettings["entityTrackingMode"];
  projectOwnerScopedCustomNonNumeric: boolean;
};

export function getCachedProjectedTrackerData(
  cache: Map<number, ProjectedTrackerDataCacheEntry>,
  input: {
    messageIndex: number;
    messageRef: ChatMessage | null | undefined;
    rawData: TrackerData;
    entityTrackingMode: BetterSimTrackerSettings["entityTrackingMode"];
    projectOwnerScopedCustomNonNumeric?: boolean;
    build: () => TrackerData;
  },
): TrackerData {
  const projectOwnerScopedCustomNonNumeric = input.projectOwnerScopedCustomNonNumeric !== false;
  const existing = cache.get(input.messageIndex);
  if (
    existing &&
    existing.messageRef === input.messageRef &&
    existing.rawDataRef === input.rawData &&
    existing.entityTrackingMode === input.entityTrackingMode &&
    existing.projectOwnerScopedCustomNonNumeric === projectOwnerScopedCustomNonNumeric
  ) {
    return existing.projectedData;
  }

  const projectedData = input.build();
  cache.set(input.messageIndex, {
    messageRef: input.messageRef,
    rawDataRef: input.rawData,
    projectedData,
    entityTrackingMode: input.entityTrackingMode,
    projectOwnerScopedCustomNonNumeric,
  });
  return projectedData;
}

export function pruneProjectedTrackerDataCache(
  cache: Map<number, ProjectedTrackerDataCacheEntry>,
  maxMessageCount: number,
): void {
  for (const messageIndex of cache.keys()) {
    if (messageIndex < 0 || messageIndex >= maxMessageCount) {
      cache.delete(messageIndex);
    }
  }
}

