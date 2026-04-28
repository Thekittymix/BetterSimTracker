import test from "node:test";
import assert from "node:assert/strict";

import { USER_TRACKER_KEY } from "../src/constants";
import {
  hasCharacterOwnedTrackedValueForCharacter,
  hasCharacterOwnedTrackedValueForSelection,
  restoreMissingCharacterContinuityFromMergedHistory,
  selectLatestRelevantHistoryEntry,
} from "../src/extractionBaselineHelpers";
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

test("hasCharacterOwnedTrackedValueForSelection resolves relevance directly from explicit entity ids", () => {
  const data = makeTracker(1, []);
  data.customNonNumericStatistics = {
    clothes: {},
  };
  data.customNonNumericStatisticsByEntityId = {
    clothes: {
      "bst_mc_alias:test:ashley": ["camp hoodie"],
    },
  };

  assert.equal(
    hasCharacterOwnedTrackedValueForSelection(
      data,
      {
        ownerNames: ["Unknown Alias"],
        entityIds: ["bst_mc_alias:test:ashley"],
      },
      makeSettings(),
      null,
    ),
    true,
  );
});

test("hasCharacterOwnedTrackedValueForSelection does not reuse same-name continuity from a different explicit entity", () => {
  const data = makeTracker(1, []);
  data.customNonNumericStatistics = {
    clothes: {
      Ash: ["camp hoodie"],
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
          "bst_narrative:ashley-shadow": {
            id: "bst_narrative:ashley-shadow",
            ownerName: "Ashley Shadow",
            canonicalName: "Ashley Shadow",
            aliases: ["Ashley"],
            sourceName: "Ashley Shadow",
            sourceAvatar: null,
            sourceKey: "narrative:bst_narrative:ashley-shadow",
            kind: "narrative-entity",
            introducedAtMessageIndex: 1,
            lastSeenMessageIndex: 1,
            lastActiveMessageIndex: 1,
            lifecycleState: "active",
            archivedAtMessageIndex: null,
            lifecycleEvents: [{ messageIndex: 1, state: "active" }],
          },
        },
        ownerToEntityId: {
          ashley: "bst_mc_alias:test:ashley",
          ash: "bst_mc_alias:test:ashley",
          "ashley shadow": "bst_narrative:ashley-shadow",
        },
      },
    },
  } as unknown as STContext;

  assert.equal(
    hasCharacterOwnedTrackedValueForSelection(
      data,
      {
        ownerNames: ["Ashley"],
        entityIds: ["bst_narrative:ashley-shadow"],
      },
      makeSettings(),
      context,
    ),
    false,
  );
});

test("restoreMissingCharacterContinuityFromMergedHistory backfills a reactivated owner from older merged scene continuity before default seeding", () => {
  const settings = makeSettings();
  const base: TrackerData = {
    timestamp: 4200,
    activeCharacters: ["Lisa"],
    statistics: {
      affection: { Lisa: 0 },
      trust: { Lisa: 0 },
      desire: { Lisa: 8 },
      connection: { Lisa: 7 },
      mood: { Lisa: "Panicked" },
      lastThought: { Lisa: "Oh crap, Mom's here! I'm so busted." },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: {
        Lisa: ["black tank top", "low-slung denim shorts", "white panties"],
      },
    },
  };
  const merged: TrackerData = {
    timestamp: 4300,
    activeCharacters: ["Lisa", "Marylyn"],
    statistics: {
      affection: { Lisa: 0, Marylyn: 5 },
      trust: { Lisa: 0, Marylyn: 5 },
      desire: { Lisa: 8, Marylyn: 0 },
      connection: { Lisa: 7, Marylyn: 6 },
      mood: { Lisa: "Panicked", Marylyn: "Caring" },
      lastThought: {
        Lisa: "Oh crap, Mom's here! I'm so busted.",
        Marylyn: "I hope he knows I love him and I'm just trying to do what's best.",
      },
    },
    customStatistics: {},
    customNonNumericStatistics: {
      clothes: {
        Lisa: ["black tank top", "low-slung denim shorts", "white panties"],
        Marylyn: [],
      },
    },
  };

  const restored = restoreMissingCharacterContinuityFromMergedHistory({
    base,
    merged,
    activeOwners: ["Lisa", "Marylyn"],
    activeEntityIds: ["bst_narrative:lisa", "bst_narrative:marylyn"],
    settingsInput: settings,
    context: null,
  });

  assert.ok(restored);
  assert.deepEqual(restored?.statistics.affection, { Lisa: 0, Marylyn: 5 });
  assert.deepEqual(restored?.statistics.trust, { Lisa: 0, Marylyn: 5 });
  assert.deepEqual(restored?.statistics.desire, { Lisa: 8, Marylyn: 0 });
  assert.deepEqual(restored?.statistics.connection, { Lisa: 7, Marylyn: 6 });
  assert.deepEqual(restored?.statistics.mood, {
    Lisa: "Panicked",
    Marylyn: "Caring",
  });
  assert.deepEqual(restored?.statistics.lastThought, {
    Lisa: "Oh crap, Mom's here! I'm so busted.",
    Marylyn: "I hope he knows I love him and I'm just trying to do what's best.",
  });
  assert.deepEqual(restored?.customNonNumericStatistics?.clothes, {
    Lisa: ["black tank top", "low-slung denim shorts", "white panties"],
    Marylyn: [],
  });
});
