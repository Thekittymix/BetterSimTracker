export type RefreshRenderSnapshot = {
  settingsRef: object | null;
  latestDataRef: object | null;
  latestDataMessageIndex: number | null;
  lastTrackableIndex: number | null;
  source: string | null;
  recoveryKey: string;
  uiPhase: string;
  uiMessageIndex: number | null;
  allCharactersKey: string;
  chatLength: number;
  groupId: string | null;
  characterId: string | null;
};

export function shouldQueueRenderAfterRefresh(
  previous: RefreshRenderSnapshot | null,
  next: RefreshRenderSnapshot,
): boolean {
  if (!previous) return true;
  return !(
    previous.settingsRef === next.settingsRef
    && previous.latestDataRef === next.latestDataRef
    && previous.latestDataMessageIndex === next.latestDataMessageIndex
    && previous.lastTrackableIndex === next.lastTrackableIndex
    && previous.source === next.source
    && previous.recoveryKey === next.recoveryKey
    && previous.uiPhase === next.uiPhase
    && previous.uiMessageIndex === next.uiMessageIndex
    && previous.allCharactersKey === next.allCharactersKey
    && previous.chatLength === next.chatLength
    && previous.groupId === next.groupId
    && previous.characterId === next.characterId
  );
}

