import test from "node:test";
import assert from "node:assert/strict";

import { GLOBAL_TRACKER_KEY, USER_TRACKER_KEY } from "../src/constants";
import { materializeTrackerDataFromJsonExtractionResponseV1, materializeTrackerDataFromJsonExtractionStatResponseV1 } from "../src/jsonExtractionProtocolAdapter";
import { resolveScopedCustomNonNumericValue } from "../src/promptInjectionHelpers";
import type { JsonExtractionResponseV1, JsonExtractionStatResponseV1 } from "../src/jsonExtractionProtocol";
import type { CustomStatDefinition } from "../src/types";

function makeResponse(): JsonExtractionResponseV1 {
  return {
    protocolVersion: "bst.extract.v1",
    responseType: "tracker_extraction_result",
    result: {
      status: "ok",
    },
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
      affection: {
        Candy: 61,
      },
      mood: {
        Candy: "Playful",
      },
      lastThought: {
        Candy: "I want to keep teasing him.",
      },
    },
    customStats: {
      stress: {
        Candy: 44,
      },
      scene_score: {
        Candy: 77,
      },
    },
    customNonNumericStats: {
      clothes: {
        Candy: ["t-shirt", "panties"],
      },
      pose: {
        Candy: "sitting on the couch and grinning at Kuba",
      },
    },
  };
}

const customStatDefinitions: CustomStatDefinition[] = [
  {
    id: "stress",
    kind: "numeric",
    label: "Stress",
    defaultValue: 50,
    track: true,
    trackCharacters: true,
    trackUser: false,
    globalScope: false,
    showOnCard: true,
    showInGraph: true,
    includeInInjection: true,
  },
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
    showOnCard: true,
    showInGraph: false,
    includeInInjection: true,
  },
  {
    id: "pose",
    kind: "text_short",
    label: "Pose",
    defaultValue: "",
    textMaxLength: 120,
    track: true,
    trackCharacters: true,
    trackUser: true,
    globalScope: false,
    showOnCard: true,
    showInGraph: false,
    includeInInjection: true,
  },
  {
    id: "isrestrained",
    kind: "boolean",
    label: "Restrained",
    defaultValue: false,
    track: true,
    trackCharacters: true,
    trackUser: true,
    globalScope: false,
    showOnCard: true,
    showInGraph: false,
    includeInInjection: true,
  },
  {
    id: "phase",
    kind: "enum_single",
    label: "Phase",
    defaultValue: "calm",
    enumOptions: ["calm", "tense", "playful"],
    track: true,
    trackCharacters: true,
    trackUser: true,
    globalScope: false,
    showOnCard: true,
    showInGraph: false,
    includeInInjection: true,
  },
  {
    id: "lastseen",
    kind: "date_time",
    label: "Last Seen",
    defaultValue: "2026-04-17 18:30",
    dateTimeMode: "timestamp",
    track: true,
    trackCharacters: true,
    trackUser: true,
    globalScope: false,
    showOnCard: true,
    showInGraph: false,
    includeInInjection: true,
  },
  {
    id: "scene_date_time",
    kind: "date_time",
    label: "Scene Date/Time",
    defaultValue: "",
    dateTimeMode: "timestamp",
    track: true,
    trackCharacters: true,
    trackUser: true,
    globalScope: true,
    showOnCard: true,
    showInGraph: false,
    includeInInjection: true,
  },
  {
    id: "scene_score",
    kind: "numeric",
    label: "Scene Score",
    defaultValue: 50,
    track: true,
    trackCharacters: true,
    trackUser: true,
    globalScope: true,
    showOnCard: true,
    showInGraph: true,
    includeInInjection: true,
  },
];

test("materializeTrackerDataFromJsonExtractionResponseV1 builds tracker data with broad scene continuity and narrow message participation", () => {
  const tracker = materializeTrackerDataFromJsonExtractionResponseV1(makeResponse(), {
    customStatDefinitions,
    timestamp: 1234,
  });

  assert.equal(tracker.timestamp, 1234);
  assert.deepEqual(tracker.activeCharacters, ["Candy", "Lisa", "Marylyn", "Serena"]);
  assert.equal(tracker.entityResolution?.resolvedEntities?.[0]?.inMessage, true);
  assert.equal(tracker.entityResolution?.resolvedEntities?.[1]?.inMessage, false);
});

test("materializeTrackerDataFromJsonExtractionResponseV1 derives active owners from resolved inScene flags when sceneOwners is incomplete", () => {
  const response = makeResponse();
  response.entityResolution.sceneOwners = ["Lisa"];
  response.entityResolution.messageOwners = [];
  response.entityResolution.resolvedEntities = [
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
  ];

  const tracker = materializeTrackerDataFromJsonExtractionResponseV1(response, {
    customStatDefinitions,
  });

  assert.deepEqual(tracker.activeCharacters, ["Lisa", "Candy"]);
  assert.deepEqual(
    (tracker.entityResolution?.resolvedEntities ?? [])
      .filter(entity => entity.inMessage)
      .map(entity => entity.name),
    ["Candy"],
  );
});

