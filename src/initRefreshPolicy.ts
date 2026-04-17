import type { TrackerUiState } from "./ui";

export type DeferredInitRefreshState = {
  enabled: boolean;
  isExtracting: boolean;
  chatGenerationInFlight: boolean;
  pendingLateRenderExtraction: boolean;
  latestDataMessageIndex: number | null;
  lastTrackableIndex: number | null;
  uiPhase: TrackerUiState["phase"];
};

export function shouldRunDeferredInitRefresh(state: DeferredInitRefreshState): boolean {
  if (!state.enabled) return false;
  if (state.isExtracting) return false;
  if (state.chatGenerationInFlight) return false;
  if (state.pendingLateRenderExtraction) return false;
  if (state.uiPhase !== "idle") return false;
  if (state.lastTrackableIndex == null) return false;
  if (state.latestDataMessageIndex == null) return true;
  return state.latestDataMessageIndex < state.lastTrackableIndex;
}
