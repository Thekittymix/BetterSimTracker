import {
  resolveEntityTrackingMode,
  resolveExtractionOwnerScopes,
  resolvePersistedActiveOwners,
  resolveStableEntityIdForOwner,
} from "./entityResolution";
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

export function buildBootstrapFallbackEntityResolution(input: {
  context: STContext | null;
  sceneActiveCharacters: string[];
  requestCharacters: string[];
  settings: Pick<BetterSimTrackerSettings, "entityTrackingMode">;
}): TrackerData["entityResolution"] | null {
  const sceneActiveCharacters = resolvePersistedActiveOwners(
    input.sceneActiveCharacters,
    { includeUserOwner: false },
  );
  const requestCharacters = resolvePersistedActiveOwners(
    input.requestCharacters,
    { includeUserOwner: false },
  );
  const sceneKeys = new Set(sceneActiveCharacters.map(owner => owner.toLowerCase()));
  const requestKeys = new Set(requestCharacters.map(owner => owner.toLowerCase()));
  const owners = resolvePersistedActiveOwners(
    [...sceneActiveCharacters, ...requestCharacters],
    { includeUserOwner: false },
  );
  if (!owners.length) return null;

  return {
    source: "fallback",
    resolvedEntities: owners.map(ownerName => ({
      entityId: resolveStableEntityIdForOwner(
        input.context,
        ownerName,
        resolveEntityTrackingMode(input.settings),
      ) || `bst_bootstrap:${ownerName.trim().toLowerCase()}`,
      kind: "st-character" as const,
      name: ownerName,
      avatar: null,
      inScene: sceneKeys.has(ownerName.toLowerCase()),
      inMessage: requestKeys.has(ownerName.toLowerCase()),
      created: false,
    })),
  };
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
