export type CardLifecycleState = "active" | "inactive" | "archived";

export interface CardLifecycleSnapshot {
  messageIndex: number;
  activeCharacters: string[];
  activeEntityIds?: string[];
}

export interface CardLifecycleRegistryState {
  lastActiveMessageIndex: number | null;
  lifecycleState: CardLifecycleState;
  archivedAtMessageIndex?: number | null;
  introducedAtMessageIndex?: number | null;
}

function normalizeName(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeEntityId(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function findLastActiveMessageIndex(
  snapshots: CardLifecycleSnapshot[],
  currentMessageIndex: number,
  ownerName: string,
  entityId?: string | null,
): number | null {
  const needle = normalizeName(ownerName);
  const entityNeedle = normalizeEntityId(entityId);
  if (!needle) return null;
  for (let i = snapshots.length - 1; i >= 0; i -= 1) {
    const snapshot = snapshots[i];
    if (snapshot.messageIndex >= currentMessageIndex) continue;
    const snapshotEntityIds = snapshot.activeEntityIds ?? [];
    if (entityNeedle) {
      if (snapshotEntityIds.some(id => normalizeEntityId(id) === entityNeedle)) {
        return snapshot.messageIndex;
      }
      if (snapshotEntityIds.length > 0) {
        continue;
      }
    }
    if ((snapshot.activeCharacters ?? []).some(name => normalizeName(name) === needle)) {
      return snapshot.messageIndex;
    }
  }
  return null;
}

export function resolveCardLifecycleState(input: {
  ownerName: string;
  entityId?: string | null;
  currentMessageIndex: number;
  currentActiveCharacters: string[];
  currentActiveEntityIds?: string[];
  history: CardLifecycleSnapshot[];
  autoArchiveInactiveCards: boolean;
  archiveInactiveAfterTurns: number;
  registryState?: CardLifecycleRegistryState | null;
}): CardLifecycleState {
  const needle = normalizeName(input.ownerName);
  const entityNeedle = normalizeEntityId(input.entityId);
  if (!needle) return "inactive";
  const registryState = input.registryState ?? null;
  const registryArchivedAt = Number.isFinite(Number(registryState?.archivedAtMessageIndex))
    ? Number(registryState?.archivedAtMessageIndex)
    : null;
  const isCurrentlyActiveByEntity = entityNeedle
    && (input.currentActiveEntityIds ?? []).some(id => normalizeEntityId(id) === entityNeedle);
  const isCurrentlyActiveByOwner = (input.currentActiveCharacters ?? []).some(name => normalizeName(name) === needle);
  const isCurrentlyActive = Boolean(isCurrentlyActiveByEntity || isCurrentlyActiveByOwner);
  if (registryState?.lifecycleState === "archived"
    && registryArchivedAt != null
    && registryArchivedAt <= input.currentMessageIndex
    && (!isCurrentlyActive || registryArchivedAt === input.currentMessageIndex)) {
    return "archived";
  }
  if (isCurrentlyActiveByEntity) {
    return "active";
  }
  if (isCurrentlyActiveByOwner) {
    return "active";
  }
  if (!input.autoArchiveInactiveCards) return "inactive";
  const threshold = Math.max(1, Math.floor(input.archiveInactiveAfterTurns));
  const introducedAtMessageIndex = Number.isFinite(Number(registryState?.introducedAtMessageIndex))
    ? Number(registryState?.introducedAtMessageIndex)
    : null;
  const historicalLastActive = findLastActiveMessageIndex(
    input.history,
    input.currentMessageIndex,
    input.ownerName,
    input.entityId,
  );
  const registryLastActive = Number.isFinite(Number(registryState?.lastActiveMessageIndex))
    ? Number(registryState?.lastActiveMessageIndex)
    : null;
  const clampedHistoricalLastActive = historicalLastActive != null
    && (introducedAtMessageIndex == null || historicalLastActive >= introducedAtMessageIndex)
    ? historicalLastActive
    : null;
  const clampedRegistryLastActive = registryLastActive != null
    && (introducedAtMessageIndex == null || registryLastActive >= introducedAtMessageIndex)
    ? registryLastActive
    : null;
  const lastActiveMessageIndex = clampedRegistryLastActive != null
    ? (clampedHistoricalLastActive != null ? Math.max(clampedHistoricalLastActive, clampedRegistryLastActive) : clampedRegistryLastActive)
    : clampedHistoricalLastActive;
  if (lastActiveMessageIndex == null) return "inactive";
  return (input.currentMessageIndex - lastActiveMessageIndex) > threshold
    ? "archived"
    : "inactive";
}
