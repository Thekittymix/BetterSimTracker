import type { BetterSimTrackerSettings, ChatMessage, STContext, TrackerData } from "./types";
import type { TrackerRecoveryEntry, TrackerUiState } from "./ui";

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

type RenderPassEntrySnapshot = {
  messageIndex: number;
  dataRef: TrackerData | null;
  recoveryKey: string | null;
};

export type RenderPassSnapshot = {
  renderConfigKey: string;
  uiPhase: TrackerUiState["phase"];
  uiMessageIndex: number | null;
  latestTrackedMessageIndex: number | null;
  latestTrackedAiMessageIndex: number | null;
  summaryBusyMessageIndices: number[];
  entries: Map<number, RenderPassEntrySnapshot>;
};

function buildRecoveryKey(recovery?: TrackerRecoveryEntry | null): string | null {
  if (!recovery) return null;
  return [
    recovery.kind,
    recovery.title,
    recovery.detail,
    recovery.actionLabel,
  ].join("|#|");
}

function normalizeBusyIndices(values: Set<number> | undefined): number[] {
  if (!values?.size) return [];
  return [...values].filter(Number.isFinite).sort((a, b) => a - b);
}

function resolveLatestTrackedMessageIndices(
  entries: Array<{ messageIndex: number; data: TrackerData | null }>,
  isUserMessageIndex?: (messageIndex: number) => boolean,
): {
  latestTrackedMessageIndex: number | null;
  latestTrackedAiMessageIndex: number | null;
} {
  const withData = entries.filter(entry => entry.data);
  const latestTrackedMessageIndex = withData.length
    ? withData[withData.length - 1].messageIndex
    : null;
  const latestTrackedAiMessageIndex = [...withData]
    .reverse()
    .find(entry => !isUserMessageIndex?.(entry.messageIndex))
    ?.messageIndex ?? null;
  return {
    latestTrackedMessageIndex,
    latestTrackedAiMessageIndex,
  };
}

export function buildRenderPassSnapshot(
  entries: Array<{ messageIndex: number; data: TrackerData | null; recovery?: TrackerRecoveryEntry | null }>,
  input: {
    settings: BetterSimTrackerSettings;
    allCharacters: string[];
    isGroupChat: boolean;
    uiState: TrackerUiState;
    summaryBusyMessageIndices?: Set<number>;
    isUserMessageIndex?: (messageIndex: number) => boolean;
  },
): RenderPassSnapshot {
  const sortedEntries = [...entries].sort((a, b) => a.messageIndex - b.messageIndex);
  const snapshotEntries = new Map<number, RenderPassEntrySnapshot>();
  for (const entry of sortedEntries) {
    snapshotEntries.set(entry.messageIndex, {
      messageIndex: entry.messageIndex,
      dataRef: entry.data,
      recoveryKey: buildRecoveryKey(entry.recovery ?? null),
    });
  }
  const latest = resolveLatestTrackedMessageIndices(sortedEntries, input.isUserMessageIndex);
  return {
    renderConfigKey: JSON.stringify({
      settings: input.settings,
      allCharacters: input.allCharacters,
      isGroupChat: input.isGroupChat,
    }),
    uiPhase: input.uiState.phase,
    uiMessageIndex: input.uiState.messageIndex,
    latestTrackedMessageIndex: latest.latestTrackedMessageIndex,
    latestTrackedAiMessageIndex: latest.latestTrackedAiMessageIndex,
    summaryBusyMessageIndices: normalizeBusyIndices(input.summaryBusyMessageIndices),
    entries: snapshotEntries,
  };
}

function resolveEarliestBusyChange(
  previous: number[],
  next: number[],
): number | null {
  const prevSet = new Set(previous);
  const nextSet = new Set(next);
  const changed = new Set<number>();
  for (const value of prevSet) {
    if (!nextSet.has(value)) changed.add(value);
  }
  for (const value of nextSet) {
    if (!prevSet.has(value)) changed.add(value);
  }
  if (!changed.size) return null;
  return [...changed].sort((a, b) => a - b)[0] ?? null;
}

export function resolveDirtyRenderStart(
  previous: RenderPassSnapshot | null,
  next: RenderPassSnapshot,
): number | null {
  if (!previous) return 0;
  let dirtyStart: number | null = null;
  const markDirty = (messageIndex: number | null | undefined): void => {
    if (!Number.isFinite(messageIndex)) return;
    dirtyStart = dirtyStart == null ? Number(messageIndex) : Math.min(dirtyStart, Number(messageIndex));
  };

  if (previous.renderConfigKey !== next.renderConfigKey) {
    return 0;
  }
  if (previous.uiPhase !== next.uiPhase || previous.uiMessageIndex !== next.uiMessageIndex) {
    markDirty(previous.uiMessageIndex);
    markDirty(next.uiMessageIndex);
  }
  if (previous.latestTrackedMessageIndex !== next.latestTrackedMessageIndex) {
    markDirty(previous.latestTrackedMessageIndex);
    markDirty(next.latestTrackedMessageIndex);
  }
  if (previous.latestTrackedAiMessageIndex !== next.latestTrackedAiMessageIndex) {
    markDirty(previous.latestTrackedAiMessageIndex);
    markDirty(next.latestTrackedAiMessageIndex);
  }
  markDirty(resolveEarliestBusyChange(previous.summaryBusyMessageIndices, next.summaryBusyMessageIndices));

  const allMessageIndices = new Set<number>([
    ...previous.entries.keys(),
    ...next.entries.keys(),
  ]);
  for (const messageIndex of [...allMessageIndices].sort((a, b) => a - b)) {
    const before = previous.entries.get(messageIndex) ?? null;
    const after = next.entries.get(messageIndex) ?? null;
    if (!before || !after) {
      markDirty(messageIndex);
      continue;
    }
    if (before.dataRef !== after.dataRef || before.recoveryKey !== after.recoveryKey) {
      markDirty(messageIndex);
      continue;
    }
  }

  return dirtyStart;
}

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

