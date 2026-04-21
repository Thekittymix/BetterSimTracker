import test from "node:test";
import assert from "node:assert/strict";

import { defaultSettings } from "../src/settings";
import { buildJsonExtractionShadowRequestForExtractionRun } from "../src/jsonExtractionProtocolRuntimeBridge";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "../src/types";

function makeSettings(): BetterSimTrackerSettings {
  return {
    ...defaultSettings,
    includeCharacterCardsInPrompt: true,
    includeLorebookInExtraction: true,
    entityTrackingMode: "dynamic_characters",
    trackAffection: true,
    trackTrust: true,
    trackDesire: true,
    trackConnection: true,
    trackMood: true,
    trackLastThought: true,
    customStats: [
      {
        id: "pose",
        kind: "text_short",
        label: "Pose",
        defaultValue: "Unknown",
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: false,
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
    characterId: 0,
    characters: [
      {
        name: "Your Family",
        avatar: "family.png",
        description: "Candy, Lisa, Marylyn, and Serena share the same household.",
        personality: "Candy is playful. Lisa is watchful.",
        scenario: "The family remains in the bedroom unless recent messages move them.",
      },
    ],
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
        mes: "Candy sits on the bed while Lisa watches.",
        extra: {},
      },
      {
        is_user: true,
        is_system: false,
        mes: "Candy, answer me first.",
        extra: {},
      },
    ],
  };
}

function makePreviousTracker(): TrackerData {
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
      affection: { Candy: 45, Lisa: 42 },
      trust: { Candy: 45, Lisa: 42 },
      desire: { Candy: 35, Lisa: 30 },
      connection: { Candy: 48, Lisa: 41 },
      mood: { Candy: "Playful", Lisa: "Watching" },
      lastThought: { Candy: "She is trying to help.", Lisa: "She wants to tease him." },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      pose: {
        Candy: "Standing by the bed.",
        Lisa: "Watching from nearby.",
      },
    },
  };
}

test("buildJsonExtractionShadowRequestForExtractionRun derives ai-turn retrack task flags from runtime reason", () => {
  const context = makeContext();
  const request = buildJsonExtractionShadowRequestForExtractionRun({
    context,
    reason: "SWIPE_GENERATION_ENDED",
    messageIndex: 0,
    settings: makeSettings(),
    activeCharacters: ["Candy", "Lisa"],
    entityResolution: makePreviousTracker().entityResolution,
    previousTrackerData: makePreviousTracker(),
    previousStatistics: makePreviousTracker().statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: {},
  });

  assert.equal(request.task.mode, "ai_turn");
  assert.equal(request.task.retrack, true);
  assert.equal(request.task.swipeRetrack, true);
  assert.equal(request.task.includeCharacterCards, true);
  assert.equal(request.task.includeActivatedLorebook, true);
  assert.equal(request.task.entityTrackingMode, "dynamic_characters");
});

test("buildJsonExtractionShadowRequestForExtractionRun derives user-turn mode and non-swipe task flags from runtime reason", () => {
  const context = makeContext();
  const request = buildJsonExtractionShadowRequestForExtractionRun({
    context,
    reason: "USER_MESSAGE_RENDERED",
    messageIndex: 1,
    settings: makeSettings(),
    activeCharacters: ["__bst_user__"],
    previousTrackerData: makePreviousTracker(),
    previousStatistics: makePreviousTracker().statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: {},
  });

  assert.equal(request.task.mode, "user_turn");
  assert.equal(request.task.retrack, true);
  assert.equal(request.task.swipeRetrack, false);
  assert.equal(request.message.isUser, true);
  assert.equal(request.message.speaker, "Kuba");
});

