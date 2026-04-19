import test from "node:test";
import assert from "node:assert/strict";

import { tryExtractStatisticsViaJsonProtocol } from "../src/extractorJsonProtocol";
import { defaultSettings } from "../src/settings";
import type {
  BetterSimTrackerSettings,
  GenerateRequestMeta,
  STContext,
  TrackerData,
} from "../src/types";

function makeSettings(): BetterSimTrackerSettings {
  return {
    ...defaultSettings,
    extractionProtocolMode: "json",
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: false,
    entityTrackingMode: "dynamic_characters",
    trackAffection: true,
    trackTrust: true,
    trackDesire: true,
    trackConnection: true,
    trackMood: true,
    trackLastThought: true,
    customStats: [
      {
        id: "clothes",
        kind: "array",
        label: "Clothes",
        defaultValue: [],
        textMaxLength: 120,
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
      },
    ],
  };
}

function makeContext(): STContext {
  return {
    name1: "Kuba",
    name2: "Your Family",
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {},
        ownerToEntityId: {},
      },
    },
    chat: [
      {
        name: "Your Family",
        is_user: false,
        is_system: false,
        mes: "Candy replies while Lisa watches.",
        extra: {},
      },
    ],
  };
}

function makeTrackerData(): TrackerData {
  return {
    timestamp: 123,
    activeCharacters: ["Candy", "Lisa"],
    entityResolution: {
      source: "model",
      resolvedEntities: [
        {
          entityId: "bst_narrative:candy",
          kind: "narrative-entity",
          name: "Candy",
          aliases: [],
          inScene: true,
          inMessage: true,
        },
      ],
    },
    statistics: {
      affection: { Candy: 61 },
      trust: {},
      desire: {},
      connection: {},
      mood: { Candy: "Playful" },
      lastThought: { Candy: "Still teasing him." },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: {
        Candy: ["t-shirt", "panties"],
      },
    },
  };
}

function makeMeta(): GenerateRequestMeta {
  return {
    profileId: "json-profile",
    promptChars: 321,
    maxTokens: 512,
    durationMs: 222,
    outputChars: 444,
    timestamp: 777,
  };
}

test("tryExtractStatisticsViaJsonProtocol returns active JSON extraction output and debug record on success", async () => {
  const progressLabels: string[] = [];
  const result = await tryExtractStatisticsViaJsonProtocol(
    {
      context: makeContext(),
      reason: "GENERATION_ENDED",
      messageIndex: 0,
      settings: makeSettings(),
      activeCharacters: ["Candy", "Lisa"],
      entityResolution: makeTrackerData().entityResolution,
      previousTrackerData: makeTrackerData(),
      previousStatistics: makeTrackerData().statistics,
      previousCustomStatistics: {},
      previousCustomNonNumericStatistics: makeTrackerData().customNonNumericStatistics,
      contextText: "Recent scene context",
      history: [makeTrackerData()],
      onProgress: (_done, _total, label) => {
        if (label) progressLabels.push(label);
      },
    },
    async () => ({
      ok: true,
      request: {} as never,
      requestText: "{\"protocolVersion\":\"bst.extract.v1\"}",
      response: {} as never,
      responseText: "{\"responseType\":\"tracker_extraction_result\"}",
      responseMeta: makeMeta(),
      trackerData: makeTrackerData(),
      parity: null,
    }),
  );

  assert.equal(result.mode, "success");
  if (result.mode !== "success") return;
  assert.equal(result.statistics.affection.Candy, 61);
  assert.deepEqual(result.customNonNumericStatistics.clothes.Candy, ["t-shirt", "panties"]);
  assert.equal(result.debug.meta?.jsonShadow?.status, "response_valid");
  assert.equal(result.debug.meta?.requests?.[0]?.retryType, "json_protocol");
  assert.deepEqual(progressLabels, [
    "Requesting extraction",
    "Parsing extraction",
    "Applying extraction",
    "Finalizing",
  ]);
});

test("tryExtractStatisticsViaJsonProtocol returns fallback with response_invalid debug when JSON response fails validation", async () => {
  const result = await tryExtractStatisticsViaJsonProtocol(
    {
      context: makeContext(),
      reason: "GENERATION_ENDED",
      messageIndex: 0,
      settings: makeSettings(),
      activeCharacters: ["Candy", "Lisa"],
      previousTrackerData: makeTrackerData(),
      previousStatistics: makeTrackerData().statistics,
      previousCustomStatistics: {},
      previousCustomNonNumericStatistics: makeTrackerData().customNonNumericStatistics,
      contextText: "Recent scene context",
      history: [makeTrackerData()],
    },
    async () => ({
      ok: false,
      request: {} as never,
      requestText: "{\"protocolVersion\":\"bst.extract.v1\"}",
      errors: ["result.status: invalid"],
      responseText: "{\"protocolVersion\":\"bst.extract.v1\"}",
      responseMeta: makeMeta(),
    }),
  );

  assert.equal(result.mode, "fallback");
  if (result.mode !== "fallback") return;
  assert.equal(result.jsonShadowDebug.status, "response_invalid");
  assert.match(result.jsonShadowDebug.responseText ?? "", /protocolVersion/);
});

test("tryExtractStatisticsViaJsonProtocol returns fallback with transport_error debug on transport failure", async () => {
  const result = await tryExtractStatisticsViaJsonProtocol(
    {
      context: makeContext(),
      reason: "GENERATION_ENDED",
      messageIndex: 0,
      settings: makeSettings(),
      activeCharacters: ["Candy", "Lisa"],
      previousTrackerData: makeTrackerData(),
      previousStatistics: makeTrackerData().statistics,
      previousCustomStatistics: {},
      previousCustomNonNumericStatistics: makeTrackerData().customNonNumericStatistics,
      contextText: "Recent scene context",
      history: [makeTrackerData()],
    },
    async () => {
      throw new Error("transport blew up");
    },
  );

  assert.equal(result.mode, "fallback");
  if (result.mode !== "fallback") return;
  assert.equal(result.jsonShadowDebug.status, "transport_error");
  assert.match(result.jsonShadowDebug.transportError ?? "", /transport blew up/);
});
