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
  const calls: Array<{ responseMode?: string; statId?: string }> = [];
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
    async input => {
      calls.push({
        responseMode: input.responseMode,
        statId: input.statId,
      });
      return {
        ok: true,
        request: {} as never,
        requestText: "{\"protocolVersion\":\"bst.extract.v1\"}",
        response: {} as never,
        responseText: "{\"responseType\":\"stats_extraction_result\"}",
        responseMeta: makeMeta(),
        trackerData: makeTrackerData(),
        parity: null,
      };
    },
  );

  assert.equal(result.mode, "success");
  if (result.mode !== "success") return;
  assert.deepEqual(calls, [{ responseMode: "stats", statId: undefined }]);
  assert.equal(result.statistics.affection.Candy, 61);
  assert.deepEqual(result.customNonNumericStatistics.clothes.Candy, ["t-shirt", "panties"]);
  assert.equal(result.debug.meta?.jsonShadow?.status, "response_valid");
  assert.equal(result.debug.meta?.requests?.[0]?.retryType, "json_protocol");
  assert.deepEqual(progressLabels, [
    "Requesting full JSON extraction",
    "Parsing full JSON extraction",
    "Applying full JSON extraction",
    "Finalizing",
  ]);
});

test("tryExtractStatisticsViaJsonProtocol splits JSON requests by stat when sequential extraction is enabled", async () => {
  const calls: Array<{ settings: BetterSimTrackerSettings; responseMode?: string; statId?: string }> = [];
  const progressLabels: string[] = [];
  const settings = {
    ...makeSettings(),
    sequentialExtraction: true,
    enableSequentialStatGroups: false,
    trackTrust: false,
    trackDesire: false,
    trackConnection: false,
    trackLastThought: false,
  };

  const result = await tryExtractStatisticsViaJsonProtocol(
    {
      context: makeContext(),
      reason: "GENERATION_ENDED",
      messageIndex: 0,
      settings,
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
    async input => {
      calls.push({
        settings: input.settings,
        responseMode: input.responseMode,
        statId: input.statId,
      });
      const callIndex = calls.length;
      const trackerData: TrackerData = {
        ...makeTrackerData(),
        statistics: callIndex === 1
          ? {
              affection: { Candy: 61 },
              trust: {},
              desire: {},
              connection: {},
              mood: {},
              lastThought: {},
            }
          : callIndex === 2
            ? {
                affection: {},
                trust: {},
                desire: {},
                connection: {},
                mood: { Candy: "Playful" },
                lastThought: {},
              }
            : {
                affection: {},
                trust: {},
                desire: {},
                connection: {},
                mood: {},
                lastThought: {},
              },
        customStatistics: {},
        customNonNumericStatistics: callIndex === 3
          ? {
              clothes: {
                Candy: ["t-shirt", "panties"],
              },
            }
          : {},
      };
      return {
        ok: true,
        request: {} as never,
        requestText: `{"protocolVersion":"bst.extract.v1","call":${callIndex}}`,
        response: {} as never,
        responseText: `{"responseType":"tracker_extraction_result","call":${callIndex}}`,
        responseMeta: {
          ...makeMeta(),
          promptChars: 100 + callIndex,
          outputChars: 200 + callIndex,
        },
        trackerData,
        parity: null,
      };
    },
  );

  assert.equal(result.mode, "success");
  if (result.mode !== "success") return;
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => [call.responseMode, call.statId]), [
    ["stat", "affection"],
    ["stat", "mood"],
    ["stat", "clothes"],
  ]);
  assert.equal(calls[0].settings.trackAffection, true);
  assert.equal(calls[0].settings.trackMood, false);
  assert.equal(calls[0].settings.customStats.length, 0);
  assert.equal(calls[1].settings.trackAffection, false);
  assert.equal(calls[1].settings.trackMood, true);
  assert.equal(calls[1].settings.customStats.length, 0);
  assert.equal(calls[2].settings.trackAffection, false);
  assert.equal(calls[2].settings.trackMood, false);
  assert.deepEqual(calls[2].settings.customStats.map(stat => stat.id), ["clothes"]);
  assert.equal(result.statistics.affection.Candy, 61);
  assert.equal(result.statistics.mood.Candy, "Playful");
  assert.deepEqual(result.customNonNumericStatistics.clothes.Candy, ["t-shirt", "panties"]);
  assert.equal(result.debug.meta?.extractionMode, "sequential");
  assert.equal(result.debug.meta?.attempts, 3);
  assert.deepEqual(result.debug.meta?.requests?.map(request => request.statList), [
    ["affection"],
    ["mood"],
    ["clothes"],
  ]);
  assert.deepEqual(progressLabels, [
    "Requesting affection",
    "Parsing affection",
    "Applying affection",
    "Requesting mood",
    "Parsing mood",
    "Applying mood",
    "Requesting Clothes",
    "Parsing Clothes",
    "Applying Clothes",
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
