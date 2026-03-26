import test from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import { buildFallbackSummaryProse, buildSummaryTrackerStateLines, collectSummaryCharacters } from "../src/trackerSummary";
import { defaultSettings } from "../src/settings";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "../src/types";

function makeSettings(): BetterSimTrackerSettings {
  return {
    ...defaultSettings,
    trackAffection: true,
    trackTrust: true,
    trackDesire: true,
    trackConnection: true,
    trackMood: true,
    trackLastThought: true,
    customStats: [
      {
        id: "stress",
        kind: "numeric",
        label: "Stress",
        defaultValue: 50,
        track: true,
        trackCharacters: true,
        trackUser: false,
        globalScope: false,
        privateToOwner: false,
        showOnCard: true,
        showInGraph: true,
        includeInInjection: true,
      },
    ],
  };
}

function makeContext(): STContext {
  return {
    chat: [],
    characterId: 0,
    groupId: "group-1",
    name1: "User",
    name2: "Ash",
    characters: [{ name: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh", avatar: "camp.png" }],
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "ent-ashley": {
            id: "ent-ashley",
            ownerName: "Ashley",
            canonicalName: "Ashley",
            aliases: ["Ash"],
            sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
            sourceAvatar: "camp.png",
            sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
            kind: "multi_character_alias",
            introducedAtMessageIndex: 1,
            lastSeenMessageIndex: 1,
            lastActiveMessageIndex: 1,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
          },
        },
        ownerToEntityId: {
          ash: "ent-ashley",
          ashley: "ent-ashley",
        },
      },
    },
  } as unknown as STContext;
}

function makeTracker(): TrackerData {
  return {
    timestamp: 1,
    activeCharacters: ["Ash"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Ash"],
      messageOwners: ["Ash"],
      sceneEntityIds: ["ent-ashley"],
      messageEntityIds: ["ent-ashley"],
    }),
    entityOwnerMap: {
      Ash: {
        entityId: "ent-ashley",
        ownerName: "Ashley",
        canonicalName: "Ashley",
        aliases: ["Ash"],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
    },
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: { Ashley: "Hopeful" },
      lastThought: {},
    },
    statisticsByEntityId: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {
      stress: {},
    },
    customStatisticsByEntityId: {
      stress: {
        "ent-ashley": 82,
      },
    },
    customNonNumericStatistics: {},
    customNonNumericStatisticsByEntityId: {},
  };
}

test("buildSummaryTrackerStateLines resolves alias-backed numeric custom stats through byEntityId", () => {
  const output = buildSummaryTrackerStateLines(makeContext(), makeTracker(), makeSettings());
  assert.match(output, /- Ashley: mood=Hopeful, stress=82/);
});

test("buildFallbackSummaryProse resolves alias-backed numeric custom stats through byEntityId", () => {
  const output = buildFallbackSummaryProse(makeContext(), makeTracker(), makeSettings());
  assert.match(output, /Stress feels high/);
  assert.match(output, /Ashley/);
});

test("collectSummaryCharacters ignores raw stat owner keys once explicit resolver/entity identity exists", () => {
  const tracker = makeTracker();
  tracker.statistics.affection = { Garret: 50 };
  tracker.customNonNumericStatistics = {
    pose: {
      Raleigh: "leaning on the window",
    },
  };

  const names = collectSummaryCharacters(makeContext(), tracker);

  assert.deepEqual(names, ["Ashley"]);
});

test("collectSummaryCharacters can materialize scene owners from sceneEntityIds plus entityOwnerMap without context", () => {
  const tracker = makeTracker();
  tracker.activeCharacters = ["Garret"];
  tracker.entityResolution = buildEntityResolution({
    source: "model",
    sceneOwners: [],
    messageOwners: [],
    sceneEntityIds: ["ent-ashley"],
    messageEntityIds: ["ent-ashley"],
  });
  tracker.entityOwnerMap = {
    Ashley: {
      entityId: "ent-ashley",
      ownerName: "Ashley",
      canonicalName: "Ashley",
      aliases: ["Ash"],
      sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
      kind: "multi_character_alias",
    },
    Garret: {
      entityId: "ent-garret",
      ownerName: "Garret",
      canonicalName: "Garret",
      aliases: [],
      sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
      kind: "multi_character_alias",
    },
  };

  const names = collectSummaryCharacters(tracker);

  assert.deepEqual(names, ["Ashley"]);
});

