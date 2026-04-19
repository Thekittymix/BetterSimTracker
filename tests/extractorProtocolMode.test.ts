import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings } from "../src/settings";
import type {
  BetterSimTrackerSettings,
  DeltaDebugRecord,
  STContext,
  TrackerData,
} from "../src/types";

type SillyTavernGlobal = {
  getContext: () => STContext;
};

function loadExtractorWithMocks(mock: {
  generateJson?: (prompt: string, settings: BetterSimTrackerSettings) => Promise<{ text: string; meta: Record<string, unknown> }>;
  cancelActiveGenerations?: () => number;
  tryExtractStatisticsViaJsonProtocol: () => Promise<
    | { mode: "inactive" }
    | { mode: "fallback"; jsonShadowDebug: NonNullable<NonNullable<DeltaDebugRecord["meta"]>["jsonShadow"]> }
    | {
        mode: "success";
        statistics: TrackerData["statistics"];
        customStatistics: NonNullable<TrackerData["customStatistics"]>;
        customNonNumericStatistics: NonNullable<TrackerData["customNonNumericStatistics"]>;
        debug: DeltaDebugRecord;
      }
  >;
}): typeof import("../src/extractor") {
  const moduleLoader = require("node:module") as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  delete require.cache[require.resolve("../src/extractor")];
  delete require.cache[require.resolve("../src/extractorJsonProtocol")];
  delete require.cache[require.resolve("../src/generator")];
  moduleLoader._load = function patchedLoad(request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "sillytavern-utils-lib") {
      return {
        Generator: class {
          generateRequest(): never {
            throw new Error("Generator path should not be used in extractor protocol mode tests.");
          }
        },
      };
    }
    if (request === "./generator") {
      return {
        generateJson: mock.generateJson ?? (async () => {
          throw new Error("Legacy generator should not be used in this test path.");
        }),
        cancelActiveGenerations: mock.cancelActiveGenerations ?? (() => 0),
      };
    }
    if (request === "./extractorJsonProtocol") {
      return {
        tryExtractStatisticsViaJsonProtocol: mock.tryExtractStatisticsViaJsonProtocol,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require("../src/extractor") as typeof import("../src/extractor");
  } finally {
    moduleLoader._load = originalLoad;
  }
}

function withSillyTavernContext<T>(context: STContext, run: () => Promise<T>): Promise<T> {
  const globalBag = globalThis as typeof globalThis & { SillyTavern?: SillyTavernGlobal };
  const previous = globalBag.SillyTavern;
  globalBag.SillyTavern = {
    getContext: () => context,
  };
  return run().finally(() => {
    if (previous === undefined) {
      delete globalBag.SillyTavern;
    } else {
      globalBag.SillyTavern = previous;
    }
  });
}

function makeBaseContext(
  processRequest: NonNullable<NonNullable<STContext["ChatCompletionService"]>["processRequest"]>,
): STContext {
  return {
    chat: [],
    characterId: 0,
    mainApi: "openai",
    chatCompletionSettings: {
      chat_completion_source: "openai",
    },
    ChatCompletionService: {
      processRequest,
    },
  } as unknown as STContext;
}

function makeSettings(overrides: Partial<BetterSimTrackerSettings> = {}): BetterSimTrackerSettings {
  return {
    ...defaultSettings,
    extractionProtocolMode: "json",
    trackAffection: false,
    trackTrust: false,
    trackDesire: false,
    trackConnection: false,
    trackMood: false,
    trackLastThought: false,
    strictJsonRepair: false,
    maxRetriesPerStat: 0,
    ...overrides,
  };
}

function makeTracker(): TrackerData {
  return {
    timestamp: 1,
    activeCharacters: ["Ash"],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {},
  };
}

test("extractStatisticsParallel returns JSON-mode output directly and skips legacy generator requests", async () => {
  let legacyGeneratorCalls = 0;
  let jsonCalls = 0;
  const context = makeBaseContext(async () => ({ choices: [] }));
  const { extractStatisticsParallel } = loadExtractorWithMocks({
    generateJson: async () => {
      legacyGeneratorCalls += 1;
      throw new Error("legacy generator should not run on JSON success");
    },
    tryExtractStatisticsViaJsonProtocol: async () => {
      jsonCalls += 1;
      return {
        mode: "success",
        statistics: {
          affection: { Ash: 77 },
          trust: {},
          desire: {},
          connection: {},
          mood: { Ash: "Focused" },
          lastThought: { Ash: "Stay calm." },
        },
        customStatistics: {},
        customNonNumericStatistics: {
          clothes: { Ash: ["hoodie"] },
        },
        debug: {
          rawModelOutput: "{\"responseType\":\"tracker_extraction_result\"}",
          parsed: {
            confidence: {},
            deltas: {
              affection: { Ash: 77 },
              trust: {},
              desire: {},
              connection: {},
              custom: {},
              customNonNumeric: {
                clothes: { Ash: ["hoodie"] },
              },
            },
            mood: { Ash: "Focused" },
            lastThought: { Ash: "Stay calm." },
          },
          applied: {
            affection: { Ash: 77 },
            trust: {},
            desire: {},
            connection: {},
            mood: { Ash: "Focused" },
            lastThought: { Ash: "Stay calm." },
            customStatistics: {},
            customNonNumericStatistics: {
              clothes: { Ash: ["hoodie"] },
            },
          },
          meta: {
            promptChars: 10,
            contextChars: 10,
            historySnapshots: 1,
            activeCharacters: ["Ash"],
            statsRequested: ["affection", "mood", "lastThought", "clothes"],
            attempts: 1,
            extractionMode: "unified",
            retryUsed: false,
            firstParseHadValues: true,
            rawLength: 10,
            parsedCounts: {
              confidence: 0,
              affection: 1,
              trust: 0,
              desire: 0,
              connection: 0,
              mood: 1,
              lastThought: 1,
              customByStat: {},
              customNonNumericByStat: { clothes: 1 },
            },
            appliedCounts: {
              affection: 1,
              trust: 0,
              desire: 0,
              connection: 0,
              mood: 1,
              lastThought: 1,
              customByStat: {},
              customNonNumericByStat: { clothes: 1 },
            },
            requests: [],
            jsonShadow: {
              status: "response_valid",
              protocolVersion: "bst.extract.v1",
            },
          },
        },
      };
    },
  });

  const result = await withSillyTavernContext(context, () => extractStatisticsParallel({
    context,
    settings: makeSettings({
      trackAffection: true,
      trackMood: true,
      trackLastThought: true,
      customStats: [{
        id: "clothes",
        label: "Clothes",
        kind: "array",
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
      }],
    }),
    reason: "GENERATION_ENDED",
    messageIndex: 0,
    userName: "User",
    activeCharacters: ["Ash"],
    contextText: "Ash squares his shoulders.",
    previousTrackerData: makeTracker(),
    previousStatistics: makeTracker().statistics,
    previousCustomStatistics: {},
    previousCustomStatisticsRaw: {},
    previousCustomNonNumericStatistics: {},
    hasPriorTrackerData: true,
    history: [makeTracker()],
  }));

  assert.equal(jsonCalls, 1);
  assert.equal(legacyGeneratorCalls, 0);
  assert.equal(result.statistics.affection.Ash, 77);
  assert.deepEqual(result.customNonNumericStatistics.clothes?.Ash, ["hoodie"]);
  assert.equal(result.debug?.meta?.jsonShadow?.status, "response_valid");
});

test("extractStatisticsParallel falls back to legacy extraction and preserves JSON failure debug when active JSON mode fails", async () => {
  let legacyGeneratorCalls = 0;
  const context = makeBaseContext(async () => ({ choices: [] }));
  const globalBag = globalThis as any;
  const previousWindow = globalBag.window;
  globalBag.window = globalThis;
  const { extractStatisticsParallel } = loadExtractorWithMocks({
    generateJson: async (prompt: string) => {
      legacyGeneratorCalls += 1;
      if (/affection/i.test(prompt)) {
        return {
          text: JSON.stringify({
            characters: [
              {
                name: "Ash",
                confidence: 1,
                delta: { affection: 2 },
              },
            ],
          }),
          meta: {
            profileId: "legacy-profile",
            promptChars: prompt.length,
            maxTokens: 128,
            durationMs: 10,
            outputChars: 64,
            timestamp: 100,
          },
        };
      }
      throw new Error(`unexpected legacy prompt: ${prompt}`);
    },
    tryExtractStatisticsViaJsonProtocol: async () => ({
      mode: "fallback",
      jsonShadowDebug: {
        status: "response_invalid",
        protocolVersion: "bst.extract.v1",
        responseText: "{\"protocolVersion\":\"bst.extract.v1\"}",
        validationErrors: ["result.status: invalid"],
      },
    }),
  });

  try {
    const result = await withSillyTavernContext(context, () => extractStatisticsParallel({
      context,
      settings: makeSettings({ trackAffection: true }),
      reason: "GENERATION_ENDED",
      messageIndex: 0,
      userName: "User",
      activeCharacters: ["Ash"],
      contextText: "Ash exhales through his nose.",
      previousTrackerData: makeTracker(),
      previousStatistics: {
        affection: { Ash: 61 },
        trust: {},
        desire: {},
        connection: {},
        mood: {},
        lastThought: {},
      },
      previousCustomStatistics: {},
      previousCustomStatisticsRaw: {},
      previousCustomNonNumericStatistics: {},
      hasPriorTrackerData: true,
      history: [makeTracker()],
    }));

    assert.equal(legacyGeneratorCalls, 1);
    assert.equal(result.statistics.affection.Ash, 63);
    assert.equal(result.debug?.meta?.jsonShadow?.status, "response_invalid");
    assert.deepEqual(result.debug?.meta?.jsonShadow?.validationErrors, ["result.status: invalid"]);
  } finally {
    if (previousWindow === undefined) delete globalBag.window;
    else globalBag.window = previousWindow;
  }
});