test("materializeTrackerDataFromJsonExtractionResponseV1 maps built-in, numeric custom, and non-numeric custom values into BST tracker buckets", () => {
  const tracker = materializeTrackerDataFromJsonExtractionResponseV1(makeResponse(), {
    customStatDefinitions,
  });

  assert.equal(tracker.statistics.affection.Candy, 61);
  assert.equal(tracker.statistics.mood.Candy, "Playful");
  assert.equal(tracker.statistics.lastThought.Candy, "I want to keep teasing him.");
  assert.equal(tracker.customStatistics?.stress?.Candy, 44);
  assert.equal(tracker.customStatistics?.scene_score?.[GLOBAL_TRACKER_KEY], 77);
  assert.equal(tracker.customStatistics?.scene_score?.Candy, undefined);
  assert.deepEqual(tracker.customNonNumericStatistics?.clothes?.Candy, ["t-shirt", "panties"]);
  assert.equal(tracker.customNonNumericStatistics?.pose?.Candy, "sitting on the couch and grinning at Kuba");
});

test("materializeTrackerDataFromJsonExtractionResponseV1 preserves explicit empty arrays for non-numeric custom stats", () => {
  const response = makeResponse();
  response.customNonNumericStats.clothes = {
    Candy: [],
  };

  const tracker = materializeTrackerDataFromJsonExtractionResponseV1(response, {
    customStatDefinitions,
  });

  assert.deepEqual(tracker.customNonNumericStatistics?.clothes?.Candy, []);
});

test("materializeTrackerDataFromJsonExtractionResponseV1 preserves boolean, enum, and date_time custom stat semantics", () => {
  const response = makeResponse();
  response.customNonNumericStats.isrestrained = {
    Candy: true,
  };
  response.customNonNumericStats.phase = {
    Candy: "playful",
  };
  response.customNonNumericStats.lastseen = {
    Candy: "2026-04-17 18:30",
  };

  const tracker = materializeTrackerDataFromJsonExtractionResponseV1(response, {
    customStatDefinitions,
    timestamp: 9876,
  });

  assert.equal(tracker.timestamp, 9876);
  assert.equal(tracker.customNonNumericStatistics?.isrestrained?.Candy, true);
  assert.equal(tracker.customNonNumericStatistics?.phase?.Candy, "playful");
  assert.equal(tracker.customNonNumericStatistics?.lastseen?.Candy, "2026-04-17 18:30");
});

test("materializeTrackerDataFromJsonExtractionResponseV1 drops invalid enum values but preserves explicit boolean false", () => {
  const response = makeResponse();
  response.customNonNumericStats.isrestrained = {
    Candy: false,
  };
  response.customNonNumericStats.phase = {
    Candy: "not-an-option",
  };

  const tracker = materializeTrackerDataFromJsonExtractionResponseV1(response, {
    customStatDefinitions,
  });

  assert.equal(tracker.customNonNumericStatistics?.isrestrained?.Candy, false);
  assert.equal(Object.prototype.hasOwnProperty.call(tracker.customNonNumericStatistics?.phase ?? {}, "Candy"), false);
});

test("materializeTrackerDataFromJsonExtractionStatResponseV1 stores sequential global custom stat values under the global owner", () => {
  const response: JsonExtractionStatResponseV1 = {
    protocolVersion: "bst.extract.v1",
    responseType: "stat_extraction_result",
    result: {
      status: "ok",
    },
    statId: "scene_date_time",
    values: {
      [USER_TRACKER_KEY]: "2024-06-15 14:05",
      Candy: "2024-06-15 14:05",
    },
  };

  const tracker = materializeTrackerDataFromJsonExtractionStatResponseV1(response, {
    activeCharacters: ["Candy"],
    customStatDefinitions,
    timestamp: 12345,
  });

  assert.equal(tracker.customNonNumericStatistics?.scene_date_time?.[GLOBAL_TRACKER_KEY], "2024-06-15 14:05");
  assert.equal(tracker.customNonNumericStatistics?.scene_date_time?.Candy, undefined);
  assert.equal(
    resolveScopedCustomNonNumericValue(tracker, "scene_date_time", GLOBAL_TRACKER_KEY, true),
    "2024-06-15 14:05",
  );
});

test("materializeTrackerDataFromJsonExtractionStatResponseV1 stores sequential global numeric custom stat values under the global owner", () => {
  const response: JsonExtractionStatResponseV1 = {
    protocolVersion: "bst.extract.v1",
    responseType: "stat_extraction_result",
    result: {
      status: "ok",
    },
    statId: "scene_score",
    values: {
      Candy: 64,
    },
  };

  const tracker = materializeTrackerDataFromJsonExtractionStatResponseV1(response, {
    activeCharacters: ["Candy"],
    customStatDefinitions,
    timestamp: 12345,
  });

  assert.equal(tracker.customStatistics?.scene_score?.[GLOBAL_TRACKER_KEY], 64);
  assert.equal(tracker.customStatistics?.scene_score?.Candy, undefined);
});
