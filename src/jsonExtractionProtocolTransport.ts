import { executeJsonExtractionProtocol, prepareJsonExtractionProtocolRequest, type ExecuteJsonExtractionProtocolInput } from "./jsonExtractionProtocolExecution";
import type { GenerateRequestMeta, TrackerData } from "./types";

export interface RunJsonExtractionProtocolShadowTransportInput
  extends Omit<ExecuteJsonExtractionProtocolInput, "rawJsonResponse"> {
  expectedTrackerData?: TrackerData | null;
}

type GenerateJsonLike = (
  prompt: string,
  settings: RunJsonExtractionProtocolShadowTransportInput["settings"],
) => Promise<{ text: string; meta: GenerateRequestMeta }>;

async function generateJsonTransportFallback(
  prompt: string,
  settings: RunJsonExtractionProtocolShadowTransportInput["settings"],
): Promise<{ text: string; meta: GenerateRequestMeta }> {
  const generatorModule = await import("./generator");
  return generatorModule.generateJson(prompt, settings);
}

export async function runJsonExtractionProtocolShadowTransport(
  input: RunJsonExtractionProtocolShadowTransportInput,
  generate: GenerateJsonLike = generateJsonTransportFallback,
): Promise<{
  requestText: string;
  responseText: string;
  responseMeta: GenerateRequestMeta;
} & ReturnType<typeof executeJsonExtractionProtocol>> {
  const prepared = prepareJsonExtractionProtocolRequest(input);
  const response = await generate(prepared.requestText, input.settings);
  const executed = executeJsonExtractionProtocol({
    ...input,
    rawJsonResponse: response.text,
  });
  return {
    responseText: response.text,
    responseMeta: response.meta,
    ...executed,
  };
}
