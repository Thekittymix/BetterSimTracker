import type { TrackerData, TrackerResolvedEntity } from "./types";

export interface JsonExtractionParityMismatch {
  path: string;
  expected: unknown;
  actual: unknown;
}

export interface JsonExtractionParityReport {
  ok: boolean;
  mismatches: JsonExtractionParityMismatch[];
}

function sortedStrings(values: string[] | undefined): string[] {
  return [...(values ?? [])].sort((left, right) => left.localeCompare(right));
}

function sortResolvedEntities(values: TrackerResolvedEntity[] | undefined): Array<{
  entityId: string;
  name: string;
  inScene: boolean;
  inMessage: boolean;
}> {
  return [...(values ?? [])]
    .map(entity => ({
      entityId: entity.entityId,
      name: entity.name,
      inScene: entity.inScene,
      inMessage: entity.inMessage,
    }))
    .sort((left, right) => left.entityId.localeCompare(right.entityId));
}

function stableObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => stableObject(item));
  }
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, stableObject(child)] as const);
  return Object.fromEntries(entries);
}

function pushIfDifferent(
  mismatches: JsonExtractionParityMismatch[],
  path: string,
  expected: unknown,
  actual: unknown,
): void {
  const normalizedExpected = stableObject(expected);
  const normalizedActual = stableObject(actual);
  if (JSON.stringify(normalizedExpected) === JSON.stringify(normalizedActual)) return;
  mismatches.push({
    path,
    expected: normalizedExpected,
    actual: normalizedActual,
  });
}

export function compareTrackerDataParity(
  expected: TrackerData,
  actual: TrackerData,
): JsonExtractionParityReport {
  const mismatches: JsonExtractionParityMismatch[] = [];

  pushIfDifferent(mismatches, "activeCharacters", sortedStrings(expected.activeCharacters), sortedStrings(actual.activeCharacters));
  pushIfDifferent(
    mismatches,
    "entityResolution.resolvedEntities",
    sortResolvedEntities(expected.entityResolution?.resolvedEntities),
    sortResolvedEntities(actual.entityResolution?.resolvedEntities),
  );
  pushIfDifferent(mismatches, "statistics", expected.statistics, actual.statistics);
  pushIfDifferent(mismatches, "customStatistics", expected.customStatistics ?? {}, actual.customStatistics ?? {});
  pushIfDifferent(
    mismatches,
    "customNonNumericStatistics",
    expected.customNonNumericStatistics ?? {},
    actual.customNonNumericStatistics ?? {},
  );

  return {
    ok: mismatches.length === 0,
    mismatches,
  };
}
