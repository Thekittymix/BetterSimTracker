import test from "node:test";
import assert from "node:assert/strict";

import { defaultSettings } from "../src/settings";
import { buildJsonExtractionShadowRequest, runJsonExtractionShadowParity } from "../src/jsonExtractionProtocolShadow";
import type { BetterSimTrackerSettings, TrackerData } from "../src/types";

function makeSettings(): BetterSimTrackerSettings {
  return {
    ...defaultSettings,
    includeCharacterCardsInPrompt: true,
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

function makeExpectedTracker(): TrackerData {
  return {
    timestamp: 123,
    activeCharacters: ["Candy", "Lisa", "Marylyn", "Serena"],
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
          entityId: "bst_narrative:lisa",
          kind: "narrative-entity",
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

test("buildJsonExtractionShadowRequest builds a real extractor-shaped request with current state and recent history", () => {
  const request = buildJsonExtractionShadowRequest({
    settings: makeSettings(),
    task: {
      mode: "ai_turn",
      messageIndex: 4,
      retrack: true,
      swipeRetrack: false,
      entityTrackingMode: "dynamic_characters",
      includeCharacterCards: true,
      includeActivatedLorebook: false,
    },
    message: {
      speaker: "Your Family",
      isUser: false,
      isSystem: false,
      text: "Candy replies while the others watch.",
    },
    activeCharacters: ["Candy", "Lisa", "Marylyn", "Serena"],
    entityResolution: {
      source: "model",
      resolvedEntities: [],
    },
    previousTrackerData: makeExpectedTracker(),
    previousStatistics: makeExpectedTracker().statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: makeExpectedTracker().customNonNumericStatistics,
    recentHistory: [
      {
        messageIndex: 3,
        speaker: "Kuba",
        isUser: true,
        isSystem: false,
        text: "Candy, answer first. The others stay here.",
        trackerSnapshot: {
          activeOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
          sceneOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
          messageOwners: [],
          entityResolution: {},
        },
      },
    ],
    entityContext: {
      candidateOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
      candidateEntities: [
        {
          entityId: "bst_narrative:candy",
          ownerName: "Candy",
          kind: "narrative-entity",
          aliases: [],
        },
      ],
      currentEntityOwnerMap: {},
    },
  });

  assert.equal(request.task.retrack, true);
  assert.equal(request.recentHistory[0]?.messageIndex, 3);
  assert.deepEqual(request.currentState.customNonNumericStats, makeExpectedTracker().customNonNumericStatistics);
});

test("runJsonExtractionShadowParity reports parity success for equivalent expected and JSON-derived tracker outputs", () => {
  const expected = makeExpectedTracker();
  const rawResponse = JSON.stringify({
    protocolVersion: "bst.extract.v1",
    responseType: "tracker_extraction_result",
    result: { status: "ok" },
    entityResolution: {
      sceneOwners: ["Candy", "Lisa", "Marylyn", "Serena"],
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
          entityId: "bst_narrative:lisa",
          ownerName: "Lisa",
          kind: "narrative-entity",
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
  });

  const result = runJsonExtractionShadowParity({
    settings: makeSettings(),
    rawResponse,
    expectedTrackerData: expected,
    timestamp: 123,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.parity.ok, true);
});

test("runJsonExtractionShadowParity reports mismatch when the JSON path collapses broad scene continuity", () => {
  const expected = makeExpectedTracker();
  const rawResponse = JSON.stringify({
    protocolVersion: "bst.extract.v1",
    responseType: "tracker_extraction_result",
    result: { status: "ok" },
    entityResolution: {
      sceneOwners: ["Candy"],
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
  });

  const result = runJsonExtractionShadowParity({
    settings: makeSettings(),
    rawResponse,
    expectedTrackerData: expected,
    timestamp: 123,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.parity.ok, false);
  assert.equal(result.parity.mismatches[0]?.path, "activeCharacters");
});
