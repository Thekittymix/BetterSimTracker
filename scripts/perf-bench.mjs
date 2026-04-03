import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

const {
  buildDiagnosticsDebugDetails,
} = require(path.resolve("C:/Users/admin/BetterSimTracker/.test-dist/src/runtimeDiagnostics.js"));
const {
  getCachedCharacterCardsContext,
  getCachedLorebookContext,
} = require(path.resolve("C:/Users/admin/BetterSimTracker/.test-dist/src/promptContextCache.js"));
const {
  buildRenderPassSnapshot,
  resolveDirtyRenderStart,
  getCachedProjectedTrackerData,
} = require(path.resolve("C:/Users/admin/BetterSimTracker/.test-dist/src/renderQueueHelpers.js"));
const {
  createRenderHistoryLookupCache,
} = require(path.resolve("C:/Users/admin/BetterSimTracker/.test-dist/src/ui.js"));

function bench(label, iterations, run) {
  const startedAt = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    run(index);
  }
  const totalMs = performance.now() - startedAt;
  return {
    label,
    iterations,
    totalMs: Number(totalMs.toFixed(3)),
    avgMs: Number((totalMs / Math.max(iterations, 1)).toFixed(6)),
  };
}

function buildTrackerData(messageIndex, suffix = "") {
  return {
    timestamp: 1_700_000_000_000 + messageIndex,
    activeCharacters: ["Candy"],
    statistics: {
      affection: { Candy: 50 + messageIndex },
      trust: {},
      desire: {},
      connection: {},
      mood: { Candy: suffix ? `Playful ${suffix}` : "Playful" },
      lastThought: { Candy: suffix ? `Thought ${suffix}` : "Thought" },
    },
    statisticsByEntityId: {
      affection: { "bst_narrative:candy": 50 + messageIndex },
      trust: {},
      desire: {},
      connection: {},
      mood: { "bst_narrative:candy": suffix ? `Playful ${suffix}` : "Playful" },
      lastThought: { "bst_narrative:candy": suffix ? `Thought ${suffix}` : "Thought" },
    },
    customStatistics: {},
    customStatisticsByEntityId: {},
    customNonNumericStatistics: {
      clothes: { Candy: ["shirt", "jeans"] },
      pose: { Candy: suffix ? `Pose ${suffix}` : "Pose" },
    },
    customNonNumericStatisticsByEntityId: {
      clothes: { "bst_narrative:candy": ["shirt", "jeans"] },
      pose: { "bst_narrative:candy": suffix ? `Pose ${suffix}` : "Pose" },
    },
    entityOwnerMap: {
      Candy: {
        entityId: "bst_narrative:candy",
        ownerName: "Candy",
        canonicalName: "Candy",
        aliases: [],
        sourceKey: "your family.png|your family",
        kind: "narrative-entity",
      },
    },
  };
}

