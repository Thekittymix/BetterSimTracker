import test from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import {
  buildDiagnosticsDebugDetails,
  buildDiagnosticsReport,
  buildHistorySample,
  filterDebugRecordForDiagnostics,
  filterDiagnosticsTrace,
} from "../src/runtimeDiagnostics";
import type { BetterSimTrackerSettings, DeltaDebugRecord, STContext, TrackerData } from "../src/types";

function makeTracker(timestamp: number): TrackerData {
  return {
    timestamp,
    activeCharacters: ["Seraphina"],
    entityResolution: buildEntityResolution({
      resolvedEntities: [
        {
          entityId: "bst_owner:seraphina.png|seraphina",
          kind: "st-character",
          name: "Seraphina",
          avatar: null,
          inScene: true,
          inMessage: true,
          created: false,
        },
      ],
      source: "model",
    }),
    statistics: {
      affection: { Seraphina: 55 },
      trust: { Seraphina: 52 },
      desire: { Seraphina: 30 },
      connection: { Seraphina: 60 },
      mood: { Seraphina: "Hopeful" },
      lastThought: { Seraphina: "Sample thought" },
    },
    customStatistics: { satisfaction: { Seraphina: 70 } },
    customNonNumericStatistics: { clothes: { Seraphina: ["dress"] } },
  };
}

function makeSettings(): BetterSimTrackerSettings {
  return {
    enabled: true,
    debug: true,
    includeContextInDiagnostics: false,
    includeGraphInDiagnostics: false,
    injectTrackerIntoPrompt: true,
    injectPromptDepth: 0,
    injectionPromptMaxChars: 6000,
    summarizationNoteVisibleForAI: false,
    injectSummarizationNote: false,
    contextMessages: 10,
    maxConcurrentCalls: 2,
    maxDeltaPerTurn: 10,
    maxTokensOverride: 0,
    truncationLengthOverride: 0,
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: true,
    useInternalLorebookScanFallback: true,
    lorebookExtractionMaxChars: 1200,
    autoDetectActive: true,
    activityLookback: 5,
    moodSource: "bst_images",
    moodExpressionMap: {
      Happy: "joy",
      Sad: "sadness",
      Angry: "anger",
      Excited: "excitement",
      Confused: "confusion",
      "In Love": "love",
      Shy: "nervousness",
      Playful: "amusement",
      Serious: "neutral",
      Lonely: "grief",
      Hopeful: "optimism",
      Anxious: "nervousness",
      Content: "relief",
      Frustrated: "annoyance",
      Neutral: "neutral",
    },
    moodSymbolMap: {
      Happy: "😄",
      Neutral: "😶",
    },
    stExpressionImageZoom: 1.2,
    stExpressionImagePositionX: 50,
    stExpressionImagePositionY: 20,
    strictJsonRepair: true,
    maxRetriesPerStat: 2,
    lastThoughtPrivate: false,
    trackAffection: true,
    trackTrust: true,
    trackDesire: true,
    trackConnection: true,
    trackMood: true,
    trackLastThought: true,
    enableUserTracking: true,
    userTrackMood: true,
    userTrackLastThought: true,
    includeUserTrackerInInjection: true,
    showLastThought: true,
    showInactive: true,
    inactiveLabel: "Inactive",
    builtInNumericStatUi: {},
    customStats: [],
    characterDefaults: {},
    promptTemplateUnified: "",
    promptTemplateSequentialAffection: "",
    promptTemplateSequentialTrust: "",
    promptTemplateSequentialDesire: "",
    promptTemplateSequentialConnection: "",
    promptTemplateSequentialCustomNumeric: "",
    promptTemplateSequentialCustomNonNumeric: "",
    promptTemplateSequentialMood: "",
    promptTemplateSequentialLastThought: "",
    promptTemplateInjection: "",
    unlockProtocolPrompts: false,
    promptProtocolUnified: "",
    promptProtocolSequentialAffection: "",
    promptProtocolSequentialTrust: "",
    promptProtocolSequentialDesire: "",
    promptProtocolSequentialConnection: "",
    promptProtocolSequentialCustomNumeric: "",
    promptProtocolSequentialCustomNonNumeric: "",
    promptProtocolSequentialMood: "",
    promptProtocolSequentialLastThought: "",
    connectionProfile: "",
    confidenceDampening: 0.5,
    moodStickiness: 0.4,
    maxDeltaPerTurnEnabled: true,
    sequentialExtraction: false,
    strictJsonMode: false,
    strictJsonRepairEnabled: true,
    maxRetriesPerStatEnabled: true,
    debugFlags: {
      extraction: true,
      prompts: true,
      ui: true,
      moodImages: true,
      storage: true,
    },
    accentColor: "#69f0ae",
    userCardColor: "#355c7d",
    cardOpacity: 0.92,
    borderRadius: 16,
    fontSize: 15,
    defaultAffection: 50,
    defaultTrust: 50,
    defaultDesire: 50,
    defaultConnection: 50,
    defaultMood: "Neutral",
    sceneCardEnabled: true,
    sceneCardPosition: "above_tracker_cards",
    sceneCardLayout: "chips",
    sceneCardShowWhenEmpty: true,
    sceneCardTitle: "Scene",
    sceneCardColor: "#2d2250",
    sceneCardValueColor: "#d4dcff",
    sceneCardStatOrder: [],
    sceneCardStatDisplay: {},
    sceneCardArrayCollapsedLimit: 4,
  } as unknown as BetterSimTrackerSettings;
}

