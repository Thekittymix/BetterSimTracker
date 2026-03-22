import test from "node:test";
import assert from "node:assert/strict";

import { buildFallbackSummaryProse, buildSummaryTrackerStateLines } from "../src/trackerSummary";
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
    entityResolution: {
      source: "model",
      sceneOwners: ["Ash"],
      messageOwners: ["Ash"],
      sceneEntityIds: ["ent-ashley"],
      messageEntityIds: ["ent-ashley"],
    },
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
  assert.match(output, /- Ash: mood=Hopeful, stress=82/);
});

test("buildFallbackSummaryProse resolves alias-backed numeric custom stats through byEntityId", () => {
  const output = buildFallbackSummaryProse(makeContext(), makeTracker(), makeSettings());
  assert.match(output, /Stress feels high/);
});
