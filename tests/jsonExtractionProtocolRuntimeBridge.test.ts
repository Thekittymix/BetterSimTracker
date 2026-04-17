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
