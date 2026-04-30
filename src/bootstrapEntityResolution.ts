import { resolveExtractionOwnerScopes, resolvePersistedActiveOwners } from "./entityResolution";
import type { BetterSimTrackerSettings, ChatMessage, STContext, TrackerData } from "./types";

export function buildGreetingBootstrapDefaultTrackerData(input: {
  timestamp: number;
  activeCharacters: string[];
  previous: TrackerData;
  entityResolution?: TrackerData["entityResolution"] | null;
}): TrackerData {
  const entityResolution = input.entityResolution ?? input.previous.entityResolution;
  return {
    timestamp: input.timestamp,
    activeCharacters: [...input.activeCharacters],
    ...(entityResolution ? { entityResolution } : {}),
    statistics: input.previous.statistics,
    statisticsByEntityId: input.previous.statisticsByEntityId,
    customStatistics: input.previous.customStatistics,
    customStatisticsByEntityId: input.previous.customStatisticsByEntityId,
    customNonNumericStatistics: input.previous.customNonNumericStatistics,
    customNonNumericStatisticsByEntityId: input.previous.customNonNumericStatisticsByEntityId,
  };
}

export function resolveBootstrapContinueEntityResolution(input: {
  isBootstrapContinue: boolean;
  existingTrackerData?: TrackerData | null;
}): TrackerData["entityResolution"] | null {
  if (!input.isBootstrapContinue) return null;
  return input.existingTrackerData?.entityResolution ?? null;
}

export function resolveBootstrapEntityResolutionOwnerScopes(input: {
  context: STContext | null;
  candidateOwners: string[];
  message: ChatMessage | null | undefined;
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">;
  modelOwnerScopes: { sceneActiveCharacters: string[]; requestCharacters: string[] } | null;
}): {
  sceneActiveCharacters: string[];
  requestCharacters: string[];
  source: "model" | "fallback";
} | null {
  if (input.modelOwnerScopes) {
    const sceneActiveCharacters = resolvePersistedActiveOwners(
      input.modelOwnerScopes.sceneActiveCharacters,
      { includeUserOwner: false },
    );
    const requestCharacters = resolvePersistedActiveOwners(
      input.modelOwnerScopes.requestCharacters,
      { includeUserOwner: false },
    );
    if (sceneActiveCharacters.length || requestCharacters.length) {
      return {
        sceneActiveCharacters,
        requestCharacters,
        source: "model",
      };
    }
  }

  const bootstrapCandidates = resolvePersistedActiveOwners(
    input.candidateOwners,
    { includeUserOwner: false },
  );
  if (!bootstrapCandidates.length) return null;

  const scopedFallback = resolveExtractionOwnerScopes(
    input.context,
    bootstrapCandidates,
    input.message,
    input.settings,
  );
  const sceneActiveCharacters = resolvePersistedActiveOwners(
    scopedFallback.sceneActiveCharacters.length
      ? scopedFallback.sceneActiveCharacters
      : bootstrapCandidates,
    { includeUserOwner: false },
  );
  const requestCharacters = resolvePersistedActiveOwners(
    scopedFallback.requestCharacters.length
      ? scopedFallback.requestCharacters
      : (sceneActiveCharacters.length === 1 ? sceneActiveCharacters : []),
    { includeUserOwner: false },
  );

  return {
    sceneActiveCharacters,
    requestCharacters,
    source: "fallback",
  };
}
