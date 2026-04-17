import { serializeJsonExtractionRequestV1 } from "./jsonExtractionProtocolBuilder";
import { materializeTrackerDataFromJsonExtractionResponseV1 } from "./jsonExtractionProtocolAdapter";
import { compareTrackerDataParity } from "./jsonExtractionProtocolParity";
import {
  JSON_EXTRACTION_PROTOCOL_VERSION,
  parseAndValidateJsonExtractionResponseV1,
} from "./jsonExtractionProtocol";
import { buildJsonExtractionShadowRequestForExtractionRun, type BuildJsonExtractionShadowRequestForRunInput } from "./jsonExtractionProtocolRuntimeBridge";
import type { DeltaDebugRecord, TrackerData } from "./types";

export interface BuildJsonExtractionShadowDebugInput extends BuildJsonExtractionShadowRequestForRunInput {
  rawJsonResponse?: string | null;
  expectedTrackerData?: TrackerData | null;
}

export function buildJsonExtractionShadowDebug(
  input: BuildJsonExtractionShadowDebugInput,
): NonNullable<NonNullable<DeltaDebugRecord["meta"]>["jsonShadow"]> {
  const request = buildJsonExtractionShadowRequestForExtractionRun(input);
  const base: NonNullable<NonNullable<DeltaDebugRecord["meta"]>["jsonShadow"]> = {
    status: "request_built",
    protocolVersion: JSON_EXTRACTION_PROTOCOL_VERSION,
    requestText: serializeJsonExtractionRequestV1(request),
    task: {
      mode: request.task.mode,
      messageIndex: request.task.messageIndex,
      retrack: request.task.retrack,
      swipeRetrack: request.task.swipeRetrack,
    },
  };

  if (!input.rawJsonResponse || !input.expectedTrackerData) {
    return base;
  }

  const parsed = parseAndValidateJsonExtractionResponseV1(input.rawJsonResponse);
  if (!parsed.ok) {
    return {
      ...base,
      status: "response_invalid",
      validationErrors: parsed.errors.map(error => `${error.path}: ${error.message}`),
    };
  }

  const materialized = materializeTrackerDataFromJsonExtractionResponseV1(parsed.value, {
    customStatDefinitions: input.settings.customStats,
    timestamp: input.expectedTrackerData.timestamp,
  });
  const parity = compareTrackerDataParity(input.expectedTrackerData, materialized);
  if (parity.ok) {
    return {
      ...base,
      status: "parity_ok",
    };
  }
  return {
    ...base,
    status: "parity_mismatch",
    parityMismatchPaths: parity.mismatches.map(mismatch => mismatch.path),
  };
}
