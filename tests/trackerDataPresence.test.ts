import test from "node:test";
import assert from "node:assert/strict";
import { buildEntityResolution } from "./helpers/entityResolution";

import { defaultSettings } from "../src/settings";
import { hasTrackedValueForOwner, hasTrackedValueForSelection } from "../src/trackerDataPresence";
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
        id: "clothes",
        kind: "array",
        label: "Clothes",
        defaultValue: [],
        textMaxLength: 80,
        track: true,
        trackCharacters: true,
        trackUser: false,
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

test("hasTrackedValueForOwner resolves alias values through byEntityId shadow state", () => {
  const data: TrackerData = {
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
      mood: {},
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
    customNonNumericStatistics: {
      clothes: {},
    },
    customNonNumericStatisticsByEntityId: {
      clothes: {
        "ent-ashley": ["worn hoodie"],
      },
    },
  };

  assert.equal(hasTrackedValueForOwner(data, "Ash", makeSettings(), makeContext()), true);
});

test("hasTrackedValueForOwner still returns false when no tracked alias value exists", () => {
  const data: TrackerData = {
    timestamp: 1,
    activeCharacters: ["Ash"],
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

  assert.equal(hasTrackedValueForOwner(data, "Ash", makeSettings(), makeContext()), false);
});

test("hasTrackedValueForSelection resolves tracked values directly from explicit entity ids", () => {
  const data: TrackerData = {
    timestamp: 1,
    activeCharacters: ["Unknown Alias"],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
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
    customNonNumericStatistics: {
      clothes: {},
    },
    customNonNumericStatisticsByEntityId: {
      clothes: {
        "ent-ashley": ["worn hoodie"],
      },
    },
  };

  assert.equal(
    hasTrackedValueForSelection(
      data,
      { ownerNames: ["Unknown Alias"], entityIds: ["ent-ashley"] },
      makeSettings(),
      null,
    ),
    true,
  );
});
