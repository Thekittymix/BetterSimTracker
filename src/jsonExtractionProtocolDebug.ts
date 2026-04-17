import { JSON_EXTRACTION_PROTOCOL_VERSION } from "./jsonExtractionProtocol";
import { executeJsonExtractionProtocol, prepareJsonExtractionProtocolRequest } from "./jsonExtractionProtocolExecution";
import type { BuildJsonExtractionShadowRequestForRunInput } from "./jsonExtractionProtocolRuntimeBridge";
import type { DeltaDebugRecord, TrackerData } from "./types";

export interface BuildJsonExtractionShadowDebugInput extends BuildJsonExtractionShadowRequestForRunInput {
  rawJsonResponse?: string | null;
  expectedTrackerData?: TrackerData | null;
}

export function buildJsonExtractionShadowDebug(
  input: BuildJsonExtractionShadowDebugInput,
): NonNullable<NonNullable<DeltaDebugRecord["meta"]>["jsonShadow"]> {
  const prepared = prepareJsonExtractionProtocolRequest(input);
  const base: NonNullable<NonNullable<DeltaDebugRecord["meta"]>["jsonShadow"]> = {
    status: "request_built",
    protocolVersion: JSON_EXTRACTION_PROTOCOL_VERSION,
    requestText: prepared.requestText,
    task: {
      mode: prepared.request.task.mode,
      messageIndex: prepared.request.task.messageIndex,
      retrack: prepared.request.task.retrack,
      swipeRetrack: prepared.request.task.swipeRetrack,
    },
  };

  if (!input.rawJsonResponse || !input.expectedTrackerData) {
    return base;
  }

  const executed = executeJsonExtractionProtocol({
    ...input,
    rawJsonResponse: input.rawJsonResponse,
    expectedTrackerData: input.expectedTrackerData,
  });
  if (!executed.ok) {
    return {
      ...base,
      status: "response_invalid",
      validationErrors: executed.errors,
    };
  }

  if (executed.parity?.ok) {
    return {
      ...base,
      status: "parity_ok",
    };
  }
  return {
    ...base,
    status: "parity_mismatch",
    parityMismatchPaths: executed.parity?.mismatches.map(mismatch => mismatch.path) ?? [],
  };
}