test("collectSummaryCharacters without context prefers sceneEntityIds plus ownerMap over stale sceneOwners", () => {
  const tracker = makeTracker();
  tracker.activeCharacters = ["Garret"];
  tracker.entityResolution = buildEntityResolution({
    source: "model",
    sceneOwners: ["Garret"],
    messageOwners: ["Garret"],
    sceneEntityIds: ["ent-ashley"],
    messageEntityIds: ["ent-ashley"],
  });
  tracker.entityOwnerMap = {
    Ashley: {
      entityId: "ent-ashley",
      ownerName: "Ashley",
      canonicalName: "Ashley",
      aliases: ["Ash"],
      sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
      kind: "multi_character_alias",
    },
    Garret: {
      entityId: "ent-garret",
      ownerName: "Garret",
      canonicalName: "Garret",
      aliases: [],
      sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
      kind: "multi_character_alias",
    },
  };

  const names = collectSummaryCharacters(tracker);

  assert.deepEqual(names, ["Ashley"]);
});

test("collectSummaryCharacters prefers context-aware entity resolution over raw alias owner keys", () => {
  const names = collectSummaryCharacters(makeContext(), makeTracker());

  assert.deepEqual(names, ["Ashley"]);
});

test("buildSummaryTrackerStateLines keeps same-name summary reads scoped to the current entity id", () => {
  const settings = makeSettings();
  const context = {
    ...makeContext(),
    name2: "Blake",
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "ent-blake-stale": {
            id: "ent-blake-stale",
            ownerName: "Blake",
            canonicalName: "Blake",
            aliases: ["B-stale"],
            sourceName: "Camp Whispering Pines | Ashley, Blake, Garret, & Raleigh",
            sourceAvatar: "camp.png",
            sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
            kind: "multi_character_alias",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 0,
            lastActiveMessageIndex: 0,
            lifecycleState: "inactive",
            archivedAtMessageIndex: null,
          },
        },
        ownerToEntityId: {
          blake: "ent-blake-stale",
          "b-stale": "ent-blake-stale",
        },
      },
    },
  } as unknown as STContext;
  const tracker: TrackerData = {
    timestamp: 1,
    activeCharacters: ["Blake"],
    entityResolution: buildEntityResolution({
      source: "model",
      sceneOwners: ["Blake"],
      messageOwners: ["Blake"],
      sceneEntityIds: ["ent-blake-current"],
      messageEntityIds: ["ent-blake-current"],
    }),
    entityOwnerMap: {
      Blake: {
        entityId: "ent-blake-current",
        ownerName: "Blake",
        canonicalName: "Blake",
        aliases: ["B-current"],
        sourceKey: "camp.png|camp whispering pines | ashley, blake, garret, & raleigh",
        kind: "multi_character_alias",
      },
    },
    statistics: {
      affection: { "B-current": 82, "B-stale": 15 },
      trust: {},
      desire: {},
      connection: {},
      mood: { "B-current": "Hopeful", "B-stale": "Angry" },
      lastThought: {},
    },
    statisticsByEntityId: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customStatisticsByEntityId: {},
    customNonNumericStatistics: {},
    customNonNumericStatisticsByEntityId: {},
  };

  const output = buildSummaryTrackerStateLines(context, tracker, settings);
  assert.match(output, /- Blake: mood=Hopeful, affection=82/);
  assert.doesNotMatch(output, /Angry/);
  assert.doesNotMatch(output, /affection=15/);
});
