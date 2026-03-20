export type CardLifecycleState = "active" | "inactive" | "archived";

export interface CardLifecycleSnapshot {
  messageIndex: number;
  activeCharacters: string[];
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
}): CardLifecycleState {
  const needle = normalizeName(input.ownerName);
  if (!needle) return "inactive";
  if ((input.currentActiveCharacters ?? []).some(name => normalizeName(name) === needle)) {
    return "active";
  }
  if (!input.autoArchiveInactiveCards) return "inactive";
  const threshold = Math.max(1, Math.floor(input.archiveInactiveAfterTurns));
  const lastActiveMessageIndex = findLastActiveMessageIndex(
    input.history,
    input.currentMessageIndex,
    input.ownerName,
  );
  if (lastActiveMessageIndex == null) return "inactive";
  return (input.currentMessageIndex - lastActiveMessageIndex) > threshold
    ? "archived"
    : "inactive";
}
