import test from "node:test";
import assert from "node:assert/strict";

import {
  buildJsonExtractionShadowDebug,
  buildJsonExtractionShadowExpectedTrackerData,
} from "../src/jsonExtractionProtocolDebug";
import { defaultSettings } from "../src/settings";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "../src/types";

function makeSettings(): BetterSimTrackerSettings {
  return {
    ...defaultSettings,
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
        entities: {
          "bst_narrative:candy": {
            id: "bst_narrative:candy",
            ownerName: "Candy",
            canonicalName: "Candy",
            aliases: [],
            sourceName: "Your Family",
            sourceAvatar: "family.png",
            sourceKey: "family.png|your family",
            kind: "narrative-entity",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 0,
            lastActiveMessageIndex: 0,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
          },
        },
        ownerToEntityId: {
          candy: "bst_narrative:candy",
        },
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
      {
        is_user: true,
        is_system: false,
        mes: "Candy, answer me first.",
        extra: {},
      },
    ],
  };
}

function makeExpectedTracker(): TrackerData {
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
        {
          entityId: "bst_owner:lisa",
          kind: "st-character",
          name: "Lisa",
          aliases: [],
          inScene: true,
          inMessage: false,
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

test("buildJsonExtractionShadowDebug captures request-built shadow data for a real extraction run shape", () => {
  const debug = buildJsonExtractionShadowDebug({
    context: makeContext(),
    reason: "GENERATION_ENDED",
    messageIndex: 0,
    settings: makeSettings(),
    activeCharacters: ["Candy", "Lisa"],
    entityResolution: makeExpectedTracker().entityResolution,
    previousTrackerData: makeExpectedTracker(),
    previousStatistics: makeExpectedTracker().statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: makeExpectedTracker().customNonNumericStatistics,
  });

  assert.equal(debug.status, "request_built");
  assert.equal(debug.protocolVersion, "bst.extract.v1");
  assert.equal(debug.task?.mode, "ai_turn");
  assert.equal(debug.task?.retrack, false);
  assert.match(debug.requestText ?? "", /"requestType": "tracker_extraction"/);
});

test("buildJsonExtractionShadowExpectedTrackerData preserves extracted tracker fields for parity input", () => {
  const expected = buildJsonExtractionShadowExpectedTrackerData({
    timestamp: 123,
    activeCharacters: ["Candy", "Lisa"],
    entityResolution: makeExpectedTracker().entityResolution,
    statistics: makeExpectedTracker().statistics,
    customStatistics: {},
    customNonNumericStatistics: makeExpectedTracker().customNonNumericStatistics,
  });

  assert.deepEqual(expected.activeCharacters, ["Candy", "Lisa"]);
  assert.equal(expected.timestamp, 123);
  assert.deepEqual(expected.customNonNumericStatistics?.clothes?.Candy, ["t-shirt", "panties"]);
});

test("buildJsonExtractionShadowDebug reports parity_ok for matching JSON response", () => {
  const expected = makeExpectedTracker();
  const debug = buildJsonExtractionShadowDebug({
    context: makeContext(),
    reason: "manual_refresh",
    messageIndex: 0,
    settings: makeSettings(),
    activeCharacters: ["Candy", "Lisa"],
    entityResolution: expected.entityResolution,
    previousTrackerData: expected,
    previousStatistics: expected.statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: expected.customNonNumericStatistics,
    expectedTrackerData: expected,
    responseMeta: {
      profileId: "shadow",
      promptChars: 100,
      maxTokens: 200,
      durationMs: 321,
      outputChars: 456,
      timestamp: 789,
    },
    rawJsonResponse: JSON.stringify({
      protocolVersion: "bst.extract.v1",
      responseType: "tracker_extraction_result",
      result: { status: "ok" },
      entityResolution: {
        sceneOwners: ["Candy", "Lisa"],
        messageOwners: ["Candy"],
        resolvedEntities: [
          {
            entityId: "bst_narrative:candy",
            ownerName: "Candy",
            kind: "narrative-entity",
            aliases: [],
            inScene: true,
            inMessage: true,
          },
          {
            entityId: "bst_owner:lisa",
            ownerName: "Lisa",
            kind: "st-character",
            aliases: [],
            inScene: true,
            inMessage: false,
          },
        ],
      },
      builtInStats: {
        affection: { Candy: 61 },
        trust: {},
        desire: {},
        connection: {},
        mood: { Candy: "Playful" },
        lastThought: { Candy: "Still teasing him." },
      },
      customStats: {},
      customNonNumericStats: {
        clothes: { Candy: ["t-shirt", "panties"] },
      },
    }),
  });

  assert.equal(debug.status, "parity_ok");
  assert.equal(debug.task?.retrack, true);
  assert.equal(debug.responseMeta?.profileId, "shadow");
  assert.match(debug.responseText ?? "", /"tracker_extraction_result"/);
});

test("buildJsonExtractionShadowDebug reports response_invalid for malformed JSON response", () => {
  const debug = buildJsonExtractionShadowDebug({
    context: makeContext(),
    reason: "GENERATION_ENDED",
    messageIndex: 0,
    settings: makeSettings(),
    activeCharacters: ["Candy", "Lisa"],
    previousTrackerData: makeExpectedTracker(),
    previousStatistics: makeExpectedTracker().statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: makeExpectedTracker().customNonNumericStatistics,
    expectedTrackerData: makeExpectedTracker(),
    rawJsonResponse: "not json",
  });

  assert.equal(debug.status, "response_invalid");
  assert.ok((debug.validationErrors?.length ?? 0) > 0);
});

test("buildJsonExtractionShadowDebug reports transport_error without changing main extraction state", () => {
  const debug = buildJsonExtractionShadowDebug({
    context: makeContext(),
    reason: "GENERATION_ENDED",
    messageIndex: 0,
    settings: makeSettings(),
    activeCharacters: ["Candy", "Lisa"],
    previousTrackerData: makeExpectedTracker(),
    previousStatistics: makeExpectedTracker().statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: makeExpectedTracker().customNonNumericStatistics,
    expectedTrackerData: makeExpectedTracker(),
    transportError: new Error("shadow transport failed"),
  });

  assert.equal(debug.status, "transport_error");
  assert.match(debug.transportError ?? "", /shadow transport failed/);
});
