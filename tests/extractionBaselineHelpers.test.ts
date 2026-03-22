import test from "node:test";
import assert from "node:assert/strict";

import { USER_TRACKER_KEY } from "../src/constants";
import { hasCharacterOwnedTrackedValueForCharacter, selectLatestRelevantHistoryEntry } from "../src/extractionBaselineHelpers";
import type { BetterSimTrackerSettings, STContext, TrackerData } from "../src/types";

function makeTracker(timestamp: number, clothes: string[]): TrackerData {
  return {
    timestamp,
    activeCharacters: [USER_TRACKER_KEY],
    statistics: {
      affection: {},
      trust: {},
      desire: {},
      connection: {},
      mood: {},
      lastThought: {},
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: {
        [USER_TRACKER_KEY]: clothes,
      },
    },
  };
}

function makeSettings(): BetterSimTrackerSettings {
  return {
    enabled: true,
    trackAffection: true,
    trackTrust: true,
    trackDesire: true,
    trackConnection: true,
    trackMood: true,
    trackLastThought: true,
    customStats: [
      {
        id: "clothes",
        label: "Clothes",
        kind: "array",
        track: true,
        trackCharacters: true,
        trackUser: true,
        globalScope: false,
        showOnCard: true,
        showInGraph: false,
        includeInInjection: true,
        enumOptions: [],
        booleanTrueLabel: "On",
        booleanFalseLabel: "Off",
        textMaxLength: 120,
        dateTimeMode: "timestamp",
        defaultValue: [],
      },
    ],
  } as unknown as BetterSimTrackerSettings;
}

test("selectLatestRelevantHistoryEntry prefers later message chronology over newer edit timestamp", () => {
  const olderEditedMessage = {
    data: makeTracker(4000, []),
    messageIndex: 1,
    timestamp: 4000,
  };
  const laterNarrativeMessage = {
    data: makeTracker(3000, ["nude"]),
    messageIndex: 3,
    timestamp: 3000,
  };

  const selected = selectLatestRelevantHistoryEntry(
    [olderEditedMessage, laterNarrativeMessage],
    5,
    data => data.customNonNumericStatistics?.clothes?.[USER_TRACKER_KEY] !== undefined,
  );

  assert.ok(selected);
  assert.equal(selected?.messageIndex, 3);
  assert.deepEqual(selected?.data.customNonNumericStatistics?.clothes?.[USER_TRACKER_KEY], ["nude"]);
});

test("selectLatestRelevantHistoryEntry can restrict continuity source to user-message indexes", () => {
  const userContinuity = {
    data: makeTracker(3000, ["nude"]),
    messageIndex: 5,
    timestamp: 3000,
  };
  const laterAiCarryForward = {
    data: makeTracker(4000, ["t-shirt", "jeans"]),
    messageIndex: 6,
    timestamp: 4000,
  };

  const selected = selectLatestRelevantHistoryEntry(
    [userContinuity, laterAiCarryForward],
    7,
    data => data.customNonNumericStatistics?.clothes?.[USER_TRACKER_KEY] !== undefined,
    messageIndex => messageIndex === 5,
  );

  assert.ok(selected);
  assert.equal(selected?.messageIndex, 5);
  assert.deepEqual(selected?.data.customNonNumericStatistics?.clothes?.[USER_TRACKER_KEY], ["nude"]);
});

test("hasCharacterOwnedTrackedValueForCharacter resolves alias-owned history through tracker entityOwnerMap", () => {
  const data = makeTracker(1, []);
  data.statistics.mood = {
    Ashley: "Hopeful",
  };
  data.customNonNumericStatistics = {
    clothes: {
      Ashley: ["camp hoodie"],
    },
  };
  data.entityOwnerMap = {
    Ashley: {
      entityId: "bst_mc_alias:test:ashley",
      ownerName: "Ashley",
      canonicalName: "Ashley",
      aliases: ["Ash"],
      sourceKey: "|camp",
      kind: "multi_character_alias",
    },
  };
  const context = {
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "bst_mc_alias:test:ashley": {
            id: "bst_mc_alias:test:ashley",
            ownerName: "Ashley",
            canonicalName: "Ashley",
            aliases: ["Ash"],
            sourceName: "Camp",
            sourceAvatar: null,
            sourceKey: "|camp",
            kind: "multi_character_alias",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 0,
            lastActiveMessageIndex: 0,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
            lifecycleEvents: [{ messageIndex: 0, state: "active" }],
          },
        },
        ownerToEntityId: {
          ashley: "bst_mc_alias:test:ashley",
          ash: "bst_mc_alias:test:ashley",
        },
      },
    },
  } as unknown as STContext;

  assert.equal(
    hasCharacterOwnedTrackedValueForCharacter(data, "Ash", makeSettings(), context),
    true,
  );
});

test("hasCharacterOwnedTrackedValueForCharacter resolves alias-owned history through byEntityId buckets", () => {
  const data = makeTracker(1, []);
  data.customNonNumericStatistics = {
    clothes: {},
  };
  data.customNonNumericStatisticsByEntityId = {
    clothes: {
      "bst_mc_alias:test:ashley": ["camp hoodie"],
    },
  };
  data.entityOwnerMap = {
    Ash: {
      entityId: "bst_mc_alias:test:ashley",
      ownerName: "Ashley",
      canonicalName: "Ashley",
      aliases: ["Ash"],
      sourceKey: "|camp",
      kind: "multi_character_alias",
    },
  };
  const context = {
    chatMetadata: {
      bstEntityRegistry: {
        version: 1,
        entities: {
          "bst_mc_alias:test:ashley": {
            id: "bst_mc_alias:test:ashley",
            ownerName: "Ashley",
            canonicalName: "Ashley",
            aliases: ["Ash"],
            sourceName: "Camp",
            sourceAvatar: null,
            sourceKey: "|camp",
            kind: "multi_character_alias",
            introducedAtMessageIndex: 0,
            lastSeenMessageIndex: 0,
            lastActiveMessageIndex: 0,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
            lifecycleEvents: [{ messageIndex: 0, state: "active" }],
          },
        },
        ownerToEntityId: {
          ashley: "bst_mc_alias:test:ashley",
          ash: "bst_mc_alias:test:ashley",
        },
      },
    },
  } as unknown as STContext;

  assert.equal(
    hasCharacterOwnedTrackedValueForCharacter(data, "Ash", makeSettings(), context),
    true,
  );
});