test("buildJsonExtractionShadowRequestForExtractionRun scopes sequential JSON request state and schema to the requested stat", () => {
  const context = makeContext();
  const scopedSettings: BetterSimTrackerSettings = {
    ...makeSettings(),
    trackAffection: false,
    trackTrust: false,
    trackDesire: true,
    trackConnection: false,
    trackMood: false,
    trackLastThought: false,
    customStats: [],
  };

  const request = buildJsonExtractionShadowRequestForExtractionRun({
    context,
    reason: "GENERATION_ENDED",
    messageIndex: 0,
    settings: scopedSettings,
    activeCharacters: ["Candy", "Lisa"],
    entityResolution: makePreviousTracker().entityResolution,
    previousTrackerData: makePreviousTracker(),
    previousStatistics: makePreviousTracker().statistics,
    previousCustomStatistics: makePreviousTracker().customStatistics,
    previousCustomNonNumericStatistics: makePreviousTracker().customNonNumericStatistics,
    responseMode: "stat",
    statId: "desire",
  });

  assert.deepEqual(request.statDefinitions.builtIn.map(stat => stat.id), ["desire"]);
  assert.deepEqual(Object.keys(request.currentState.builtInStats), [
    "affection",
    "trust",
    "desire",
    "connection",
    "mood",
    "lastThought",
  ]);
  assert.deepEqual(request.currentState.builtInStats.affection, {});
  assert.deepEqual(request.currentState.builtInStats.trust, {});
  assert.deepEqual(request.currentState.builtInStats.desire, { Candy: 35, Lisa: 30 });
  assert.deepEqual(request.currentState.builtInStats.connection, {});
  assert.deepEqual(request.currentState.builtInStats.mood, {});
  assert.deepEqual(request.currentState.builtInStats.lastThought, {});
  assert.deepEqual(request.currentState.customNonNumericStats, {});

  const latestSnapshot = request.currentState.latestRelevantSnapshot as {
    statistics: Record<string, unknown>;
    customNonNumericStatistics: Record<string, unknown>;
  };
  assert.deepEqual(latestSnapshot.statistics.affection, {});
  assert.deepEqual(latestSnapshot.statistics.desire, { Candy: 35, Lisa: 30 });
  assert.deepEqual(latestSnapshot.customNonNumericStatistics, {});

  assert.deepEqual(request.outputContract.requiredSections, ["result", "statId", "values"]);
  assert.deepEqual(request.outputContract.responseSchema, {
    protocolVersion: "bst.extract.v1",
    responseType: "stat_extraction_result",
    result: {
      status: "ok",
    },
    statId: "desire",
    values: {
      "Owner display name": "value for this stat only",
    },
  });
});

test("buildJsonExtractionShadowRequestForExtractionRun includes enabled card context in the runtime JSON payload", () => {
  const request = buildJsonExtractionShadowRequestForExtractionRun({
    context: makeContext(),
    reason: "GENERATION_ENDED",
    messageIndex: 0,
    settings: makeSettings(),
    activeCharacters: ["Candy", "Lisa"],
    entityResolution: makePreviousTracker().entityResolution,
    previousTrackerData: makePreviousTracker(),
    previousStatistics: makePreviousTracker().statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: makePreviousTracker().customNonNumericStatistics,
  });

  assert.equal(request.task.includeCharacterCards, true);
  assert.match(request.contextSources.characterCards, /Character Card - Your Family/);
  assert.match(request.contextSources.characterCards, /Candy, Lisa, Marylyn, and Serena share the same household/);
});

test("buildJsonExtractionShadowRequestForExtractionRun omits card context when the runtime setting is disabled", () => {
  const request = buildJsonExtractionShadowRequestForExtractionRun({
    context: makeContext(),
    reason: "GENERATION_ENDED",
    messageIndex: 0,
    settings: {
      ...makeSettings(),
      includeCharacterCardsInPrompt: false,
    },
    activeCharacters: ["Candy", "Lisa"],
    entityResolution: makePreviousTracker().entityResolution,
    previousTrackerData: makePreviousTracker(),
    previousStatistics: makePreviousTracker().statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: makePreviousTracker().customNonNumericStatistics,
  });

  assert.equal(request.task.includeCharacterCards, false);
  assert.equal(request.contextSources.characterCards, "");
});
