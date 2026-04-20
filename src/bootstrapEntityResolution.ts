import type { TrackerData } from "./types";

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
