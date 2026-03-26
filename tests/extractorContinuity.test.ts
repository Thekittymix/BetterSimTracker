import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings } from "../src/settings";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "../src/types";

type SillyTavernGlobal = {
  getContext: () => STContext;
};

function loadExtractor(): typeof import("../src/extractor") {
  const moduleLoader = require("node:module") as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  delete require.cache[require.resolve("../src/extractor")];
  delete require.cache[require.resolve("../src/generator")];
  moduleLoader._load = function patchedLoad(request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "sillytavern-utils-lib") {
      return {
        Generator: class {
          generateRequest(): never {
            throw new Error("Generator path should not be used in extractor continuity tests.");
          }
        },
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

function makeTracker(overrides: Partial<TrackerData> = {}): TrackerData {
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
      ...overrides.statistics,
    },
    customStatistics: overrides.customStatistics ?? {},
    customNonNumericStatistics: overrides.customNonNumericStatistics ?? {},
    ...(overrides.statisticsByEntityId ? { statisticsByEntityId: overrides.statisticsByEntityId } : {}),
    ...(overrides.customStatisticsByEntityId ? { customStatisticsByEntityId: overrides.customStatisticsByEntityId } : {}),
    ...(overrides.customNonNumericStatisticsByEntityId ? { customNonNumericStatisticsByEntityId: overrides.customNonNumericStatisticsByEntityId } : {}),
    ...(overrides.entityOwnerMap ? { entityOwnerMap: overrides.entityOwnerMap } : {}),
    ...(overrides.entityResolution ? { entityResolution: overrides.entityResolution } : {}),
  };
}

function makeSettings(overrides: Partial<BetterSimTrackerSettings> = {}): BetterSimTrackerSettings {
  return {
    ...defaultSettings,
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

test("extractStatisticsParallel keeps built-in continuity scoped to the current entity snapshot", async () => {
  const { extractStatisticsParallel } = loadExtractor();
  let requestCount = 0;
  const context = makeBaseContext(async () => {
    requestCount += 1;
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            characters: [
              {
                name: "Ash",
                confidence: 1,
                delta: { affection: 0 },
              },
            ],
          }),
        },
      }],
    };
  });

  const previousTrackerData = makeTracker({
    entityOwnerMap: {
      Ash: {
        entityId: "bst_narrative:ashley-current",
        ownerName: "Ashley Summers",
        canonicalName: "Ashley Summers",
        aliases: ["Ash"],
        sourceKey: "narrative:bst_narrative:ashley-current",
        kind: "narrative-entity",
      },
    },
  });

  const result = await withSillyTavernContext(context, () => extractStatisticsParallel({
    context,
    settings: makeSettings({ trackAffection: true }),
    userName: "User",
    activeCharacters: ["Ash"],
    contextText: "Ashley pauses by the window.",
    previousTrackerData,
    previousStatistics: {
      affection: {
        Ashley: 10,
        "Ashley Summers": 61,
      },
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
    history: [],
  }));

  assert.equal(requestCount, 1);
  assert.equal(result.statistics.affection.Ash, 61);
});

test("extractStatisticsParallel seeds custom numeric defaults when only a stale same-name owner bucket exists", async () => {
  const { extractStatisticsParallel } = loadExtractor();
  let requestCount = 0;
  const context = makeBaseContext(async () => {
    requestCount += 1;
    return {
      choices: [{
        message: {
          content: JSON.stringify({ characters: [] }),
        },
      }],
    };
  });

  const previousTrackerData = makeTracker({
    entityOwnerMap: {
      Ash: {
        entityId: "bst_narrative:ashley-current",
        ownerName: "Ashley Summers",
        canonicalName: "Ashley Summers",
        aliases: ["Ash"],
        sourceKey: "narrative:bst_narrative:ashley-current",
        kind: "narrative-entity",
      },
    },
  });

  const result = await withSillyTavernContext(context, () => extractStatisticsParallel({
    context,
    settings: makeSettings({
      customStats: [{
        id: "focus",
        label: "Focus",
        kind: "numeric",
        defaultValue: 50,
        track: true,
        includeInInjection: true,
        showOnCard: true,
        showInGraph: false,
      }],
    }),
    userName: "User",
    activeCharacters: ["Ash"],
    contextText: "Ashley glances away.",
    previousTrackerData,
    previousStatistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    previousCustomStatistics: {
      focus: {
        Ashley: 12,
      },
    },
    previousCustomStatisticsRaw: {
      focus: {
        Ashley: 12,
      },
    },
    previousCustomNonNumericStatistics: {},
    hasPriorTrackerData: true,
    history: [],
  }));

  assert.equal(requestCount, 0);
  assert.equal(result.customStatistics.focus?.Ash, 50);
});