test("filterDiagnosticsTrace removes graph-open lines when graph diagnostics are disabled", () => {
  const lines = [
    "2026-01-01 graph.open {...}",
    "2026-01-01 extract.start {...}",
  ];
  assert.deepEqual(filterDiagnosticsTrace(lines, false), ["2026-01-01 extract.start {...}"]);
  assert.deepEqual(filterDiagnosticsTrace(lines, true), lines);
});

test("buildHistorySample keeps tracked snapshot structure", () => {
  const sample = buildHistorySample([{ messageIndex: 4, timestamp: 1234, data: makeTracker(1234) }]);
  assert.equal(sample.length, 1);
  assert.equal(sample[0].messageIndex, 4);
  assert.equal(sample[0].statistics.mood.Seraphina, "Hopeful");
});

test("buildHistorySample prefers resolver-backed activeCharacters over stale non-user explicit arrays", () => {
  const tracker = makeTracker(1234);
  tracker.activeCharacters = ["Garret"];
  tracker.entityResolution = buildEntityResolution({
    resolvedEntities: [
      {
        entityId: "ent-blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
    ],
    source: "model",
  });

  const sample = buildHistorySample([{ messageIndex: 4, timestamp: 1234, data: tracker }]);

  assert.deepEqual(sample[0].activeCharacters, ["Blake"]);
});

test("filterDebugRecordForDiagnostics strips graph entries from trace", () => {
  const record: DeltaDebugRecord = {
    rawModelOutput: "{}",
    parsed: {
      confidence: {},
      deltas: { affection: {}, trust: {}, desire: {}, connection: {}, custom: {}, customNonNumeric: {} },
      mood: {},
      lastThought: {},
    },
    applied: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
      customStatistics: {},
      customNonNumericStatistics: {},
    },
    meta: {
      promptChars: 0,
      contextChars: 0,
      historySnapshots: 0,
      activeCharacters: [],
      statsRequested: [],
      attempts: 1,
      extractionMode: "unified",
      retryUsed: false,
      firstParseHadValues: true,
      rawLength: 0,
      parsedCounts: {
        confidence: 0,
        affection: 0,
        trust: 0,
        desire: 0,
        connection: 0,
        mood: 0,
        lastThought: 0,
        customByStat: {},
        customNonNumericByStat: {},
      },
      appliedCounts: {
        affection: 0,
        trust: 0,
        desire: 0,
        connection: 0,
        mood: 0,
        lastThought: 0,
        customByStat: {},
        customNonNumericByStat: {},
      },
      moodFallbackApplied: [],
      requests: [],
    },
    trace: ["x graph.open y", "x extract.start y"],
  };
  const filtered = filterDebugRecordForDiagnostics(record, false);
  assert.deepEqual(filtered?.trace, ["x extract.start y"]);
});

