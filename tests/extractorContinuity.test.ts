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

function loadExtractorWithGeneratorMock(mock: {
  generateJson: (prompt: string, settings: BetterSimTrackerSettings) => Promise<{ text: string; meta: Record<string, unknown> }>;
  cancelActiveGenerations?: () => number;
}): typeof import("../src/extractor") {
  const moduleLoader = require("node:module") as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  delete require.cache[require.resolve("../src/extractor")];
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
    if (request === "./generator") {
      return {
        generateJson: mock.generateJson,
        cancelActiveGenerations: mock.cancelActiveGenerations ?? (() => 0),
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

test("extractStatisticsParallel keeps private lastThought out of public legacy sequential prompts", async () => {
  const prompts: string[] = [];
  const { extractStatisticsParallel } = loadExtractorWithGeneratorMock({
    generateJson: async (prompt: string) => {
      prompts.push(prompt);
      if (/Only update trust deltas/.test(prompt) || /"trust": 0/.test(prompt)) {
        return {
          text: JSON.stringify({
            characters: [
              { name: "Lisa", confidence: 1, delta: { trust: 0 } },
              { name: "Candy", confidence: 1, delta: { trust: 0 } },
            ],
          }),
          meta: {},
        };
      }
      const owner = /Extract updates only for these target owners: Lisa/.test(prompt) ? "Lisa" : "Candy";
      return {
        text: JSON.stringify({
          characters: [
            { name: owner, confidence: 1, lastThought: owner === "Lisa" ? "I need to hold my line." : "I should stay nearby." },
          ],
        }),
        meta: {},
      };
    },
  });
  const context = makeBaseContext(async () => {
    throw new Error("ChatCompletionService path should not be used with the generator mock.");
  });

  const previousTrackerData = makeTracker({
    activeCharacters: ["Lisa", "Candy"],
    statistics: {
      affection: {},
      trust: { Lisa: 40, Candy: 55 },
      desire: {},
      connection: {},
      mood: {},
      lastThought: {
        Lisa: "Previous private Lisa thought.",
        Candy: "Previous private Candy thought.",
      },
    },
  });

  const result = await withSillyTavernContext(context, () => extractStatisticsParallel({
    context,
    settings: makeSettings({
      extractionProtocolMode: "legacy",
      sequentialExtraction: true,
      maxConcurrentCalls: 1,
      trackTrust: true,
      trackLastThought: true,
      lastThoughtPrivate: true,
      includeContextInDiagnostics: true,
    }),
    userName: "User",
    activeCharacters: ["Lisa", "Candy"],
    contextText: "Lisa answers while Candy stays close.",
    previousTrackerData,
    previousStatistics: previousTrackerData.statistics,
    previousCustomStatistics: {},
    previousCustomStatisticsRaw: {},
    previousCustomNonNumericStatistics: {},
    hasPriorTrackerData: true,
    history: [previousTrackerData],
  }));

  assert.equal(prompts.length, 3);
  const trustPrompt = prompts.find(prompt => /Only update trust deltas/.test(prompt) || /"trust": 0/.test(prompt));
  const lisaThoughtPrompt = prompts.find(prompt =>
    /Extract updates only for these target owners: Lisa/.test(prompt) && /"lastThought": ""/.test(prompt),
  );
  const candyThoughtPrompt = prompts.find(prompt =>
    /Extract updates only for these target owners: Candy/.test(prompt) && /"lastThought": ""/.test(prompt),
  );
  assert.ok(trustPrompt);
  assert.ok(lisaThoughtPrompt);
  assert.ok(candyThoughtPrompt);
  assert.doesNotMatch(trustPrompt, /lastThought=/);
  assert.match(lisaThoughtPrompt, /Lisa: trust=40, lastThought="Previous private Lisa thought\."/);
  assert.doesNotMatch(lisaThoughtPrompt, /Previous private Candy thought/);
  assert.match(candyThoughtPrompt, /Candy: trust=55, lastThought="Previous private Candy thought\."/);
  assert.doesNotMatch(candyThoughtPrompt, /Previous private Lisa thought/);
  assert.equal(result.statistics.trust.Lisa, 40);
  assert.equal(result.statistics.lastThought.Lisa, "I need to hold my line.");
  assert.equal(result.statistics.lastThought.Candy, "I should stay nearby.");
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

test("extractStatisticsParallel scopeResolution debug uses entity-aware custom non-numeric lookup instead of stale owner buckets", async () => {
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
                value: {
                  clothes: ["oversized flannel shirt", "worn-out jeans", "tank top"],
                },
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
    customNonNumericStatisticsByEntityId: {
      clothes: {
        "bst_narrative:ashley-current": ["oversized flannel shirt", "worn-out jeans", "tank top"],
      },
    },
  });

  const result = await withSillyTavernContext(context, () => extractStatisticsParallel({
    context,
    settings: makeSettings({
      customStats: [({
        id: "clothes",
        label: "Clothes",
        kind: "array",
        defaultValue: [],
        textMaxLength: 80,
        track: true,
        includeInInjection: true,
        showOnCard: true,
        showInGraph: false,
      } as unknown) as BetterSimTrackerSettings["customStats"][number]],
    }),
    userName: "User",
    activeCharacters: ["Ash"],
    contextText: "Ashley lingers near the doorway.",
    previousTrackerData,
    previousStatistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    previousCustomStatistics: {},
    previousCustomStatisticsRaw: {},
    previousCustomNonNumericStatistics: {
      clothes: {
        Ashley: ["worn hoodie", "hoodie pocket"],
      },
    },
    hasPriorTrackerData: true,
    history: [],
  }));

  assert.equal(requestCount, 1);
  assert.deepEqual(result.debug?.meta?.scopeResolution?.current?.clothes?.Ash?.value, [
    "oversized flannel shirt",
    "worn-out jeans",
    "tank top",
  ]);
  assert.equal(result.debug?.meta?.scopeResolution?.current?.clothes?.Ash?.resolvedFrom, "entity_lookup");
});

test("extractStatisticsParallel stops scheduling later stat requests after a fatal request failure", async () => {
  const progressLabels: string[] = [];
  let callCount = 0;
  let cancelCount = 0;
  const context = makeBaseContext(async () => ({ choices: [] }));
  const globalBag = globalThis as any;
  const previousWindow = globalBag.window;
  globalBag.window = globalThis;
  const { extractStatisticsParallel } = loadExtractorWithGeneratorMock({
    generateJson: async (prompt: string) => {
      callCount += 1;
      if (/affection/i.test(prompt)) {
        throw new Error("API request failed");
      }
      await new Promise(resolve => setTimeout(resolve, 10));
      return {
        text: JSON.stringify({
          characters: [
            { name: "Ash", confidence: 1, delta: { trust: 0 } },
          ],
        }),
        meta: {},
      };
    },
    cancelActiveGenerations: () => {
      cancelCount += 1;
      return 1;
    },
  });

  try {
    await assert.rejects(
      withSillyTavernContext(context, () => extractStatisticsParallel({
        context,
        settings: makeSettings({
          trackAffection: true,
          trackTrust: true,
          trackDesire: true,
          maxConcurrentCalls: 2,
        }),
        userName: "User",
        activeCharacters: ["Ash"],
        contextText: "Ashley freezes in the doorway.",
        previousTrackerData: makeTracker(),
        previousStatistics: {
          affection: { Ash: 61 },
          trust: { Ash: 62 },
          desire: { Ash: 63 },
          connection: {},
          mood: {},
          lastThought: {},
        },
        previousCustomStatistics: {},
        previousCustomStatisticsRaw: {},
        previousCustomNonNumericStatistics: {},
        hasPriorTrackerData: true,
        history: [],
        onProgress: (_done, _total, label) => {
          if (label) progressLabels.push(label);
        },
      })),
      /API request failed/,
    );

    assert.equal(cancelCount, 1);
    assert.ok(callCount >= 2);
    assert.equal(progressLabels.some(label => /Requesting Built-in: Desire/i.test(label)), false);
  } finally {
    if (previousWindow === undefined) delete globalBag.window;
    else globalBag.window = previousWindow;
  }
});
