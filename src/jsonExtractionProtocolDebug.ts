import { JSON_EXTRACTION_PROTOCOL_VERSION } from "./jsonExtractionProtocol";
import { executeJsonExtractionProtocol, prepareJsonExtractionProtocolRequest } from "./jsonExtractionProtocolExecution";
import type { BuildJsonExtractionShadowRequestForRunInput } from "./jsonExtractionProtocolRuntimeBridge";
import type {
  CustomNonNumericStatistics,
  CustomStatistics,
  DeltaDebugRecord,
  GenerateRequestMeta,
  Statistics,
  TrackerData,
  TrackerDataEntityResolution,
} from "./types";

export interface BuildJsonExtractionShadowDebugInput extends BuildJsonExtractionShadowRequestForRunInput {
  rawJsonResponse?: string | null;
  expectedTrackerData?: TrackerData | null;
  requestTextOverride?: string | null;
  responseMeta?: GenerateRequestMeta | null;
  transportError?: unknown;
}

export interface BuildJsonExtractionShadowExpectedTrackerDataInput {
  timestamp?: number;
  activeCharacters: string[];
  entityResolution?: TrackerDataEntityResolution | null;
  statistics: Statistics;
  customStatistics?: CustomStatistics | null;
  customNonNumericStatistics?: CustomNonNumericStatistics | null;
}

export function buildJsonExtractionShadowExpectedTrackerData(
  input: BuildJsonExtractionShadowExpectedTrackerDataInput,
): TrackerData {
  return {
    timestamp: input.timestamp ?? Date.now(),
    activeCharacters: [...input.activeCharacters],
    entityResolution: input.entityResolution ?? undefined,
    statistics: input.statistics,
    customStatistics: input.customStatistics ?? {},
    customNonNumericStatistics: input.customNonNumericStatistics ?? {},
  };
}

export function buildJsonExtractionShadowDebug(
  input: BuildJsonExtractionShadowDebugInput,
): NonNullable<NonNullable<DeltaDebugRecord["meta"]>["jsonShadow"]> {
  const prepared = prepareJsonExtractionProtocolRequest(input);
  const base: NonNullable<NonNullable<DeltaDebugRecord["meta"]>["jsonShadow"]> = {
    status: "request_built",
    protocolVersion: JSON_EXTRACTION_PROTOCOL_VERSION,
    requestText: input.requestTextOverride ?? prepared.requestText,
    responseText: input.rawJsonResponse ?? undefined,
    responseMeta: input.responseMeta ?? undefined,
    task: {
      mode: prepared.request.task.mode,
      messageIndex: prepared.request.task.messageIndex,
      retrack: prepared.request.task.retrack,
      swipeRetrack: prepared.request.task.swipeRetrack,
    },
  };

  if (input.transportError) {
    return {
      ...base,
      status: "transport_error",
      transportError: String(input.transportError),
    };
  }

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