test("buildDiagnosticsDebugDetails skips persisted trace reads and debug-only payloads when debug is off", () => {
  let persistedReads = 0;

  const details = buildDiagnosticsDebugDetails({
    debugEnabled: false,
    includeGraphInDiagnostics: false,
    currentPrompt: "preview",
    lastMessageSnapshot: {
      messageIndex: 2,
      prompt: "<bst_inject_block>...</bst_inject_block>",
      capturedAt: 1772800000000,
      targetIndex: 2,
      generationType: "normal",
    },
    latestDataMessagePrompt: "<bst_inject_block>...</bst_inject_block>",
    promptInjectionDebugMeta: { targetOwner: "Seraphina" },
    macroDebugMeta: { characterTargets: [{ ownerName: "Seraphina" }] },
    baselineDebugMeta: { baselineBeforeIndex: 4 },
    debugTrace: ["memory-trace"],
    readPersistedTrace: () => {
      persistedReads += 1;
      return ["persisted-trace"];
    },
  });

  assert.equal(persistedReads, 0);
  assert.equal(details.promptInjectionPreview, undefined);
  assert.equal(details.promptInjectionCurrentPrompt, undefined);
  assert.equal(details.promptInjectionLastMessage, null);
  assert.equal(details.promptInjectionPreviousMessage, null);
  assert.equal(details.promptInjectionLatestDataMessage, null);
  assert.equal(details.promptInjectionDebugMeta, null);
  assert.equal(details.macroDebugMeta, null);
  assert.equal(details.baselineDebugMeta, null);
  assert.deepEqual(details.traceTailMemory, []);
  assert.deepEqual(details.traceTailPersisted, []);
});

test("buildDiagnosticsDebugDetails preserves trace and prompt debug details when debug is on", () => {
  let persistedReads = 0;

  const details = buildDiagnosticsDebugDetails({
    debugEnabled: true,
    includeGraphInDiagnostics: false,
    currentPrompt: "preview",
    lastMessageSnapshot: {
      messageIndex: 2,
      prompt: "<bst_inject_block>...</bst_inject_block>",
      capturedAt: 1772800000000,
      targetIndex: 2,
      generationType: "normal",
    },
    latestDataMessagePrompt: "<bst_inject_block>...</bst_inject_block>",
    promptInjectionDebugMeta: { targetOwner: "Seraphina" },
    macroDebugMeta: { characterTargets: [{ ownerName: "Seraphina" }] },
    baselineDebugMeta: { baselineBeforeIndex: 4 },
    debugTrace: ["2026 graph.open x", "2026 extract.start y"],
    readPersistedTrace: () => {
      persistedReads += 1;
      return ["2026 graph.open persisted", "2026 extract.persisted"];
    },
  });

  assert.equal(persistedReads, 1);
  assert.equal(details.promptInjectionPreview, "preview");
  assert.equal(details.promptInjectionCurrentPrompt, "preview");
  assert.equal(details.promptInjectionLastMessage?.messageIndex, 2);
  assert.equal(details.promptInjectionPreviousMessage?.messageIndex, 2);
  assert.equal(details.promptInjectionLatestDataMessage, "<bst_inject_block>...</bst_inject_block>");
  assert.deepEqual(details.promptInjectionDebugMeta, { targetOwner: "Seraphina" });
  assert.deepEqual(details.traceTailMemory, ["2026 extract.start y"]);
  assert.deepEqual(details.traceTailPersisted, ["2026 extract.persisted"]);
});

