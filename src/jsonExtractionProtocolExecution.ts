import { materializeTrackerDataFromJsonExtractionResponseV1 } from "./jsonExtractionProtocolAdapter";
import { serializeJsonExtractionRequestV1 } from "./jsonExtractionProtocolBuilder";
import { compareTrackerDataParity, type JsonExtractionParityReport } from "./jsonExtractionProtocolParity";
import { parseAndValidateJsonExtractionResponseV1, type JsonExtractionResponseV1 } from "./jsonExtractionProtocol";
import { buildJsonExtractionShadowRequestForExtractionRun, type BuildJsonExtractionShadowRequestForRunInput } from "./jsonExtractionProtocolRuntimeBridge";
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

export function executeJsonExtractionProtocol(
  input: ExecuteJsonExtractionProtocolInput,
): {
  ok: true;
  request: JsonExtractionRequestV1;
  requestText: string;
  response: JsonExtractionResponseV1;
  trackerData: TrackerData;
  parity: JsonExtractionParityReport | null;
} | {
  ok: false;
  request: JsonExtractionRequestV1;
  requestText: string;
  errors: string[];
} {
  const prepared = prepareJsonExtractionProtocolRequest(input);
  const parsed = parseAndValidateJsonExtractionResponseV1(input.rawJsonResponse);
  if (!parsed.ok) {
    return {
      ok: false,
      request: prepared.request,
      requestText: prepared.requestText,
      errors: parsed.errors.map(error => `${error.path}: ${error.message}`),
    };
  }

  const trackerData = materializeTrackerDataFromJsonExtractionResponseV1(parsed.value, {
    customStatDefinitions: input.settings.customStats,
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
