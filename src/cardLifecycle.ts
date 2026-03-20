export type CardLifecycleState = "active" | "inactive" | "archived";

export interface CardLifecycleSnapshot {
  messageIndex: number;
  activeCharacters: string[];
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

export function findLastActiveMessageIndex(
  snapshots: CardLifecycleSnapshot[],
  currentMessageIndex: number,
  ownerName: string,
): number | null {
  const needle = normalizeName(ownerName);
  if (!needle) return null;
  for (let i = snapshots.length - 1; i >= 0; i -= 1) {
    const snapshot = snapshots[i];
    if (snapshot.messageIndex >= currentMessageIndex) continue;
    if ((snapshot.activeCharacters ?? []).some(name => normalizeName(name) === needle)) {
      return snapshot.messageIndex;
    }
  }
  return null;
}

export function resolveCardLifecycleState(input: {
  ownerName: string;
  currentMessageIndex: number;
  currentActiveCharacters: string[];
  history: CardLifecycleSnapshot[];
  autoArchiveInactiveCards: boolean;
  archiveInactiveAfterTurns: number;
  registryState?: CardLifecycleRegistryState | null;
}): CardLifecycleState {
  const needle = normalizeName(input.ownerName);
  if (!needle) return "inactive";
  if ((input.currentActiveCharacters ?? []).some(name => normalizeName(name) === needle)) {
    return "active";
  }
  const registryState = input.registryState ?? null;
  if (!input.autoArchiveInactiveCards) return "inactive";
  const threshold = Math.max(1, Math.floor(input.archiveInactiveAfterTurns));
  const introducedAtMessageIndex = Number.isFinite(Number(registryState?.introducedAtMessageIndex))
    ? Number(registryState?.introducedAtMessageIndex)
    : null;
  const historicalLastActive = findLastActiveMessageIndex(
    input.history,
    input.currentMessageIndex,
    input.ownerName,
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
  const registryArchivedAt = Number.isFinite(Number(registryState?.archivedAtMessageIndex))
    ? Number(registryState?.archivedAtMessageIndex)
    : null;
  if (registryState?.lifecycleState === "archived"
    && registryArchivedAt != null
    && registryArchivedAt <= input.currentMessageIndex
    && (input.currentMessageIndex - lastActiveMessageIndex) > threshold) {
    return "archived";
  }
  return (input.currentMessageIndex - lastActiveMessageIndex) > threshold
    ? "archived"
    : "inactive";
}