test("buildDiagnosticsReport produces expected core fields", () => {
  const context = {
    chat: [{}, {}],
    groupId: null,
    characterId: "1",
  } as unknown as STContext;
  const report = buildDiagnosticsReport({
    context,
    settings: makeSettings(),
    extensionVersion: "2.2.3.10-dev23",
    isExtracting: false,
    runSequence: 12,
    trackerUiState: { phase: "idle", done: 0, total: 0, messageIndex: null },
    latestDataMessageIndex: 2,
    latestDataTimestamp: 123456,
    allCharacterNames: ["Seraphina"],
    settingsProvenance: { enabled: "context" },
    graphPreferences: { window: "all", smoothing: true },
    profileDebug: { selectedProfile: "", resolvedProfileId: null, activeProfileId: null },
    historySample: buildHistorySample([{ messageIndex: 2, timestamp: 123456, data: makeTracker(123456) }]),
    activity: null,
    latestData: makeTracker(123456),
    latestPromptMacroData: makeTracker(123456),
    promptInjectionPreview: "preview",
    promptInjectionCurrentPrompt: "preview",
    promptInjectionLastMessage: {
      messageIndex: 2,
      prompt: "<bst_inject_block>...</bst_inject_block>",
      capturedAt: 1772800000000,
      targetIndex: 2,
      generationType: "normal",
    },
    promptInjectionPreviousMessage: {
      messageIndex: 2,
      prompt: "<bst_inject_block>...</bst_inject_block>",
      capturedAt: 1772800000000,
      targetIndex: 2,
      generationType: "normal",
    },
    promptInjectionLatestDataMessage: "<bst_inject_block>...</bst_inject_block>",
    promptInjectionDebugMeta: { targetOwner: "Seraphina" },
    macroDebugMeta: { characterTargets: [{ ownerName: "Seraphina", macroSlug: "seraphina" }] },
    baselineDebugMeta: { baselineBeforeIndex: 4, previousEntryMessageIndex: 3, currentMessageWasUsedAsBaseline: false },
    traceTailMemory: ["a"],
    traceTailPersisted: ["b"],
    debugRecord: null,
  });
  assert.equal(report.scope, "char:1");
  assert.equal(report.chatLength, 2);
  assert.equal(report.extensionVersion, "2.2.3.10-dev23");
  assert.equal(
    (report.promptInjectionLastMessage as { messageIndex: number }).messageIndex,
    2,
  );
  assert.equal(
    report.promptInjectionLatestDataMessage,
    "<bst_inject_block>...</bst_inject_block>",
  );
  assert.equal(report.promptInjectionCurrentPrompt, "preview");
  assert.equal(
    (report.promptInjection as { latestDataMessageIndex: number }).latestDataMessageIndex,
    2,
  );
  assert.deepEqual(
    ((report.promptInjection as { latestStoredTrackerData: { entityResolution: unknown } }).latestStoredTrackerData.entityResolution),
    buildEntityResolution({
      resolvedEntities: [
        {
          entityId: "bst_owner:seraphina.png|seraphina",
          kind: "st-character",
          name: "Seraphina",
          avatar: null,
          inScene: true,
          inMessage: true,
          created: false,
        },
      ],
      source: "model",
    }),
  );
  assert.equal(
    (report.promptInjection as { currentPromptMatchesLatestDataMessage: boolean }).currentPromptMatchesLatestDataMessage,
    false,
  );
  assert.deepEqual(
    (report.promptInjection as { baseline: Record<string, unknown> }).baseline,
    { baselineBeforeIndex: 4, previousEntryMessageIndex: 3, currentMessageWasUsedAsBaseline: false },
  );
  assert.deepEqual(
    report.lorebook,
    {
      source: "none",
      promptChars: 0,
      includeLorebookInExtraction: true,
      useInternalLorebookScanFallback: true,
      usedCachedActivatedLorebookEntries: false,
      cachedActivatedLorebookEntryCount: 0,
    },
  );
});

