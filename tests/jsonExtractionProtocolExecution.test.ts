import test from "node:test";
import assert from "node:assert/strict";

import { prepareJsonExtractionProtocolRequest, executeJsonExtractionProtocol } from "../src/jsonExtractionProtocolExecution";
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

test("prepareJsonExtractionProtocolRequest builds transport text for a real extraction run", () => {
  const prepared = prepareJsonExtractionProtocolRequest({
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

  assert.equal(prepared.request.task.mode, "ai_turn");
  assert.equal(prepared.request.task.retrack, false);
  assert.match(prepared.requestText, /"protocolVersion": "bst\.extract\.v1"/);
});

test("executeJsonExtractionProtocol materializes tracker data and parity for matching JSON response", () => {
  const expected = makeExpectedTracker();
  const result = executeJsonExtractionProtocol({
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

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.parity?.ok, true);
  assert.equal(result.trackerData.statistics.mood.Candy, "Playful");
});

test("executeJsonExtractionProtocol returns request context together with parse errors", () => {
  const result = executeJsonExtractionProtocol({
    context: makeContext(),
    reason: "GENERATION_ENDED",
    messageIndex: 0,
    settings: makeSettings(),
    activeCharacters: ["Candy", "Lisa"],
    previousTrackerData: makeExpectedTracker(),
    previousStatistics: makeExpectedTracker().statistics,
    previousCustomStatistics: {},
    previousCustomNonNumericStatistics: makeExpectedTracker().customNonNumericStatistics,
    rawJsonResponse: "not json",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.requestText, /"requestType": "tracker_extraction"/);
  assert.ok(result.errors.length > 0);
});