function main() {
  const diagnosticsResults = {};
  let persistedTraceReads = 0;
  const diagnosticsDebugOff = bench("diagnostics.debugOff", 50_000, () => {
    buildDiagnosticsDebugDetails({
      debugEnabled: false,
      includeGraphInDiagnostics: false,
      currentPrompt: "prompt",
      lastMessageSnapshot: null,
      latestDataMessagePrompt: "latest",
      promptInjectionDebugMeta: { ownerLines: ["Candy"] },
      macroDebugMeta: { scope: "test" },
      baselineDebugMeta: { base: true },
      debugTrace: ["one", "two"],
      readPersistedTrace: () => {
        persistedTraceReads += 1;
        return ["persisted"];
      },
    });
  });
  diagnosticsResults.debugOff = {
    ...diagnosticsDebugOff,
    persistedTraceReads,
  };

  persistedTraceReads = 0;
  const diagnosticsDebugOn = bench("diagnostics.debugOn", 50_000, () => {
    buildDiagnosticsDebugDetails({
      debugEnabled: true,
      includeGraphInDiagnostics: false,
      currentPrompt: "prompt",
      lastMessageSnapshot: { messageIndex: 5, prompt: "prompt", capturedAt: 1, targetIndex: 5, generationType: "normal" },
      latestDataMessagePrompt: "latest",
      promptInjectionDebugMeta: { ownerLines: ["Candy"] },
      macroDebugMeta: { scope: "test" },
      baselineDebugMeta: { base: true },
      debugTrace: ["one", "two", "three"],
      readPersistedTrace: () => {
        persistedTraceReads += 1;
        return ["persisted"];
      },
    });
  });
  diagnosticsResults.debugOn = {
    ...diagnosticsDebugOn,
    persistedTraceReads,
  };

  const context = {
    characters: [{ name: "Candy" }],
    chatMetadata: { bstLorebookActivatedEntries: ["one"] },
    worldInfo: { id: 1 },
    world_info: { id: 1 },
    lorebook: { id: 1 },
  };
  let characterCardBuilds = 0;
  let lorebookBuilds = 0;
  const promptContextResults = {
    characterCardsRepeated: bench("promptContext.characterCardsRepeated", 50_000, () => {
      getCachedCharacterCardsContext(context, {
        activeCharacters: ["Candy", "Lisa"],
        activeEntityIds: ["bst_narrative:candy", "bst_narrative:lisa"],
        entityTrackingMode: "dynamic_characters",
        preferredCharacterName: "Candy",
        build: () => {
          characterCardBuilds += 1;
          return "cards";
        },
      });
    }),
    characterCardBuilds,
    lorebookRepeated: bench("promptContext.lorebookRepeated", 50_000, () => {
      getCachedLorebookContext(context, {
        maxChars: 1200,
        maxCap: 8000,
        build: () => {
          lorebookBuilds += 1;
          return "lore";
        },
      });
    }),
    lorebookBuilds,
  };

  const settings = {
    entityTrackingMode: "dynamic_characters",
  };
  const uiState = { phase: "idle", done: 0, total: 0, messageIndex: null };
  const baseEntries = [
    { messageIndex: 10, data: buildTrackerData(10) },
    { messageIndex: 11, data: buildTrackerData(11) },
    { messageIndex: 12, data: buildTrackerData(12) },
  ];
  const previousSnapshot = buildRenderPassSnapshot(baseEntries, {
    settings,
    allCharacters: ["Candy", "Lisa"],
    isGroupChat: false,
    uiState,
    summaryBusyMessageIndices: new Set(),
    isUserMessageIndex: messageIndex => messageIndex % 2 === 1,
  });
  const changedSnapshot = buildRenderPassSnapshot([
    baseEntries[0],
    { messageIndex: 11, data: buildTrackerData(11, "changed") },
    baseEntries[2],
  ], {
    settings,
    allCharacters: ["Candy", "Lisa"],
    isGroupChat: false,
    uiState,
    summaryBusyMessageIndices: new Set([11]),
    isUserMessageIndex: messageIndex => messageIndex % 2 === 1,
  });
  const renderPassResults = {
    unchanged: bench("renderPass.unchanged", 100_000, () => {
      resolveDirtyRenderStart(previousSnapshot, previousSnapshot);
    }),
    changed: bench("renderPass.changed", 100_000, () => {
      resolveDirtyRenderStart(previousSnapshot, changedSnapshot);
    }),
  };

  const projectedCache = new Map();
  let projectedBuilds = 0;
  const stableMessageRef = { mesid: 12 };
  const projectionResults = {
    repeated: bench("projectionCache.repeated", 100_000, () => {
      getCachedProjectedTrackerData(projectedCache, {
        messageIndex: 12,
        messageRef: stableMessageRef,
        rawData: baseEntries[2].data,
        entityTrackingMode: "dynamic_characters",
        build: () => {
          projectedBuilds += 1;
          return baseEntries[2].data;
        },
      });
    }),
    projectedBuilds,
  };

  let historyResolverCalls = 0;
  const historyLookup = createRenderHistoryLookupCache(
    baseEntries,
    {
      resolveLookupNamesForOwnerInData: (_data, ownerName) => {
        historyResolverCalls += 1;
        return [ownerName];
      },
      isNumericGlobalScope: () => false,
    },
  );
  const poseDef = {
    id: "pose",
    label: "Pose",
    kind: "text",
    defaultValue: "",
    enumOptions: [],
    booleanTrueLabel: "yes",
    booleanFalseLabel: "no",
    textMaxLength: 200,
    dateTimeMode: "timestamp",
    trackCharacters: true,
    trackUser: false,
    globalScope: false,
    showOnCard: true,
    includeInInjection: true,
    color: "",
  };
  const historyResults = {
    numericRepeated: bench("historyLookup.numericRepeated", 100_000, () => {
      historyLookup.findPreviousDataWithNumericStat(12, "affection", "Candy");
    }),
    nonNumericRepeated: bench("historyLookup.nonNumericRepeated", 100_000, () => {
      historyLookup.findPreviousDataWithNonNumericStat(12, poseDef, "Candy");
    }),
    historyResolverCalls,
  };

  const results = {
    diagnostics: diagnosticsResults,
    promptContext: promptContextResults,
    renderPass: renderPassResults,
    projectionCache: projectionResults,
    historyLookup: historyResults,
  };

  console.log(JSON.stringify(results, null, 2));
}

main();