test("buildDiagnosticsReport prefers resolver-backed activeCharacters in tracker summaries", () => {
  const context = {
    chat: [{}, {}],
    groupId: null,
    characterId: "1",
  } as unknown as STContext;
  const tracker = makeTracker(123456);
  tracker.activeCharacters = ["Garret"];
  tracker.entityResolution = buildEntityResolution({
    resolvedEntities: [
      {
        entityId: "ent-blake",
        kind: "st-character",
        name: "Blake",
        avatar: null,
        inScene: true,
        inMessage: true,
      },
    ],
    source: "model",
  });

  const report = buildDiagnosticsReport({
    context,
    settings: makeSettings(),
    extensionVersion: "2.2.4.16-expX",
    isExtracting: false,
    runSequence: 1,
    trackerUiState: { phase: "idle", done: 0, total: 0, messageIndex: null },
    latestDataMessageIndex: 2,
    latestDataTimestamp: 123456,
    allCharacterNames: ["Seraphina"],
    settingsProvenance: { enabled: "context" },
    graphPreferences: { window: "all", smoothing: true },
    profileDebug: { selectedProfile: "", resolvedProfileId: null, activeProfileId: null },
    historySample: buildHistorySample([{ messageIndex: 2, timestamp: 123456, data: tracker }]),
    activity: null,
    latestData: tracker,
    latestPromptMacroData: tracker,
    promptInjectionPreview: "preview",
    promptInjectionCurrentPrompt: "preview",
    promptInjectionLastMessage: null,
    promptInjectionPreviousMessage: null,
    promptInjectionLatestDataMessage: null,
    promptInjectionDebugMeta: null,
    macroDebugMeta: null,
    baselineDebugMeta: null,
    traceTailMemory: [],
    traceTailPersisted: [],
    debugRecord: null,
  });

  assert.deepEqual(
    ((report.promptInjection as { latestStoredTrackerData: { activeCharacters: string[] } }).latestStoredTrackerData.activeCharacters),
    ["Blake"],
  );
});

test("buildDiagnosticsReport includes entity registry lifecycle summary", () => {
  const context = {
    chat: [{}, {}],
    groupId: null,
    characterId: "1",
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "ent-ashley": {
            id: "ent-ashley",
            ownerName: "Ashley",
            canonicalName: "Ashley",
            kind: "multi_character_alias",
            lifecycleState: "archived",
            introducedAtMessageIndex: 3,
            lastActiveMessageIndex: 7,
            archivedAtMessageIndex: 9,
          },
        },
      },
    },
  } as unknown as STContext;

  const report = buildDiagnosticsReport({
    context,
    settings: makeSettings(),
    extensionVersion: "2.2.4.16-expX",
    isExtracting: false,
    runSequence: 1,
    trackerUiState: { phase: "idle", done: 0, total: 0, messageIndex: null },
    latestDataMessageIndex: 2,
    latestDataTimestamp: 123456,
    allCharacterNames: ["Ashley"],
    settingsProvenance: { enabled: "context" },
    graphPreferences: { window: "all", smoothing: true },
    profileDebug: { selectedProfile: "", resolvedProfileId: null, activeProfileId: null },
    historySample: buildHistorySample([{ messageIndex: 2, timestamp: 123456, data: makeTracker(123456) }]),
    activity: null,
    latestData: makeTracker(123456),
    latestPromptMacroData: makeTracker(123456),
    promptInjectionPreview: "preview",
    promptInjectionCurrentPrompt: "preview",
    promptInjectionLastMessage: null,
    promptInjectionPreviousMessage: null,
    promptInjectionLatestDataMessage: null,
    promptInjectionDebugMeta: null,
    macroDebugMeta: null,
    baselineDebugMeta: null,
    traceTailMemory: [],
    traceTailPersisted: [],
    debugRecord: null,
  });

  assert.deepEqual(report.entityRegistry, [{
    id: "ent-ashley",
    ownerName: "Ashley",
    canonicalName: "Ashley",
    kind: "multi_character_alias",
    lifecycleState: "archived",
    introducedAtMessageIndex: 3,
    lastActiveMessageIndex: 7,
    archivedAtMessageIndex: 9,
  }]);
});
