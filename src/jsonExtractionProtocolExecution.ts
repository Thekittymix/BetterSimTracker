import { materializeTrackerDataFromJsonExtractionResponseV1, materializeTrackerDataFromJsonExtractionStatResponseV1, materializeTrackerDataFromJsonExtractionStatsResponseV1 } from "./jsonExtractionProtocolAdapter";
import { serializeJsonExtractionRequestV1 } from "./jsonExtractionProtocolBuilder";
import { compareTrackerDataParity, type JsonExtractionParityReport } from "./jsonExtractionProtocolParity";
import { parseAndValidateJsonExtractionResponseV1, parseAndValidateJsonExtractionStatResponseV1, parseAndValidateJsonExtractionStatsResponseV1, type JsonExtractionResponseV1, type JsonExtractionStatResponseV1, type JsonExtractionStatsResponseV1 } from "./jsonExtractionProtocol";
import { buildJsonExtractionShadowRequestForExtractionRun, type BuildJsonExtractionShadowRequestForRunInput } from "./jsonExtractionProtocolRuntimeBridge";
import { normalizeCustomStatKind } from "./customStatRuntime";
import { shouldBypassConfidenceControls } from "./extractorHelpers";
import type { JsonExtractionRequestV1 } from "./jsonExtractionProtocol";
import type { TrackerData } from "./types";

export interface JsonExtractionPreparedRequest {
  request: JsonExtractionRequestV1;
  requestText: string;
}

export interface ExecuteJsonExtractionProtocolInput extends BuildJsonExtractionShadowRequestForRunInput {
  rawJsonResponse: string;
  expectedTrackerData?: TrackerData | null;
}

export function prepareJsonExtractionProtocolRequest(
  input: BuildJsonExtractionShadowRequestForRunInput,
): JsonExtractionPreparedRequest {
  const request = buildJsonExtractionShadowRequestForExtractionRun(input);
  return {
    request,
    requestText: serializeJsonExtractionRequestV1(request),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function usesLegacyWrappedCustomNonNumericStatValue(rawValue: unknown, statId: string): boolean {
  if (!isRecord(rawValue)) return false;
  if (Object.prototype.hasOwnProperty.call(rawValue, statId)) return true;
  const nested = rawValue.value;
  return isRecord(nested) && Object.prototype.hasOwnProperty.call(nested, statId);
}

export function executeJsonExtractionProtocol(
  input: ExecuteJsonExtractionProtocolInput,
): {
  ok: true;
  request: JsonExtractionRequestV1;
  requestText: string;
  response: JsonExtractionResponseV1 | JsonExtractionStatResponseV1 | JsonExtractionStatsResponseV1;
  trackerData: TrackerData;
  parity: JsonExtractionParityReport | null;
} | {
  ok: false;
  request: JsonExtractionRequestV1;
  requestText: string;
  errors: string[];
} {
  const prepared = prepareJsonExtractionProtocolRequest(input);
  const parsed = input.responseMode === "stat"
    ? parseAndValidateJsonExtractionStatResponseV1(input.rawJsonResponse)
    : input.responseMode === "stats"
      ? parseAndValidateJsonExtractionStatsResponseV1(input.rawJsonResponse)
      : parseAndValidateJsonExtractionResponseV1(input.rawJsonResponse);
  if (!parsed.ok) {
    return {
      ok: false,
      request: prepared.request,
      requestText: prepared.requestText,
      errors: parsed.errors.map(error => `${error.path}: ${error.message}`),
    };
  }
  if (
    input.responseMode === "stat"
    && input.statId
    && (parsed.value as JsonExtractionStatResponseV1).statId !== input.statId
  ) {
    return {
      ok: false,
      request: prepared.request,
      requestText: prepared.requestText,
      errors: [`statId: Expected ${input.statId}, got ${(parsed.value as JsonExtractionStatResponseV1).statId}.`],
    };
  }
  if (input.responseMode === "stat" && input.statId) {
    const customDefinition = input.settings.customStats?.find(candidate => candidate.id === input.statId);
    const isCustomNonNumeric = customDefinition && normalizeCustomStatKind(customDefinition.kind) !== "numeric";
    if (isCustomNonNumeric) {
      const invalidOwners = Object.entries((parsed.value as JsonExtractionStatResponseV1).values)
        .filter(([, cell]) => usesLegacyWrappedCustomNonNumericStatValue(cell, input.statId!))
        .map(([ownerName]) => ownerName);
      if (invalidOwners.length) {
        return {
          ok: false,
          request: prepared.request,
          requestText: prepared.requestText,
          errors: [
            `values: Sequential custom non-numeric stat responses must return direct value cells for ${input.statId}, not nested ${input.statId} wrappers (owners: ${invalidOwners.join(", ")}).`,
          ],
        };
      }
    }
  }

  const trackerData = input.responseMode === "stat"
    ? materializeTrackerDataFromJsonExtractionStatResponseV1(parsed.value as JsonExtractionStatResponseV1, {
        context: input.context,
        activeCharacters: input.activeCharacters,
        entityResolution: input.entityResolution,
        customStatDefinitions: input.settings.customStats,
        settings: input.settings,
        previousTrackerData: input.previousTrackerData,
        previousStatistics: input.previousStatistics,
        previousCustomStatistics: input.previousCustomStatistics,
        previousCustomNonNumericStatistics: input.previousCustomNonNumericStatistics,
        bypassConfidenceControls: shouldBypassConfidenceControls(input.reason),
        timestamp: input.expectedTrackerData?.timestamp,
      })
    : input.responseMode === "stats"
      ? materializeTrackerDataFromJsonExtractionStatsResponseV1(parsed.value as JsonExtractionStatsResponseV1, {
          context: input.context,
          activeCharacters: input.activeCharacters,
          entityResolution: input.entityResolution,
          customStatDefinitions: input.settings.customStats,
          settings: input.settings,
          previousTrackerData: input.previousTrackerData,
          previousStatistics: input.previousStatistics,
          previousCustomStatistics: input.previousCustomStatistics,
          previousCustomNonNumericStatistics: input.previousCustomNonNumericStatistics,
          bypassConfidenceControls: shouldBypassConfidenceControls(input.reason),
          timestamp: input.expectedTrackerData?.timestamp,
        })
      : materializeTrackerDataFromJsonExtractionResponseV1(parsed.value as JsonExtractionResponseV1, {
          context: input.context,
          customStatDefinitions: input.settings.customStats,
          settings: input.settings,
          previousTrackerData: input.previousTrackerData,
          previousStatistics: input.previousStatistics,
          previousCustomStatistics: input.previousCustomStatistics,
          previousCustomNonNumericStatistics: input.previousCustomNonNumericStatistics,
          bypassConfidenceControls: shouldBypassConfidenceControls(input.reason),
          timestamp: input.expectedTrackerData?.timestamp,
        });

  return {
    ok: true,
    request: prepared.request,
    requestText: prepared.requestText,
    response: parsed.value,
    trackerData,
    parity: input.expectedTrackerData
      ? compareTrackerDataParity(input.expectedTrackerData, trackerData)
      : null,
  };
}
